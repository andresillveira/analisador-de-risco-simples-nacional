import io
import re
import csv
from typing import Dict, Any, List
import pandas as pd
from pypdf import PdfReader

from app.config import CFOP_MAP
from app.utils.text_utils import clean_and_parse_float, split_csv_line, extract_and_normalize_cfop

def parse_csv_txt(content: str, report_type: str, payroll_base: str = "custo_func") -> Dict[str, Any]:
    from app.services.risk_service import classify_cfop_row  # Import here to avoid circular imports if any
    
    lines = content.splitlines()
    total = 0.0
    valid_rows = 0
    breakdown = {"compras": 0.0, "vendas": 0.0, "servicos": 0.0, "outras": 0.0, "folha": 0.0}
    
    # 1. Folha de Pagamento Report
    if report_type == "Folha de Pagamento":
        delimiter = ";"
        for line in lines[:15]:
            line_stripped = line.strip()
            if not line_stripped:
                continue
            if ";" in line_stripped:
                delimiter = ";"
                break
            elif "," in line_stripped:
                if ";" not in line_stripped and line_stripped.count(",") > 5:
                    delimiter = ","
                    break
            elif "|" in line_stripped:
                delimiter = "|"
                break
            elif "\t" in line_stripped:
                delimiter = "\t"
                break
        
        import io
        f = io.StringIO(content)
        reader = csv.reader(f, delimiter=delimiter)
        
        rows = []
        for r in reader:
            if r:
                rows.append([cell.strip() for cell in r])
        
        header_row_index = -1
        custo_func_idx = -1
        sal_hrs_faltas_idx = -1
        sal_base_idx = -1
        
        for idx, row in enumerate(rows[:15]):
            row_lower = [cell.lower() for cell in row]
            has_contrato = any("contrato" in cell for cell in row_lower)
            has_sal_base = any("sal. base" in cell or "salario base" in cell or "salário base" in cell for cell in row_lower)
            
            if has_contrato or has_sal_base:
                header_row_index = idx
                for c_idx, cell in enumerate(row):
                    clean_cell = cell.lower().replace('\r', '').replace('\n', '').strip()
                    if "custo func" in clean_cell or "custo de func" in clean_cell or "custo total" in clean_cell or "custo funcional" in clean_cell:
                        custo_func_idx = c_idx
                    elif "sal - hrs" in clean_cell or "sal. - hrs" in clean_cell or "horas faltas" in clean_cell or "sal-hrs" in clean_cell:
                        sal_hrs_faltas_idx = c_idx
                    elif "sal. base" in clean_cell or "salario base" in clean_cell or "salário base" in clean_cell or "sal base" in clean_cell:
                        sal_base_idx = c_idx
                break
        
        target_idx = -1
        if payroll_base == "custo_func":
            if custo_func_idx != -1:
                target_idx = custo_func_idx
            elif sal_hrs_faltas_idx != -1:
                target_idx = sal_hrs_faltas_idx
            elif sal_base_idx != -1:
                target_idx = sal_base_idx
        elif payroll_base == "sal_hrs_faltas":
            if sal_hrs_faltas_idx != -1:
                target_idx = sal_hrs_faltas_idx
            elif custo_func_idx != -1:
                target_idx = custo_func_idx
            elif sal_base_idx != -1:
                target_idx = sal_base_idx
        else: # sal_base
            if sal_base_idx != -1:
                target_idx = sal_base_idx
            elif sal_hrs_faltas_idx != -1:
                target_idx = sal_hrs_faltas_idx
            elif custo_func_idx != -1:
                target_idx = custo_func_idx
        
        employee_rows = []
        totalizer_row = None
        
        start_row = header_row_index + 1 if header_row_index != -1 else 0
        for row in rows[start_row:]:
            if not row or not any(row):
                continue
            
            first_cell = row[0]
            if "tot emp" in first_cell.lower() or "total geral" in first_cell.lower() or "tot. emp" in first_cell.lower():
                totalizer_row = row
                continue
            
            if re.match(r'^\d{1,6}\s', first_cell) or (re.match(r'^\d{1,6}$', first_cell) and len(row) > 1):
                employee_rows.append(row)
        
        def extract_row_value(row) -> float:
            if target_idx != -1 and target_idx < len(row):
                val_str = row[target_idx].strip()
                return clean_and_parse_float(val_str)
            else:
                for cell in reversed(row):
                    cell_stripped = cell.strip()
                    if not cell_stripped:
                        continue
                    clean_alpha_check = re.sub(r'(?i)R\$\s?', '', cell_stripped).strip()
                    if "/" in cell_stripped or re.match(r'^[a-zA-Z\sà-úÀ-Ú\ufffdáéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ]+$', clean_alpha_check):
                        continue
                    v = clean_and_parse_float(cell_stripped)
                    if v > 0.0:
                        return v
                return 0.0
        
        total_val = 0.0
        if totalizer_row:
            total_val = extract_row_value(totalizer_row)
            
        if total_val <= 0.0:
            for emp in employee_rows:
                total_val += extract_row_value(emp)
        
        valid_rows = len(employee_rows)
        total = total_val
        breakdown["folha"] = total
        
        return {"total": round(total, 2), "rowCount": valid_rows, "breakdown": {k: round(v, 2) for k, v in breakdown.items()}}
        
    # 2. General Fiscal reports (ICMS, ISS, Outras Despesas)
    target_column_index = -1
    for i in range(min(len(lines), 15)):
        line = lines[i].strip()
        if not line:
            continue
        parts = [p.lower() for p in split_csv_line(line)]
        
        for j, p in enumerate(parts):
            if "contábil" in p or "contabil" in p or "vlr cont" in p or "vlr_cont" in p or "valor contabil" in p or "valor cont" in p:
                target_column_index = j
                break
        if target_column_index != -1:
            break
            
    for line in lines:
        line_str = line.strip()
        if not line_str:
            continue
            
        lower_line = line_str.lower()
        
        if (lower_line.startswith("____") or 
            lower_line.startswith("====") or 
            lower_line.startswith("----") or 
            "pg:" in lower_line or 
            "pag:" in lower_line or 
            "pág:" in lower_line or 
            "data de emit" in lower_line or 
            "emissão:" in lower_line or 
            "cnpj:" in lower_line or 
            "razão social" in lower_line or 
            "razao social" in lower_line or 
            "período:" in lower_line or 
            "periodo:" in lower_line or 
            "competência:" in lower_line or 
            "competencia:" in lower_line or 
            "relatorio" in lower_line or 
            "relatório" in lower_line or 
            "natureza" in lower_line or
            "total" in lower_line or 
            "totais" in lower_line or
            "subtotal" in lower_line or 
            "soma" in lower_line or 
            "resumo" in lower_line or 
            lower_line.startswith("***")):
            continue
            
        parts = split_csv_line(line_str)
        if not parts:
            continue
            
        parts = [p.strip() for p in parts]
        
        col0 = parts[0].replace('"', '').strip()
        cfop_code = extract_and_normalize_cfop(col0)
        
        val = 0.0
        if target_column_index != -1 and target_column_index < len(parts):
            val = clean_and_parse_float(parts[target_column_index])
        else:
            for cell in reversed(parts):
                if not cell or re.match(r'^[a-zA-Z\s]+$', re.sub(r'(?i)R\$\s?', '', cell).strip()):
                    continue
                v = clean_and_parse_float(cell)
                if v != 0.0:
                    val = v
                    break
                    
        if val == 0.0:
            continue
            
        if cfop_code:
            row_class = classify_cfop_row(cfop_code, val, report_type)
            for k, v in row_class.items():
                breakdown[k] += v
            total += val
            valid_rows += 1
        else:
            if report_type == "Compras":
                breakdown["compras"] += val
            elif report_type == "Vendas":
                breakdown["vendas"] += val
            elif report_type == "Serviços":
                breakdown["servicos"] += val
            elif report_type == "Outras Despesas":
                breakdown["outras"] += val
            total += val
            valid_rows += 1
            
    return {"total": round(total, 2), "rowCount": valid_rows, "breakdown": {k: round(v, 2) for k, v in breakdown.items()}}

def parse_excel(content_bytes: bytes, report_type: str, payroll_base: str = "custo_func") -> Dict[str, Any]:
    try:
        xl = pd.ExcelFile(io.BytesIO(content_bytes))
        sheet_name = xl.sheet_names[0]
        df = xl.parse(sheet_name, header=None)
    except Exception as e:
        print(f"Error reading Excel: {e}")
        return {"total": 0.0, "rowCount": 0, "breakdown": {"compras": 0.0, "vendas": 0.0, "servicos": 0.0, "outras": 0.0, "folha": 0.0}}
        
    lines = []
    for _, row in df.iterrows():
        row_str_parts = []
        for val in row:
            if pd.isna(val):
                row_str_parts.append("")
            else:
                row_str_parts.append(str(val).strip())
        line = ";".join(row_str_parts)
        lines.append(line)
        
    content = "\n".join(lines)
    return parse_csv_txt(content, report_type, payroll_base)

def parse_pdf(content_bytes: bytes, report_type: str, payroll_base: str = "custo_func") -> Dict[str, Any]:
    try:
        reader = PdfReader(io.BytesIO(content_bytes))
        lines = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                for line in text.splitlines():
                    line = line.strip()
                    if not line:
                        continue
                    parts = re.split(r'\s{2,}', line)
                    if len(parts) <= 1:
                        parts = re.split(r'\s+', line)
                    lines.append(";".join(parts))
    except Exception as e:
        print(f"Error reading PDF: {e}")
        return {"total": 0.0, "rowCount": 0, "breakdown": {"compras": 0.0, "vendas": 0.0, "servicos": 0.0, "outras": 0.0, "folha": 0.0}}
        
    content = "\n".join(lines)
    return parse_csv_txt(content, report_type, payroll_base)

import io
import re
import csv
from typing import Dict, Any, List
import pandas as pd
from pypdf import PdfReader

from app.config import CFOP_MAP
from app.utils.text_utils import clean_and_parse_float, split_csv_line, extract_and_normalize_cfop

def parse_csv_txt(content: str, report_type: str) -> Dict[str, Any]:
    from app.services.risk_service import classify_cfop_row  # Import here to avoid circular imports if any
    
    lines = content.splitlines()
    total = 0.0
    valid_rows = 0
    breakdown = {"compras": 0.0, "vendas": 0.0, "servicos": 0.0, "outras": 0.0, "folha": 0.0}
    
    # 1. Folha de Pagamento Report
    if report_type == "Folha de Pagamento":
        for line in lines:
            line_str = line.strip()
            if not line_str:
                continue
            
            parts = split_csv_line(line_str)
            if not parts:
                continue
            
            parts = [p.strip() for p in parts]
            
            col0 = parts[0]
            if re.match(r'^\d{1,6}\s', col0) or (re.match(r'^\d{1,6}$', col0) and len(parts) > 1):
                val = 0.0
                for cell in reversed(parts):
                    cell_stripped = cell.strip()
                    if not cell_stripped:
                        continue
                    
                    clean_alpha_check = re.sub(r'(?i)R\$\s?', '', cell_stripped).strip()
                    if "/" in cell_stripped or re.match(r'^[a-zA-Z\sà-úÀ-Ú\ufffdáéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ]+$', clean_alpha_check):
                        continue
                        
                    v = clean_and_parse_float(cell_stripped)
                    if v > 0.0:
                        val = v
                        break
                
                if val > 0.0:
                    breakdown["folha"] += val
                    total += val
                    valid_rows += 1
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

def parse_excel(content_bytes: bytes, report_type: str) -> Dict[str, Any]:
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
    return parse_csv_txt(content, report_type)

def parse_pdf(content_bytes: bytes, report_type: str) -> Dict[str, Any]:
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
    return parse_csv_txt(content, report_type)

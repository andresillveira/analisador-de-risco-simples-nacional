import io
import re
import csv
from typing import Dict, Any, List, Optional
import pandas as pd
from pypdf import PdfReader

def extract_company_name_from_text(content: str) -> Optional[str]:
    if not content:
        return None
    lines = content.splitlines()
    # Limitar busca às primeiras 3 linhas para evitar falsos positivos nos dados
    for line in lines[:3]:
        line_stripped = line.strip()
        if not line_stripped:
            continue
        
        # Obter a primeira célula (separando por delimitadores comuns)
        parts = []
        if ";" in line_stripped:
            parts = [p.strip() for p in line_stripped.split(";")]
        elif "," in line_stripped and line_stripped.count(",") > 3:
            parts = [p.strip() for p in line_stripped.split(",")]
        elif "|" in line_stripped:
            parts = [p.strip() for p in line_stripped.split("|")]
        elif "\t" in line_stripped:
            parts = [p.strip() for p in line_stripped.split("\t")]
        else:
            parts = [p.strip() for p in re.split(r'\s{2,}', line_stripped) if p.strip()]
            
        if not parts:
            continue
            
        first_cell = parts[0]
        # Se for apenas número (ex ID da empresa), pega a próxima parte
        if re.match(r'^\d+$', first_cell) and len(parts) > 1:
            first_cell = parts[1]
            
        first_cell = first_cell.strip('"\' ')
        
        # Remover prefixo numérico (ex: "0513-AGROBORGES" -> "AGROBORGES")
        # Captura de 3 a 6 dígitos seguidos opcionalmente por traço/espaços
        cleaned = re.sub(r'^\d{3,6}\s*[-–]?\s*', '', first_cell)
        cleaned = cleaned.strip('"\' ')
        
        # Normalizar espaços múltiplos
        cleaned = re.sub(r'\s+', ' ', cleaned)
        
        if not cleaned or len(cleaned) < 3:
            continue
            
        # O nome da empresa deve conter letras
        if not re.search(r'[a-zA-ZáéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ]', cleaned):
            continue
            
        lower_cleaned = cleaned.lower()
        
        # Filtro de palavras-chave que representam cabeçalhos ou dados, não nomes
        exclude_words = [
            "natureza", "contrato", "totais", "relatorio", "relatório", 
            "cnpj", "período", "competência", "vlr contábil", "contábil",
            "valor", "soma", "total", "subtotal", "empresa", "razão social",
            "razao social", "per calc", "competencia", "relatorio", "relatório"
        ]
        
        if any(w in lower_cleaned for w in exclude_words):
            continue
            
        return cleaned
    return None

from app.config import CFOP_MAP
from app.utils.text_utils import clean_and_parse_float, split_csv_line, extract_and_normalize_cfop

def parse_csv_txt(content: str, report_type: str, payroll_base: str = "custo_func") -> Dict[str, Any]:
    from app.services.risk_service import classify_cfop_row  # Import here to avoid circular imports if any
    
    company_name = extract_company_name_from_text(content)
    lines = content.splitlines()
    total = 0.0
    valid_rows = 0
    breakdown = {"compras": 0.0, "vendas": 0.0, "servicos": 0.0, "outras": 0.0, "folha": 0.0, "devolucoes_entrada": 0.0, "devolucoes_saida": 0.0}
    
    # 1. Folha de Pagamento Report
    if report_type == "Folha de Pagamento":
        is_ficha_financeira = "ficha financeira" in content.lower().replace(';', ' ').replace('\t', ' ')
        if is_ficha_financeira:
            company_name_extracted = None
            for line in lines:
                line_norm = line.replace(';', ' ').replace('\t', ' ')
                line_norm = re.sub(r'\s+', ' ', line_norm).strip()
                company_match = re.search(r'Total da Empresa:\s*\d+\s*-\s*(.+)', line_norm, re.IGNORECASE)
                if not company_match:
                    company_match = re.search(r'Resumo\s+Sint[eé\ufffd\x81]+tico\s+da\s+Empresa:\s*\d+\s*-\s*(.+)', line_norm, re.IGNORECASE)
                if company_match:
                    company_name_extracted = company_match.group(1).strip().strip('"\' ')
                    break
            
            if company_name_extracted:
                company_name = company_name_extracted
            else:
                for line in lines[:5]:
                    if "agroborge" in line.lower():
                        company_name = "AGROBORGES"
                        break
            
            found_total_row = False
            values_line = None
            for i, line in enumerate(lines):
                line_norm = line.lower().replace(';', ' ').replace('\t', ' ')
                if "total da empresa" in line_norm:
                    for j in range(i + 1, min(i + 5, len(lines))):
                        if lines[j].strip():
                            values_line = lines[j].strip()
                            found_total_row = True
                            break
                    if found_total_row:
                        break
            
            total_val = 0.0
            if values_line:
                normalized = values_line.replace(';', ' ').replace('\t', ' ')
                normalized = re.sub(r'\s+', ' ', normalized).strip()
                tokens = normalized.split(' ')
                numbers = []
                for t in tokens:
                    val = clean_and_parse_float(t)
                    if val > 0.0:
                        numbers.append(val)
                if len(numbers) >= 2:
                    total_val = numbers[-2]
                elif len(numbers) == 1:
                    total_val = numbers[0]
            
            total = total_val
            breakdown["folha"] = total
            return {
                "total": round(total, 2),
                "rowCount": 0,
                "breakdown": {k: round(v, 2) for k, v in breakdown.items()},
                "company_name": company_name
            }

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
        
        return {"total": round(total, 2), "rowCount": valid_rows, "breakdown": {k: round(v, 2) for k, v in breakdown.items()}, "company_name": company_name}
        
    # 2. General Fiscal reports (ICMS, ISS, Outras Despesas)
    is_csv = ";" in content or "|" in content or "\t" in content
    
    if is_csv:
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
    else:
        # Lógica robusta para TXT/PDF (baseado em quebra por espaços e tokenização por colunas)
        for line in lines:
            line_str = line.strip()
            if not line_str:
                continue
                
            lower_line = line_str.lower()
            
            # Ignorar cabeçalhos e rodapés gerais
            if (lower_line.startswith("____") or 
                lower_line.startswith("====") or 
                lower_line.startswith("----") or 
                "pg:" in lower_line or 
                "pag:" in lower_line or 
                "pág:" in lower_line or 
                "cnpj:" in lower_line or 
                "razão social" in lower_line or 
                "razao social" in lower_line or 
                "total" in lower_line or 
                "totais" in lower_line or
                "subtotal" in lower_line or 
                "soma" in lower_line or 
                "resumo" in lower_line or 
                lower_line.startswith("***")):
                continue
                
            tokens = [t.strip() for t in line_str.split() if t.strip()]
            if len(tokens) < 2:
                continue
                
            # Extrair CFOP dos primeiros tokens (normalmente o primeiro)
            cfop_code = None
            for token in tokens[:2]:
                cfop_code = extract_and_normalize_cfop(token)
                if cfop_code:
                    break
                    
            if not cfop_code:
                continue
                
            # Para relatórios fiscais (ICMS/ISS), o valor contábil é o primeiro dos 5 valores à direita.
            # Se houver pelo menos 5 tokens adicionais, o valor de interesse está na posição -5.
            # Caso contrário, pega o último token disponível como valor contábil.
            val = 0.0
            if len(tokens) >= 5:
                val = clean_and_parse_float(tokens[-5])
            else:
                val = clean_and_parse_float(tokens[-1])
                
            if val == 0.0:
                continue
                
            row_class = classify_cfop_row(cfop_code, val, report_type)
            for k, v in row_class.items():
                breakdown[k] += v
            total += val
            valid_rows += 1
            
    return {"total": round(total, 2), "rowCount": valid_rows, "breakdown": {k: round(v, 2) for k, v in breakdown.items()}, "company_name": company_name}

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
        pages_text = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages_text.append(text)
        content = "\n".join(pages_text)
    except Exception as e:
        print(f"Error reading PDF: {e}")
        return {"total": 0.0, "rowCount": 0, "breakdown": {"compras": 0.0, "vendas": 0.0, "servicos": 0.0, "outras": 0.0, "folha": 0.0}}
        
    return parse_csv_txt(content, report_type, payroll_base)

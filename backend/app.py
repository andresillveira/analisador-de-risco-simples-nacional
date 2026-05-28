import io
import re
import json
import csv
import uuid
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
from pypdf import PdfReader

app = FastAPI(title="Simples Nacional Risk Analyzer Backend")

# Habilita CORS para o desenvolvimento local
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REPORT_TYPES_INFO = {
    "Vendas": {
        "title": "Relatório de Vendas (Receitas)",
        "description": "Operações comerciais de saídas e receitas brutas. Inclui faturamento comercial.",
        "allowedKeyword": "Venda, Faturamento, Receita, Prestação",
        "ignoredKeyword": "Remessa, Devolução, Brinde, Demonstração"
    },
    "Serviços": {
        "title": "Relatório de Serviços",
        "description": "Prestação de serviços tributados, como notas fiscais de serviço (CFOP 9000 ou séries equivalentes).",
        "allowedKeyword": "Serviço, Consultoria, Assessoria, Mensalidade",
        "ignoredKeyword": "Cancelado, Devolução"
    },
    "Compras": {
        "title": "Relatório de Compras",
        "description": "Aquisições de insumos, matérias-primas e mercadorias para industrialização ou revenda.",
        "allowedKeyword": "Compra, Aquisição, Insumo, Mercadoria, Insumo Industrial",
        "ignoredKeyword": "Imobilizado, Uso e Consumo, Frete, Ativo, Diferencial"
    },
    "Folha de Pagamento": {
        "title": "Folha de Pagamento (Trabalhistas)",
        "description": "Resumos de folha, pró-labore, salários, encargos sociais (INSS, FGTS).",
        "allowedKeyword": "Salários, FGTS, INSS, Pró-labore, Gratificação, Décimo Terceiro",
        "ignoredKeyword": "Reembolso, Ajuda de Custo"
    },
    "Outras Despesas": {
        "title": "Outras Despesas Operacionais",
        "description": "Aluguel, energia, água, internet, contabilidade, material de escritório.",
        "allowedKeyword": "Aluguel, Luz, Energia, Internet, Condomínio, Água, Marketing",
        "ignoredKeyword": "Investimento, Distribuição de Lucros"
    }
}

# Carregar mapeamento dinâmico de CFOPs do CSV
CFOP_MAP = {}
try:
    import os
    csv_paths = ["CFOP_Categorizado.csv", "../CFOP_Categorizado.csv"]
    csv_path = None
    for p in csv_paths:
        if os.path.exists(p):
            csv_path = p
            break
            
    if csv_path:
        with open(csv_path, mode="r", encoding="latin1") as f:
            reader = csv.reader(f, delimiter=";")
            header = next(reader)  # CFOP;Tipo;Origem/Destino;Categoria;Descrição
            for row in reader:
                if len(row) >= 4:
                    cfop_code = row[0].strip()
                    CFOP_MAP[cfop_code] = {
                        "tipo": row[1].strip(),
                        "origem_destino": row[2].strip(),
                        "categoria": row[3].strip(),
                        "descricao": row[4].strip() if len(row) > 4 else ""
                    }
        print(f"Successfully loaded {len(CFOP_MAP)} CFOP mappings from {csv_path}")
    else:
        print("Warning: CFOP_Categorizado.csv not found in typical search paths!")
except Exception as e:
    print(f"Error loading CFOP_Categorizado.csv: {e}")

def clean_and_parse_float(str_val: str) -> float:
    if not str_val:
        return 0.0
    cleaned = re.sub(r'(?i)R\$\s?', '', str(str_val)).strip()
    if not cleaned:
        return 0.0
    
    first_dot = cleaned.find('.')
    first_comma = cleaned.find(',')
    
    if first_dot != -1 and first_comma != -1:
        if first_dot < first_comma:
            # 1.500,00 -> dot is thousands, comma is decimal
            cleaned = cleaned.replace('.', '').replace(',', '.')
        else:
            # 1,500.00 -> comma is thousands, dot is decimal
            cleaned = cleaned.replace(',', '')
    elif first_comma != -1:
        parts = cleaned.split(',')
        if len(parts[-1]) <= 2:
            cleaned = cleaned.replace('.', '').replace(',', '.')
        else:
            cleaned = cleaned.replace(',', '')
    elif first_dot != -1:
        parts = cleaned.split('.')
        if len(parts[-1]) == 3:
            cleaned = cleaned.replace('.', '')
            
    try:
        parsed = float(cleaned)
        return parsed if not pd.isna(parsed) else 0.0
    except ValueError:
        return 0.0

def split_csv_line(line: str) -> List[str]:
    delimiter = ","
    if "|" in line:
        delimiter = "|"
    elif ";" in line:
        delimiter = ";"
    elif "\t" in line:
        delimiter = "\t"
        
    reader = csv.reader([line], delimiter=delimiter)
    try:
        parts = next(reader)
        return [p.strip() for p in parts]
    except StopIteration:
        return []

def extract_and_normalize_cfop(cell_value: str) -> Optional[str]:
    if not cell_value:
        return None
    # Busca código CFOP de 4 dígitos com ou sem ponto
    match = re.search(r'\b([1-9])\.?(\d{3})\b', cell_value)
    if match:
        return f"{match.group(1)}.{match.group(2)}"
    return None

def classify_cfop_row(cfop_code: str, val: float, report_type: str) -> Dict[str, float]:
    res = {"compras": 0.0, "vendas": 0.0, "servicos": 0.0, "outras": 0.0, "folha": 0.0, "devolucoes_entrada": 0.0, "devolucoes_saida": 0.0}
    
    # Correção: CFOPs 1.128, 2.128 e 3.128 (ISSQN) entram como Outras Despesas
    if cfop_code in ["1.128", "2.128", "3.128", "1128", "2128", "3128"]:
        res["outras"] = val
        return res
        
    cfop_normalized = cfop_code.replace(".", "").strip()
    is_ativo_imobilizado = False
    
    info = CFOP_MAP.get(cfop_code)
    
    if info:
        category = info["categoria"]
        tipo = info["tipo"]
        
        # Identificar se é aquisição de ativo imobilizado (Cenário 2 - Outros Custos)
        if (category == "Ativo Permanente" and tipo == "Entrada") or cfop_normalized in ["1551", "2551", "3551", "1406", "2406", "1151", "2151"]:
            is_ativo_imobilizado = True
            
        # 1. Serviços Prestados (CFOP 9.000 / Serviços sob Saída)
        category_lower = category.lower()
        is_servico = "servi" in category_lower
        
        if is_ativo_imobilizado:
            res["outras"] = val
        elif "devol" in category_lower:
            if tipo == "Entrada" or cfop_code.startswith(("1", "2", "3")):
                res["devolucoes_entrada"] = val
            elif tipo == "Saída" or cfop_code.startswith(("5", "6", "7")):
                res["devolucoes_saida"] = val
        elif is_servico and tipo == "Saída":
            res["servicos"] = val
        # 2. Serviços Tomados (CFOP 8.000 / Serviços sob Entrada)
        elif is_servico and tipo == "Entrada":
            res["outras"] = val
        # 3. Compras Comerciais
        elif category == "Compras":
            res["compras"] = val
        # 4. Vendas
        elif category == "Vendas":
            res["vendas"] = val
        # 5. Fretes (Transporte) e Uso/Consumo
        elif category == "Transporte":
            if cfop_normalized.startswith(("5", "6", "7")) or cfop_code.startswith(("5", "6", "7")):
                res["servicos"] = val
            else:
                res["outras"] = val
        elif category == "Uso ou Consumo":
            res["outras"] = val
        # Outras categorias como Devolução, Ativo Permanente e Transferências são ignoradas.
    return res


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


def parse_csv_txt(content: str, report_type: str, payroll_base: str = "custo_func") -> Dict[str, Any]:
    company_name = extract_company_name_from_text(content)
    lines = content.splitlines()
    total = 0.0
    valid_rows = 0
    breakdown = {"compras": 0.0, "vendas": 0.0, "servicos": 0.0, "outras": 0.0, "folha": 0.0, "devolucoes_entrada": 0.0, "devolucoes_saida": 0.0}
    
    # 1. Folha de Pagamento Report
    if report_type == "Folha de Pagamento":
        # Check for the new payroll report pattern
        has_inss_fgts = bool(re.search(r"VALORES\s+DE\s+INSS/FGTS\s+CONFORME\s+RESUMO\s+PROCESSADO", content, re.IGNORECASE))
        has_resumo_geral = bool(re.search(r"RESUMO\s*GERAL|R\s*E\s*S\s*U\s*M\s*O\s*G\s*E\s*R\s*A\s*L", content, re.IGNORECASE))
        has_resumo_empregados = bool(re.search(r"RESUMO\s*DE\s*EMPREGADOS|R\s*E\s*S\s*U\s*M\s*O\s*D\s*E\s*E\s*M\s*P\s*R\s*E\s*G\s*A\s*D\s*O\s*S", content, re.IGNORECASE))
        
        if has_inss_fgts and (has_resumo_geral or has_resumo_empregados):
            company_match = re.search(r"Empresa:\s*\d+\s*-\s*(.+?)(?=\s{2,}|CNPJ:|$)", content, re.IGNORECASE)
            if company_match:
                company_name = company_match.group(1).strip()
            
            # Extract Total Proventos
            total_proventos = 0.0
            resumo_geral_match = re.search(r"R\s*E\s*S\s*U\s*M\s*O\s+G\s*E\s*R\s*A\s*L", content, re.IGNORECASE)
            if resumo_geral_match:
                start_idx = resumo_geral_match.start()
                sliced_content = content[start_idx:]
                prov_match = re.search(r"TOTAL\s+DE\s+PROVENTOS\s*-+>.*", sliced_content, re.IGNORECASE)
                if prov_match:
                    try:
                        valores_numericos = re.findall(r"[\d\.,]+", prov_match.group(0))
                        if valores_numericos:
                            total_proventos = clean_and_parse_float(valores_numericos[-1])
                    except Exception:
                        pass
                        
            # Extract Total Liquido GPS
            total_liquido_gps = 0.0
            gps_match = re.search(r"Total\s*L[ií]quido\.+:\s*([0-9.,]+)", content, re.IGNORECASE)
            if gps_match:
                try:
                    total_liquido_gps = clean_and_parse_float(gps_match.group(1))
                except Exception:
                    pass
                    
            # Extract FGTS sem 13o (Funcionário)
            fgts_sem_13o = 0.0
            fgts_match = re.search(r"FGTS\s*sem\s*13[o0°º]\s*\(Funcion[áa]rio\)\.+:\s*([0-9.,]+)", content, re.IGNORECASE)
            if fgts_match:
                try:
                    fgts_sem_13o = clean_and_parse_float(fgts_match.group(1))
                except Exception:
                    pass
                    
            # Extract IRRF s/Pró-Labore
            irrf_pro_labore = 0.0
            irrf_match = re.search(r"IRRF\s*s/Pr[óo]-Labore\.+\s*([0-9.,]+)", content, re.IGNORECASE)
            if irrf_match:
                try:
                    irrf_pro_labore = clean_and_parse_float(irrf_match.group(1))
                except Exception:
                    pass
                    
            # Consolidated calculation
            total = total_proventos + total_liquido_gps + fgts_sem_13o + irrf_pro_labore
            breakdown["folha"] = total
            
            return {
                "total": round(total, 2),
                "rowCount": 0,
                "breakdown": {k: round(v, 2) for k, v in breakdown.items()},
                "company_name": company_name
            }

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
                # Be careful: numbers might use comma as decimal (e.g. 1.621,00) or comma as separator
                # In standard Brazilian reports, comma is decimal and semicolon is the separator
                if ";" not in line_stripped and line_stripped.count(",") > 5:
                    delimiter = ","
                    break
            elif "|" in line_stripped:
                delimiter = "|"
                break
            elif "\t" in line_stripped:
                delimiter = "\t"
                break
        
        # Parse all lines using csv.reader on a StringIO buffer to handle quotes and multiline rows properly
        import io
        f = io.StringIO(content)
        reader = csv.reader(f, delimiter=delimiter)
        
        rows = []
        for r in reader:
            if r:
                rows.append([cell.strip() for cell in r])
        
        # Mapeamento de colunas de cabeçalho
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
        
        # Selecionar coluna alvo com base nas escolhas e fallbacks
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
        
        # Agregação de funcionários e linha de totais
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
            
            # Check if row starts with employee ID (4-digit number followed by space or just digits in column 0)
            if re.match(r'^\d{1,6}\s', first_cell) or (re.match(r'^\d{1,6}$', first_cell) and len(row) > 1):
                employee_rows.append(row)
        
        def extract_row_value(row) -> float:
            if target_idx != -1 and target_idx < len(row):
                val_str = row[target_idx].strip()
                return clean_and_parse_float(val_str)
            else:
                # Fallback to right-to-left heuristic
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
            
        # Se não houver linha de totalizador ou o valor nela for 0, somamos os funcionários
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

def split_combined_file(file_name: str, content: str) -> List[Dict[str, Any]]:
    lines = content.splitlines()
    has_entradas = any(re.search(r'- entr', line, re.I) for line in lines)
    has_saidas = any(re.search(r'- s[a-zãáí\ufffd\u00e1\u00ed\u00e3]+das', line, re.I) for line in lines)
    
    if not has_entradas or not has_saidas:
        return []
        
    saidas_line_index = -1
    saidas_regex = re.compile(r'- s[a-zãáí\ufffd\u00e1\u00ed\u00e3]+das', re.I)
    entradas_regex = re.compile(r'- entr', re.I)
    
    first_split_index = -1
    for i, line in enumerate(lines):
        if entradas_regex.search(line) or saidas_regex.search(line):
            first_split_index = i
            break
            
    header_lines = lines[:first_split_index] if first_split_index != -1 else []
    
    for i, line in enumerate(lines):
        if saidas_regex.search(line):
            saidas_line_index = i
            break
            
    if saidas_line_index == -1:
        return []
        
    entradas_lines = lines[:saidas_line_index]
    saidas_lines = lines[saidas_line_index:]
    
    entradas_content = "\n".join(entradas_lines)
    saidas_content = "\n".join(header_lines + saidas_lines)
    is_iss = "iss" in content.lower()
    
    return [
        {
            "name": f"Entradas - {file_name}",
            "content": entradas_content,
            "type": "Outras Despesas" if is_iss else "Compras"
        },
        {
            "name": f"Saídas - {file_name}",
            "content": saidas_content,
            "type": "Serviços" if is_iss else "Vendas"
        }
    ]

def detect_report_type(file_name: str, sample_content: str) -> str:
    fn_lower = file_name.lower()
    cont_lower = sample_content.lower()
    
    if ("compra" in fn_lower or 
        "entrada" in fn_lower or 
        "aquisic" in fn_lower or 
        "compra" in cont_lower or 
        "entradas" in cont_lower or 
        "1102" in cont_lower or 
        "1.102" in cont_lower):
        return "Compras"
        
    if ("folha" in fn_lower or 
        "salario" in fn_lower or 
        "prolabore" in fn_lower or 
        "pro-labore" in fn_lower or 
        "trabalhista" in fn_lower or 
        "salário" in cont_lower or 
        "salario" in cont_lower or 
        "pró-labore" in cont_lower or 
        "pro-labore" in cont_lower or 
        "prolabore" in cont_lower or 
        "empregados/custos" in cont_lower or 
        "contrato do empregado" in cont_lower or 
        "relação cálculo" in cont_lower or 
        "relacao calculo" in cont_lower or
        (re.search(r"VALORES\s+DE\s+INSS/FGTS\s+CONFORME\s+RESUMO\s+PROCESSADO", sample_content, re.IGNORECASE) and
         (re.search(r"RESUMO\s*GERAL|R\s*E\s*S\s*U\s*M\s*O\s*G\s*E\s*R\s*A\s*L", sample_content, re.IGNORECASE) or
          re.search(r"RESUMO\s*DE\s*EMPREGADOS|R\s*E\s*S\s*U\s*M\s*O\s*D\s*E\s*E\s*M\s*P\s*R\s*E\s*G\s*A\s*D\s*O\s*S", sample_content, re.IGNORECASE)))):
        return "Folha de Pagamento"
        
    if ("servico" in fn_lower or 
        "nfse" in fn_lower or 
        "prestacao" in fn_lower or 
        "prestação de serviço" in cont_lower or 
        "prestacao de servico" in cont_lower or 
        "9000" in cont_lower or 
        "9.000" in cont_lower):
        return "Serviços"
        
    if ("despesa" in fn_lower or 
        "gasto" in fn_lower or 
        "aluguel" in fn_lower or 
        "luz" in fn_lower or 
        "energia" in fn_lower or 
        "internet" in fn_lower or 
        "outra" in fn_lower or 
        "custo" in fn_lower or 
        "despesa" in cont_lower or 
        "aluguel" in cont_lower):
        return "Outras Despesas"
        
    return "Vendas"

def calculate_risk(files_data: List[Dict[str, Any]]) -> Dict[str, Any]:
    vendas_bruto = 0.0
    servicos = 0.0
    compras_bruto = 0.0
    folha = 0.0
    outras = 0.0
    devolucoes_entrada = 0.0
    devolucoes_saida = 0.0
    
    has_vendas = False
    has_servicos = False
    has_compras = False
    has_folha = False
    has_outras = False
    
    for f in files_data:
        ftype = f["type"]
        
        # Aggregate using breakdown dictionary if available
        if "breakdown" in f and f["breakdown"] is not None:
            bd = f["breakdown"]
            compras_bruto += bd.get("compras", 0.0)
            vendas_bruto += bd.get("vendas", 0.0)
            servicos += bd.get("servicos", 0.0)
            outras += bd.get("outras", 0.0)
            folha += bd.get("folha", 0.0)
            devolucoes_entrada += bd.get("devolucoes_entrada", 0.0)
            devolucoes_saida += bd.get("devolucoes_saida", 0.0)
        else:
            total = f.get("detectedTotal", 0.0)
            if ftype == "Vendas":
                vendas_bruto += total
            elif ftype == "Serviços":
                servicos += total
            elif ftype == "Compras":
                compras_bruto += total
            elif ftype == "Folha de Pagamento":
                folha += total
            elif ftype == "Outras Despesas":
                outras += total
        
        if ftype == "Vendas":
            has_vendas = True
        elif ftype == "Serviços":
            has_servicos = True
        elif ftype == "Compras":
            has_compras = True
        elif ftype == "Folha de Pagamento":
            has_folha = True
        elif ftype == "Outras Despesas":
            has_outras = True
            
    vendas_liquidas = max(0.0, vendas_bruto - devolucoes_entrada)
    compras_liquidas = max(0.0, compras_bruto - devolucoes_saida)
    
    faturamento = vendas_liquidas + servicos
    despesas = compras_liquidas + folha + outras
    
    compras_percentage = (compras_liquidas / faturamento) * 100 if faturamento > 0 else 0.0
    inciso_x_exceeded = compras_percentage > 80
    
    despesas_percentage = (despesas / faturamento) * 100 if faturamento > 0 else 0.0
    inciso_ix_exceeded = despesas_percentage > 120
    
    status_x = "Inconclusivo"
    status_ix = "Inconclusivo"
    
    text_verdict_x = "Aguardando envio dos relatórios de receita (Vendas/Serviços) e compras."
    text_verdict_ix = "Aguardando envio dos relatórios de receita, folha e despesas."
    
    # Inciso X
    if faturamento > 0 and has_compras:
        if inciso_x_exceeded:
            status_x = "Risco"
            text_verdict_x = f"RISCO DE EXCLUSÃO DETECTADO! As compras representam {compras_percentage:.2f}% do faturamento, ultrapassando o teto de 80% do Art. 29, Inciso X, LC 123/2006."
        else:
            status_x = "Regular"
            text_verdict_x = f"Regularidade Fiscal Sob o Art. 29. As compras de mercadorias representam {compras_percentage:.2f}% do faturamento tributável. Operação dentro do limite prudencial (80%)."
    elif not has_compras and faturamento > 0:
        status_x = "Inconclusivo"
        text_verdict_x = "Relatório de Compras pendente. Não é possível calcular o limite do Inciso X."
    elif has_compras and faturamento == 0:
        status_x = "Risco"
        text_verdict_x = "Brecha Gravíssima! Compras registradas sem nenhum faturamento correspondente no período."
        
    # Inciso IX
    if faturamento > 0:
        if inciso_ix_exceeded:
            status_ix = "Risco"
            text_verdict_ix = f"RISCO DE EXCLUSÃO DETECTADO! Despesas computadas somam {despesas_percentage:.2f}% do faturamento total, estourando o limite de 120% previsto no Art. 29, Inciso IX."
        else:
            if has_folha:
                status_ix = "Regular"
                text_verdict_ix = f"Regularidade Fiscal Sob o Art. 29. Despesas totais representam {despesas_percentage:.2f}% do faturamento total. Limite de 120% respeitado."
            else:
                status_ix = "Inconclusivo"
                text_verdict_ix = f"Análise Parcial: Despesas conhecidas representam {despesas_percentage:.2f}% do faturamento. Falta anexar o relatório de Pró-labore e Folha de Pagamento para o cálculo oficial definitivo."
    elif despesas > 0 and faturamento == 0:
        status_ix = "Risco"
        text_verdict_ix = "ALERTA CRÍTICO: Despesas declaradas sem nenhuma comprovação de receita declarada (Faturamento Zero)."
        
    return {
        "faturamento": round(faturamento, 2),
        "vendasContabilizadas": round(vendas_bruto, 2),
        "devolucoesVendas": round(devolucoes_entrada, 2),
        "vendasLiquidas": round(vendas_liquidas, 2),
        "servicosCfopContabilizados": round(servicos, 2),
        "comprasContabilizadas": round(compras_bruto, 2),
        "devolucoesCompras": round(devolucoes_saida, 2),
        "comprasLiquidas": round(compras_liquidas, 2),
        "despesasContabilizadas": round(despesas, 2),
        "folhaPagamentoContabilizada": round(folha, 2),
        "outrasDespesasContabilizadas": round(outras, 2),
        "outrasReceitasContabilizadas": 0.0,
        "comprasPercentage": round(compras_percentage, 2),
        "despesasPercentage": round(despesas_percentage, 2),
        "incisoXExceeded": inciso_x_exceeded,
        "incisoIXExceeded": inciso_ix_exceeded,
        "hasFolha": has_folha,
        "hasCompras": has_compras,
        "hasVendas": has_vendas,
        "hasServicos": has_servicos,
        "statusX": status_x,
        "statusIX": status_ix,
        "textVerdictX": text_verdict_x,
        "textVerdictIX": text_verdict_ix
    }


def generate_alerts(files_data: List[Dict[str, Any]], results: Dict[str, Any], is_manual: bool = False) -> List[Dict[str, str]]:
    alerts = []
    
    if len(files_data) == 0 and not is_manual:
        alerts.append({
            "id": "no-files",
            "type": "info",
            "message": "Aguardando envio dos relatórios",
            "description": "Suba relatórios de faturamento, compras e despesas (CSV/TXT/Excel/PDF) no painel de upload para iniciar."
        })
        return alerts
        
    if not results["hasFolha"]:
        alerts.append({
            "id": "missing-folha",
            "type": "warning",
            "message": "⚠️ Atenção: Valores de Folha de Pagamentos não preenchidos" if is_manual else "⚠️ Atenção: Relatório de Folha de Pagamentos não enviado",
            "description": "A ausência de custos previdenciários e trabalhistas compromete a análise do Inciso IX (Despesas < 120%). O status continuará como 'Inconclusivo' até que os valores de salários e pró-labore sejam computados."
        })
        
    if not results["hasCompras"]:
        alerts.append({
            "id": "missing-compras",
            "type": "warning",
            "message": "⚠️ Valores de Compras ausentes",
            "description": "Adicione o total de aquisições para podermos computar o limite do Inciso X."
        })
        
    if not results["hasVendas"] and not results["hasServicos"] and results.get("outrasReceitasContabilizadas", 0.0) == 0.0:
        alerts.append({
            "id": "missing-revenue",
            "type": "danger",
            "message": "❌ Sem Valores de Receita (Vendas/Serviços)",
            "description": "O faturamento do Simples Nacional é a base de cálculo de todo o Artigo 29. Sem receitas declaradas, qualquer despesa ou compra acarreta risco imediato de desenquadramento."
        })
        
    if results["incisoXExceeded"]:
        alerts.append({
            "id": "inciso-x-triggered",
            "type": "danger",
            "message": "🚨 Extrapolação do Inciso X (Compras > 80% do Faturamento)",
            "description": f"Risco iminente de autuação e exclusão de ofício. Compras de {results['comprasPercentage']:.1f}% superam a barreira dos 80% do Art. 29, Inciso X, presumindo faturamento omitido pelo contribuinte."
        })
        
    if results["incisoIXExceeded"]:
        alerts.append({
            "id": "inciso-ix-triggered",
            "type": "danger",
            "message": "🚨 Extrapolação do Inciso IX (Despesas > 120% do Faturamento)",
            "description": f"Irregularidade Fiscal Crítica. Despesas pagas computadas representam {results['despesasPercentage']:.1f}% do faturamento, ultrapassando os 120%. A exclusão de ofício pode ser decidida pela Receita."
        })
        
    if ((len(files_data) > 0 or is_manual) and 
        not results["incisoXExceeded"] and 
        not results["incisoIXExceeded"] and 
        (results["hasVendas"] or results["hasServicos"] or results.get("outrasReceitasContabilizadas", 0.0) > 0.0) and 
        results["hasCompras"] and 
        results["hasFolha"]):
        alerts.append({
            "id": "perfect-regular",
            "type": "success",
            "message": "✅ Elegibilidade Saudável (Simples Nacional Mantido)",
            "description": "Os indicadores da empresa mostram conformidade matemática estrita: compras abaixo de 80% e despesas gerais abaixo de 120% do faturamento do período."
        })
        
    return alerts


def calculate_risk_from_values(
    vendas: float,
    compras: float,
    servicos_prestados: float,
    servicos_tomados: float,
    folha_pagamento: float,
    outras_receitas: float,
    outras_despesas: float,
    devolucoes_vendas: float = 0.0,
    devolucoes_compras: float = 0.0
) -> Dict[str, Any]:
    # Calculate faturamento and despesas
    vendas_liquidas = max(0.0, vendas - devolucoes_vendas)
    compras_liquidas = max(0.0, compras - devolucoes_compras)
    
    faturamento = vendas_liquidas + servicos_prestados + outras_receitas
    despesas = compras_liquidas + folha_pagamento + servicos_tomados + outras_despesas
    
    compras_percentage = (compras_liquidas / faturamento) * 100 if faturamento > 0 else 0.0
    inciso_x_exceeded = compras_percentage > 80
    
    despesas_percentage = (despesas / faturamento) * 100 if faturamento > 0 else 0.0
    inciso_ix_exceeded = despesas_percentage > 120
    
    status_x = "Inconclusivo"
    status_ix = "Inconclusivo"
    
    text_verdict_x = "Aguardando definição de faturamento (Vendas/Serviços/Outras Receitas) e compras."
    text_verdict_ix = "Aguardando definição de faturamento, folha e despesas."
    
    has_vendas = vendas > 0
    has_servicos = servicos_prestados > 0
    has_compras = compras > 0
    has_folha = folha_pagamento > 0
    has_outras = (servicos_tomados + outras_despesas) > 0
    
    # Inciso X
    if faturamento > 0 and has_compras:
        if inciso_x_exceeded:
            status_x = "Risco"
            text_verdict_x = f"RISCO DE EXCLUSÃO DETECTADO! As compras representam {compras_percentage:.2f}% do faturamento, ultrapassando o teto de 80% do Art. 29, Inciso X, LC 123/2006."
        else:
            status_x = "Regular"
            text_verdict_x = f"Regularidade Fiscal Sob o Art. 29. As compras de mercadorias representam {compras_percentage:.2f}% do faturamento tributável. Operação dentro do limite prudencial (80%)."
    elif not has_compras and faturamento > 0:
        status_x = "Inconclusivo"
        text_verdict_x = "Compras zeradas ou não informadas. Não é possível calcular o limite do Inciso X."
    elif has_compras and faturamento == 0:
        status_x = "Risco"
        text_verdict_x = "Brecha Gravíssima! Compras registradas sem nenhum faturamento correspondente no período."
        
    # Inciso IX
    if faturamento > 0:
        if inciso_ix_exceeded:
            status_ix = "Risco"
            text_verdict_ix = f"RISCO DE EXCLUSÃO DETECTADO! Despesas computadas somam {despesas_percentage:.2f}% do faturamento total, estourando o limite de 120% previsto no Art. 29, Inciso IX."
        else:
            if has_folha:
                status_ix = "Regular"
                text_verdict_ix = f"Regularidade Fiscal Sob o Art. 29. Despesas totais representam {despesas_percentage:.2f}% do faturamento total. Limite de 120% respeitado."
            else:
                status_ix = "Inconclusivo"
                text_verdict_ix = f"Análise Parcial: Despesas conhecidas representam {despesas_percentage:.2f}% do faturamento. Falta informar Pró-labore e Folha de Pagamento para o cálculo oficial definitivo."
    elif despesas > 0 and faturamento == 0:
        status_ix = "Risco"
        text_verdict_ix = "ALERTA CRÍTICO: Despesas declaradas sem nenhuma comprovação de receita declarada (Faturamento Zero)."
        
    return {
        "faturamento": round(faturamento, 2),
        "vendasContabilizadas": round(vendas, 2),
        "devolucoesVendas": round(devolucoes_vendas, 2),
        "vendasLiquidas": round(vendas_liquidas, 2),
        "servicosCfopContabilizados": round(servicos_prestados, 2),
        "comprasContabilizadas": round(compras, 2),
        "devolucoesCompras": round(devolucoes_compras, 2),
        "comprasLiquidas": round(compras_liquidas, 2),
        "despesasContabilizadas": round(despesas, 2),
        "folhaPagamentoContabilizada": round(folha_pagamento, 2),
        "outrasDespesasContabilizadas": round(servicos_tomados + outras_despesas, 2),
        "outrasReceitasContabilizadas": round(outras_receitas, 2),
        "comprasPercentage": round(compras_percentage, 2),
        "despesasPercentage": round(despesas_percentage, 2),
        "incisoXExceeded": inciso_x_exceeded,
        "incisoIXExceeded": inciso_ix_exceeded,
        "hasFolha": has_folha,
        "hasCompras": has_compras,
        "hasVendas": has_vendas,
        "hasServicos": has_servicos,
        "statusX": status_x,
        "statusIX": status_ix,
        "textVerdictX": text_verdict_x,
        "textVerdictIX": text_verdict_ix
    }


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class FileBreakdown(BaseModel):
    compras: float = 0.0
    vendas: float = 0.0
    servicos: float = 0.0
    outras: float = 0.0
    folha: float = 0.0

class FileItemModel(BaseModel):
    id: str
    name: str
    size: int
    type: str
    content: str
    rowCount: int
    detectedTotal: float
    processedByBackend: Optional[bool] = True
    breakdown: Optional[FileBreakdown] = None

class AnalysisResultsModel(BaseModel):
    faturamento: float = 0.0
    vendasContabilizadas: float = 0.0
    servicosCfopContabilizados: float = 0.0
    comprasContabilizadas: float = 0.0
    despesasContabilizadas: float = 0.0
    folhaPagamentoContabilizada: float = 0.0
    outrasDespesasContabilizadas: float = 0.0
    outrasReceitasContabilizadas: float = 0.0
    comprasPercentage: float = 0.0
    despesasPercentage: float = 0.0
    incisoXExceeded: bool = False
    incisoIXExceeded: bool = False
    hasFolha: bool = False
    hasCompras: bool = False
    hasVendas: bool = False
    hasServicos: bool = False
    statusX: str = "Inconclusivo"
    statusIX: str = "Inconclusivo"
    textVerdictX: str = ""
    textVerdictIX: str = ""

class AuditRecordInput(BaseModel):
    companyName: str
    period: str
    results: AnalysisResultsModel
    files: list[FileItemModel]

class AuditRecord(BaseModel):
    id: str
    timestamp: str
    companyName: str
    period: str
    results: AnalysisResultsModel
    files: list[FileItemModel]


class CompareRequest(BaseModel):
    audit_id_a: str
    audit_id_b: str

class ManualValuesModel(BaseModel):
    companyName: str
    period: str
    vendas: float = 0.0
    compras: float = 0.0
    servicos_prestados: float = 0.0
    servicos_tomados: float = 0.0
    folha_pagamento: float = 0.0
    outras_receitas: float = 0.0
    outras_despesas: float = 0.0
    is_manual: bool = True

# ---------------------------------------------------------------------------
# History helpers (JSON file storage)
# ---------------------------------------------------------------------------

HISTORY_FILE = Path(__file__).parent / "data" / "history.json"
MANUAL_VALUES_FILE = Path(__file__).parent / "data" / "manual_values.json"

def _ensure_data_dir():
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not HISTORY_FILE.exists():
        HISTORY_FILE.write_text("[]", encoding="utf-8")
    if not MANUAL_VALUES_FILE.exists():
        MANUAL_VALUES_FILE.write_text("{}", encoding="utf-8")

def _load_history() -> list:
    _ensure_data_dir()
    try:
        return json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, FileNotFoundError):
        return []

def _save_history(data: list):
    _ensure_data_dir()
    HISTORY_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def _load_manual_values() -> dict:
    _ensure_data_dir()
    try:
        return json.loads(MANUAL_VALUES_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, FileNotFoundError):
        return {}

def _save_manual_values(data: dict):
    _ensure_data_dir()
    MANUAL_VALUES_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# ---------------------------------------------------------------------------
# Simulation Profiles
# ---------------------------------------------------------------------------

SIMULATION_PROFILES = [
    {
        "id": "regular-healthy",
        "title": "Caso 1: Empresa Regular (Conformidade Fiscal)",
        "companyName": "Alfa Soluções e Comércio Ltda",
        "period": "1º Trimestre de 2026",
        "description": "Operação saudável com compras de insumos controladas e despesas operacionais inferiores ao faturamento obtido no mesmo período.",
        "badge": "Saudável",
        "badgeColor": "bg-emerald-50 text-emerald-700 border-emerald-200",
        "files": [
            {
                "id": "vendas-1",
                "name": "vendas_saidas_q1_2026.csv",
                "size": 1420,
                "type": "Vendas",
                "content": "CFOP,Descrição do Item,Valor Líquido,ST\n5102,Venda de mercadoria adquirida de terceiros,R$ 210.000,00,Isento\n5102,Venda de produtos revenda comercial,R$ 180.000,00,Isento\n5949,Remessa em bonificação de mercadorias,R$ 15.000,00,Isento (Desconsiderado)\n5201,Devolução de compras de insumos para revenda,R$ 10.000,00,Isento (Desconsiderado)"
            },
            {
                "id": "servicos-1",
                "name": "notas_fiscais_servicos_q1.csv",
                "size": 980,
                "type": "Serviços",
                "content": "Cód. Serviço,Descrição do Serviço Prestado,Valor Cobrado,Status\n9000-01,Prestação de Serviço de Assessoria em TI,R$ 80.000,00,Ativo\n9000-02,Prestação de Serviço de Consultoria Técnica,R$ 30.000,00,Ativo\n9000-99,Nota Fiscal de Serviço Cancelada na Receita,R$ 25.000,00,Cancelado (Desconsiderado)"
            },
            {
                "id": "compras-1",
                "name": "compras_insumos_q1.csv",
                "size": 1250,
                "type": "Compras",
                "content": "CFOP,Descrição da Aquisição,Valor Nota,Imposto\n1102,Compra para comercialização (Matéria Prima),R$ 110.000,00,Tributado\n1104,Compra para industrialização de itens,R$ 70.000,00,Tributado\n1551,Compra de bem para o ativo imobilizado (Computadores),R$ 40.000,00,Isento (Desconsiderado)\n1353,Aquisição de serviço de frete interestadual,R$ 5.000,00,Isento (Desconsiderado)"
            },
            {
                "id": "folha-1",
                "name": "resumo_folha_prolabore_q1.csv",
                "size": 850,
                "type": "Folha de Pagamento",
                "content": "Código,Descrição Rubrica Trabalhista,Valor Pago,Referência\n101,Salários e Gratificações a Empregados,R$ 50.000,00,Mensal\n104,Encargos e Contribuição Previdenciária (INSS Patronal),R$ 15.000,00,Mensal\n201,Retirada Mensal de Pró-labore de Sócios,R$ 15.000,00,Mensal"
            },
            {
                "id": "outras-1",
                "name": "despesas_operacionais_mensais.csv",
                "size": 720,
                "type": "Outras Despesas",
                "content": "Competência,Descrição do Desembolso Caixa,Valor Pago,Observação\nJaneiro,Aluguel da Sede Comercial e Condomínio,R$ 12.000,00,Recorrente\nFevereiro,Energia Elétrica e Serviços de Internet,R$ 18.000,00,Recorrente\nMarço,Honorários Advocatícios e Contação Geral,R$ 10.000,00,Despesa Tax"
            }
        ]
    },
    {
        "id": "risk-excess-purchases",
        "title": "Caso 2: Exclusão Art. 29, Inciso X (Compras excessivas)",
        "companyName": "Distribuidora de Alimentos Sul Ltda",
        "period": "Janeiro a Abril / 2026",
        "description": "Exemplo onde as compras de mercadorias ultrapassam 80% do faturamento total. Prática que deflagra presunção de omissão de receitas pela Receita Federal, acarretando exclusão.",
        "badge": "Risco Compras",
        "badgeColor": "bg-red-50 text-red-700 border-red-200",
        "files": [
            {
                "id": "vendas-2",
                "name": "vendas_faturamento_q1_p.csv",
                "size": 1100,
                "type": "Vendas",
                "content": "CFOP,Descrição Operação de Saída,Valor Líquido,Observações\n5102,Venda Mercadorias canal físico,R$ 200.000,00,Operante\n5102,Venda Mercadorias loja digital,R$ 100.000,00,Operante\n5910,Remessa para demonstração externa,R$ 20.000,00,Isento (Desconsiderado)"
            },
            {
                "id": "compras-2",
                "name": "compras_inventario_alto.csv",
                "size": 1300,
                "type": "Compras",
                "content": "CFOP,Descrição de Notas de Entrada,Valor Nota,Observação\n1102,Aquisição de alimentos secos estocados,R$ 150.000,00,Estoque Elevado\n1102,Compra para revenda (Bebidas e doces),R$ 110.000,00,Estoque Elevado\n1104,Compra de embalagens plásticas industriais,R$ 44.000,00,Estoque Elevado\n1551,Compra de Caminhão para Entrega Própria,R$ 90.000,00,Ativo Imobilizado (Desconsiderado)"
            },
            {
                "id": "folha-2",
                "name": "folha_pagamentos_distribuidora.csv",
                "size": 600,
                "type": "Folha de Pagamento",
                "content": "Código,Item,Valor Pago,Notas\n101,Folha Mensal de Escritório,R$ 20.000,00,Administrativo\n201,Retirada Pró-labore Sócios,R$ 5.000,00,Administrativo"
            },
            {
                "id": "outras-2",
                "name": "despesas_operacionais_recorrentes.csv",
                "size": 600,
                "type": "Outras Despesas",
                "content": "Mês,Descrição Despesa,Valor Pago,Notas\nGeral,Aluguel de Galpão Industrial,R$ 15.000,00,Operação"
            }
        ]
    },
    {
        "id": "risk-excess-expenses",
        "title": "Caso 3: Exclusão Art. 29, Inciso IX (Despesas > 120%)",
        "companyName": "Clínica Odonto Saúde Integral S/S",
        "period": "1º Semestre de 2026",
        "description": "Situação em que as despesas totais (compras + folha + aluguéis/outros) somadas ultrapassam 120% do faturamento da empresa. Demonstra incapacidade operacional financeira declarada.",
        "badge": "Risco Despesas",
        "badgeColor": "bg-amber-50 text-amber-700 border-amber-200",
        "files": [
            {
                "id": "vendas-3",
                "name": "notas_servicos_faturados.csv",
                "size": 1000,
                "type": "Serviços",
                "content": "Cód. Serviço,Descrição Nota Fiscal,Valor Cobrado,Status\n9000-01,Tratamentos Estéticos e Clínicos Gerais,R$ 150.000,00,Emitida\n9000-02,Consultas Médicas de Emergência,R$ 50.000,00,Emitida"
            },
            {
                "id": "compras-3",
                "name": "compras_insumos_clinica.csv",
                "size": 1100,
                "type": "Compras",
                "content": "CFOP,Descrição,Valor Nota,Observações\n1102,Compra de materiais descartáveis dentários,R$ 30.000,00,Consumo Clínico\n1104,Equipamentos odontológicos e brocas de revenda,R$ 10.000,00,Consumo Clínico"
            },
            {
                "id": "folha-3",
                "name": "folha_custo_trabalhista_6m.csv",
                "size": 900,
                "type": "Folha de Pagamento",
                "content": "Código,Descrição,Valor,Referência\n101,Folha Corpo Médico e Secretárias,R$ 110.000,00,Acumulado\n102,Retiradas Pró-labore Sócios e Diretores,R$ 40.000,00,Acumulado\n104,Encargos Sociais e FGTS / INSS,R$ 30.000,00,Acumulado"
            },
            {
                "id": "outras-3",
                "name": "outros_alugueis_energia.csv",
                "size": 800,
                "type": "Outras Despesas",
                "content": "Despesa,Descrição Operação,Valor,Tipo\n1,Aluguel clínica e estacionamento,R$ 20.000,00,Fixo\n2,Serviço de limpeza especializada hospitalar,R$ 10.000,00,Fixo\n3,Marketing digital e anúncios locais,R$ 15.000,00,Variável"
            }
        ]
    },
    {
        "id": "incomplete-missing-reports",
        "title": "Caso 4: Dados Ausentes (Inconclusão de Análise)",
        "companyName": "Metalúrgica Forja Rápida Eireli",
        "period": "Exercício de 2026",
        "description": "Empresa envia compras e faturamento comercial, mas não anexa o relatório de Folha de Pagamentos nem despesas gerais. O sistema deve alertar a falta das despesas sem interromper os outros cálculos.",
        "badge": "Incompleto",
        "badgeColor": "bg-slate-50 text-slate-700 border-slate-200",
        "files": [
            {
                "id": "vendas-4",
                "name": "faturamento_metalurgica_ex_2026.csv",
                "size": 1100,
                "type": "Vendas",
                "content": "CFOP,Especificação da Saída,Valor Líquido,Observações\n5102,Venda de portões e vigas de ferro,R$ 400.000,00,Líquido Comercial\n5102,Vendas chapas de aço sob medida,R$ 200.000,00,Líquido Comercial"
            },
            {
                "id": "compras-4",
                "name": "entradas_aco_e_ferro.csv",
                "size": 1200,
                "type": "Compras",
                "content": "CFOP,Especificação Entrada Insumo,Valor Nota,Observações\n1102,Compra de perfis de aço laminados,R$ 210.000,00,Uso Industrial\n1102,Aquisição de eletrodos e soldas industriais,R$ 30.000,00,Uso Industrial"
            }
        ]
    }
]

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}

@app.get("/api/report-types")
def get_report_types():
    return REPORT_TYPES_INFO

@app.get("/api/config")
def get_config():
    return {
        "thresholds": {
            "incisoX": 80,
            "incisoIX": 120,
            "cautionX": 70,
            "cautionIX": 100
        },
        "legalReferences": {
            "incisoX": "Art. 29, Inciso X da LC 123/2006",
            "incisoIX": "Art. 29, Inciso IX da LC 123/2006"
        }
    }

@app.post("/api/detect-type")
async def detect_type(file: UploadFile = File(...)):
    content_bytes = await file.read()
    try:
        sample_text = content_bytes.decode("utf-8")
    except Exception:
        try:
            sample_text = content_bytes.decode("cp1252")
        except Exception:
            sample_text = content_bytes.decode("utf-8", errors="ignore")
    detected = detect_report_type(file.filename, sample_text[:1000])
    return {"type": detected}

@app.post("/api/reanalyze-file")
async def reanalyze_file(
    file: UploadFile = File(...),
    report_type: str = Form(...),
    payroll_base: str = Form("custo_func")
):
    content_bytes = await file.read()
    filename = file.filename
    file_size = len(content_bytes)

    if filename.lower().endswith(".xlsx"):
        parsed = parse_excel(content_bytes, report_type, payroll_base)
        text_repr = f"PLANILHA EXCEL PARSADA: {parsed['rowCount']} linhas."
    elif filename.lower().endswith(".pdf"):
        parsed = parse_pdf(content_bytes, report_type, payroll_base)
        text_repr = f"DOCUMENTO PDF PARSADO: {parsed['rowCount']} linhas."
    else:
        try:
            sample_text = content_bytes.decode("utf-8")
        except Exception:
            try:
                sample_text = content_bytes.decode("cp1252")
            except Exception:
                sample_text = content_bytes.decode("utf-8", errors="ignore")
        parsed = parse_csv_txt(sample_text, report_type, payroll_base)
        text_repr = sample_text

    return {
        "id": f"file-{filename}-{file_size}",
        "name": filename,
        "size": file_size,
        "type": report_type,
        "content": text_repr,
        "rowCount": parsed["rowCount"],
        "detectedTotal": parsed["total"],
        "processedByBackend": True,
        "breakdown": parsed.get("breakdown", {"compras": 0.0, "vendas": 0.0, "servicos": 0.0, "outras": 0.0, "folha": 0.0}),
        "companyName": parsed.get("company_name")
    }

# --- History endpoints ---

@app.get("/api/history")
def get_history():
    return _load_history()

@app.post("/api/history")
def create_history(record_input: AuditRecordInput):
    history = _load_history()
    new_record = {
        "id": "hist_" + uuid.uuid4().hex[:12],
        "timestamp": datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
        "companyName": record_input.companyName,
        "period": record_input.period,
        "results": record_input.results.model_dump(),
        "files": [f.model_dump() for f in record_input.files]
    }
    history.insert(0, new_record)
    _save_history(history)
    return new_record

@app.delete("/api/history/{audit_id}")
def delete_history_record(audit_id: str):
    history = _load_history()
    history = [r for r in history if r["id"] != audit_id]
    _save_history(history)
    return {"deleted": True}

@app.delete("/api/history")
def clear_history():
    _save_history([])
    return {"cleared": True}

# --- Simulation profiles ---

@app.get("/api/simulation-profiles")
def get_simulation_profiles():
    return SIMULATION_PROFILES

# --- Verdict ---

@app.post("/api/verdict")
def get_verdict(results: AnalysisResultsModel):
    has_risk = results.statusX == "Risco" or results.statusIX == "Risco"
    is_incomplete = results.statusX == "Inconclusivo" or results.statusIX == "Inconclusivo"

    if has_risk:
        return {
            "label": "EM RISCO DE EXCLUSÃO",
            "sub": "Presunção legal de irregularidade sob o Art. 29 da LC 123/06",
            "severity": "danger"
        }
    elif is_incomplete:
        return {
            "label": "REGULARIDADE PARCIAL / DADOS AUSENTES",
            "sub": "A auditoria fiscal definitiva depende da anexação de documentos pendentes",
            "severity": "warning"
        }
    else:
        return {
            "label": "REGULAR / SEM RISCO APARENTE",
            "sub": "A empresa encontra-se operando dentro das margens prudenciais permitidas",
            "severity": "success"
        }

# --- Compare audits ---

@app.post("/api/compare-audits")
def compare_audits(req: CompareRequest):
    history = _load_history()
    rec_a = next((r for r in history if r["id"] == req.audit_id_a), None)
    rec_b = next((r for r in history if r["id"] == req.audit_id_b), None)

    if not rec_a or not rec_b:
        raise HTTPException(status_code=404, detail="One or both audit records not found")

    res_a = rec_a["results"]
    res_b = rec_b["results"]

    return {
        "recordA": rec_a,
        "recordB": rec_b,
        "diffs": {
            "faturamento": res_b["faturamento"] - res_a["faturamento"],
            "compras": res_b["comprasContabilizadas"] - res_a["comprasContabilizadas"],
            "despesas": res_b["despesasContabilizadas"] - res_a["despesasContabilizadas"],
            "comprasPercentageDiff": res_b["comprasPercentage"] - res_a["comprasPercentage"],
            "despesasPercentageDiff": res_b["despesasPercentage"] - res_a["despesasPercentage"],
            "riskChangeX": res_a["statusX"] != res_b["statusX"],
            "riskChangeIX": res_a["statusIX"] != res_b["statusIX"]
        }
    }

# --- Manual Values endpoints ---

@app.get("/api/manual-values")
def get_manual_values(company: str, period: str):
    manual_data = _load_manual_values()
    key = f"{company.strip().lower()}|||{period.strip().lower()}"
    if key in manual_data:
        model = manual_data[key]
        results = calculate_risk_from_values(
            vendas=model.get("vendas", 0.0),
            compras=model.get("compras", 0.0),
            servicos_prestados=model.get("servicos_prestados", 0.0),
            servicos_tomados=model.get("servicos_tomados", 0.0),
            folha_pagamento=model.get("folha_pagamento", 0.0),
            outras_receitas=model.get("outras_receitas", 0.0),
            outras_despesas=model.get("outras_despesas", 0.0)
        )
        alerts = generate_alerts([], results, is_manual=model.get("is_manual", False))
        return {
            "manualValues": model,
            "results": results,
            "alerts": alerts
        }
    
    empty_model = {
        "companyName": company,
        "period": period,
        "vendas": 0.0,
        "compras": 0.0,
        "servicos_prestados": 0.0,
        "servicos_tomados": 0.0,
        "folha_pagamento": 0.0,
        "outras_receitas": 0.0,
        "outras_despesas": 0.0,
        "is_manual": False
    }
    results = calculate_risk_from_values(0, 0, 0, 0, 0, 0, 0)
    alerts = generate_alerts([], results, is_manual=False)
    return {
        "manualValues": empty_model,
        "results": results,
        "alerts": alerts
    }

@app.post("/api/manual-values")
def save_manual_values(model: ManualValuesModel):
    manual_data = _load_manual_values()
    key = f"{model.companyName.strip().lower()}|||{model.period.strip().lower()}"
    
    manual_data[key] = model.model_dump()
    _save_manual_values(manual_data)
    
    results = calculate_risk_from_values(
        vendas=model.vendas,
        compras=model.compras,
        servicos_prestados=model.servicos_prestados,
        servicos_tomados=model.servicos_tomados,
        folha_pagamento=model.folha_pagamento,
        outras_receitas=model.outras_receitas,
        outras_despesas=model.outras_despesas
    )
    alerts = generate_alerts([], results, is_manual=model.is_manual)
    
    return {
        "results": results,
        "alerts": alerts,
        "manualValues": model.model_dump()
    }

@app.delete("/api/manual-values")
def delete_manual_values(company: str, period: str):
    manual_data = _load_manual_values()
    key = f"{company.strip().lower()}|||{period.strip().lower()}"
    if key in manual_data:
        del manual_data[key]
        _save_manual_values(manual_data)
        return {"deleted": True}
    return {"deleted": False}

# --- Original analyze endpoint ---

@app.post("/api/analyze")
async def analyze_files(
    files: List[UploadFile] = File(...),
    file_configs: Optional[str] = Form(None),
    payroll_base: str = Form("custo_func")
):
    configs = []
    if file_configs:
        try:
            configs = json.loads(file_configs)
        except Exception:
            pass
            
    config_by_name = {c.get("name"): c for c in configs}
    
    processed_files = []
    
    for uploaded_file in files:
        filename = uploaded_file.filename
        content_bytes = await uploaded_file.read()
        file_size = len(content_bytes)
        
        # Get custom type if it is configured, or auto-detect
        conf = config_by_name.get(filename, {})
        file_id = conf.get("id", f"file-{filename}-{file_size}")
        report_type = conf.get("type", None)
        
        # Try checking for combined CSV/TXT first
        is_text = not filename.lower().endswith(('.xlsx', '.pdf'))
        sample_text = ""
        
        if is_text:
            try:
                sample_text = content_bytes.decode('utf-8')
                # If there are many replacement characters, try cp1252
                if sample_text.count('\ufffd') > 5:
                    sample_text = content_bytes.decode('cp1252')
            except Exception:
                try:
                    sample_text = content_bytes.decode('cp1252')
                except Exception:
                    sample_text = content_bytes.decode('utf-8', errors='ignore')
                    
        # Split combined file if text and combined format
        splits = []
        if is_text and sample_text:
            splits = split_combined_file(filename, sample_text)
            
        if splits:
            for item in splits:
                split_name = item["name"]
                split_content = item["content"]
                split_type = item["type"]
                
                # Check if user has explicitly overwritten this split file's type
                conf_split = config_by_name.get(split_name, {})
                split_id = conf_split.get("id", f"split-{split_name}")
                final_split_type = conf_split.get("type", split_type)
                
                parsed = parse_csv_txt(split_content, final_split_type, payroll_base)
                
                processed_files.append({
                    "id": split_id,
                    "name": split_name,
                    "size": int(file_size / 2),
                    "type": final_split_type,
                    "content": split_content,
                    "rowCount": parsed["rowCount"],
                    "detectedTotal": parsed["total"],
                    "breakdown": parsed.get("breakdown", {"compras": 0.0, "vendas": 0.0, "servicos": 0.0, "outras": 0.0, "folha": 0.0}),
                    "companyName": parsed.get("company_name")
                })
        else:
            # Standard single file
            if not report_type:
                # Auto detect based on name and sample content
                detect_sample = ""
                if is_text:
                    detect_sample = sample_text[:1000]
                elif filename.lower().endswith('.pdf'):
                    try:
                        reader = PdfReader(io.BytesIO(content_bytes))
                        if reader.pages:
                            detect_sample = reader.pages[0].extract_text()[:1000] or ""
                    except Exception:
                        pass
                report_type = detect_report_type(filename, detect_sample)
                
            # Parse based on extension
            if filename.lower().endswith('.xlsx'):
                parsed = parse_excel(content_bytes, report_type, payroll_base)
                text_repr = f"PLANILHA EXCEL PARSADA: {parsed['rowCount']} linhas."
            elif filename.lower().endswith('.pdf'):
                parsed = parse_pdf(content_bytes, report_type, payroll_base)
                text_repr = f"DOCUMENTO PDF PARSADO: {parsed['rowCount']} linhas."
            else:
                parsed = parse_csv_txt(sample_text, report_type, payroll_base)
                text_repr = sample_text
                
            processed_files.append({
                "id": file_id,
                "name": filename,
                "size": file_size,
                "type": report_type,
                "content": text_repr,
                "rowCount": parsed["rowCount"],
                "detectedTotal": parsed["total"],
                "breakdown": parsed.get("breakdown", {"compras": 0.0, "vendas": 0.0, "servicos": 0.0, "outras": 0.0, "folha": 0.0}),
                "companyName": parsed.get("company_name")
            })
            
    # Calculate global indicators and alerts
    results = calculate_risk(processed_files)
    alerts = generate_alerts(processed_files, results)
    
    # Agregar os nomes de empresa detectados e selecionar o mais completo (mais longo)
    company_names = [f.get("companyName") for f in processed_files if f.get("companyName")]
    detected_company_name = None
    if company_names:
        unique_names = list(set(company_names))
        unique_names.sort(key=len, reverse=True)
        detected_company_name = unique_names[0]
        
    return {
        "files": processed_files,
        "results": results,
        "alerts": alerts,
        "detectedCompanyName": detected_company_name
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)

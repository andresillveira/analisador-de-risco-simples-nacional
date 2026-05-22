import re
import csv
import pandas as pd
from typing import List, Optional

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

import os
import sys
import re

import importlib.util

# Load app.py dynamically to prevent collision with the 'app' package
backend_dir = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("app_monolithic", os.path.join(backend_dir, "app.py"))
app_monolithic = importlib.util.module_from_spec(spec)
sys.modules["app_monolithic"] = app_monolithic
spec.loader.exec_module(app_monolithic)

parse_csv_txt = app_monolithic.parse_csv_txt
CFOP_MAP = app_monolithic.CFOP_MAP
split_combined_file = app_monolithic.split_combined_file

def read_file_safely(path):
    with open(path, "rb") as f:
        content_bytes = f.read()
    try:
        sample_text = content_bytes.decode('utf-8')
        if sample_text.count('\ufffd') > 5:
            sample_text = content_bytes.decode('cp1252')
    except Exception:
        try:
            sample_text = content_bytes.decode('cp1252')
        except Exception:
            sample_text = content_bytes.decode('utf-8', errors='ignore')
    return sample_text

def run_tests():
    print("=== STARTING PARSER VERIFICATION SYSTEM ===")
    exemples_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "exemples")
    
    if not os.path.exists(exemples_dir):
        print(f"Error: examples directory not found at {exemples_dir}")
        sys.exit(1)
        
    print(f"Examples directory found at: {exemples_dir}")
    print(f"Loaded {len(CFOP_MAP)} CFOP definitions.\n")
    
    # 1. Test Folha de Pagamento 01-2026
    folha1_path = os.path.join(exemples_dir, "AGROBORGES - FOLHA - 01-2026.csv")
    content = read_file_safely(folha1_path)
    parsed = parse_csv_txt(content, "Folha de Pagamento")
    print(f"File: {os.path.basename(folha1_path)}")
    print(f"  Detected Total: {parsed['total']}")
    print(f"  Row Count: {parsed['rowCount']}")
    print(f"  Breakdown: {parsed['breakdown']}")
    assert abs(parsed['total'] - 11250.82) < 0.01, f"Expected 11250.82, got {parsed['total']}"
    print("  => SUCCESS!\n")

    # 2. Test Folha de Pagamento 02-2026
    folha2_path = os.path.join(exemples_dir, "AGROBORGES - FOLHA - 02-2026.csv")
    content = read_file_safely(folha2_path)
    parsed = parse_csv_txt(content, "Folha de Pagamento")
    print(f"File: {os.path.basename(folha2_path)}")
    print(f"  Detected Total: {parsed['total']}")
    print(f"  Row Count: {parsed['rowCount']}")
    print(f"  Breakdown: {parsed['breakdown']}")
    assert abs(parsed['total'] - 11307.65) < 0.01, f"Expected 11307.65, got {parsed['total']}"
    print("  => SUCCESS!\n")

    # 3. Test Folha de Pagamento 03-2026
    folha3_path = os.path.join(exemples_dir, "AGROBORGES - FOLHA - 03-2026.csv")
    content = read_file_safely(folha3_path)
    parsed = parse_csv_txt(content, "Folha de Pagamento")
    print(f"File: {os.path.basename(folha3_path)}")
    print(f"  Detected Total: {parsed['total']}")
    print(f"  Row Count: {parsed['rowCount']}")
    print(f"  Breakdown: {parsed['breakdown']}")
    assert abs(parsed['total'] - 12233.89) < 0.01, f"Expected 12233.89, got {parsed['total']}"
    print("  => SUCCESS!\n")

    # 4. Test ICMS 01-2026 (Combined File with Compras and Vendas)
    icms_path = os.path.join(exemples_dir, "AGROBORGES - ICMS - 01-2026.csv")
    content = read_file_safely(icms_path)
    
    # Combined files are split in app.py
    splits = split_combined_file(os.path.basename(icms_path), content)
    print(f"File: {os.path.basename(icms_path)} (Splitting into Entradas and Saídas)")
    assert len(splits) == 2, f"Expected 2 splits, got {len(splits)}"
    
    # Part 1: Entradas (Compras and Outras Despesas like freights and consumption)
    entradas = splits[0]
    parsed_entradas = parse_csv_txt(entradas["content"], entradas["type"])
    print(f"  Split: {entradas['name']} (Type: {entradas['type']})")
    print(f"    Detected Total: {parsed_entradas['total']}")
    print(f"    Breakdown: {parsed_entradas['breakdown']}")
    # 1.102: 24316.26, 1.403: 61584.39, 2.102: 8154.74 -> Sum = 94055.39 Compras
    # 1.353: 40.00, 1.407: 811.24 -> Sum = 851.24 Outras Despesas
    assert abs(parsed_entradas['breakdown']['compras'] - 94055.39) < 0.01, f"Expected 94055.39 Compras, got {parsed_entradas['breakdown']['compras']}"
    assert abs(parsed_entradas['breakdown']['outras'] - 851.24) < 0.01, f"Expected 851.24 Outras Despesas, got {parsed_entradas['breakdown']['outras']}"
    print("    => SUCCESS!\n")
    
    # Part 2: Saídas (Vendas)
    saidas = splits[1]
    parsed_saidas = parse_csv_txt(saidas["content"], saidas["type"])
    print(f"  Split: {saidas['name']} (Type: {saidas['type']})")
    print(f"    Detected Total: {parsed_saidas['total']}")
    print(f"    Breakdown: {parsed_saidas['breakdown']}")
    # 5.102: 50722.85, 5.405: 41957.50 -> Sum = 92680.35 Vendas
    assert abs(parsed_saidas['breakdown']['vendas'] - 92680.35) < 0.01, f"Expected 92680.35 Vendas, got {parsed_saidas['breakdown']['vendas']}"
    print("    => SUCCESS!\n")

    # 5. Test ISS 01-2026 (Combined File with Tomados and Prestados)
    iss_path = os.path.join(exemples_dir, "AGROBORGES - ISS - 01-2026.csv")
    content = read_file_safely(iss_path)
        
    splits_iss = split_combined_file(os.path.basename(iss_path), content)
    print(f"File: {os.path.basename(iss_path)} (Splitting into Entradas and Saídas)")
    assert len(splits_iss) == 2, f"Expected 2 splits, got {len(splits_iss)}"
    
    # Part 1: Entradas (Outras Despesas)
    iss_entradas = splits_iss[0]
    parsed_iss_entradas = parse_csv_txt(iss_entradas["content"], iss_entradas["type"])
    print(f"  Split: {iss_entradas['name']} (Type: {iss_entradas['type']})")
    print(f"    Detected Total: {parsed_iss_entradas['total']}")
    print(f"    Breakdown: {parsed_iss_entradas['breakdown']}")
    # 8.000: 986.94 -> Sum = 986.94 Outras Despesas
    assert abs(parsed_iss_entradas['breakdown']['outras'] - 986.94) < 0.01, f"Expected 986.94 Outras Despesas, got {parsed_iss_entradas['breakdown']['outras']}"
    print("    => SUCCESS!\n")
    
    # Part 2: Saídas (Serviços)
    iss_saidas = splits_iss[1]
    parsed_iss_saidas = parse_csv_txt(iss_saidas["content"], iss_saidas["type"])
    print(f"  Split: {iss_saidas['name']} (Type: {iss_saidas['type']})")
    print(f"    Detected Total: {parsed_iss_saidas['total']}")
    print(f"    Breakdown: {parsed_iss_saidas['breakdown']}")
    # 9.000: 2689.22 -> Sum = 2689.22 Serviços
    assert abs(parsed_iss_saidas['breakdown']['servicos'] - 2689.22) < 0.01, f"Expected 2689.22 Serviços, got {parsed_iss_saidas['breakdown']['servicos']}"
    print("    => SUCCESS!\n")
    
    print("=== ALL PARSER TESTS PASSED FLAWLESSLY! ===")

if __name__ == "__main__":
    run_tests()

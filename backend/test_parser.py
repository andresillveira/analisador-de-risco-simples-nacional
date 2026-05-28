import os
import sys
import re

# Add backend to path to import app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from app.services.parser_service import parse_csv_txt, parse_pdf
    from app.config import CFOP_MAP
except ImportError:
    try:
        # If running in environment where backend/ is added to path but app.py is desired
        import sys
        import os
        # Insert backend path at front
        backend_path = os.path.dirname(os.path.abspath(__file__))
        if backend_path in sys.path:
            sys.path.remove(backend_path)
        sys.path.insert(0, backend_path)
        from app import parse_csv_txt, parse_pdf, CFOP_MAP
    except ImportError:
        from app import parse_csv_txt, parse_pdf, CFOP_MAP

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
    
    old_exemples_dir = os.path.join(exemples_dir, "old")
    
    # 1. Test Folha de Pagamento 01-2026
    folha1_path = os.path.join(old_exemples_dir, "AGROBORGES - FOLHA - 01-2026.csv")
    content = read_file_safely(folha1_path)
    parsed = parse_csv_txt(content, "Folha de Pagamento")
    print(f"File: {os.path.basename(folha1_path)}")
    print(f"  Detected Total: {parsed['total']}")
    print(f"  Row Count: {parsed['rowCount']}")
    print(f"  Breakdown: {parsed['breakdown']}")
    assert abs(parsed['total'] - 11250.82) < 0.01, f"Expected 11250.82, got {parsed['total']}"
    print("  => SUCCESS!\n")

    # 2. Test Folha de Pagamento 02-2026
    folha2_path = os.path.join(old_exemples_dir, "AGROBORGES - FOLHA - 02-2026.csv")
    content = read_file_safely(folha2_path)
    parsed = parse_csv_txt(content, "Folha de Pagamento")
    print(f"File: {os.path.basename(folha2_path)}")
    print(f"  Detected Total: {parsed['total']}")
    print(f"  Row Count: {parsed['rowCount']}")
    print(f"  Breakdown: {parsed['breakdown']}")
    assert abs(parsed['total'] - 11307.65) < 0.01, f"Expected 11307.65, got {parsed['total']}"
    print("  => SUCCESS!\n")

    # 3. Test Folha de Pagamento 03-2026
    folha3_path = os.path.join(old_exemples_dir, "AGROBORGES - FOLHA - 03-2026.csv")
    content = read_file_safely(folha3_path)
    parsed = parse_csv_txt(content, "Folha de Pagamento")
    print(f"File: {os.path.basename(folha3_path)}")
    print(f"  Detected Total: {parsed['total']}")
    print(f"  Row Count: {parsed['rowCount']}")
    print(f"  Breakdown: {parsed['breakdown']}")
    assert abs(parsed['total'] - 12233.89) < 0.01, f"Expected 12233.89, got {parsed['total']}"
    print("  => SUCCESS!\n")

    # 4. Test ICMS 01-2026 (Combined File with Compras and Vendas)
    icms_path = os.path.join(old_exemples_dir, "AGROBORGES - ICMS - 01-2026.csv")
    content = read_file_safely(icms_path)
    
    # Combined files are split in app.py
    try:
        from app.services.risk_service import split_combined_file
    except ImportError:
        from app import split_combined_file
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
    # 1.353: 40.00, 1.407: 811.24, 1.551 (Ativo Imobilizado): 3826.06 -> Sum = 4677.30 Outras Despesas
    assert abs(parsed_entradas['breakdown']['compras'] - 94055.39) < 0.01, f"Expected 94055.39 Compras, got {parsed_entradas['breakdown']['compras']}"
    assert abs(parsed_entradas['breakdown']['outras'] - 4677.30) < 0.01, f"Expected 4677.30 Outras Despesas, got {parsed_entradas['breakdown']['outras']}"
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
    iss_path = os.path.join(old_exemples_dir, "AGROBORGES - ISS - 01-2026.csv")
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
    
    # 6. Test New Ficha Financeira (CSV)
    new_csv_path = os.path.join(exemples_dir, "Agroborges - Folha - 01-2026 (Ficha Financeira).csv")
    content = read_file_safely(new_csv_path)
    parsed_new_csv = parse_csv_txt(content, "Folha de Pagamento")
    print(f"File: {os.path.basename(new_csv_path)}")
    print(f"  Detected Total: {parsed_new_csv['total']}")
    print(f"  Company Name: {parsed_new_csv['company_name']}")
    assert abs(parsed_new_csv['total'] - 49641.72) < 0.01, f"Expected 49641.72, got {parsed_new_csv['total']}"
    assert parsed_new_csv['company_name'] == "AGROBORGES", f"Expected AGROBORGES, got {parsed_new_csv['company_name']}"
    print("  => SUCCESS!\n")

    # 7. Test New Ficha Financeira (TXT)
    new_txt_path = os.path.join(exemples_dir, "Agroborges - Folha - 01-2026 (Ficha Financeira).txt")
    content = read_file_safely(new_txt_path)
    parsed_new_txt = parse_csv_txt(content, "Folha de Pagamento")
    print(f"File: {os.path.basename(new_txt_path)}")
    print(f"  Detected Total: {parsed_new_txt['total']}")
    print(f"  Company Name: {parsed_new_txt['company_name']}")
    assert abs(parsed_new_txt['total'] - 49641.72) < 0.01, f"Expected 49641.72, got {parsed_new_txt['total']}"
    assert parsed_new_txt['company_name'] == "AGROBORGES", f"Expected AGROBORGES, got {parsed_new_txt['company_name']}"
    print("  => SUCCESS!\n")

    # 8. Test New Ficha Financeira (PDF)
    new_pdf_path = os.path.join(exemples_dir, "Agroborges - Folha - 01-2026 (Ficha Financeira).pdf")
    with open(new_pdf_path, "rb") as f:
        pdf_bytes = f.read()
    parsed_new_pdf = parse_pdf(pdf_bytes, "Folha de Pagamento")
    print(f"File: {os.path.basename(new_pdf_path)}")
    print(f"  Detected Total: {parsed_new_pdf['total']}")
    print(f"  Company Name: {parsed_new_pdf['company_name']}")
    assert abs(parsed_new_pdf['total'] - 49641.72) < 0.01, f"Expected 49641.72, got {parsed_new_pdf['total']}"
    assert parsed_new_pdf['company_name'] == "AGROBORGES", f"Expected AGROBORGES, got {parsed_new_pdf['company_name']}"
    print("  => SUCCESS!\n")

    # 9. Test Transport output / input classification in parsing
    print("Test 9: Parsing/Classification of Transport CFOPs")
    transport_output_content = "CFOP;Descrição;Vlr. Contábil\n5.351;Prestacao de servico de transporte;5000,00\n1.353;Aquisicao de servico de transporte;1200,00"
    parsed_transport = parse_csv_txt(transport_output_content, "Vendas")
    print("  Test Transport output classification in parse_csv_txt:")
    print(f"    Breakdown: {parsed_transport['breakdown']}")
    assert abs(parsed_transport['breakdown']['servicos'] - 5000.00) < 0.01, f"Expected 5000.00 servicos, got {parsed_transport['breakdown']['servicos']}"
    assert abs(parsed_transport['breakdown']['outras'] - 1200.00) < 0.01, f"Expected 1200.00 outras, got {parsed_transport['breakdown']['outras']}"
    print("  => SUCCESS!\n")

    # 10. Test New Restaurante Amaral PDF (01-2026)
    print("Test 10: Parsing of Restaurante Amaral -01-2026 payroll PDF")
    amaral_pdf_path1 = os.path.join(exemples_dir, "Restaurante Amaral -01-2026.pdf")
    with open(amaral_pdf_path1, "rb") as f:
        pdf_bytes1 = f.read()
    parsed_amaral1 = parse_pdf(pdf_bytes1, "Folha de Pagamento")
    print(f"File: {os.path.basename(amaral_pdf_path1)}")
    print(f"  Detected Total: {parsed_amaral1['total']}")
    print(f"  Company Name: {parsed_amaral1['company_name']}")
    assert abs(parsed_amaral1['total'] - 47066.02) < 0.01, f"Expected 47066.02, got {parsed_amaral1['total']}"
    assert parsed_amaral1['company_name'] == "RESTAURANTE E LANCHONETE AMARAL E PEREIRA LTDA", f"Expected RESTAURANTE E LANCHONETE AMARAL E PEREIRA LTDA, got {parsed_amaral1['company_name']}"
    print("  => SUCCESS!\n")

    # 11. Test New Restaurante Amaral PDF (02-2026)
    print("Test 11: Parsing of Restaurante Amaral -02-2026 payroll PDF")
    amaral_pdf_path2 = os.path.join(exemples_dir, "Restaurante Amaral -02-2026.pdf")
    with open(amaral_pdf_path2, "rb") as f:
        pdf_bytes2 = f.read()
    parsed_amaral2 = parse_pdf(pdf_bytes2, "Folha de Pagamento")
    print(f"File: {os.path.basename(amaral_pdf_path2)}")
    print(f"  Detected Total: {parsed_amaral2['total']}")
    print(f"  Company Name: {parsed_amaral2['company_name']}")
    assert abs(parsed_amaral2['total'] - 53066.57) < 0.01, f"Expected 53066.57, got {parsed_amaral2['total']}"
    assert parsed_amaral2['company_name'] == "RESTAURANTE E LANCHONETE AMARAL E PEREIRA LTDA", f"Expected RESTAURANTE E LANCHONETE AMARAL E PEREIRA LTDA, got {parsed_amaral2['company_name']}"
    print("  => SUCCESS!\n")

    print("=== ALL PARSER TESTS PASSED FLAWLESSLY! ===")

if __name__ == "__main__":
    run_tests()

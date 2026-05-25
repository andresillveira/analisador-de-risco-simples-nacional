import unittest
import sys
import os

# Adiciona o diretório backend ao PATH
backend_dir = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
sys.path.insert(0, backend_dir)

from app.services.parser_service import parse_csv_txt
from app.services.risk_service import split_combined_file

class TestCombinedSplitBugfix(unittest.TestCase):
    
    def test_combined_file_splitting_parity(self):
        bugfix_dir = os.path.join(backend_dir, "..", "exemples", "bugfix")
        
        compra_path = os.path.join(bugfix_dir, "Centro de Dist. Protege - Compra - 01-2026.csv")
        venda_path = os.path.join(bugfix_dir, "Centro de Dist. Protege - Venda - 01-2026.csv")
        combined_path = os.path.join(bugfix_dir, "Centro de Dist. Protege - Compra e Venda - 01-2026.csv")
        
        # Load standalone contents
        with open(compra_path, "r", encoding="cp1252") as f:
            compra_content = f.read()
        with open(venda_path, "r", encoding="cp1252") as f:
            venda_content = f.read()
        with open(combined_path, "r", encoding="cp1252") as f:
            combined_content = f.read()
            
        # Parse standalone contents
        parsed_compra_standalone = parse_csv_txt(compra_content, "Compras")
        parsed_venda_standalone = parse_csv_txt(venda_content, "Vendas")
        
        # Perform split on combined file
        splits = split_combined_file("Centro de Dist. Protege - Compra e Venda - 01-2026.csv", combined_content)
        self.assertEqual(len(splits), 2, "Combined file should split into exactly 2 parts")
        
        entradas_split = splits[0]
        saidas_split = splits[1]
        
        self.assertEqual(entradas_split["type"], "Compras")
        self.assertEqual(saidas_split["type"], "Vendas")
        
        parsed_entradas_split = parse_csv_txt(entradas_split["content"], entradas_split["type"])
        parsed_saidas_split = parse_csv_txt(saidas_split["content"], saidas_split["type"])
        
        # Verify 100% exact parity in total and breakdown calculations
        self.assertEqual(parsed_entradas_split["total"], parsed_compra_standalone["total"])
        self.assertEqual(parsed_saidas_split["total"], parsed_venda_standalone["total"])
        
        self.assertEqual(parsed_entradas_split["breakdown"]["compras"], parsed_compra_standalone["breakdown"]["compras"])
        self.assertEqual(parsed_saidas_split["breakdown"]["vendas"], parsed_venda_standalone["breakdown"]["vendas"])
        
        # Verify that company name is correctly captured for both splits (no "- Saídas" extraction bug)
        expected_company = "CENTRO DE DISTRIBUICAO PROTEGE JP LTDA - Matriz"
        self.assertEqual(parsed_entradas_split["company_name"], expected_company)
        self.assertEqual(parsed_saidas_split["company_name"], expected_company)
        
        print("[OK] Combined file split parity test passed successfully!")

if __name__ == "__main__":
    unittest.main()

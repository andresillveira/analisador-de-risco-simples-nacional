import unittest
import sys
import os

# Adiciona o diretório backend ao PATH para poder importar app
sys.path.append(os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from app import clean_and_parse_float, calculate_risk, detect_report_type

class TestTaxCalculator(unittest.TestCase):
    
    def test_clean_and_parse_float(self):
        self.assertEqual(clean_and_parse_float("R$ 1.500,00"), 1500.0)
        self.assertEqual(clean_and_parse_float("2,500.50"), 2500.5)
        self.assertEqual(clean_and_parse_float("R$12.500"), 12500.0)
        self.assertEqual(clean_and_parse_float("R$ 950,50"), 950.5)
        self.assertEqual(clean_and_parse_float("texto aleatório"), 0.0)
        self.assertEqual(clean_and_parse_float(""), 0.0)
        
    def test_detect_report_type(self):
        self.assertEqual(detect_report_type("compras_insumos.csv", ""), "Compras")
        self.assertEqual(detect_report_type("folha_pagamento_2026.csv", ""), "Folha de Pagamento")
        self.assertEqual(detect_report_type("prestacao_servicos.pdf", ""), "Serviços")
        self.assertEqual(detect_report_type("despesas_escritorio.xlsx", ""), "Outras Despesas")
        self.assertEqual(detect_report_type("outros_dados.csv", "CFOP 1.102 entrada mercadoria"), "Compras")
        self.assertEqual(detect_report_type("dados.csv", "pro-labore de sócio administrador"), "Folha de Pagamento")
        
    def test_calculate_risk(self):
        # Caso Saudável (Saídas: 100.000, Compras: 50.000 (50%), Despesas: 70.000 (70%))
        files = [
            {"type": "Vendas", "detectedTotal": 100000.0},
            {"type": "Compras", "detectedTotal": 50000.0},
            {"type": "Folha de Pagamento", "detectedTotal": 10000.0},
            {"type": "Outras Despesas", "detectedTotal": 10000.0}
        ]
        res = calculate_risk(files)
        self.assertEqual(res["faturamento"], 100000.0)
        self.assertEqual(res["comprasContabilizadas"], 50000.0)
        self.assertEqual(res["despesasContabilizadas"], 70000.0)
        self.assertEqual(res["comprasPercentage"], 50.0)
        self.assertEqual(res["despesasPercentage"], 70.0)
        self.assertEqual(res["statusX"], "Regular")
        self.assertEqual(res["statusIX"], "Regular")
        self.assertFalse(res["incisoXExceeded"])
        self.assertFalse(res["incisoIXExceeded"])
        
        # Caso Risco Inciso X (Compras: 90.000 (90%))
        files_x = [
            {"type": "Vendas", "detectedTotal": 100000.0},
            {"type": "Compras", "detectedTotal": 90000.0}
        ]
        res_x = calculate_risk(files_x)
        self.assertEqual(res_x["statusX"], "Risco")
        self.assertTrue(res_x["incisoXExceeded"])
        
        # Caso Risco Inciso IX (Despesas: 130.000 (130%))
        files_ix = [
            {"type": "Vendas", "detectedTotal": 100000.0},
            {"type": "Compras", "detectedTotal": 40000.0},
            {"type": "Folha de Pagamento", "detectedTotal": 50000.0},
            {"type": "Outras Despesas", "detectedTotal": 40000.0}
        ]
        res_ix = calculate_risk(files_ix)
        self.assertEqual(res_ix["statusIX"], "Risco")
        self.assertTrue(res_ix["incisoIXExceeded"])

if __name__ == "__main__":
    unittest.main()

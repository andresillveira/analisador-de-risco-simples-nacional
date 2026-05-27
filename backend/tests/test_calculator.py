import unittest
import importlib.util
import sys
import os

# Adiciona o diretório backend ao PATH
backend_dir = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
sys.path.insert(0, backend_dir)

# Importa o arquivo app.py diretamente para evitar colisão com o pacote modular 'app'
spec = importlib.util.spec_from_file_location("app_monolithic", os.path.join(backend_dir, "app.py"))
app_monolithic = importlib.util.module_from_spec(spec)
sys.modules["app_monolithic"] = app_monolithic
spec.loader.exec_module(app_monolithic)

clean_and_parse_float = app_monolithic.clean_and_parse_float
calculate_risk = app_monolithic.calculate_risk
detect_report_type = app_monolithic.detect_report_type
calculate_risk_from_values = app_monolithic.calculate_risk_from_values
classify_cfop_row = app_monolithic.classify_cfop_row

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

    def test_calculate_risk_from_values(self):
        # Regular state
        res = calculate_risk_from_values(
            vendas=100000.0,
            compras=50000.0,
            servicos_prestados=0.0,
            servicos_tomados=0.0,
            folha_pagamento=10000.0,
            outras_receitas=0.0,
            outras_despesas=10000.0
        )
        self.assertEqual(res["faturamento"], 100000.0)
        self.assertEqual(res["comprasContabilizadas"], 50000.0)
        self.assertEqual(res["despesasContabilizadas"], 70000.0)
        self.assertEqual(res["comprasPercentage"], 50.0)
        self.assertEqual(res["despesasPercentage"], 70.0)
        self.assertEqual(res["statusX"], "Regular")
        self.assertEqual(res["statusIX"], "Regular")
        self.assertFalse(res["incisoXExceeded"])
        self.assertFalse(res["incisoIXExceeded"])

        # Exceeded inciso X (Compras > 80% faturamento)
        res_x = calculate_risk_from_values(
            vendas=100000.0,
            compras=85000.0,
            servicos_prestados=0.0,
            servicos_tomados=0.0,
            folha_pagamento=0.0,
            outras_receitas=0.0,
            outras_despesas=0.0
        )
        self.assertEqual(res_x["statusX"], "Risco")
        self.assertTrue(res_x["incisoXExceeded"])

        # Exceeded inciso IX (Despesas > 120% faturamento)
        res_ix = calculate_risk_from_values(
            vendas=100000.0,
            compras=50000.0,
            servicos_prestados=0.0,
            servicos_tomados=10000.0,
            folha_pagamento=50000.0,
            outras_receitas=0.0,
            outras_despesas=20000.0
        )
        self.assertEqual(res_ix["statusIX"], "Risco")
        self.assertTrue(res_ix["incisoIXExceeded"])

    def test_ativo_imobilizado_classification(self):
        # 1.551 and 2.551 (fixed asset acquisitions) must be classified as 'outras', NOT 'compras'
        res_1551 = classify_cfop_row("1.551", 100.0, "Compras")
        self.assertEqual(res_1551["outras"], 100.0)
        self.assertEqual(res_1551["compras"], 0.0)
        
        res_2551 = classify_cfop_row("2.551", 200.0, "Compras")
        self.assertEqual(res_2551["outras"], 200.0)
        self.assertEqual(res_2551["compras"], 0.0)
        
        # 1.406 (fixed asset subject to ST) must be 'outras'
        res_1406 = classify_cfop_row("1.406", 300.0, "Compras")
        self.assertEqual(res_1406["outras"], 300.0)
        self.assertEqual(res_1406["compras"], 0.0)
        
        # 2.151 (explicitly mentioned correlato example) must be 'outras'
        res_2151 = classify_cfop_row("2.151", 400.0, "Compras")
        self.assertEqual(res_2151["outras"], 400.0)
        self.assertEqual(res_2151["compras"], 0.0)
        
        # Standard purchases like 1.102 must remain 'compras', NOT 'outras'
        res_1102 = classify_cfop_row("1.102", 500.0, "Compras")
        self.assertEqual(res_1102["compras"], 500.0)
        self.assertEqual(res_1102["outras"], 0.0)

if __name__ == "__main__":
    unittest.main()

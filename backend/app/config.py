import csv
from pathlib import Path
from typing import Dict, Any, List

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

CFOP_MAP: Dict[str, Dict[str, str]] = {}

# Locate CFOP_Categorizado.csv in a resilient way
pkg_dir = Path(__file__).resolve().parent  # backend/app
project_root = pkg_dir.parent  # backend
project_base = project_root.parent  # D:\analisador-de-risco-simples-nacional

csv_paths = [
    project_base / "CFOP_Categorizado.csv",
    project_root / "CFOP_Categorizado.csv",
    pkg_dir / "CFOP_Categorizado.csv",
    Path("CFOP_Categorizado.csv"),
    Path("../CFOP_Categorizado.csv"),
    Path("backend/CFOP_Categorizado.csv")
]

csv_path = None
for p in csv_paths:
    if p.exists():
        csv_path = p
        break

if csv_path:
    try:
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
    except Exception as e:
        print(f"Error loading CFOP_Categorizado.csv: {e}")
else:
    print("Warning: CFOP_Categorizado.csv not found in typical search paths!")

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

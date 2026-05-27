import re
from typing import List, Dict, Any, Optional
from app.config import CFOP_MAP

def classify_cfop_row(cfop_code: str, val: float, report_type: str) -> Dict[str, float]:
    res = {"compras": 0.0, "vendas": 0.0, "servicos": 0.0, "outras": 0.0, "folha": 0.0}
    
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
            
        category_lower = category.lower()
        is_servico = "servi" in category_lower
        
        if is_ativo_imobilizado:
            res["outras"] = val
        elif is_servico and tipo == "Saída":
            res["servicos"] = val
        elif is_servico and tipo == "Entrada":
            res["outras"] = val
        elif category == "Compras":
            res["compras"] = val
        elif category == "Vendas":
            res["vendas"] = val
        elif category in ["Transporte", "Uso ou Consumo"]:
            res["outras"] = val
    else:
        if cfop_normalized in ["1551", "2551", "3551", "1406", "2406", "1151", "2151"]:
            is_ativo_imobilizado = True
            
        if is_ativo_imobilizado:
            res["outras"] = val
        else:
            prefix = cfop_code.split('.')[0] if cfop_code else ""
            if report_type == "Compras" and prefix in ["1", "2"]:
                res["compras"] = val
            elif report_type == "Vendas" and prefix in ["5", "6"]:
                res["vendas"] = val
            elif report_type == "Serviços":
                if prefix == "9":
                    res["servicos"] = val
                elif prefix == "8":
                    res["outras"] = val
                
    return res

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
        "relacao calculo" in cont_lower):
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
    vendas = 0.0
    servicos = 0.0
    compras = 0.0
    folha = 0.0
    outras = 0.0
    
    has_vendas = False
    has_servicos = False
    has_compras = False
    has_folha = False
    has_outras = False
    
    for f in files_data:
        ftype = f["type"]
        
        if "breakdown" in f and f["breakdown"] is not None:
            bd = f["breakdown"]
            compras += bd.get("compras", 0.0)
            vendas += bd.get("vendas", 0.0)
            servicos += bd.get("servicos", 0.0)
            outras += bd.get("outras", 0.0)
            folha += bd.get("folha", 0.0)
        else:
            total = f.get("detectedTotal", 0.0)
            if ftype == "Vendas":
                vendas += total
            elif ftype == "Serviços":
                servicos += total
            elif ftype == "Compras":
                compras += total
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
            
    faturamento = vendas + servicos
    despesas = compras + folha + outras
    
    compras_percentage = (compras / faturamento) * 100 if faturamento > 0 else 0.0
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
        "vendasContabilizadas": round(vendas, 2),
        "servicosCfopContabilizados": round(servicos, 2),
        "comprasContabilizadas": round(compras, 2),
        "despesasContabilizadas": round(despesas, 2),
        "folhaPagamentoContabilizada": round(folha, 2),
        "outrasDespesasContabilizadas": round(outras, 2),
        "outrasReceitasContabilizadas": 0.0,  # Import results don't have other revenues directly, default 0
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
        
    if not results.get("hasFolha", False):
        alerts.append({
            "id": "missing-folha",
            "type": "warning",
            "message": "⚠️ Atenção: Valores de Folha de Pagamentos não preenchidos" if is_manual else "⚠️ Atenção: Relatório de Folha de Pagamentos não enviado",
            "description": "A ausência de custos previdenciários e trabalhistas compromete a análise do Inciso IX (Despesas < 120%). O status continuará como 'Inconclusivo' até que os valores de salários e pró-labore sejam computados."
        })
        
    if not results.get("hasCompras", False):
        alerts.append({
            "id": "missing-compras",
            "type": "warning",
            "message": "⚠️ Valores de Compras ausentes",
            "description": "Adicione o total de aquisições para podermos computar o limite do Inciso X."
        })
        
    if not results.get("hasVendas", False) and not results.get("hasServicos", False) and results.get("outrasReceitasContabilizadas", 0.0) == 0.0:
        alerts.append({
            "id": "missing-revenue",
            "type": "danger",
            "message": "❌ Sem Valores de Receita (Vendas/Serviços)",
            "description": "O faturamento do Simples Nacional é a base de cálculo de todo o Artigo 29. Sem receitas declaradas, qualquer despesa ou compra acarreta risco imediato de desenquadramento."
        })
        
    if results.get("incisoXExceeded", False):
        alerts.append({
            "id": "inciso-x-triggered",
            "type": "danger",
            "message": "🚨 Extrapolação do Inciso X (Compras > 80% do Faturamento)",
            "description": f"Risco iminente de autuação e exclusão de ofício. Compras de {results['comprasPercentage']:.1f}% superam a barreira dos 80% do Art. 29, Inciso X, presumindo faturamento omitido pelo contribuinte."
        })
        
    if results.get("incisoIXExceeded", False):
        alerts.append({
            "id": "inciso-ix-triggered",
            "type": "danger",
            "message": "🚨 Extrapolação do Inciso IX (Despesas > 120% do Faturamento)",
            "description": f"Irregularidade Fiscal Crítica. Despesas pagas computadas representam {results['despesasPercentage']:.1f}% do faturamento, ultrapassando os 120%. A exclusão de ofício pode ser decidida pela Receita."
        })
        
    if ((len(files_data) > 0 or is_manual) and 
        not results.get("incisoXExceeded", False) and 
        not results.get("incisoIXExceeded", False) and 
        (results.get("hasVendas", False) or results.get("hasServicos", False) or results.get("outrasReceitasContabilizadas", 0.0) > 0.0) and 
        results.get("hasCompras", False) and 
        results.get("hasFolha", False)):
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
    outras_despesas: float
) -> Dict[str, Any]:
    faturamento = vendas + servicos_prestados + outras_receitas
    despesas = compras + folha_pagamento + servicos_tomados + outras_despesas
    
    compras_percentage = (compras / faturamento) * 100 if faturamento > 0 else 0.0
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
        "servicosCfopContabilizados": round(servicos_prestados, 2),
        "comprasContabilizadas": round(compras, 2),
        "despesasContabilizadas": round(despesas, 2),
        "folhaPagamentoContabilizada": round(folha_pagamento, 2),
        "outrasDespesasContabilizadas": round(servicos_tomados + outras_despesas, 2),
        "outrasReceitasContabilizadas": round(outras_receitas, 2),  # Symmetric other revenues
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

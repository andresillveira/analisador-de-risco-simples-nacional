import io
import json
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pypdf import PdfReader

from app.config import REPORT_TYPES_INFO, SIMULATION_PROFILES
from app.models import (
    FileBreakdown,
    FileItemModel,
    AnalysisResultsModel,
    AuditRecordInput,
    AuditRecord,
    CompareRequest,
    ManualValuesModel
)
from app.utils.file_utils import (
    _load_history,
    _save_history,
    _load_manual_values,
    _save_manual_values
)
from app.services.parser_service import parse_csv_txt, parse_excel, parse_pdf
from app.services.risk_service import (
    calculate_risk,
    calculate_risk_from_values,
    generate_alerts,
    detect_report_type,
    split_combined_file
)

router = APIRouter()

@router.get("/health")
async def health_check():
    return {"status": "healthy"}

@router.get("/report-types")
def get_report_types():
    return REPORT_TYPES_INFO

@router.get("/config")
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

@router.post("/detect-type")
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

@router.post("/reanalyze-file")
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
        "isTypeManuallySelected": False,
        "breakdown": parsed.get("breakdown", {"compras": 0.0, "vendas": 0.0, "servicos": 0.0, "outras": 0.0, "folha": 0.0}),
        "companyName": parsed.get("company_name")
    }

# --- History endpoints ---

@router.get("/history")
def get_history():
    return _load_history()

@router.post("/history")
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

@router.delete("/history/{audit_id}")
def delete_history_record(audit_id: str):
    history = _load_history()
    history = [r for r in history if r["id"] != audit_id]
    _save_history(history)
    return {"deleted": True}

@router.delete("/history")
def clear_history():
    _save_history([])
    return {"cleared": True}

# --- Simulation profiles ---

@router.get("/simulation-profiles")
def get_simulation_profiles():
    return SIMULATION_PROFILES

# --- Verdict ---

@router.post("/verdict")
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
            "sub": "A empresa encontra-se operando dentro das margens pragmáticas permitidas",
            "severity": "success"
        }

# --- Compare audits ---

@router.post("/compare-audits")
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

@router.get("/manual-values")
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
            outras_despesas=model.get("outras_despesas", 0.0),
            devolucoes_vendas=model.get("devolucoes_vendas", 0.0),
            devolucoes_compras=model.get("devolucoes_compras", 0.0)
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
        "devolucoes_vendas": 0.0,
        "devolucoes_compras": 0.0,
        "is_manual": False
    }
    results = calculate_risk_from_values(0, 0, 0, 0, 0, 0, 0)
    alerts = generate_alerts([], results, is_manual=False)
    return {
        "manualValues": empty_model,
        "results": results,
        "alerts": alerts
    }

@router.post("/manual-values")
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
        outras_despesas=model.outras_despesas,
        devolucoes_vendas=model.devolucoes_vendas,
        devolucoes_compras=model.devolucoes_compras
    )
    alerts = generate_alerts([], results, is_manual=model.is_manual)
    
    return {
        "results": results,
        "alerts": alerts,
        "manualValues": model.model_dump()
    }

@router.delete("/manual-values")
def delete_manual_values(company: str, period: str):
    manual_data = _load_manual_values()
    key = f"{company.strip().lower()}|||{period.strip().lower()}"
    if key in manual_data:
        del manual_data[key]
        _save_manual_values(manual_data)
        return {"deleted": True}
    return {"deleted": False}

# --- Original analyze endpoint ---

@router.post("/analyze")
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
        
        conf = config_by_name.get(filename, {})
        file_id = conf.get("id", f"file-{filename}-{file_size}")
        report_type = conf.get("type", None)
        is_type_manually_selected = conf.get("isTypeManuallySelected", False)
        
        is_text = not filename.lower().endswith(('.xlsx', '.pdf'))
        sample_text = ""
        
        if is_text:
            try:
                sample_text = content_bytes.decode('utf-8')
                if sample_text.count('\ufffd') > 5:
                    sample_text = content_bytes.decode('cp1252')
            except Exception:
                try:
                    sample_text = content_bytes.decode('cp1252')
                except Exception:
                    sample_text = content_bytes.decode('utf-8', errors='ignore')
                    
        splits = []
        if is_text and sample_text:
            splits = split_combined_file(filename, sample_text)
            
        if splits:
            for item in splits:
                split_name = item["name"]
                split_content = item["content"]
                split_type = item["type"]
                
                conf_split = config_by_name.get(split_name, {})
                split_id = conf_split.get("id", f"split-{split_name}")
                final_split_type = conf_split.get("type", split_type)
                split_is_manually_selected = conf_split.get("isTypeManuallySelected", False)
                
                parsed = parse_csv_txt(split_content, final_split_type, payroll_base)
                
                processed_files.append({
                    "id": split_id,
                    "name": split_name,
                    "size": int(file_size / 2),
                    "type": final_split_type,
                    "content": split_content,
                    "rowCount": parsed["rowCount"],
                    "detectedTotal": parsed["total"],
                    "processedByBackend": True,
                    "isTypeManuallySelected": split_is_manually_selected,
                    "breakdown": parsed.get("breakdown", {"compras": 0.0, "vendas": 0.0, "servicos": 0.0, "outras": 0.0, "folha": 0.0}),
                    "companyName": parsed.get("company_name")
                })
        else:
            if not report_type:
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
                "processedByBackend": True,
                "isTypeManuallySelected": is_type_manually_selected,
                "breakdown": parsed.get("breakdown", {"compras": 0.0, "vendas": 0.0, "servicos": 0.0, "outras": 0.0, "folha": 0.0}),
                "companyName": parsed.get("company_name")
            })
            
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

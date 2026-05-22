from pydantic import BaseModel
from typing import List, Dict, Any, Optional

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
    isTypeManuallySelected: Optional[bool] = False  # Bugfix: prevent losing manual type selection
    breakdown: Optional[FileBreakdown] = None

class AnalysisResultsModel(BaseModel):
    faturamento: float = 0.0
    vendasContabilizadas: float = 0.0
    servicosCfopContabilizados: float = 0.0
    comprasContabilizadas: float = 0.0
    despesasContabilizadas: float = 0.0
    folhaPagamentoContabilizada: float = 0.0
    outrasDespesasContabilizadas: float = 0.0
    outrasReceitasContabilizadas: float = 0.0  # Bugfix: align Outras Receitas
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
    files: List[FileItemModel]

class AuditRecord(BaseModel):
    id: str
    timestamp: str
    companyName: str
    period: str
    results: AnalysisResultsModel
    files: List[FileItemModel]

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

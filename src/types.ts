/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ReportType = "Compras" | "Vendas" | "Folha de Pagamento" | "Serviços" | "Outras Despesas";

export interface FileItem {
  id: string;
  name: string;
  size: number;
  type: ReportType;
  content: string;
  rowCount: number;
  detectedTotal: number;
  fileObject?: File;
  processedByBackend?: boolean;
  breakdown?: {
    compras: number;
    vendas: number;
    servicos: number;
    outras: number;
    folha: number;
  };
}

export interface CompanyInfo {
  name: string;
  period: string;
}

export interface AnalysisResults {
  faturamento: number;
  vendasContabilizadas: number;
  servicosCfopContabilizados: number;
  comprasContabilizadas: number;
  despesasContabilizadas: number;
  folhaPagamentoContabilizada: number;
  outrasDespesasContabilizadas: number;
  
  comprasPercentage: number;
  despesasPercentage: number;
  
  incisoXExceeded: boolean;
  incisoIXExceeded: boolean;
  
  hasFolha: boolean;
  hasCompras: boolean;
  hasVendas: boolean;
  hasServicos: boolean;
  
  statusX: "Regular" | "Risco" | "Inconclusivo";
  statusIX: "Regular" | "Risco" | "Inconclusivo";
  
  textVerdictX: string;
  textVerdictIX: string;
}

export interface AlertMessage {
  id: string;
  type: "danger" | "warning" | "success" | "info";
  message: string;
  description?: string;
}

export interface AuditHistoryRecord {
  id: string;
  timestamp: string;
  companyName: string;
  period: string;
  results: AnalysisResults;
  files: FileItem[];
}

export interface SimulationProfile {
  id: string;
  title: string;
  companyName: string;
  period: string;
  description: string;
  badge: string;
  badgeColor: string;
  files: FileItem[];
}

export interface ApiConfig {
  thresholds: {
    incisoX: number;
    incisoIX: number;
    cautionX: number;
    cautionIX: number;
  };
  legalReferences: {
    incisoX: string;
    incisoIX: string;
  };
}

export interface ReportTypeInfo {
  title: string;
  description: string;
  allowedKeyword: string;
  ignoredKeyword: string;
}

/** Default empty AnalysisResults for initial state */
export const EMPTY_RESULTS: AnalysisResults = {
  faturamento: 0,
  vendasContabilizadas: 0,
  servicosCfopContabilizados: 0,
  comprasContabilizadas: 0,
  despesasContabilizadas: 0,
  folhaPagamentoContabilizada: 0,
  outrasDespesasContabilizadas: 0,
  comprasPercentage: 0,
  despesasPercentage: 0,
  incisoXExceeded: false,
  incisoIXExceeded: false,
  hasFolha: false,
  hasCompras: false,
  hasVendas: false,
  hasServicos: false,
  statusX: "Inconclusivo",
  statusIX: "Inconclusivo",
  textVerdictX: "Aguardando envio dos relatórios de receita (Vendas/Serviços) e compras.",
  textVerdictIX: "Aguardando envio dos relatórios de receita, folha e despesas."
};

/** Default empty alerts for initial state */
export const EMPTY_ALERTS: AlertMessage[] = [
  {
    id: "no-files",
    type: "info",
    message: "Aguardando envio dos relatórios",
    description: "Suba relatórios de faturamento, compras e despesas (CSV/TXT/Excel/PDF) no painel de upload para iniciar."
  }
];

export interface ManualValues {
  companyName: string;
  period: string;
  vendas: number;
  compras: number;
  servicos_prestados: number;
  servicos_tomados: number;
  folha_pagamento: number;
  outras_receitas: number;
  outras_despesas: number;
  is_manual: boolean;
}

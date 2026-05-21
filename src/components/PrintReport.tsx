/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { X, Printer, FileText, CheckCircle2, AlertTriangle, Scale, Calendar, Landmark } from "lucide-react";
import { CompanyInfo, AnalysisResults, FileItem, AlertMessage } from "../types";

interface PrintReportProps {
  isOpen: boolean;
  onClose: () => void;
  companyInfo: CompanyInfo;
  results: AnalysisResults;
  files: FileItem[];
  alerts: AlertMessage[];
}

export default function PrintReport({
  isOpen,
  onClose,
  companyInfo,
  results,
  files,
  alerts
}: PrintReportProps) {
  if (!isOpen) return null;

  const currentDateStr = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  const currentTimeStr = new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(val);
  };

  const handlePrint = () => {
    window.print();
  };

  // Veredict determination for print
  const getVerdictBadge = () => {
    const hasRisk = results.statusX === "Risco" || results.statusIX === "Risco";
    const isIncomplete = results.statusX === "Inconclusivo" || results.statusIX === "Inconclusivo";
    
    if (hasRisk) {
      return {
        label: "EM RISCO DE EXCLUSÃO",
        sub: "Presunção legal de irregularidade sob o Art. 29 da LC 123/06",
        colorClass: "bg-red-50 text-red-800 border-red-300"
      };
    } else if (isIncomplete) {
      return {
        label: "REGULARIDADE PARCIAL / DADOS AUSENTES",
        sub: "A auditoria fiscal definitiva depende da anexação de documentos pendentes",
        colorClass: "bg-amber-50 text-amber-800 border-amber-300"
      };
    } else {
      return {
        label: "REGULAR / SEM RISCO APARENTE",
        sub: "A empresa encontra-se operando dentro das margens prudenciais permitidas",
        colorClass: "bg-emerald-50 text-emerald-800 border-emerald-300"
      };
    }
  };

  const verdict = getVerdictBadge();

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print-modal-container">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl border border-slate-200 overflow-hidden my-8 select-none print-modal-card">
        
        {/* Modal Controls Header */}
        <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white no-print">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-sm sm:text-base">Visualização do Parecer Fiscal Impresso</h3>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Imprimir / Salvar PDF
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Layout Simulator */}
        <div className="p-8 max-h-[80vh] overflow-y-auto bg-slate-100 print-modal-content">
          
          {/* Printable Page Frame (A4 Aspect/White Paper style) */}
          <div className="bg-white shadow-xl max-w-[210mm] mx-auto p-12 border border-slate-300 print-shadow-none text-slate-800 font-sans" id="printable-area">
            
            {/* Paper Timbrado (Letterhead Header) */}
            <div className="border-b-2 border-blue-900 pb-5 mb-6 flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-blue-900 tracking-widest uppercase block font-mono">
                  DEUSDEDIT CONTABILIDADE LTDA.
                </span>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Parecer de Conformidade Fiscal
                </h1>
                <p className="text-[10px] text-slate-500 font-mono italic">
                  Análise Técnica Integrada baseada no Art. 29 da Lei Complementar nº 123/2006
                </p>
              </div>
              <div className="text-right">
                <span className="inline-block px-3 py-1 bg-slate-100 rounded text-[10px] font-mono text-slate-600 border border-slate-200 uppercase">
                  Auditoria de Simples Nacional
                </span>
                <p className="text-[10px] text-slate-400 font-mono mt-1">
                  Emitido em: {currentDateStr} às {currentTimeStr}
                </p>
              </div>
            </div>

            {/* Entity/Company Metadata Grid */}
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs mb-6 font-mono">
              <div>
                <span className="text-slate-400 font-bold uppercase text-[9px] block">
                  Razão Social:
                </span>
                <span className="font-bold text-slate-800 text-sm">
                  {companyInfo.name || "NÃO INFORMADO"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 font-bold uppercase text-[9px] block">
                  Período Analisado:
                </span>
                <span className="font-bold text-slate-800 text-sm">
                  {companyInfo.period || "NÃO INFORMADO"}
                </span>
              </div>
            </div>

            {/* Executive Status Indicator Panel */}
            <div className={`mt-4 border-2 p-5 rounded-2xl mb-8 flex flex-col sm:flex-row items-center sm:items-start gap-4 ${verdict.colorClass}`}>
              <div className="mt-1">
                {results.statusX === "Risco" || results.statusIX === "Risco" ? (
                  <AlertTriangle className="w-10 h-10 text-red-600" />
                ) : results.statusX === "Inconclusivo" || results.statusIX === "Inconclusivo" ? (
                  <AlertTriangle className="w-10 h-10 text-amber-500" />
                ) : (
                  <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                )}
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider">
                  STATUS GERAL DE ENQUADRAMENTO FISCAL
                </span>
                <h3 className="text-lg font-extrabold tracking-tight mt-0.5">
                  {verdict.label}
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  {verdict.sub}
                </p>
              </div>
            </div>

            {/* Detailed Calculations Table */}
            <div className="mb-6">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 font-mono flex items-center gap-1.5 border-b border-slate-200 pb-1">
                <Scale className="w-3.5 h-3.5 text-blue-900" />
                1. DETALHAMENTO DE BASE DE CÁLCULO E VALORES PROCESSADOS
              </h3>
              
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                    <th className="py-2.5 px-3">Tipo de Movimento</th>
                    <th className="py-2.5 px-3">Observações</th>
                    <th className="py-2.5 px-3 text-right">Valores Apurados (R$)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono">
                  <tr>
                    <td className="py-2 px-3 font-sans font-semibold">Total de Faturamento Bruto (Ingressos de Recursos)</td>
                    <td className="py-2 px-3 text-slate-500 text-[10px]">Vendas + Serviços Prestados</td>
                    <td className="py-2 px-3 text-right font-bold">{formatBRL(results.faturamento)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 pl-6 font-sans">↳ Vendas Declaradas</td>
                    <td className="py-2 px-3 text-slate-400 text-[10px]">Livro de Saídas Comerciais</td>
                    <td className="py-2 px-3 text-right text-slate-600">{formatBRL(results.vendasContabilizadas)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 pl-6 font-sans">↳ Serviços Prestados</td>
                    <td className="py-2 px-3 text-slate-400 text-[10px]">Registro Municipal de NFS-e</td>
                    <td className="py-2 px-3 text-right text-slate-600">{formatBRL(results.servicosCfopContabilizados)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans font-semibold text-slate-900">Aquisição de Mercadorias (Compras)</td>
                    <td className="py-2 px-3 text-slate-500 text-[10px]">Revenda/Industrialização (Excluído Uso, Consumo, Ativos e Fretes)</td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900">{formatBRL(results.comprasContabilizadas)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans font-semibold">Despesas Gerais Pagas do período</td>
                    <td className="py-2 px-3 text-slate-500 text-[10px]">Soma de Compras + Folha + Outros Custos</td>
                    <td className="py-2 px-3 text-right font-bold">{formatBRL(results.despesasContabilizadas)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 pl-6 font-sans">↳ Despesas com Pessoal / Folha</td>
                    <td className="py-2 px-3 text-slate-400 text-[10px]">Salários, Previdência e Pró-labore</td>
                    <td className="py-2 px-3 text-right text-slate-600">{results.hasFolha ? formatBRL(results.folhaPagamentoContabilizada) : "Não enviada"}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 pl-6 font-sans">↳ Custos Administrativos Gerais</td>
                    <td className="py-2 px-3 text-slate-400 text-[10px]">Serviços tomados e outras despesas</td>
                    <td className="py-2 px-3 text-right text-slate-600">{formatBRL(results.outrasDespesasContabilizadas)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Test Framework Evaluations Art 29 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              
              <div className="p-4 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-blue-900 font-mono block">Inciso X (Regra de Compras 80%)</span>
                <p className="text-[11px] text-slate-500 mt-1 mb-2 font-mono">
                  Fórmula: Compras / Fatur. = {results.comprasPercentage.toFixed(2)}%
                </p>
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span>Limite Máximo:</span>
                  <span className="font-mono text-slate-700">80,00%</span>
                </div>
                <div className="flex justify-between items-center text-xs font-semibold mt-1">
                  <span>Atingido pela Empresa:</span>
                  <span className={`font-mono ${results.incisoXExceeded ? "text-red-650" : "text-emerald-650"}`}>
                    {results.comprasPercentage.toFixed(2)}%
                  </span>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs font-bold font-mono">
                  Resultado:{" "}
                  <span className={results.statusX === "Risco" ? "text-red-600" : results.statusX === "Regular" ? "text-emerald-600" : "text-amber-500"}>
                    {results.statusX === "Risco" ? "Risco de Exclusão" : results.statusX === "Regular" ? "Adequado (Regular)" : "Inconclusivo"}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-indigo-900 font-mono block">Inciso IX (Regra de Despesas 120%)</span>
                <p className="text-[11px] text-slate-500 mt-1 mb-2 font-mono">
                  Fórmula: Despesas / Fatur. = {results.despesasPercentage.toFixed(2)}%
                </p>
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span>Limite Máximo:</span>
                  <span className="font-mono text-slate-700">120,00%</span>
                </div>
                <div className="flex justify-between items-center text-xs font-semibold mt-1">
                  <span>Atingido pela Empresa:</span>
                  <span className={`font-mono ${results.incisoIXExceeded ? "text-red-650" : "text-emerald-650"}`}>
                    {results.despesasPercentage.toFixed(2)}%
                  </span>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs font-bold font-mono">
                  Resultado:{" "}
                  <span className={results.statusIX === "Risco" ? "text-red-600" : results.statusIX === "Regular" ? "text-emerald-600" : "text-amber-500"}>
                    {results.statusIX === "Risco" ? "Risco de Exclusão" : results.statusIX === "Regular" ? "Adequado (Regular)" : "Inconclusivo"}
                  </span>
                </div>
              </div>

            </div>

            {/* Warnings and Missing Evidence */}
            {alerts.length > 0 && (
              <div className="mb-8">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 font-mono flex items-center gap-1.5 border-b border-slate-200 pb-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-blue-900" />
                  2. NOTAS DE AUDITORIA E EVENTUAIS RESIDÊNCIAS DE DOCUMENTOS
                </h3>
                <div className="space-y-2">
                  {alerts.map((al) => (
                    <div key={al.id} className="text-xs bg-slate-50 p-3 rounded border border-slate-200 leading-relaxed font-sans">
                      <b className="text-slate-800">{al.message}</b>
                      {al.description && <p className="text-slate-500 mt-0.5">{al.description}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Legal Citations and Veredict Summary */}
            <div className="bg-slate-100 p-4 rounded-xl border border-slate-300 text-[11px] leading-relaxed mb-10 font-sans">
              <b>Fundamentação Legislativa:</b>
              <p className="text-slate-600 mt-1">
                Lembramos que nos termos do Art. 29 caput, da Lei Complementar nº 123/2006, a ocorrência das situações descritas nos incisos IX e X dão ensejo à exclusão de ofício do optante pelo Simples Nacional com efeitos a partir do próprio período de ocorrência do fato gerador presumido. O planejamento tributário e o saneamento das aquisições de caixa são necessários para defesas e contestações junto ao órgão fiscalizador fazendário municipal e federal.
              </p>
            </div>

            {/* Sign-off Accountant Section */}
            <div className="mt-16 pt-8 border-t border-slate-300 grid grid-cols-2 gap-8 text-center text-xs">
              <div>
                <div className="border-b border-slate-400 mx-10 h-10" />
                <p className="font-bold text-slate-800 mt-2">Responsável Técnico (Contador/Auditor)</p>
                <p className="text-[10px] text-slate-400 mt-0.5 font-mono">Deusdedit Contabilidade LTDA</p>
              </div>
              <div>
                <div className="border-b border-slate-400 mx-10 h-10" />
                <p className="font-bold text-slate-800 mt-2">Representante Legal da Empresa</p>
                <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{companyInfo.name || "NÃO INFORMADO"}</p>
              </div>
            </div>

          </div>

        </div>

        {/* Modal Outer Actions */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between no-print">
          <p className="text-[11px] text-slate-500 font-mono">
            *Dica: Ao clicar em &quot;Imprimir&quot;, selecione &quot;Salvar como PDF&quot; em seu navegador.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs rounded-lg transition-colors"
          >
            Fechar Visualização
          </button>
        </div>

      </div>
    </div>
  );
}

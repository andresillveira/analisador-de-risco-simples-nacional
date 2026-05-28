/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ShieldCheck, ShieldAlert, AlertTriangle, HelpCircle, ArrowRight } from "lucide-react";
import { AnalysisResults } from "../types";

interface RiskAnalysisCardsProps {
  results: AnalysisResults;
  analyzeScenario1?: boolean;
  analyzeScenario2?: boolean;
}

export default function RiskAnalysisCards({ 
  results,
  analyzeScenario1 = true,
  analyzeScenario2 = true
}: RiskAnalysisCardsProps) {
  const formatPercentage = (val: number) => {
    return `${val.toFixed(2)}%`;
  };

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(val);
  };

  // Determine status color helpers for progress bar X
  const getProgressBarColorX = (pct: number) => {
    if (pct === 0) return "bg-slate-200";
    if (pct > 80) return "bg-red-600";
    if (pct > 70) return "bg-amber-500"; // Caution zone (70%)
    return "bg-emerald-500";
  };

  // Determine status color helpers for progress bar IX
  const getProgressBarColorIX = (pct: number) => {
    if (pct === 0) return "bg-slate-200";
    if (pct > 120) return "bg-red-600";
    if (pct > 100) return "bg-amber-500"; // Caution zone
    return "bg-emerald-500";
  };

  return (
    <div id="risk-analysis-assessment-grid" className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      
      {/* CARD CRITÉRIO 1: INCISO X (Compras < 80%) */}
      {!analyzeScenario1 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 opacity-70 relative flex flex-col justify-between min-h-[400px]">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-4 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 bg-slate-200 px-2 py-0.5 rounded-sm">
                    Art. 29, Inciso X
                  </span>
                  <span className="text-xs text-slate-400 font-mono">LC 123/2006</span>
                </div>
                <h4 className="font-bold text-slate-400 text-base mt-1">
                  Critério 1: Aquisição de Mercadorias (Compras)
                </h4>
              </div>
              <div>
                <span className="inline-flex items-center gap-1 bg-slate-250 text-slate-650 text-xs font-bold px-2.5 py-1 rounded-full border border-slate-350">
                  Inativo
                </span>
              </div>
            </div>
            
            <p className="text-xs text-slate-500 italic mt-4 leading-relaxed">
              A análise das aquisições de mercadorias para revenda foi desativada pelo usuário para esta auditoria.
            </p>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Nenhuma restrição ou alerta de compras será computado ou apresentado nesta seção ou no veredito consolidado.
            </p>
          </div>
          <div className="mt-8 border-t border-slate-200/60 pt-4 text-[11px] text-slate-450 font-mono">
            Excluído da avaliação geral de risco.
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-sm">
                    Art. 29, Inciso X
                  </span>
                  <span className="text-xs text-slate-400 font-mono">LC 123/2006</span>
                </div>
                <h4 className="font-bold text-slate-800 text-base mt-1">
                  Critério 1: Aquisição de Mercadorias (Compras)
                </h4>
              </div>
              
              <div>
                {results.statusX === "Regular" && (
                  <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full border border-emerald-200">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Regular
                  </span>
                )}
                {results.statusX === "Risco" && (
                  <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-xs font-bold px-2.5 py-1 rounded-full border border-red-200">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Em Risco
                  </span>
                )}
                {results.statusX === "Inconclusivo" && (
                  <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 text-xs font-bold px-2.5 py-1 rounded-full border border-slate-200">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Inconclusivo
                  </span>
                )}
              </div>
            </div>

            {/* Legislation Box */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-[11px] text-slate-600 mb-4 dark:bg-slate-50/50">
              <span className="font-semibold text-slate-700">Regra Fiscal:</span> As compras de mercadorias para comercialização ou industrialização do período fiscal não podem exceder <b className="text-slate-800">80% dos ingressos</b> de recursos (faturamento). Exceder esse patamar gera presunção de omissão de vendas.
            </div>

            {/* Formula Header */}
            <div className="mb-4">
              <span className="text-xs font-bold text-slate-500 uppercase block mb-1">
                Fórmula do Indicador
              </span>
              <div className="bg-slate-100/60 p-3 rounded-lg flex items-center justify-center font-mono text-xs text-slate-700 border border-slate-200">
                <div className="text-center">
                  <span className="font-bold text-blue-700">Compras Líquidas</span>
                  <span className="mx-2">÷</span>
                  <span className="font-bold text-emerald-700">Faturamento Líquido</span>
                  <span className="mx-2">×</span>
                  <span>100</span>
                  <span className="mx-2">=</span>
                  <span className="font-bold text-slate-800 bg-white px-2 py-1 rounded shadow-2xs border border-slate-200">
                    {results.comprasPercentage.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Mathematics calculation detail */}
            <div className="space-y-1.5 text-xs text-slate-600 font-mono bg-slate-50 p-3 rounded-lg mb-4">
              <div className="flex justify-between text-[11px]">
                <span>Compras {results.devolucoesCompras > 0 ? "Líquidas" : ""}(A):</span>
                <span className="font-bold text-slate-700">{formatBRL(results.comprasLiquidas)}</span>
              </div>
              
              {results.devolucoesCompras > 0 && (
                <div className="pl-3 text-[10px] text-slate-400 space-y-0.5">
                  <div className="flex justify-between">
                    <span>↳ Compras Brutas:</span>
                    <span>{formatBRL(results.comprasContabilizadas)}</span>
                  </div>
                  <div className="flex justify-between text-rose-500">
                    <span>↳ (-) Dev. Compras (Saídas):</span>
                    <span>{formatBRL(results.devolucoesCompras)}</span>
                  </div>
                </div>
              )}
              
              <div className="flex justify-between border-t border-dashed border-slate-200 pt-1.5 mt-1.5 text-[11px] font-semibold text-slate-700">
                <span>Faturamento Líquido (B):</span>
                <span className="font-bold text-slate-700">{formatBRL(results.faturamento)}</span>
              </div>
              
              <div className="pl-3 text-[10px] text-slate-400 space-y-0.5">
                {results.devolucoesVendas > 0 ? (
                  <>
                    <div className="flex justify-between">
                      <span>↳ Vendas Brutas:</span>
                      <span>{formatBRL(results.vendasContabilizadas)}</span>
                    </div>
                    <div className="flex justify-between text-rose-500">
                      <span>↳ (-) Dev. Vendas (Entradas):</span>
                      <span>{formatBRL(results.devolucoesVendas)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-slate-500">
                      <span>↳ (=) Vendas Líquidas:</span>
                      <span>{formatBRL(results.vendasLiquidas)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between">
                    <span>↳ Vendas Brutas:</span>
                    <span>{formatBRL(results.vendasContabilizadas)}</span>
                  </div>
                )}
                
                <div className="flex justify-between">
                  <span>↳ Serviços Prestados:</span>
                  <span>{formatBRL(results.servicosCfopContabilizados)}</span>
                </div>
                
                {results.outrasReceitasContabilizadas > 0 && (
                  <div className="flex justify-between">
                    <span>↳ Outras Receitas:</span>
                    <span>{formatBRL(results.outrasReceitasContabilizadas)}</span>
                  </div>
                )}
              </div>
              
              <div className="flex justify-between border-t border-dashed border-slate-200 pt-1.5 mt-1.5 text-[11px] font-semibold">
                <span>Resultado Líquido (A ÷ B):</span>
                <span className={`font-bold ${results.incisoXExceeded ? "text-red-600" : "text-emerald-600"}`}>
                  {results.faturamento > 0 ? formatPercentage(results.comprasPercentage) : "0,00%"}
                </span>
              </div>
            </div>
          </div>

          {/* Progress bar visual container */}
          <div>
            <div className="mb-2">
              <div className="flex justify-between text-xs text-slate-500 font-medium mb-1">
                <span>Nível de Risco de Exclusão (Teto: 80%)</span>
                <span className={results.incisoXExceeded ? "text-red-600 font-bold" : "text-slate-800"}>
                  {results.faturamento > 0 ? `${results.comprasPercentage.toFixed(1)}% / 80%` : "Pendente"}
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden border border-slate-200 p-[1px]">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${getProgressBarColorX(results.comprasPercentage)}`}
                  style={{ width: `${Math.min(results.comprasPercentage, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
                <span>0%</span>
                <span>70% (Atenção)</span>
                <span className="font-bold text-red-500">80% (Limite-Teto)</span>
                <span>100%+</span>
              </div>
            </div>

            <div className={`p-4 rounded-xl text-xs flex items-start gap-2.5 ${
              results.statusX === "Risco" 
                ? "bg-red-50 text-red-800 border border-red-150" 
                : results.statusX === "Regular"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-150"
                  : "bg-slate-50 text-slate-600 border border-slate-200"
            }`}>
              <div className="mt-0.5 font-bold">Veredito:</div>
              <p className="flex-1 text-[11px] leading-relaxed">
                {results.textVerdictX}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* CARD CRITÉRIO 2: INCISO IX (Despesas < 120%) */}
      {!analyzeScenario2 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 opacity-70 relative flex flex-col justify-between min-h-[400px]">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-4 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 bg-slate-200 px-2 py-0.5 rounded-sm">
                    Art. 29, Inciso IX
                  </span>
                  <span className="text-xs text-slate-400 font-mono">LC 123/2006</span>
                </div>
                <h4 className="font-bold text-slate-400 text-base mt-1">
                  Critério 2: Despesas Pagas (Gerais + Pessoal)
                </h4>
              </div>
              <div>
                <span className="inline-flex items-center gap-1 bg-slate-250 text-slate-655 text-xs font-bold px-2.5 py-1 rounded-full border border-slate-300">
                  Inativo
                </span>
              </div>
            </div>
            
            <p className="text-xs text-slate-500 italic mt-4 leading-relaxed">
              A análise de despesas pagas e limite de fluxo de caixa foi desativada pelo usuário para esta auditoria.
            </p>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Nenhuma restrição ou alerta de despesas será computado ou apresentado nesta seção ou no veredito consolidado.
            </p>
          </div>
          <div className="mt-8 border-t border-slate-200/60 pt-4 text-[11px] text-slate-450 font-mono">
            Excluído da avaliação geral de risco.
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-sm">
                    Art. 29, Inciso IX
                  </span>
                  <span className="text-xs text-slate-400 font-mono">LC 123/2006</span>
                </div>
                <h4 className="font-bold text-slate-800 text-base mt-1">
                  Critério 2: Despesas Pagas (Gerais + Pessoal)
                </h4>
              </div>
              
              <div>
                {results.statusIX === "Regular" && (
                  <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full border border-emerald-200">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Regular
                  </span>
                )}
                {results.statusIX === "Risco" && (
                  <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-xs font-bold px-2.5 py-1 rounded-full border border-red-200">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Em Risco
                  </span>
                )}
                {results.statusIX === "Inconclusivo" && (
                  <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full border border-amber-200">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Inconclusivo
                  </span>
                )}
              </div>
            </div>

            {/* Legislation Box */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-[11px] text-slate-600 mb-4 dark:bg-slate-50/50">
              <span className="font-semibold text-slate-700">Regra Fiscal:</span> As despesas pagas (compras, folha, pró-labore e fixas) de caixa não podem superar o faturamento em mais de 20%, significando teto de <b className="text-slate-800">120% da receita bruta</b> do período.
            </div>

            {/* Formula Header */}
            <div className="mb-4">
              <span className="text-xs font-bold text-slate-500 uppercase block mb-1">
                Fórmula do Indicador
              </span>
              <div className="bg-slate-100/60 p-3 rounded-lg flex items-center justify-center font-mono text-xs text-slate-700 border border-slate-200">
                <div className="text-center">
                  <span className="font-bold text-indigo-700">Despesas Totais</span>
                  <span className="mx-2">÷</span>
                  <span className="font-bold text-emerald-700">Faturamento</span>
                  <span className="mx-2">×</span>
                  <span>100</span>
                  <span className="mx-2">=</span>
                  <span className="font-bold text-slate-800 bg-white px-2 py-1 rounded shadow-2xs border border-slate-200">
                    {results.despesasPercentage.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Mathematics calculation detail */}
            <div className="space-y-1.5 text-xs text-slate-600 font-mono bg-slate-50 p-3 rounded-lg mb-4">
              <div className="flex justify-between text-[11px]">
                <span>Despesas Totais (A):</span>
                <span className="font-bold text-slate-700">{formatBRL(results.despesasContabilizadas)}</span>
              </div>
              <div className="pl-3 text-[10px] text-slate-400 space-y-0.5">
                <div className="flex justify-between">
                  <span>↳ Compras líquidas:</span>
                  <span>
                    {formatBRL(results.comprasLiquidas)}
                    {results.devolucoesCompras > 0 && ` (Bruto: ${formatBRL(results.comprasContabilizadas)} - Dev: ${formatBRL(results.devolucoesCompras)})`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>↳ Folha de Pagamentos:</span>
                  <span>{results.hasFolha ? formatBRL(results.folhaPagamentoContabilizada) : "R$ 0,00 (Não Anexada)"}</span>
                </div>
                <div className="flex justify-between">
                  <span>↳ Outras despesas de caixa:</span>
                  <span>{formatBRL(results.outrasDespesasContabilizadas)}</span>
                </div>
              </div>
              <div className="flex justify-between border-y border-dashed border-slate-200 py-1 font-semibold text-[11px]">
                <span>Faturamento Líquido (B):</span>
                <span className="text-slate-800">{formatBRL(results.faturamento)}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span>Resultado (A ÷ B):</span>
                <span className={`font-bold ${results.incisoIXExceeded ? "text-red-600" : "text-emerald-600"}`}>
                  {results.faturamento > 0 ? formatPercentage(results.despesasPercentage) : "0,00%"}
                </span>
              </div>
            </div>
          </div>

          {/* Progress bar visual container */}
          <div>
            <div className="mb-2">
              <div className="flex justify-between text-xs text-slate-500 font-medium mb-1">
                <span>Nível de Risco de Exclusão (Teto: 120%)</span>
                <span className={results.incisoIXExceeded ? "text-red-600 font-bold" : "text-slate-800"}>
                  {results.faturamento > 0 ? `${results.despesasPercentage.toFixed(1)}% / 120%` : "Pendente"}
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden border border-slate-200 p-[1px]">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${getProgressBarColorIX(results.despesasPercentage)}`}
                  style={{ width: `${Math.min((results.despesasPercentage / 140) * 100, 100)}%` }} // normalized for 140 max gauge
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
                <span>0%</span>
                <span>80%</span>
                <span className="font-semibold text-amber-500">100% (Igualdade)</span>
                <span className="font-bold text-red-500">120% (Limite-Teto)</span>
              </div>
            </div>

            <div className={`p-4 rounded-xl text-xs flex items-start gap-2.5 ${
              results.statusIX === "Risco" 
                ? "bg-red-50 text-red-800 border border-red-150" 
                : results.statusIX === "Regular"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-150"
                  : "bg-amber-50 text-amber-800 border border-amber-150"
            }`}>
              <div className="mt-0.5 font-bold">Veredito:</div>
              <p className="flex-1 text-[11px] leading-relaxed">
                {results.textVerdictIX}
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

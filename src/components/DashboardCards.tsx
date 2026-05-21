/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BarChart3, ShoppingBag, Landmark, Info } from "lucide-react";
import { AnalysisResults } from "../types";

interface DashboardCardsProps {
  results: AnalysisResults;
}

export default function DashboardCards({ results }: DashboardCardsProps) {
  const formatBRL = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(val);
  };

  return (
    <div id="summary-dashboard-cards" className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* CARD 1: Faturamento */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs relative overflow-hidden transition-all hover:shadow-md">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/50 rounded-full translate-x-12 -translate-y-12 -z-0" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Faturamento Bruto Total
            </span>
            <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-4 h-4" />
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight font-mono">
            {formatBRL(results.faturamento)}
          </h2>
          
          <p className="text-[11px] text-slate-500 mt-2 flex items-start gap-1">
            <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
            <span>
              Soma de Vendas e Serviços. Operações de <b>Remessas</b> e <b>Devoluções</b> foram identificadas e descartadas.
            </span>
          </p>
          
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Vendas: {formatBRL(results.vendasContabilizadas)}</span>
            <span>Serviços: {formatBRL(results.servicosCfopContabilizados)}</span>
          </div>
        </div>
      </div>

      {/* CARD 2: Compras */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs relative overflow-hidden transition-all hover:shadow-md">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50/20 rounded-full translate-x-12 -translate-y-12 -z-0" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Compras para Comercialização
            </span>
            <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight font-mono">
            {formatBRL(results.comprasContabilizadas)}
          </h2>
          
          <p className="text-[11px] text-slate-500 mt-2 flex items-start gap-1">
            <Info className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
            <span>
              Insumos e industrialização. <b>Fretes</b>, <b>Ativo Imobilizado</b> e <b>Devoluções</b> foram devidamente ignorados.
            </span>
          </p>
          
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Subliminar ao Art. 29</span>
            <span className="font-semibold text-emerald-600">Inciso X</span>
          </div>
        </div>
      </div>

      {/* CARD 3: Despesas */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs relative overflow-hidden transition-all hover:shadow-md">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50/30 rounded-full translate-x-12 -translate-y-12 -z-0" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Despesas Pagas Computadas
            </span>
            <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center">
              <Landmark className="w-4 h-4" />
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight font-mono">
            {formatBRL(results.despesasContabilizadas)}
          </h2>
          
          <p className="text-[11px] text-slate-500 mt-2 flex items-start gap-1">
            <Info className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" />
            <span>
              Soma de <b>Compras</b> + <b>Folha de Pagamento</b> + <b>Despesas Administrativas</b> ocorridas no período fiscal.
            </span>
          </p>
          
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Folha: {formatBRL(results.folhaPagamentoContabilizada)}</span>
            <span>Outras: {formatBRL(results.outrasDespesasContabilizadas)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

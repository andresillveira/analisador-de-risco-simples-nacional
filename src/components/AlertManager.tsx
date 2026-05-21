/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AlertCircle, AlertTriangle, CheckCircle, Info, ArrowUpRight } from "lucide-react";
import { AlertMessage } from "../types";

interface AlertManagerProps {
  alerts: AlertMessage[];
}

export default function AlertManager({ alerts }: AlertManagerProps) {
  if (alerts.length === 0) return null;

  return (
    <div id="smart-alerts-container" className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs mt-6">
      <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-100 pb-3 mb-3">
        <AlertTriangle className="w-4 h-4 text-amber-500 animate-bounce" />
        Alertas Dinâmicos e Recomendações
      </h3>
      
      <div className="space-y-3">
        {alerts.map((alert) => {
          let bgClass = "bg-blue-50 border-blue-200 text-blue-800";
          let icon = <Info className="w-5 h-5 text-blue-600 shrink-0" />;
          
          if (alert.type === "danger") {
            bgClass = "bg-red-50 border-red-200 text-red-900";
            icon = <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />;
          } else if (alert.type === "warning") {
            bgClass = "bg-amber-50 border-amber-200 text-amber-900";
            icon = <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />;
          } else if (alert.type === "success") {
            bgClass = "bg-emerald-50 border-emerald-200 text-emerald-900";
            icon = <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />;
          }

          return (
            <div
              key={alert.id}
              className={`p-4 border rounded-xl flex items-start gap-3 transition-all ${bgClass}`}
            >
              {icon}
              <div className="flex-1">
                <h4 className="font-bold text-xs sm:text-sm">
                  {alert.message}
                </h4>
                {alert.description && (
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {alert.description}
                  </p>
                )}
                
                {/* Practical Accounting Recommendations */}
                {alert.id === "missing-folha" && (
                  <div className="mt-2.5 pt-2 border-t border-amber-200/50 text-[11px] text-amber-800 space-y-1">
                    <span className="font-bold block uppercase tracking-wider text-[9px] text-amber-600">Recomendação do Auditor:</span>
                    <p className="">• Para empresas prestadoras de serviço, a folha de salários influi diretamente no Fator R do Simples Nacional. Obtenha o extrato consolidado do eSocial ou livro diário de provisões trabalhistas.</p>
                  </div>
                )}
                
                {alert.id === "inciso-x-triggered" && (
                  <div className="mt-2.5 pt-2 border-t border-red-200/50 text-[11px] text-red-800 space-y-1">
                    <span className="font-bold block uppercase tracking-wider text-[9px] text-red-600">Ação Corretiva Urgente:</span>
                    <p className="">• 1. Verificar se houve compras de <b>Ativo Imobilizado</b> ou bens de uso e consumo não segregados no relatório.</p>
                    <p className="">• 2. Conferir se há notas de compras duplicadas ou emitidas por erro contra o CNPJ (Inutilização ou Manifesto do Destinatário).</p>
                    <p className="">• 3. Auditar as margens de lucro praticadas. Compras volumosas com estoques parados justificam aumento de volume se devidamente lastreados em inventário formal.</p>
                  </div>
                )}

                {alert.id === "inciso-ix-triggered" && (
                  <div className="mt-2.5 pt-2 border-t border-red-200/50 text-[11px] text-red-800 space-y-1">
                    <span className="font-bold block uppercase tracking-wider text-[9px] text-red-600">Estrutura de Mitigação:</span>
                    <p className="">• Evidencie as despesas dedutíveis reais. Se houver despesas pagas por conta de empréstimos bancários ou aportes de capital dos sócios (mútuo), certifique-se de que os contratos e transferências estejam 100% amparados para rebater a presunção legal de omissão de caixas.</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

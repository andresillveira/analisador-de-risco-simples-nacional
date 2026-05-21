/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, Dispatch, SetStateAction, FormEvent } from "react";
import { 
  Building2, 
  Calendar, 
  Save, 
  RefreshCw, 
  FileSpreadsheet, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Coins, 
  Trash2,
  Sliders,
  DollarSign
} from "lucide-react";
import { ManualValues, FileItem } from "../types";

interface ManualValuesEditorProps {
  companyName: string;
  period: string;
  importedFiles: FileItem[];
  currentManualValues: ManualValues | null;
  onSave: (values: ManualValues) => Promise<void>;
  onReset: () => Promise<void>;
  isAnalyzing: boolean;
}

export default function ManualValuesEditor({
  companyName,
  period,
  importedFiles,
  currentManualValues,
  onSave,
  onReset,
  isAnalyzing
}: ManualValuesEditorProps) {
  // Local state for the manual value fields
  const [isManualMode, setIsManualMode] = useState(false);
  const [vendas, setVendas] = useState(0);
  const [compras, setCompras] = useState(0);
  const [servicosPrestados, setServicosPrestados] = useState(0);
  const [servicosTomados, setServicosTomados] = useState(0);
  const [folhaPagamento, setFolhaPagamento] = useState(0);
  const [outrasReceitas, setOutrasReceitas] = useState(0);
  const [outrasDespesas, setOutrasDespesas] = useState(0);

  // Sync state when currentManualValues changes
  useEffect(() => {
    if (currentManualValues) {
      setIsManualMode(currentManualValues.is_manual);
      setVendas(currentManualValues.vendas ?? 0);
      setCompras(currentManualValues.compras ?? 0);
      setServicosPrestados(currentManualValues.servicos_prestados ?? 0);
      setServicosTomados(currentManualValues.servicos_tomados ?? 0);
      setFolhaPagamento(currentManualValues.folha_pagamento ?? 0);
      setOutrasReceitas(currentManualValues.outras_receitas ?? 0);
      setOutrasDespesas(currentManualValues.outras_despesas ?? 0);
    } else {
      setIsManualMode(false);
      clearForm();
    }
  }, [currentManualValues, companyName, period]);

  const clearForm = () => {
    setVendas(0);
    setCompras(0);
    setServicosPrestados(0);
    setServicosTomados(0);
    setFolhaPagamento(0);
    setOutrasReceitas(0);
    setOutrasDespesas(0);
  };

  // Currency Formatter & Parser
  const formatBRL = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(val);
  };

  const parseBRLString = (str: string): number => {
    const cleanStr = str.replace(/\D/g, "");
    if (!cleanStr) return 0;
    return parseFloat(cleanStr) / 100;
  };

  // Input Change Handlers
  const handleInputChange = (setter: Dispatch<SetStateAction<number>>, rawValue: string) => {
    const parsed = parseBRLString(rawValue);
    setter(parsed);
  };

  // Pre-fill values from uploaded/imported files breakdown or totals
  const handlePreFill = () => {
    let aggVendas = 0;
    let aggCompras = 0;
    let aggServicosPrestados = 0;
    let aggServicosTomados = 0;
    let aggFolha = 0;
    let aggOutrasReceitas = 0;
    let aggOutrasDespesas = 0;

    importedFiles.forEach(f => {
      const isServiceFile = 
        f.type === "Serviços" || 
        f.name.toLowerCase().includes("servi") || 
        f.name.toLowerCase().includes("iss") || 
        f.name.toLowerCase().includes("nfse");
      
      const isEntrada = 
        f.name.toLowerCase().includes("entr") || 
        f.name.toLowerCase().includes("toma");

      // Check if breakdown exists and has at least one positive value
      const breakdownSum = f.breakdown
        ? (f.breakdown.compras ?? 0) +
          (f.breakdown.vendas ?? 0) +
          (f.breakdown.servicos ?? 0) +
          (f.breakdown.outras ?? 0) +
          (f.breakdown.folha ?? 0)
        : 0;
      
      const hasValidBreakdown = f.breakdown && breakdownSum > 0.01;

      if (hasValidBreakdown && f.breakdown) {
        aggCompras += f.breakdown.compras ?? 0;
        aggVendas += f.breakdown.vendas ?? 0;
        aggServicosPrestados += f.breakdown.servicos ?? 0;
        
        // If it's a services file (like an ISS report or a file explicitly mapped to services),
        // breakdown.outras (CFOP 8.000) represents Serviços Tomados.
        // Otherwise, it represents Outras Despesas.
        if (isServiceFile) {
          aggServicosTomados += f.breakdown.outras ?? 0;
        } else {
          aggOutrasDespesas += f.breakdown.outras ?? 0;
        }
        
        aggFolha += f.breakdown.folha ?? 0;
      } else {
        const total = f.detectedTotal ?? 0;
        if (f.type === "Vendas") {
          aggVendas += total;
        } else if (f.type === "Serviços") {
          if (isEntrada) {
            aggServicosTomados += total;
          } else {
            aggServicosPrestados += total;
          }
        } else if (f.type === "Compras") {
          aggCompras += total;
        } else if (f.type === "Folha de Pagamento") {
          aggFolha += total;
        } else if (f.type === "Outras Despesas") {
          if (isServiceFile) {
            aggServicosTomados += total;
          } else {
            aggOutrasDespesas += total;
          }
        }
      }
    });

    setVendas(aggVendas);
    setCompras(aggCompras);
    setServicosPrestados(aggServicosPrestados);
    setServicosTomados(aggServicosTomados);
    setFolhaPagamento(aggFolha);
    setOutrasReceitas(aggOutrasReceitas);
    setOutrasDespesas(aggOutrasDespesas);
  };

  // Submit Handler
  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const payload: ManualValues = {
      companyName,
      period,
      vendas,
      compras,
      servicos_prestados: servicosPrestados,
      servicos_tomados: servicosTomados,
      folha_pagamento: folhaPagamento,
      outras_receitas: outrasReceitas,
      outras_despesas: outrasDespesas,
      is_manual: isManualMode
    };
    await onSave(payload);
  };

  const handleReset = async () => {
    await onReset();
    setIsManualMode(false);
    clearForm();
  };

  return (
    <div id="manual-values-editor-container" className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs transition-all duration-300">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider leading-tight">
              Ajustes e Valores Manuais
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">
              Persistido no Servidor Python
            </span>
          </div>
        </div>

        {/* Manual Mode Toggle Switch */}
        <label className="relative inline-flex items-center cursor-pointer group">
          <input 
            type="checkbox" 
            checked={isManualMode} 
            onChange={(e) => setIsManualMode(e.target.checked)}
            className="sr-only peer" 
          />
          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
          <span className="ml-2 text-[10px] font-bold text-slate-500 group-hover:text-slate-800 transition-colors uppercase tracking-wider">
            {isManualMode ? "Ativo" : "Inativo"}
          </span>
        </label>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {/* Pre-fill Action Button if there are files in screen */}
        {isManualMode && (
          <div className="flex items-center justify-between gap-3 p-3 bg-blue-50/40 border border-blue-100 rounded-xl animate-fade-in">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-blue-500 shrink-0" />
              <span className="text-[10px] text-slate-600 leading-snug font-medium">
                Tem relatórios importados? Pré-preencha para ajustar.
              </span>
            </div>
            <button
              type="button"
              onClick={handlePreFill}
              disabled={importedFiles.length === 0}
              className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-white hover:bg-slate-50 text-blue-600 border border-blue-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Pré-preencher
            </button>
          </div>
        )}

        {/* Input Fields Grid (hidden or disabled depending on toggle) */}
        <div className={`grid grid-cols-1 gap-3.5 transition-all duration-300 ${isManualMode ? "opacity-100 max-h-[1000px] pointer-events-auto" : "opacity-40 max-h-[150px] overflow-hidden pointer-events-none select-none"}`}>
          
          <div className="border-t border-slate-100 pt-3">
            <span className="text-[9px] font-bold text-blue-600 uppercase tracking-widest block mb-2 font-mono flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Faturamento / Receitas
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Vendas */}
              <div>
                <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">
                  Vendas (Faturamento)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                    <span className="text-[10px] font-bold text-slate-400 font-mono">R$</span>
                  </div>
                  <input
                    type="text"
                    disabled={!isManualMode}
                    value={formatBRL(vendas).replace("R$", "").trim()}
                    onChange={(e) => handleInputChange(setVendas, e.target.value)}
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-md pl-8 pr-2 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white font-mono text-right"
                  />
                </div>
              </div>

              {/* Serviços Prestados */}
              <div>
                <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">
                  Serviços Prestados
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                    <span className="text-[10px] font-bold text-slate-400 font-mono">R$</span>
                  </div>
                  <input
                    type="text"
                    disabled={!isManualMode}
                    value={formatBRL(servicosPrestados).replace("R$", "").trim()}
                    onChange={(e) => handleInputChange(setServicosPrestados, e.target.value)}
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-md pl-8 pr-2 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white font-mono text-right"
                  />
                </div>
              </div>

              {/* Outras Receitas */}
              <div>
                <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">
                  Outras Receitas
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                    <span className="text-[10px] font-bold text-slate-400 font-mono">R$</span>
                  </div>
                  <input
                    type="text"
                    disabled={!isManualMode}
                    value={formatBRL(outrasReceitas).replace("R$", "").trim()}
                    onChange={(e) => handleInputChange(setOutrasReceitas, e.target.value)}
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-md pl-8 pr-2 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white font-mono text-right"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <span className="text-[9px] font-bold text-rose-600 uppercase tracking-widest block mb-2 font-mono flex items-center gap-1">
              <TrendingDown className="w-3 h-3" /> Custos e Despesas
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              {/* Compras */}
              <div>
                <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">
                  Compras (Mercadorias/Insumos)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                    <span className="text-[10px] font-bold text-slate-400 font-mono">R$</span>
                  </div>
                  <input
                    type="text"
                    disabled={!isManualMode}
                    value={formatBRL(compras).replace("R$", "").trim()}
                    onChange={(e) => handleInputChange(setCompras, e.target.value)}
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-md pl-8 pr-2 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white font-mono text-right"
                  />
                </div>
              </div>

              {/* Folha de Pagamento */}
              <div>
                <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">
                  Folha de Pagamento + Encargos
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                    <span className="text-[10px] font-bold text-slate-400 font-mono">R$</span>
                  </div>
                  <input
                    type="text"
                    disabled={!isManualMode}
                    value={formatBRL(folhaPagamento).replace("R$", "").trim()}
                    onChange={(e) => handleInputChange(setFolhaPagamento, e.target.value)}
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-md pl-8 pr-2 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white font-mono text-right"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Serviços Tomados */}
              <div>
                <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">
                  Serviços Tomados
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                    <span className="text-[10px] font-bold text-slate-400 font-mono">R$</span>
                  </div>
                  <input
                    type="text"
                    disabled={!isManualMode}
                    value={formatBRL(servicosTomados).replace("R$", "").trim()}
                    onChange={(e) => handleInputChange(setServicosTomados, e.target.value)}
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-md pl-8 pr-2 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white font-mono text-right"
                  />
                </div>
              </div>

              {/* Outras Despesas */}
              <div>
                <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">
                  Outras Despesas Operacionais
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                    <span className="text-[10px] font-bold text-slate-400 font-mono">R$</span>
                  </div>
                  <input
                    type="text"
                    disabled={!isManualMode}
                    value={formatBRL(outrasDespesas).replace("R$", "").trim()}
                    onChange={(e) => handleInputChange(setOutrasDespesas, e.target.value)}
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-md pl-8 pr-2 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white font-mono text-right"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2 border-t border-slate-100">
          <button
            type="submit"
            disabled={isAnalyzing || (!isManualMode && !currentManualValues)}
            className="flex-1 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-500 hover:shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5"
          >
            {isAnalyzing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>Salvar e Auditar</span>
          </button>

          {currentManualValues?.is_manual && (
            <button
              type="button"
              onClick={handleReset}
              disabled={isAnalyzing}
              className="px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider text-rose-600 bg-rose-50 hover:bg-rose-100 hover:text-rose-700 cursor-pointer disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 border border-rose-200"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpar Ajustes</span>
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

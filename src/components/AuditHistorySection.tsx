/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  History, 
  Save, 
  Trash2, 
  FolderOpen, 
  ArrowLeftRight, 
  Check, 
  X, 
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Building2,
  Calendar as CalendarIcon,
  Scale,
  RefreshCw
} from "lucide-react";
import { FileItem, CompanyInfo, AnalysisResults, AuditHistoryRecord } from "../types";

interface AuditHistorySectionProps {
  currentFiles: FileItem[];
  currentCompany: CompanyInfo;
  currentResults: AnalysisResults;
  onRestoreAudit: (files: FileItem[], company: CompanyInfo) => void;
}

export default function AuditHistorySection({
  currentFiles,
  currentCompany,
  currentResults,
  onRestoreAudit
}: AuditHistorySectionProps) {
  const [history, setHistory] = useState<AuditHistoryRecord[]>([]);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [tempSaveName, setTempSaveName] = useState("");
  const [tempSavePeriod, setTempSavePeriod] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);

  // States for server-side comparison
  const [compareData, setCompareData] = useState<any>(null);
  const [isComparing, setIsComparing] = useState(false);

  // Load history from backend API on mount
  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/history");
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (e) {
      console.error("Erro ao carregar histórico", e);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  // Pre-fill save form whenever current company updates
  useEffect(() => {
    if (currentCompany) {
      setTempSaveName(currentCompany.name);
      setTempSavePeriod(currentCompany.period);
    }
  }, [currentCompany]);

  const handleSaveCurrentAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentFiles.length === 0) return;

    setIsSaving(true);
    try {
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: tempSaveName.trim() || currentCompany.name || "Empresa sem Nome",
          period: tempSavePeriod.trim() || currentCompany.period || "Período sem Nome",
          results: currentResults,
          files: currentFiles.map(f => ({
            id: f.id,
            name: f.name,
            size: f.size,
            type: f.type,
            content: f.content,
            rowCount: f.rowCount,
            detectedTotal: f.detectedTotal,
            processedByBackend: f.processedByBackend,
            breakdown: f.breakdown
          }))
        })
      });

      if (res.ok) {
        const newRecord = await res.json();
        setHistory(prev => [newRecord, ...prev]);
        setShowSaveSuccess(true);
        setTimeout(() => {
          setShowSaveSuccess(false);
        }, 3000);
      }
    } catch (err) {
      console.error("Erro ao salvar histórico na API:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRecord = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/history/${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setHistory(prev => prev.filter(item => item.id !== id));
        setSelectedForCompare(prev => prev.filter(item => item !== id));
      }
    } catch (err) {
      console.error("Erro ao deletar histórico", err);
    }
  };

  const handleToggleCompare = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedForCompare(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      } else {
        if (prev.length >= 2) {
          // Substitui o primeiro se já tiver 2 selecionados
          return [prev[1], id];
        }
        return [...prev, id];
      }
    });
  };

  const handleRestoreRecord = (record: AuditHistoryRecord) => {
    onRestoreAudit(record.files, {
      name: record.companyName,
      period: record.period
    });
  };

  // Fetch comparison results whenever selectedForCompare has 2 items
  useEffect(() => {
    if (selectedForCompare.length === 2) {
      const fetchComparison = async () => {
        setIsComparing(true);
        try {
          const res = await fetch("/api/compare-audits", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audit_id_a: selectedForCompare[0],
              audit_id_b: selectedForCompare[1]
            })
          });
          if (res.ok) {
            const data = await res.json();
            setCompareData(data);
          }
        } catch (err) {
          console.error("Erro ao comparar auditorias:", err);
        } finally {
          setIsComparing(false);
        }
      };
      fetchComparison();
    } else {
      setCompareData(null);
    }
  }, [selectedForCompare]);

  // Find records to compare
  const compareRecordA = history.find(r => r.id === selectedForCompare[0]);
  const compareRecordB = history.find(r => r.id === selectedForCompare[1]);

  return (
    <div className="space-y-6">
      
      {/* 2.1 CONSOLE DE SALVAMENTO DE REGISTRO */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
        <h3 className="font-bold text-xs text-slate-700 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-100 pb-2 mb-3">
          <Save className="w-3.5 h-3.5 text-blue-600" />
          Registrar Auditoria Atual
        </h3>

        {currentFiles.length === 0 ? (
          <p className="text-[11px] text-slate-400 font-mono text-center py-2">
            Anexe livros fiscais para poder salvar esta análise no histórico.
          </p>
        ) : (
          <form onSubmit={handleSaveCurrentAudit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] uppercase font-bold text-slate-400 mb-0.5">Nome de Referência</label>
                <input
                  type="text"
                  value={tempSaveName}
                  onChange={(e) => setTempSaveName(e.target.value)}
                  className="w-full text-[11px] font-semibold bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
                  placeholder="Ex: Alfa S/A"
                />
              </div>
              <div>
                <label className="block text-[9px] uppercase font-bold text-slate-400 mb-0.5">Exercício/Período</label>
                <input
                  type="text"
                  value={tempSavePeriod}
                  onChange={(e) => setTempSavePeriod(e.target.value)}
                  className="w-full text-[11px] font-semibold bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
                  placeholder="Ex: Q1/2026"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[10px] text-slate-400 font-mono">
                {currentFiles.length} livro(s) compilado(s)
              </span>
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs py-1.5 px-3 rounded flex items-center gap-1.5 shadow-sm hover:shadow-md transition-all uppercase tracking-wider"
              >
                <Save className="w-3.5 h-3.5" />
                Salvar Historico
              </button>
            </div>

            {showSaveSuccess && (
              <div className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded text-center font-semibold animate-fade-in">
                ✓ Auditoria gravada com sucesso no histórico local!
              </div>
            )}
          </form>
        )}
      </div>

      {/* 2.2 HISTÓRICO DE AUDITORIAS */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
          <h3 className="font-bold text-xs text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-blue-600" />
            Histórico Tributário ({history.length})
          </h3>
          {history.length > 0 && (
            <span className="text-[9px] text-slate-400 font-mono">
              Selecione [2] para comparar
            </span>
          )}
        </div>

        {history.length === 0 ? (
          <div className="text-center py-6 text-slate-400 font-mono text-[11px]">
            <History className="w-8 h-8 mx-auto mb-2 text-slate-300 stroke-[1.5]" />
            Nenhuma auditoria salva no histórico local.<br />
            Os dados serão guardados de forma segura sob este navegador.
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {history.map((record) => {
              const isSelected = selectedForCompare.includes(record.id);
              const rX_Risk = record.results.statusX === "Risco";
              const rIX_Risk = record.results.statusIX === "Risco";
              const hasRisk = rX_Risk || rIX_Risk;

              return (
                <div
                  key={record.id}
                  onClick={() => handleRestoreRecord(record)}
                  className="p-2.5 rounded-lg border border-slate-100 bg-slate-50 hover:bg-slate-100/50 hover:border-slate-200 cursor-pointer transition-all flex items-start gap-2.5 text-left group"
                >
                  {/* Select checkbox for comparison */}
                  <button
                    type="button"
                    onClick={(e) => handleToggleCompare(record.id, e)}
                    className={`shrink-0 w-4 h-4 mt-1 border rounded flex items-center justify-center transition-all ${
                      isSelected 
                        ? "bg-blue-600 border-blue-600 text-white" 
                        : "border-slate-300 hover:border-blue-400 bg-white"
                    }`}
                    title={isSelected ? "Desmarcar comparação" : "Selecionar para controle comparativo de risco"}
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-1">
                      <h4 className="font-bold text-xs text-slate-800 truncate leading-snug group-hover:text-blue-600">
                        {record.companyName}
                      </h4>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteRecord(record.id, e)}
                        className="text-slate-400 hover:text-red-600 p-0.5 rounded transition-colors shrink-0"
                        title="Remover auditoria salva"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex justify-between items-center mt-1 text-[10px] text-slate-500 font-mono">
                      <span className="flex items-center gap-1">
                        <CalendarIcon className="w-3 h-3 text-slate-400" />
                        {record.period}
                      </span>
                      <span className="text-[9px] text-slate-400">
                        {record.timestamp.split(" ")[0]}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-1.5 items-center font-mono">
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 border border-slate-300">
                        {record.files.length} Livro(s)
                      </span>

                      {/* BADGE RISK INDICATORS */}
                      <span className={`text-[8px] font-bold px-1 py-0.5 rounded border ${
                        rX_Risk 
                          ? "bg-red-50 text-red-700 border-red-200" 
                          : record.results.statusX === "Inconclusivo"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                      }`}>
                        X: {record.results.comprasPercentage.toFixed(0)}%
                      </span>

                      <span className={`text-[8px] font-bold px-1 py-0.5 rounded border ${
                        rIX_Risk 
                          ? "bg-red-50 text-red-700 border-red-200" 
                          : record.results.statusIX === "Inconclusivo"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                      }`}>
                        IX: {record.results.despesasPercentage.toFixed(0)}%
                      </span>

                      {hasRisk ? (
                        <span className="text-[8px] px-1.5 py-0.5 bg-red-50 border border-red-200 text-red-600 uppercase font-extrabold rounded animate-pulse">
                          ⚠️ ALTA EXCLUSÃO
                        </span>
                      ) : (
                        <span className="text-[8px] px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-600 uppercase font-bold rounded">
                          ✓ SALVO
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2.3 COMPARADOR DE AUDITORIAS SELECIONADAS (ELEGANT SIDE-BY-SIDE SIDEBAR WIDGET OR POPUP) */}
      {selectedForCompare.length > 0 && (
        <div className="bg-slate-900 text-slate-100 border border-slate-950 rounded-xl p-4 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full translate-x-12 -translate-y-12" />
          
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
            <h3 className="font-bold text-xs text-white uppercase tracking-widest flex items-center gap-1.5 font-mono">
              <ArrowLeftRight className="w-3.5 h-3.5 text-blue-400" />
              Comparador Ativo
            </h3>
            <button
              onClick={() => setSelectedForCompare([])}
              className="text-slate-400 hover:text-white"
              title="Limpar seleção"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {selectedForCompare.length === 1 ? (
            <div className="text-center py-4 text-xs text-slate-400 font-sans">
              <p>Você selecionou <b>{compareRecordA?.companyName}</b> ({compareRecordA?.period}).</p>
              <p className="text-[10px] text-slate-500 font-mono mt-1">Marque outra auditoria para comparar.</p>
            </div>
          ) : (
            recordCompareStats(compareRecordA, compareRecordB)
          )}
        </div>
      )}

    </div>
  );

  function recordCompareStats(recA?: AuditHistoryRecord, recB?: AuditHistoryRecord) {
    if (!recA || !recB) return null;
    if (isComparing) {
      return (
        <div className="text-center py-4 text-xs text-slate-400 font-sans">
          <RefreshCw className="w-4 h-4 text-blue-400 animate-spin mx-auto mb-2" />
          <p>Calculando controle comparativo de risco no servidor...</p>
        </div>
      );
    }
    if (!compareData || !compareData.diffs) return null;

    const diffs = compareData.diffs;

    return (
      <div className="space-y-3 relative z-10">
        <div className="grid grid-cols-2 gap-2 text-center border-b border-slate-800 pb-2">
          <div>
            <span className="text-[8px] uppercase text-slate-400 block font-bold">Origem [A]</span>
            <span className="font-bold text-[11px] block text-blue-300 truncate">{recA.companyName}</span>
            <span className="text-[9px] text-slate-500 block font-mono">{recA.period}</span>
          </div>
          <div>
            <span className="text-[8px] uppercase text-slate-400 block font-bold font-semibold text-blue-500">Destino [B]</span>
            <span className="font-bold text-[11px] block text-blue-300 truncate">{recB.companyName}</span>
            <span className="text-[9px] text-slate-500 block font-mono">{recB.period}</span>
          </div>
        </div>

        {/* COMPARISON METRICS TAB */}
        <div className="space-y-2.5 text-[11px] font-sans">
          
          {/* FATURAMENTO COMPARISON */}
          <div className="bg-slate-950/60 p-2 rounded border border-slate-800 flex justify-between items-center">
            <div>
              <span className="text-[9px] uppercase text-slate-400 block font-mono">Faturamento Receita</span>
              <div className="flex gap-2 text-[10px] text-slate-300 mt-0.5">
                <span>[A] {recA.results.faturamento.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</span>
                <span className="text-slate-500">→</span>
                <span>[B] {recB.results.faturamento.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
            <div className="text-right">
              {compIndicator(diffs.faturamento)}
            </div>
          </div>

          {/* COMPRAS % (INCISO X) */}
          <div className="bg-slate-950/60 p-2 rounded border border-slate-800 space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[9px] uppercase text-slate-400 font-mono">Limite Compras (Inciso X)</span>
              <span className="text-[8px] text-slate-500 bg-slate-800 px-1 rounded">Barr. 80%</span>
            </div>
            <div className="flex justify-between items-center text-[10px]">
              <div className="flex gap-1">
                <span className={recA.results.incisoXExceeded ? "text-red-400" : "text-emerald-400"}>
                  {recA.results.comprasPercentage.toFixed(1)}%
                </span>
                <span className="text-slate-500">→</span>
                <span className={recB.results.incisoXExceeded ? "text-red-400 font-bold" : "text-emerald-400"}>
                  {recB.results.comprasPercentage.toFixed(1)}%
                </span>
              </div>
              <div>
                {percentageIndicator(diffs.comprasPercentageDiff)}
              </div>
            </div>
            {diffs.riskChangeX && (
              <div className="text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded text-center font-mono">
                Alteração no status do Art. 29 Inciso X!
              </div>
            )}
          </div>

          {/* DESPESAS % (INCISO IX) */}
          <div className="bg-slate-950/60 p-2 rounded border border-slate-800 space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[9px] uppercase text-slate-400 font-mono">Limite Despesas (Inciso IX)</span>
              <span className="text-[8px] text-slate-500 bg-slate-800 px-1 rounded">Barr. 120%</span>
            </div>
            <div className="flex justify-between items-center text-[10px]">
              <div className="flex gap-1">
                <span className={recA.results.incisoIXExceeded ? "text-red-400" : "text-emerald-400"}>
                  {recA.results.despesasPercentage.toFixed(1)}%
                </span>
                <span className="text-slate-500">→</span>
                <span className={recB.results.incisoIXExceeded ? "text-red-400 font-bold" : "text-emerald-400"}>
                  {recB.results.despesasPercentage.toFixed(1)}%
                </span>
              </div>
              <div>
                {percentageIndicator(diffs.despesasPercentageDiff)}
              </div>
            </div>
            {diffs.riskChangeIX && (
              <div className="text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded text-center font-mono">
                Alteração no status do Art. 29 Inciso IX!
              </div>
            )}
          </div>

          {/* TOTAL DIAGNOSTICO VEREDICT SUMMARY */}
          <div className="pt-2 border-t border-slate-800 text-[10px]">
            <b className="text-white uppercase block text-[8px] tracking-wide mb-1">Mutações de Risco:</b>
            <div className="grid grid-cols-2 gap-1.5 text-center font-mono text-[9px]">
              <div className={`p-1 rounded ${getVerdictColor(recA.results)}`}>
                [A]: <span className="font-bold">{getVerdictLabel(recA.results)}</span>
              </div>
              <div className={`p-1 rounded ${getVerdictColor(recB.results)}`}>
                [B]: <span className="font-bold">{getVerdictLabel(recB.results)}</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    );
  }

  function getVerdictLabel(res: AnalysisResults): string {
    if (res.statusX === "Risco" || res.statusIX === "Risco") {
      return "RISCO ALTO";
    }
    if (res.statusX === "Inconclusivo" || res.statusIX === "Inconclusivo") {
      return "PENDENTE";
    }
    return "REGULAR";
  }

  function getVerdictColor(res: AnalysisResults): string {
    if (res.statusX === "Risco" || res.statusIX === "Risco") {
      return "bg-red-950 text-red-400 border border-red-900/50";
    }
    if (res.statusX === "Inconclusivo" || res.statusIX === "Inconclusivo") {
      return "bg-amber-950 text-amber-400 border border-amber-900/50";
    }
    return "bg-emerald-950 text-emerald-400 border border-emerald-900/50";
  }

  function compIndicator(diff: number) {
    if (diff === 0) return <span className="text-slate-500 font-mono text-[10px]">0</span>;
    const isUp = diff > 0;
    return (
      <span className={`font-mono font-bold text-[10px] flex items-center gap-0.5 ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
        {isUp ? "+" : ""}{diff.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
        {isUp ? <TrendingUp className="w-3 h-3 text-emerald-400" /> : <TrendingDown className="w-3 h-3 text-red-400" />}
      </span>
    );
  }

  function percentageIndicator(diff: number) {
    if (diff === 0) return <span className="text-slate-500 font-mono">0.0%</span>;
    const isUp = diff > 0;
    return (
      <span className={`font-mono font-semibold text-[10px] flex items-center gap-0.5 ${isUp ? 'text-red-400' : 'text-emerald-400'}`}>
        {isUp ? "+" : ""}{diff.toFixed(1)}%
        {isUp ? <TrendingUp className="w-3 h-3 text-red-400" /> : <TrendingDown className="w-3 h-3 text-emerald-400" />}
      </span>
    );
  }
}

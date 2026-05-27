/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  History, 
  Trash2, 
  FolderOpen, 
  ArrowLeftRight, 
  Check, 
  X, 
  TrendingUp, 
  TrendingDown, 
  Building2, 
  Calendar as CalendarIcon, 
  Clock,
  Scale, 
  RefreshCw,
  Search,
  Filter,
  FileSpreadsheet,
  AlertTriangle,
  Info
} from "lucide-react";
import { FileItem, CompanyInfo, AnalysisResults, AuditHistoryRecord } from "../types";

interface AuditHistoryTabProps {
  onRestoreAudit: (files: FileItem[], company: CompanyInfo) => void;
}

export default function AuditHistoryTab({
  onRestoreAudit
}: AuditHistoryTabProps) {
  const [history, setHistory] = useState<AuditHistoryRecord[]>([]);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  
  // Search & Filter state
  const [searchName, setSearchName] = useState("");
  const [searchPeriod, setSearchPeriod] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "risk" | "regular">("all");

  // States for server-side comparison
  const [compareData, setCompareData] = useState<any>(null);
  const [isComparing, setIsComparing] = useState(false);

  // Load history from backend API
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

  const handleDeleteRecord = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Tem certeza de que deseja remover esta auditoria permanentemente do histórico local?")) {
      return;
    }
    
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
          // Replace first selection if already 2 selected
          return [prev[1], id];
        }
        return [...prev, id];
      }
    });
  };

  const handleRestoreRecord = (record: AuditHistoryRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    onRestoreAudit(record.files, {
      name: record.companyName,
      period: record.period
    });
  };

  const handleClearFilters = () => {
    setSearchName("");
    setSearchPeriod("");
    setFilterStatus("all");
  };

  // Fetch comparison results when 2 items selected
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

  // Apply filters
  const filteredHistory = history.filter(record => {
    if (searchName && !record.companyName.toLowerCase().includes(searchName.toLowerCase())) {
      return false;
    }
    if (searchPeriod && !record.period.toLowerCase().includes(searchPeriod.toLowerCase())) {
      return false;
    }
    if (filterStatus !== "all") {
      const hasRisk = record.results.statusX === "Risco" || record.results.statusIX === "Risco";
      if (filterStatus === "risk" && !hasRisk) return false;
      if (filterStatus === "regular" && hasRisk) return false;
    }
    return true;
  });

  // Calculate Metrics from original history
  const totalSaved = history.length;
  const totalRisk = history.filter(r => r.results.statusX === "Risco" || r.results.statusIX === "Risco").length;
  const totalRegular = totalSaved - totalRisk;

  const hasActiveFilters = searchName !== "" || searchPeriod !== "" || filterStatus !== "all";

  // Comparison references
  const compareRecordA = history.find(r => r.id === selectedForCompare[0]);
  const compareRecordB = history.find(r => r.id === selectedForCompare[1]);

  return (
    <div className="col-span-12 grid grid-cols-12 gap-6 w-full">
      
      {/* 1. LEFT SIDEBAR: FILTERS, STATS & COMPARER */}
      <aside className="col-span-12 lg:col-span-4 space-y-6 flex flex-col">
        
        {/* ADVANCED FILTERS PANEL */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1.5 font-sans">
              <Filter className="w-4 h-4 text-blue-600" />
              Filtros de Busca
            </h3>
            {hasActiveFilters && (
              <button 
                onClick={handleClearFilters}
                className="text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors uppercase tracking-wider cursor-pointer"
              >
                Limpar
              </button>
            )}
          </div>

          <div className="space-y-3.5">
            {/* Search by Company */}
            <div>
              <label htmlFor="filter-name" className="block text-[9px] uppercase font-bold text-slate-400 mb-1">
                Empresa (Razão Social / Nome Fantasia)
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  id="filter-name"
                  type="text"
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  placeholder="Buscar empresa..."
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-md pl-8 pr-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all font-mono"
                />
              </div>
            </div>

            {/* Search by Period */}
            <div>
              <label htmlFor="filter-period" className="block text-[9px] uppercase font-bold text-slate-400 mb-1">
                Período / Exercício
              </label>
              <div className="relative">
                <CalendarIcon className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  id="filter-period"
                  type="text"
                  value={searchPeriod}
                  onChange={(e) => setSearchPeriod(e.target.value)}
                  placeholder="Ex: Q1/2026, Mês..."
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-md pl-8 pr-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all font-mono"
                />
              </div>
            </div>

            {/* Status Pills Selector */}
            <div>
              <span className="block text-[9px] uppercase font-bold text-slate-400 mb-1.5">
                Situação Fiscal (Art. 29)
              </span>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => setFilterStatus("all")}
                  className={`w-full px-3 py-2 text-left rounded-md text-xs font-semibold border flex items-center justify-between transition-all cursor-pointer ${
                    filterStatus === "all"
                      ? "bg-slate-100 border-slate-300 text-slate-800 font-bold"
                      : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100/50"
                  }`}
                >
                  <span>Todos os Registros</span>
                  <span className="text-[10px] font-mono bg-white border px-1.5 py-0.2 rounded text-slate-500">{totalSaved}</span>
                </button>
                
                <button
                  type="button"
                  onClick={() => setFilterStatus("risk")}
                  className={`w-full px-3 py-2 text-left rounded-md text-xs font-semibold border flex items-center justify-between transition-all cursor-pointer ${
                    filterStatus === "risk"
                      ? "bg-red-50 border-red-200 text-red-700 font-bold shadow-2xs"
                      : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100/50"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block animate-pulse" />
                    Com risco em algum cenário
                  </span>
                  <span className="text-[10px] font-mono bg-white border px-1.5 py-0.2 rounded text-red-600">{totalRisk}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilterStatus("regular")}
                  className={`w-full px-3 py-2 text-left rounded-md text-xs font-semibold border flex items-center justify-between transition-all cursor-pointer ${
                    filterStatus === "regular"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700 font-bold shadow-2xs"
                      : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100/50"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                    Sem pendências / Tudo OK
                  </span>
                  <span className="text-[10px] font-mono bg-white border px-1.5 py-0.2 rounded text-emerald-600">{totalRegular}</span>
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* QUICK PORTFOLIO HEALTH STATS CARD */}
        <div className="bg-slate-900 border border-slate-950 rounded-xl p-5 shadow-xs text-white space-y-4">
          <h3 className="font-bold text-xs uppercase tracking-widest text-slate-400 flex items-center gap-1.5 font-mono border-b border-slate-800 pb-3">
            <Scale className="w-4 h-4 text-blue-400" />
            Diagnóstico do Portfólio
          </h3>
          
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-800/50 border border-slate-800 rounded-lg p-2 flex flex-col justify-center">
              <span className="text-[9px] uppercase font-bold text-slate-400 block font-mono">Auditorias</span>
              <span className="font-bold text-lg text-white font-mono mt-0.5">{totalSaved}</span>
            </div>
            <div className="bg-slate-800/50 border border-slate-800 rounded-lg p-2 flex flex-col justify-center">
              <span className="text-[9px] uppercase font-bold text-red-400 block font-mono">Risco</span>
              <span className="font-bold text-lg text-red-400 font-mono mt-0.5">{totalRisk}</span>
            </div>
            <div className="bg-slate-800/50 border border-slate-800 rounded-lg p-2 flex flex-col justify-center">
              <span className="text-[9px] uppercase font-bold text-emerald-400 block font-mono">Regular</span>
              <span className="font-bold text-lg text-emerald-400 font-mono mt-0.5">{totalRegular}</span>
            </div>
          </div>

          <div className="text-[10px] text-slate-400 font-mono bg-slate-950/60 p-2.5 rounded border border-slate-800/60 space-y-1.5 leading-relaxed">
            <div className="flex justify-between items-center">
              <span>Taxa de Conformidade:</span>
              <span className="font-bold text-white">
                {totalSaved > 0 ? ((totalRegular / totalSaved) * 100).toFixed(0) : 0}%
              </span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${totalSaved > 0 ? (totalRegular / totalSaved) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* INTEGRATED AUDIT COMPARER WIDGET */}
        {selectedForCompare.length > 0 && (
          <div className="bg-slate-900 text-slate-100 border border-slate-950 rounded-xl p-5 shadow-xl relative overflow-hidden flex-1 min-h-[350px]">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full translate-x-12 -translate-y-12" />
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <h3 className="font-bold text-xs text-white uppercase tracking-widest flex items-center gap-1.5 font-mono">
                <ArrowLeftRight className="w-3.5 h-3.5 text-blue-400" />
                Comparador de Risco
              </h3>
              <button
                onClick={() => setSelectedForCompare([])}
                className="text-slate-400 hover:text-white cursor-pointer"
                title="Limpar seleção"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedForCompare.length === 1 ? (
              <div className="text-center py-8 text-xs text-slate-400 font-sans flex flex-col justify-center items-center h-[200px] border border-dashed border-slate-800 rounded-lg bg-slate-950/20">
                <ArrowLeftRight className="w-8 h-8 text-slate-700 mb-2 stroke-[1]" />
                <p>Selecionado: <b className="text-blue-300">{compareRecordA?.companyName}</b></p>
                <p className="text-[10px] text-slate-500 font-mono mt-1 max-w-[200px] leading-relaxed">
                  Marque o checkbox de comparação em outro card para cruzar faturamento e despesas.
                </p>
              </div>
            ) : (
              recordCompareStats(compareRecordA, compareRecordB)
            )}
          </div>
        )}

      </aside>

      {/* 2. RIGHT CONTAINER: LIST OF SAVE CARDS WITH DETAILED GAUGES */}
      <main className="col-span-12 lg:col-span-8 space-y-4">
        
        {/* COMPILATION HEADER INFO */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
              <History className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-sans">
                Histórico Tributário de Auditorias
              </h2>
              <p className="text-[11px] text-slate-500 font-mono">
                Laudos e livros arquivados localmente ({filteredHistory.length} registros correspondentes)
              </p>
            </div>
          </div>
          
          {selectedForCompare.length > 0 && (
            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-800 px-3 py-1 rounded-md text-[10px] font-bold font-mono">
              <span>Comparando [{selectedForCompare.length}/2]</span>
            </div>
          )}
        </div>

        {/* LIST RENDER OR EMPTY STATES */}
        {filteredHistory.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-6 flex flex-col items-center justify-center min-h-[450px] shadow-xs">
            <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 shadow-inner">
              <History className="w-8 h-8 stroke-[1.5]" />
            </div>
            
            <div className="max-w-md space-y-2">
              <h3 className="text-base font-bold text-slate-800">
                {hasActiveFilters ? "Nenhum resultado encontrado" : "Nenhum histórico disponível"}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {hasActiveFilters
                  ? "Tente flexibilizar os termos digitados na identificação, período de análise ou altere a situação fiscal selecionada nos filtros de busca."
                  : "Ainda não há registros tributários arquivados neste navegador. Faça a auditoria de uma empresa real enviando seus livros fiscais e salve-a para consulta posterior."}
              </p>
            </div>

            {hasActiveFilters ? (
              <button
                onClick={handleClearFilters}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider shadow-md cursor-pointer transition-all"
              >
                Limpar Filtros Ativos
              </button>
            ) : (
              <div className="text-[10px] text-slate-400 font-mono max-w-sm border border-slate-100 rounded-lg p-3 bg-slate-50 leading-relaxed">
                💡 <b>Dica fiscal:</b> Na aba <b>"Auditar Nova Empresa"</b>, preencha a identificação, faça upload de arquivos e use a ferramenta de gravação rápida para começar a consolidar seu histórico local.
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredHistory.map((record) => {
              const isSelected = selectedForCompare.includes(record.id);
              const rX_Risk = record.results.statusX === "Risco";
              const rIX_Risk = record.results.statusIX === "Risco";
              const hasRisk = rX_Risk || rIX_Risk;

              return (
                <div
                  key={record.id}
                  className={`bg-white border rounded-xl overflow-hidden shadow-xs hover:shadow-md transition-all duration-200 relative group flex flex-col ${
                    isSelected 
                      ? "ring-2 ring-blue-500 border-blue-500" 
                      : "border-slate-200"
                  }`}
                >
                  {/* Subtle top indicator band matching the risk status */}
                  <div className={`h-1.5 w-full ${
                    hasRisk 
                      ? "bg-red-500" 
                      : record.results.statusX === "Inconclusivo" || record.results.statusIX === "Inconclusivo"
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                  }`} />

                  {/* MAIN CARD BODY */}
                  <div className="p-5 flex-1 space-y-4">
                    {/* Header info */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={`p-2 rounded-lg shrink-0 ${
                          hasRisk 
                            ? "bg-red-50 text-red-600 border border-red-100" 
                            : "bg-slate-50 text-slate-600 border border-slate-100"
                        }`}>
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-sm text-slate-800 leading-snug truncate group-hover:text-blue-600 transition-colors" title={record.companyName}>
                            {record.companyName}
                          </h4>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 items-center mt-1 text-[10px] text-slate-500 font-mono">
                            <span className="flex items-center gap-1">
                              <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
                              {record.period}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              {record.timestamp}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => handleDeleteRecord(record.id, e)}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:bg-red-50 hover:border-red-100 transition-all cursor-pointer shadow-2xs"
                          title="Remover auditoria arquivada"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Financial stats values */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-slate-50 border border-slate-100 p-3 rounded-lg text-slate-700 font-mono text-[11px]">
                      <div>
                        <span className="block text-[8px] uppercase text-slate-400 font-bold">Faturamento Total</span>
                        <span className="font-bold text-slate-800 text-xs">
                          R$ {record.results.faturamento.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[8px] uppercase text-slate-400 font-bold">Compras Acumuladas</span>
                        <span className="font-bold text-slate-800 text-xs">
                          R$ {record.results.comprasContabilizadas.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[8px] uppercase text-slate-400 font-bold">Despesas Gerais</span>
                        <span className="font-bold text-slate-800 text-xs">
                          R$ {record.results.despesasContabilizadas.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    {/* Progress bars for Inciso X and Inciso IX */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Inciso X: Compras */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[10px] font-mono">
                          <span className="font-bold text-slate-600">Compras / Faturamento (Inciso X)</span>
                          <span className={`font-bold ${rX_Risk ? "text-red-600" : "text-slate-700"}`}>
                            {record.results.comprasPercentage.toFixed(1)}% / 80%
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200/50">
                          <div 
                            className={`h-full rounded-full transition-all duration-300 ${
                              rX_Risk 
                                ? "bg-red-500" 
                                : record.results.statusX === "Inconclusivo"
                                  ? "bg-amber-400"
                                  : "bg-emerald-500"
                            }`} 
                            style={{ width: `${Math.min(record.results.comprasPercentage, 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* Inciso IX: Despesas */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[10px] font-mono">
                          <span className="font-bold text-slate-600">Despesas / Faturamento (Inciso IX)</span>
                          <span className={`font-bold ${rIX_Risk ? "text-red-600" : "text-slate-700"}`}>
                            {record.results.despesasPercentage.toFixed(1)}% / 120%
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200/50">
                          <div 
                            className={`h-full rounded-full transition-all duration-300 ${
                              rIX_Risk 
                                ? "bg-red-500" 
                                : record.results.statusIX === "Inconclusivo"
                                  ? "bg-amber-400"
                                  : "bg-emerald-500"
                            }`} 
                            style={{ width: `${Math.min(record.results.despesasPercentage, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* CARD FOOTER */}
                  <div className="bg-slate-50/80 border-t border-slate-100 p-4 px-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 font-sans">
                    
                    {/* Visual markers or badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Checkbox Compare */}
                      <button
                        type="button"
                        onClick={(e) => handleToggleCompare(record.id, e)}
                        className={`shrink-0 h-6 px-2.5 rounded-lg border text-[10px] font-bold font-mono flex items-center gap-1.5 transition-all cursor-pointer shadow-3xs ${
                          isSelected 
                            ? "bg-blue-600 border-blue-600 text-white font-extrabold" 
                            : "border-slate-200 bg-white text-slate-500 hover:border-blue-400 hover:text-blue-600"
                        }`}
                        title={isSelected ? "Remover do comparador de cenários" : "Marcar para cruzar dados e riscos"}
                      >
                        {isSelected ? <Check className="w-3.5 h-3.5 text-white" /> : <ArrowLeftRight className="w-3.5 h-3.5 text-slate-400" />}
                        <span>{isSelected ? "Comparando" : "Comparar"}</span>
                      </button>

                      {/* Verdict Pill */}
                      <div className={`px-2.5 py-1 rounded-lg text-[9px] font-extrabold uppercase tracking-wide border font-mono ${
                        hasRisk 
                          ? "bg-red-50 text-red-700 border-red-100 animate-pulse" 
                          : record.results.statusX === "Inconclusivo" || record.results.statusIX === "Inconclusivo"
                            ? "bg-amber-50 text-amber-700 border-amber-100"
                            : "bg-emerald-50 text-emerald-700 border-emerald-100"
                      }`}>
                        {hasRisk ? "🚨 EXCLUSÃO PREVISTA" : record.results.statusX === "Inconclusivo" || record.results.statusIX === "Inconclusivo" ? "⚠️ PENDENTE" : "🟢 REGULAR"}
                      </div>

                      {/* Livros count badge */}
                      <span className="text-[10px] text-slate-400 font-mono bg-white border border-slate-200/60 rounded px-2 py-0.8 shadow-3xs">
                        🏢 {record.files.length} Livro(s)
                      </span>
                    </div>

                    {/* Restauration CTA Button */}
                    <button
                      type="button"
                      onClick={(e) => handleRestoreRecord(record, e)}
                      className="px-4 py-1.8 bg-white border border-slate-200 rounded-lg text-slate-600 text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-3xs hover:border-slate-300 hover:text-slate-800 hover:bg-slate-50 cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-slate-500" />
                      Restaurar Auditoria
                    </button>

                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
      
    </div>
  );

  function recordCompareStats(recA?: AuditHistoryRecord, recB?: AuditHistoryRecord) {
    if (!recA || !recB) return null;
    if (isComparing) {
      return (
        <div className="text-center py-8 text-xs text-slate-400 font-sans flex flex-col justify-center items-center h-[200px]">
          <RefreshCw className="w-6 h-6 text-blue-400 animate-spin mb-2" />
          <p>Calculando controle comparativo de risco no servidor...</p>
        </div>
      );
    }
    if (!compareData || !compareData.diffs) return null;

    const diffs = compareData.diffs;

    return (
      <div className="space-y-4 relative z-10 font-sans">
        <div className="grid grid-cols-2 gap-2.5 text-center border-b border-slate-800 pb-3">
          <div className="min-w-0">
            <span className="text-[8px] uppercase text-slate-400 block font-bold font-mono">Origem [A]</span>
            <span className="font-bold text-[11px] block text-blue-300 truncate leading-snug">{recA.companyName}</span>
            <span className="text-[9px] text-slate-500 block font-mono mt-0.5">{recA.period}</span>
          </div>
          <div className="min-w-0">
            <span className="text-[8px] uppercase text-blue-400 block font-bold font-mono">Destino [B]</span>
            <span className="font-bold text-[11px] block text-blue-300 truncate leading-snug">{recB.companyName}</span>
            <span className="text-[9px] text-slate-500 block font-mono mt-0.5">{recB.period}</span>
          </div>
        </div>

        {/* COMPARISON METRICS TAB */}
        <div className="space-y-3 text-[11px]">
          
          {/* FATURAMENTO COMPARISON */}
          <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800/80 flex justify-between items-center">
            <div>
              <span className="text-[8px] uppercase text-slate-400 block font-bold font-mono">Faturamento Receita</span>
              <div className="flex gap-2 text-[10px] text-slate-300 mt-0.5 font-mono">
                <span>[A] {recA.results.faturamento.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</span>
                <span className="text-slate-600">→</span>
                <span>[B] {recB.results.faturamento.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
            <div className="text-right">
              {compIndicator(diffs.faturamento)}
            </div>
          </div>

          {/* COMPRAS % (INCISO X) */}
          <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800/80 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-[8px] uppercase text-slate-400 block font-bold font-mono">Limite Compras (Inciso X)</span>
              <span className="text-[8px] text-slate-500 bg-slate-800 px-1 rounded font-mono">Barreira: 80%</span>
            </div>
            <div className="flex justify-between items-center text-[10px] font-mono">
              <div className="flex gap-1.5">
                <span className={recA.results.incisoXExceeded ? "text-red-400" : "text-emerald-400"}>
                  {recA.results.comprasPercentage.toFixed(1)}%
                </span>
                <span className="text-slate-600">→</span>
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
                Mutação no status do Art. 29, Inciso X!
              </div>
            )}
          </div>

          {/* DESPESAS % (INCISO IX) */}
          <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800/80 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-[8px] uppercase text-slate-400 block font-bold font-mono">Limite Despesas (Inciso IX)</span>
              <span className="text-[8px] text-slate-500 bg-slate-800 px-1 rounded font-mono">Barreira: 120%</span>
            </div>
            <div className="flex justify-between items-center text-[10px] font-mono">
              <div className="flex gap-1.5">
                <span className={recA.results.incisoIXExceeded ? "text-red-400" : "text-emerald-400"}>
                  {recA.results.despesasPercentage.toFixed(1)}%
                </span>
                <span className="text-slate-600">→</span>
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
                Mutação no status do Art. 29, Inciso IX!
              </div>
            )}
          </div>

          {/* TOTAL DIAGNOSTICO VEREDICT SUMMARY */}
          <div className="pt-2.5 border-t border-slate-800/80 text-[10px]">
            <b className="text-white uppercase block text-[8px] font-bold font-mono tracking-wide mb-1.5">Mutações de Risco:</b>
            <div className="grid grid-cols-2 gap-2 text-center font-mono text-[9px]">
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
      return "bg-red-950/60 text-red-400 border border-red-900/40";
    }
    if (res.statusX === "Inconclusivo" || res.statusIX === "Inconclusivo") {
      return "bg-amber-950/60 text-amber-400 border border-amber-900/40";
    }
    return "bg-emerald-950/60 text-emerald-400 border border-emerald-900/40";
  }

  function compIndicator(diff: number) {
    if (diff === 0) return <span className="text-slate-500 font-mono text-[10px]">0</span>;
    const isUp = diff > 0;
    return (
      <span className={`font-mono font-bold text-[10px] flex items-center gap-0.5 justify-end ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
        {isUp ? "+" : ""}{diff.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
        {isUp ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <TrendingDown className="w-3.5 h-3.5 text-red-400 shrink-0" />}
      </span>
    );
  }

  function percentageIndicator(diff: number) {
    if (diff === 0) return <span className="text-slate-500 font-mono">0.0%</span>;
    const isUp = diff > 0;
    return (
      <span className={`font-mono font-semibold text-[10px] flex items-center gap-0.5 justify-end ${isUp ? 'text-red-400' : 'text-emerald-400'}`}>
        {isUp ? "+" : ""}{diff.toFixed(1)}%
        {isUp ? <TrendingUp className="w-3.5 h-3.5 text-red-400 shrink-0" /> : <TrendingDown className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
      </span>
    );
  }
}

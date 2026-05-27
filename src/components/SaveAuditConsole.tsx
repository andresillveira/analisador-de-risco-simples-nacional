/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { FileItem, CompanyInfo, AnalysisResults } from "../types";

interface SaveAuditConsoleProps {
  currentFiles: FileItem[];
  currentCompany: CompanyInfo;
  currentResults: AnalysisResults;
  onSaveSuccess: () => void;
}

export default function SaveAuditConsole({
  currentFiles,
  currentCompany,
  currentResults,
  onSaveSuccess
}: SaveAuditConsoleProps) {
  const [tempSaveName, setTempSaveName] = useState("");
  const [tempSavePeriod, setTempSavePeriod] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);

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
        setShowSaveSuccess(true);
        setTimeout(() => {
          setShowSaveSuccess(false);
          onSaveSuccess();
        }, 1500); // Short delay to show success check, then redirect to history
      }
    } catch (err) {
      console.error("Erro ao salvar histórico na API:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
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
                className="w-full text-[11px] font-semibold bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all font-mono"
                placeholder="Ex: Alfa S/A"
              />
            </div>
            <div>
              <label className="block text-[9px] uppercase font-bold text-slate-400 mb-0.5">Exercício/Período</label>
              <input
                type="text"
                value={tempSavePeriod}
                onChange={(e) => setTempSavePeriod(e.target.value)}
                className="w-full text-[11px] font-semibold bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all font-mono"
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
              disabled={isSaving}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs py-1.5 px-3 rounded flex items-center gap-1.5 shadow-sm hover:shadow-md transition-all uppercase tracking-wider cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving ? "Gravando..." : "Salvar Histórico"}
            </button>
          </div>

          {showSaveSuccess && (
            <div className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded text-center font-semibold animate-fade-in mt-2">
              ✓ Auditoria gravada! Redirecionando para o Histórico...
            </div>
          )}
        </form>
      )}
    </div>
  );
}

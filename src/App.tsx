/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { 
  Building2, 
  Calendar, 
  Printer, 
  Sparkles, 
  RotateCcw, 
  BookOpen, 
  Scale, 
  FileCheck, 
  Compass, 
  HelpCircle,
  FileSpreadsheet,
  AlertTriangle,
  Info,
  Clock,
  RefreshCw,
  Lock,
  UploadCloud
} from "lucide-react";

import { FileItem, CompanyInfo, AnalysisResults, AlertMessage, EMPTY_RESULTS, EMPTY_ALERTS, SimulationProfile, ManualValues } from "./types";

import ReportDropzone from "./components/ReportDropzone";
import DashboardCards from "./components/DashboardCards";
import RiskAnalysisCards from "./components/RiskAnalysisCards";
import AlertManager from "./components/AlertManager";
import PrintReport from "./components/PrintReport";
import AuditHistorySection from "./components/AuditHistorySection";
import ManualValuesEditor from "./components/ManualValuesEditor";

const areBreakdownsEqual = (b1?: any, b2?: any) => {
  if (!b1 && !b2) return true;
  if (!b1 || !b2) return false;
  const keys = ["compras", "vendas", "servicos", "outras", "folha"] as const;
  return keys.every(k => Math.abs((b1[k] ?? 0) - (b2[k] ?? 0)) < 0.01);
};

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<"simulations" | "import">("simulations");
  
  // Shared Print Preview & Core Backend Status
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [backendStatus, setBackendStatus] = useState<"connected" | "disconnected" | "connecting">("connecting");

  // === 1. SIMULATION STATE (DEMO SANDBOX) ===
  const [simulationProfiles, setSimulationProfiles] = useState<SimulationProfile[]>([]);
  const [simulationProfileId, setSimulationProfileId] = useState<string>("");
  const [simulationCompanyInfo, setSimulationCompanyInfo] = useState<CompanyInfo>({
    name: "Empresa de Exemplo Simulação S/A",
    period: "1º Trimestre de 2026"
  });
  const [simulationFiles, setSimulationFiles] = useState<FileItem[]>([]);
  const [simulationResults, setSimulationResults] = useState<AnalysisResults>(EMPTY_RESULTS);
  const [simulationAlerts, setSimulationAlerts] = useState<AlertMessage[]>(EMPTY_ALERTS);
  const [isAnalyzingSimulation, setIsAnalyzingSimulation] = useState(false);

  // === 2. CUSTOM IMPORT STATE (REAL AUDIT) ===
  const [importCompanyInfo, setImportCompanyInfo] = useState<CompanyInfo>({
    name: "Nova Empresa S/A",
    period: "Mês/Ano Atual"
  });
  const [importFiles, setImportFiles] = useState<FileItem[]>([]);
  const [importResults, setImportResults] = useState<AnalysisResults>(EMPTY_RESULTS);
  const [importAlerts, setImportAlerts] = useState<AlertMessage[]>(EMPTY_ALERTS);
  const [isAnalyzingImport, setIsAnalyzingImport] = useState(false);
  const [isNameAutoCaptured, setIsNameAutoCaptured] = useState(false);

  // === 3. MANUAL OVERRIDES STATE ===
  const [currentManualValues, setCurrentManualValues] = useState<ManualValues | null>(null);
  const [manualResults, setManualResults] = useState<AnalysisResults | null>(null);
  const [manualAlerts, setManualAlerts] = useState<AlertMessage[] | null>(null);
  const [isSavingManual, setIsSavingManual] = useState(false);

  // === 4. SCENARIO SCOPE SELECTION STATE ===
  const [analyzeScenario1, setAnalyzeScenario1] = useState(true);
  const [analyzeScenario2, setAnalyzeScenario2] = useState(true);

  // === 5. PAYROLL CALCULATION BASE STATE ===
  const [payrollCalculationBase, setPayrollCalculationBase] = useState<"custo_func" | "sal_hrs_faltas" | "sal_base">("custo_func");

  const handlePayrollBaseChange = (base: "custo_func" | "sal_hrs_faltas" | "sal_base") => {
    setPayrollCalculationBase(base);
    setSimulationFiles(prev => prev.map(f => ({ ...f, processedByBackend: false })));
    setImportFiles(prev => prev.map(f => ({ ...f, processedByBackend: false })));
  };

  // Heartbeat check on mount (Shared across backend connections)
  useEffect(() => {
    let active = true;
    const checkHealth = async () => {
      try {
        const res = await fetch("/api/health");
        if (res.ok && active) {
          setBackendStatus("connected");
        } else if (active) {
          setBackendStatus("disconnected");
        }
      } catch (err) {
        if (active) setBackendStatus("disconnected");
      }
    };
    
    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Load simulation profiles from backend on mount
  useEffect(() => {
    let active = true;
    const fetchProfiles = async () => {
      try {
        const res = await fetch("/api/simulation-profiles");
        if (res.ok) {
          const data = await res.json();
          if (active) {
            setSimulationProfiles(data);
            if (data.length > 0) {
              const profile = data[0];
              setSimulationCompanyInfo({
                name: profile.companyName,
                period: profile.period
              });
              const resetFiles = profile.files.map((f: any) => ({ ...f, processedByBackend: false }));
              setSimulationFiles(resetFiles);
              setSimulationProfileId(profile.id);
            }
          }
        }
      } catch (err) {
        console.error("Erro ao carregar perfis de simulação:", err);
      }
    };
    fetchProfiles();
    return () => {
      active = false;
    };
  }, []);

  const loadSimulationProfile = (profile: SimulationProfile) => {
    setSimulationCompanyInfo({
      name: profile.companyName,
      period: profile.period
    });
    const resetFiles = profile.files.map(f => ({ ...f, processedByBackend: false }));
    setSimulationFiles(resetFiles);
    setSimulationProfileId(profile.id);
  };

  // Simulation Analyzer Pipeline
  useEffect(() => {
    let active = true;
    
    const needsBackendAnalysis = simulationFiles.some(f => !f.processedByBackend);
    if (!needsBackendAnalysis && simulationFiles.length > 0) {
      return;
    }
    
    const analyze = async () => {
      if (simulationFiles.length === 0) {
        if (active) {
          setSimulationResults(EMPTY_RESULTS);
          setSimulationAlerts(EMPTY_ALERTS);
        }
        return;
      }
      
      if (active) {
        setIsAnalyzingSimulation(true);
      }
      
      try {
        const formData = new FormData();
        const configs = simulationFiles.map(f => ({
          id: f.id,
          name: f.name,
          type: f.isTypeManuallySelected ? f.type : undefined
        }));
        formData.append("file_configs", JSON.stringify(configs));
        formData.append("payroll_base", payrollCalculationBase);
        
        simulationFiles.forEach(f => {
          let fileToUpload: File;
          if (f.fileObject) {
            fileToUpload = f.fileObject;
          } else {
            fileToUpload = new File([f.content], f.name, { type: "text/plain" });
          }
          formData.append("files", fileToUpload, f.name);
        });
        
        const response = await fetch("/api/analyze", {
          method: "POST",
          body: formData
        });
        
        if (!response.ok) {
          throw new Error("Erro na resposta da API local");
        }
        
        const data = await response.json();
        
        if (active) {
          setBackendStatus("connected");
          setSimulationResults(data.results);
          setSimulationAlerts(data.alerts);
          
          let hasChanges = false;
          const updatedFiles = simulationFiles.map(f => {
            const matches = data.files.filter((pf: any) => 
              pf.id === f.id || 
              pf.name === f.name || 
              (pf.name && f.name && pf.name.toLowerCase().includes(f.name.toLowerCase()))
            );
            
            if (matches.length > 0) {
              let totalRowCount = 0;
              let totalDetected = 0;
              const aggBreakdown = { compras: 0, vendas: 0, servicos: 0, outras: 0, folha: 0 };
              let matchedContent = "";
              let detectedType = f.type;
              const isManual = f.isTypeManuallySelected;
              
              matches.forEach((pf: any) => {
                totalRowCount += pf.rowCount ?? 0;
                totalDetected += pf.detectedTotal ?? 0;
                if (pf.content) {
                  matchedContent += (matchedContent ? "\n\n" : "") + pf.content;
                }
                if (pf.breakdown) {
                  aggBreakdown.compras += pf.breakdown.compras ?? 0;
                  aggBreakdown.vendas += pf.breakdown.vendas ?? 0;
                  aggBreakdown.servicos += pf.breakdown.servicos ?? 0;
                  aggBreakdown.outras += pf.breakdown.outras ?? 0;
                  aggBreakdown.folha += pf.breakdown.folha ?? 0;
                }
                if (pf.type && !isManual) {
                  detectedType = pf.type;
                }
              });

              const breakdownChanged = !areBreakdownsEqual(f.breakdown, aggBreakdown);
              const totalChanged = Math.abs((f.detectedTotal ?? 0) - totalDetected) > 0.01;
              const rowCountChanged = f.rowCount !== totalRowCount;
              const contentChanged = f.content !== matchedContent;
              const processedChanged = !f.processedByBackend;
              const typeChanged = f.type !== detectedType;
              
              if (rowCountChanged || totalChanged || breakdownChanged || contentChanged || processedChanged || typeChanged) {
                hasChanges = true;
                return {
                  ...f,
                  type: detectedType,
                  rowCount: totalRowCount,
                  detectedTotal: totalDetected,
                  content: matchedContent,
                  breakdown: aggBreakdown,
                  processedByBackend: true,
                  isTypeManuallySelected: f.isTypeManuallySelected
                };
              }
            } else {
              if (!f.processedByBackend) {
                hasChanges = true;
                return { ...f, processedByBackend: true };
              }
            }
            return f;
          });
          
          if (hasChanges) {
            setSimulationFiles(updatedFiles);
          }
        }
      } catch (err) {
        console.error("Erro na análise via Python:", err);
        if (active) {
          setBackendStatus("disconnected");
          const errorAlerts: AlertMessage[] = [
            {
              id: "backend-offline-error",
              type: "danger",
              message: "❌ Servidor Python Offline (Sem Conexão)",
              description: "O analisador de risco do Simples Nacional requer que o servidor Python esteja em execução. Por favor, verifique se o backend está rodando na porta 8000."
            }
          ];
          setSimulationResults(EMPTY_RESULTS);
          setSimulationAlerts(errorAlerts);
          
          // Mark all simulation files as processed to avoid infinite loop when offline
          const updated = simulationFiles.map(f => f.processedByBackend ? f : { ...f, processedByBackend: true });
          setSimulationFiles(updated);
        }
      } finally {
        if (active) {
          setIsAnalyzingSimulation(false);
        }
      }
    };
    
    analyze();
    return () => {
      active = false;
    };
  }, [simulationFiles]);

  // Import Analyzer Pipeline (Custom User Audit)
  useEffect(() => {
    let active = true;
    
    const needsBackendAnalysis = importFiles.some(f => !f.processedByBackend);
    if (!needsBackendAnalysis && importFiles.length > 0) {
      return;
    }
    
    const analyze = async () => {
      if (importFiles.length === 0) {
        if (active) {
          setImportResults(EMPTY_RESULTS);
          setImportAlerts(EMPTY_ALERTS);
        }
        return;
      }
      
      if (active) {
        setIsAnalyzingImport(true);
      }
      
      try {
        const formData = new FormData();
        const configs = importFiles.map(f => ({
          id: f.id,
          name: f.name,
          type: f.isTypeManuallySelected ? f.type : undefined
        }));
        formData.append("file_configs", JSON.stringify(configs));
        formData.append("payroll_base", payrollCalculationBase);
        
        importFiles.forEach(f => {
          let fileToUpload: File;
          if (f.fileObject) {
            fileToUpload = f.fileObject;
          } else {
            fileToUpload = new File([f.content], f.name, { type: "text/plain" });
          }
          formData.append("files", fileToUpload, f.name);
        });
        
        const response = await fetch("/api/analyze", {
          method: "POST",
          body: formData
        });
        
        if (!response.ok) {
          throw new Error("Erro na resposta da API local");
        }
        
        const data = await response.json();
        
        if (active) {
          setBackendStatus("connected");
          setImportResults(data.results);
          setImportAlerts(data.alerts);
          
          if (data.detectedCompanyName && (importCompanyInfo.name === "Nova Empresa S/A" || !importCompanyInfo.name.trim())) {
            setImportCompanyInfo(prev => ({ ...prev, name: data.detectedCompanyName }));
            setIsNameAutoCaptured(true);
          }
          
          let hasChanges = false;
          const updatedFiles = importFiles.map(f => {
            const matches = data.files.filter((pf: any) => 
              pf.id === f.id || 
              pf.name === f.name || 
              (pf.name && f.name && pf.name.toLowerCase().includes(f.name.toLowerCase()))
            );
            
            if (matches.length > 0) {
              let totalRowCount = 0;
              let totalDetected = 0;
              const aggBreakdown = { compras: 0, vendas: 0, servicos: 0, outras: 0, folha: 0 };
              let matchedContent = "";
              let detectedType = f.type;
              const isManual = f.isTypeManuallySelected;
              
              matches.forEach((pf: any) => {
                totalRowCount += pf.rowCount ?? 0;
                totalDetected += pf.detectedTotal ?? 0;
                if (pf.content) {
                  matchedContent += (matchedContent ? "\n\n" : "") + pf.content;
                }
                if (pf.breakdown) {
                  aggBreakdown.compras += pf.breakdown.compras ?? 0;
                  aggBreakdown.vendas += pf.breakdown.vendas ?? 0;
                  aggBreakdown.servicos += pf.breakdown.servicos ?? 0;
                  aggBreakdown.outras += pf.breakdown.outras ?? 0;
                  aggBreakdown.folha += pf.breakdown.folha ?? 0;
                }
                if (pf.type && !isManual) {
                  detectedType = pf.type;
                }
              });

              const breakdownChanged = !areBreakdownsEqual(f.breakdown, aggBreakdown);
              const totalChanged = Math.abs((f.detectedTotal ?? 0) - totalDetected) > 0.01;
              const rowCountChanged = f.rowCount !== totalRowCount;
              const contentChanged = f.content !== matchedContent;
              const processedChanged = !f.processedByBackend;
              const typeChanged = f.type !== detectedType;
              
              if (rowCountChanged || totalChanged || breakdownChanged || contentChanged || processedChanged || typeChanged) {
                hasChanges = true;
                return {
                  ...f,
                  type: detectedType,
                  rowCount: totalRowCount,
                  detectedTotal: totalDetected,
                  content: matchedContent,
                  breakdown: aggBreakdown,
                  processedByBackend: true,
                  isTypeManuallySelected: f.isTypeManuallySelected
                };
              }
            } else {
              if (!f.processedByBackend) {
                hasChanges = true;
                return { ...f, processedByBackend: true };
              }
            }
            return f;
          });
          
          if (hasChanges) {
            setImportFiles(updatedFiles);
          }
        }
      } catch (err) {
        console.error("Erro na análise via Python:", err);
        if (active) {
          setBackendStatus("disconnected");
          const errorAlerts: AlertMessage[] = [
            {
              id: "backend-offline-error",
              type: "danger",
              message: "❌ Servidor Python Offline (Sem Conexão)",
              description: "O analisador de risco do Simples Nacional requer que o servidor Python esteja em execução. Por favor, verifique se o backend está rodando na porta 8000."
            }
          ];
          setImportResults(EMPTY_RESULTS);
          setImportAlerts(errorAlerts);
          
          // Mark all import files as processed to avoid infinite loop when offline
          const updated = importFiles.map(f => f.processedByBackend ? f : { ...f, processedByBackend: true });
          setImportFiles(updated);
        }
      } finally {
        if (active) {
          setIsAnalyzingImport(false);
        }
      }
    };
    
    analyze();
    return () => {
      active = false;
    };
  }, [importFiles]);

  // Custom Import Callbacks
  const handleImportFilesChange = (updatedFiles: FileItem[]) => {
    setImportFiles(updatedFiles);
  };

  const handleClearAllImport = () => {
    setImportFiles([]);
    setImportCompanyInfo(prev => ({ ...prev, name: "Nova Empresa S/A" }));
    setIsNameAutoCaptured(false);
  };

  const handleRestoreAudit = (restoredFiles: FileItem[], restoredCompany: CompanyInfo) => {
    const resetFiles = restoredFiles.map(f => ({ ...f, processedByBackend: false }));
    setImportFiles(resetFiles);
    setImportCompanyInfo(restoredCompany);
  };

  // Load manual values from backend on company/period change
  useEffect(() => {
    let active = true;
    if (activeTab !== "import") return;

    const fetchManualValues = async () => {
      try {
        const company = importCompanyInfo.name;
        const period = importCompanyInfo.period;
        const res = await fetch(`/api/manual-values?company=${encodeURIComponent(company)}&period=${encodeURIComponent(period)}`);
        if (res.ok && active) {
          const data = await res.json();
          if (data.manualValues && data.manualValues.is_manual) {
            setCurrentManualValues(data.manualValues);
            setManualResults(data.results);
            setManualAlerts(data.alerts);
          } else {
            setCurrentManualValues(null);
            setManualResults(null);
            setManualAlerts(null);
          }
        }
      } catch (err) {
        console.error("Erro ao carregar valores manuais:", err);
      }
    };

    fetchManualValues();
    return () => {
      active = false;
    };
  }, [importCompanyInfo.name, importCompanyInfo.period, activeTab]);

  const handleSaveManualValues = async (values: ManualValues) => {
    setIsSavingManual(true);
    try {
      const response = await fetch("/api/manual-values", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      if (response.ok) {
        const data = await response.json();
        setCurrentManualValues(data.manualValues);
        setManualResults(data.results);
        setManualAlerts(data.alerts);
      } else {
        console.error("Erro ao salvar valores manuais");
      }
    } catch (err) {
      console.error("Erro ao salvar valores manuais:", err);
    } finally {
      setIsSavingManual(false);
    }
  };

  const handleResetManualValues = async () => {
    setIsSavingManual(true);
    try {
      const company = importCompanyInfo.name;
      const period = importCompanyInfo.period;
      const response = await fetch(`/api/manual-values?company=${encodeURIComponent(company)}&period=${encodeURIComponent(period)}`, {
        method: "DELETE"
      });
      if (response.ok) {
        setCurrentManualValues(null);
        setManualResults(null);
        setManualAlerts(null);
      } else {
        console.error("Erro ao limpar valores manuais");
      }
    } catch (err) {
      console.error("Erro ao limpar valores manuais:", err);
    } finally {
      setIsSavingManual(false);
    }
  };

  // Resolve current active data based on selected tab
  const activeCompanyInfo = activeTab === "simulations" ? simulationCompanyInfo : importCompanyInfo;
  const activeResults = activeTab === "simulations" 
    ? simulationResults 
    : (currentManualValues?.is_manual && manualResults ? manualResults : importResults);
  const activeFiles = activeTab === "simulations" ? simulationFiles : importFiles;
  const activeAlerts = activeTab === "simulations" 
    ? simulationAlerts 
    : (currentManualValues?.is_manual && manualAlerts ? manualAlerts : importAlerts);
  const activeIsAnalyzing = activeTab === "simulations" ? isAnalyzingSimulation : (isAnalyzingImport || isSavingManual);

  // Dynamic alert filtering based on enabled scenarios
  const filteredSimulationAlerts = simulationAlerts.filter(alert => {
    if (!analyzeScenario1) {
      if (alert.id === "missing-compras" || alert.id === "inciso-x-triggered") return false;
    }
    if (!analyzeScenario2) {
      if (alert.id === "missing-folha" || alert.id === "inciso-ix-triggered") return false;
    }
    return true;
  });

  const filteredImportAlerts = (currentManualValues?.is_manual && manualAlerts ? manualAlerts : importAlerts).filter(alert => {
    if (!analyzeScenario1) {
      if (alert.id === "missing-compras" || alert.id === "inciso-x-triggered") return false;
    }
    if (!analyzeScenario2) {
      if (alert.id === "missing-folha" || alert.id === "inciso-ix-triggered") return false;
    }
    return true;
  });

  const filteredActiveAlerts = activeTab === "simulations" ? filteredSimulationAlerts : filteredImportAlerts;

  const getOverallVerdictText = () => {
    if (!analyzeScenario1 && !analyzeScenario2) return "Inativo";
    
    const checkX = analyzeScenario1 && activeResults.statusX === "Risco";
    const checkIX = analyzeScenario2 && activeResults.statusIX === "Risco";
    
    return checkX || checkIX ? "🔴 EM RISCO" : "🟢 REGULAR";
  };

  const canExport = activeFiles.length > 0 || !!(activeTab === "import" && currentManualValues?.is_manual);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      
      {/* HIGH DENSITY PROFESSIONAL FISCAL HEADER */}
      <header className="bg-slate-900 text-white border-b border-slate-950 no-print px-4 py-4 sm:px-6 shrink-0 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg shadow-sm">
              <Scale className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold bg-blue-600/30 text-blue-300 px-1.5 py-0.5 rounded-sm uppercase tracking-wider font-mono border border-blue-500/20">
                  Art. 29 LC 123/2006
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Deusdedit Contabilidade</span>
              </div>
              <h1 className="text-lg font-bold tracking-tight text-white leading-tight">
                Analisador de Risco - Simples Nacional
              </h1>
            </div>
          </div>

          {/* Quick Header Widgets */}
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
            <div className={`border px-3 py-1.5 rounded-md flex items-center gap-2 transition-all ${
              backendStatus === "connected"
                ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
                : backendStatus === "connecting"
                ? "bg-amber-950/40 border-amber-500/30 text-amber-300"
                : "bg-red-950/40 border-red-500/30 text-red-300"
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                backendStatus === "connected"
                  ? "bg-emerald-400 animate-pulse"
                  : backendStatus === "connecting"
                  ? "bg-amber-400 animate-pulse"
                  : "bg-red-400 animate-pulse"
              }`} />
              <span>
                {backendStatus === "connected"
                  ? "Python Core: Ativo"
                  : backendStatus === "connecting"
                  ? "Conectando Core..."
                  : "Modo Fallback: Offline"}
              </span>
            </div>
            <div className="bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-md flex items-center gap-2 text-slate-300">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span>Exercício 2026</span>
            </div>
          </div>

        </div>
      </header>

      {/* PREMIUM GLASSMORPHISM NAVIGATION TABS BAR */}
      <div className="bg-white border-b border-slate-200 no-print sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab("simulations")}
              className={`py-4 px-2 border-b-2 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === "simulations"
                  ? "border-blue-600 text-blue-600 font-extrabold"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              }`}
            >
              <Sparkles className={`w-4 h-4 transition-transform group-hover:scale-110 ${activeTab === "simulations" ? "text-blue-600" : "text-slate-400"}`} />
              <span>Simulações Rápidas</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold font-mono ml-1 ${
                activeTab === "simulations" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"
              }`}>
                Amostras
              </span>
            </button>
            
            <button
              onClick={() => setActiveTab("import")}
              className={`py-4 px-2 border-b-2 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === "import"
                  ? "border-blue-600 text-blue-600 font-extrabold"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              }`}
            >
              <FileSpreadsheet className={`w-4 h-4 transition-transform group-hover:scale-110 ${activeTab === "import" ? "text-blue-600" : "text-slate-400"}`} />
              <span>Auditar Nova Empresa</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold font-mono ml-1 ${
                activeTab === "import" ? "bg-emerald-100 text-emerald-800 font-bold" : "bg-slate-100 text-slate-600"
              }`}>
                Upload Real
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* CORE HIGH DENSITY DUAL-COLUMN WORKSPACE */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 grid grid-cols-1 grid-cols-12 gap-6 no-print">
        
        {/* === TAB 1: SIMULATIONS WORKSPACE === */}
        {activeTab === "simulations" && (
          <>
            {/* SIDEBAR: PRESET SELECTORS & READ-ONLY CARD */}
            <aside className="lg:col-span-4 space-y-6 flex flex-col col-span-12 lg:col-span-4">
              
              {/* SANDBOX EXPLANATION PANEL */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
                <div className="flex items-center gap-2">
                  <Compass className="w-5 h-5 text-blue-600" />
                  <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                    Explorar Casos Fiscais
                  </h3>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Selecione um cenário pré-configurado abaixo para testar instantaneamente a integridade das regras da Receita Federal (Art. 29 da LC 123/2006).
                </p>
                
                <div className="space-y-2 mt-2">
                  {simulationProfiles.length === 0 ? (
                    <div className="text-center py-4 text-xs font-mono text-slate-400">
                      Carregando perfis de simulação...
                    </div>
                  ) : (
                    simulationProfiles.map((profile) => (
                      <button
                        key={profile.id}
                        onClick={() => loadSimulationProfile(profile)}
                        type="button"
                        className={`w-full p-3 text-left rounded-xl border transition-all flex flex-col justify-between group relative overflow-hidden cursor-pointer ${
                          simulationProfileId === profile.id
                            ? "bg-blue-50/40 border-blue-500 ring-1 ring-blue-500 shadow-xs"
                            : "bg-slate-50 hover:bg-slate-100/50 border-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${profile.badgeColor}`}>
                            {profile.badge}
                          </span>
                          <span className="text-[9px] text-slate-400 font-mono">
                            Caso {simulationProfiles.indexOf(profile) + 1}
                          </span>
                        </div>
                        <span className="font-bold text-xs text-slate-800 block mt-0.5 leading-snug group-hover:text-blue-600 transition-colors">
                          {profile.title.replace(/^Caso \d+:\s*/, "")}
                        </span>
                        <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed line-clamp-2">
                          {profile.description}
                        </p>
                        <span className="text-[9px] text-slate-400 font-mono truncate block w-full mt-2 border-t border-slate-200/60 pt-1.5">
                          🏢 {profile.companyName}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* READ-ONLY CARD */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h3 className="font-bold text-xs text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-500" />
                    Ficha do Contribuinte
                  </h3>
                  <div className="flex items-center gap-1 bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[9px] font-mono border border-slate-200">
                    <Lock className="w-2.5 h-2.5 text-slate-400" />
                    <span>Demonstração</span>
                  </div>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-slate-400 mb-0.5">Razão Social</span>
                    <p className="font-mono font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded px-2.5 py-2 truncate">
                      {simulationCompanyInfo.name}
                    </p>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-slate-400 mb-0.5">Período de Referência</span>
                    <p className="font-mono font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded px-2.5 py-2">
                      {simulationCompanyInfo.period}
                    </p>
                  </div>
                </div>
              </div>

            </aside>

            {/* MAIN DASHBOARD CONTENT AREA */}
            <main className="lg:col-span-8 space-y-6 col-span-12 lg:col-span-8">
              
              {/* ACTIVE VERDICT BANNER */}
              <div className="bg-slate-900 text-white rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg border border-slate-800 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                    {isAnalyzingSimulation ? (
                      <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
                    ) : (
                      <Sparkles className="w-5 h-5 text-blue-400 animate-pulse" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      Auditoria de Simulação Ativa
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono">
                      Análise estática do perfil selecionado • Regras Fiscais Consolidadas
                    </p>
                  </div>
                </div>
                
                <button
                  type="button"
                  onClick={() => setIsPrintModalOpen(true)}
                  disabled={!canExport}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider shadow-md bg-blue-600 hover:bg-blue-500 text-white cursor-pointer hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Printer className="w-4 h-4 text-white" />
                  Exportar Relatório PDF
                </button>
              </div>

              {/* SCENARIO SELECTOR CONTROL PANEL */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Scale className="w-4 h-4 text-blue-600" />
                    Escopo da Auditoria Fiscal (Art. 29)
                  </h3>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Selecione quais cenários e limites da LC 123/2006 deseja cruzar e analisar para este contribuinte.
                  </p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 border border-slate-200 rounded-lg p-1.5 px-3 bg-slate-50 text-slate-700 shadow-2xs hover:bg-slate-100/55 transition-all">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                      Base da Folha:
                    </span>
                    <select
                      value={payrollCalculationBase}
                      onChange={(e) => handlePayrollBaseChange(e.target.value as any)}
                      className="text-xs font-bold text-slate-700 bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer p-0 pr-1"
                    >
                      <option value="custo_func">Custo Func (Recomendado)</option>
                      <option value="sal_hrs_faltas">Sal - Hrs Faltas</option>
                      <option value="sal_base">Sal. Base</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (analyzeScenario1 && !analyzeScenario2) return;
                      setAnalyzeScenario1(!analyzeScenario1);
                    }}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border flex items-center gap-2 transition-all cursor-pointer ${
                      analyzeScenario1
                        ? "bg-blue-50 border-blue-200 text-blue-700 shadow-2xs font-bold"
                        : "bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100/55"
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border ${
                      analyzeScenario1 ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white"
                    }`}>
                      {analyzeScenario1 && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                    </div>
                    <span>Cenário 1: Compras (Inciso X - 80%)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (analyzeScenario2 && !analyzeScenario1) return;
                      setAnalyzeScenario2(!analyzeScenario2);
                    }}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border flex items-center gap-2 transition-all cursor-pointer ${
                      analyzeScenario2
                        ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-2xs font-bold"
                        : "bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100/55"
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border ${
                      analyzeScenario2 ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white"
                    }`}>
                      {analyzeScenario2 && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                    </div>
                    <span>Cenário 2: Despesas (Inciso IX - 120%)</span>
                  </button>
                </div>
              </div>

              {/* SUMMARY STATISTICS CARDS */}
              <DashboardCards results={simulationResults} />

              {/* CRITERION INDIVIDUAL PROGRESS GAUGE */}
              <RiskAnalysisCards 
                results={simulationResults} 
                analyzeScenario1={analyzeScenario1} 
                analyzeScenario2={analyzeScenario2} 
              />

              {/* ALERTS SECTION */}
              <AlertManager alerts={filteredSimulationAlerts} />

              {/* BRIEF ACCREDITATION LEGAL EXPLANATION */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-2 text-slate-600">
                <h4 className="font-bold text-xs text-slate-800 uppercase tracking-widest flex items-center gap-1.5 font-mono">
                  <Scale className="w-4 h-4 text-blue-800" />
                  Base Reguladora (LC 123/2006 - Art. 29)
                </h4>
                <p className="text-[11px] leading-relaxed">
                  O Simples Nacional prevê que as empresas devem manter perfeita correspondência entre ingressos registrados e dispêndios fiscais. Compras acima de 80% (Inciso X) denotam estoque gerador não declarado, e despesas superiores a 120% (Inciso IX) presumem capital externo omitido do caixa oficial do contribuinte.
                </p>
              </div>

            </main>
          </>
        )}

        {/* === TAB 2: USER CUSTOM IMPORT WORKSPACE === */}
        {activeTab === "import" && (
          <>
            {/* SIDEBAR: INPUT CONTROLS, EDITABLE IDENTITY, FILE MANAGEMENT */}
            <aside className="lg:col-span-4 space-y-6 flex flex-col col-span-12 lg:col-span-4">
              
              {/* EDITABLE IDENTIDADE FISCAL */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                <h3 className="font-bold text-xs text-slate-700 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-100 pb-2 mb-3">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  1. Identificação Fiscal
                </h3>

                <div className="space-y-3">
                  <div>
                    <label htmlFor="import-company-name" className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                      Razão Social da Empresa
                    </label>
                    <div className="relative">
                      <Building2 className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        id="import-company-name"
                        type="text"
                        value={importCompanyInfo.name}
                        onChange={(e) => {
                          setImportCompanyInfo({ ...importCompanyInfo, name: e.target.value });
                          setIsNameAutoCaptured(false);
                        }}
                        placeholder="Nome da Empresa"
                        className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-md pl-8 pr-2.5 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all font-mono"
                      />
                    </div>
                    {isNameAutoCaptured && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5 w-fit font-mono shadow-xs animate-pulse">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Nome capturado automaticamente!</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label htmlFor="import-period" className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                      Período Analisado (Livros)
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        id="import-period"
                        type="text"
                        value={importCompanyInfo.period}
                        onChange={(e) => setImportCompanyInfo({ ...importCompanyInfo, period: e.target.value })}
                        placeholder="Ex: 1º Trimestre/2026"
                        className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-md pl-8 pr-2.5 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* REPORT DROPZONE COMPONENT */}
              <ReportDropzone
                files={importFiles}
                onFilesChange={handleImportFilesChange}
                onClearAll={handleClearAllImport}
              />

              {/* COMPONENTE DE AJUSTES E VALORES MANUAIS */}
              <ManualValuesEditor
                companyName={importCompanyInfo.name}
                period={importCompanyInfo.period}
                importedFiles={importFiles}
                currentManualValues={currentManualValues}
                onSave={handleSaveManualValues}
                onReset={handleResetManualValues}
                isAnalyzing={isSavingManual}
              />

              {/* HISTÓRICO DE AUDITORIAS E COMPARAÇÃO */}
              <AuditHistorySection
                currentFiles={importFiles}
                currentCompany={importCompanyInfo}
                currentResults={activeResults}
                onRestoreAudit={handleRestoreAudit}
              />

            </aside>

            {/* MAIN DASHBOARD CONTENT AREA */}
            <main className="lg:col-span-8 space-y-6 col-span-12 lg:col-span-8">
              
              {importFiles.length === 0 && !currentManualValues?.is_manual ? (
                /* GORGEOUS ONBOARDING/EMPTY STATE */
                <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-xs text-center space-y-6 flex flex-col items-center justify-center min-h-[500px]">
                  <div className="w-16 h-16 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-inner">
                    <UploadCloud className="w-8 h-8 animate-bounce" />
                  </div>
                  
                  <div className="max-w-md space-y-2">
                    <h3 className="text-lg font-bold text-slate-800">
                      Pronto para Auditar Nova Empresa?
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Preencha os dados do contribuinte no painel lateral e faça a importação de seus livros fiscais (.CSV, .TXT, .XLSX ou .PDF) para cruzar os dados com os critérios de exclusão do Simples Nacional.
                    </p>
                  </div>

                  {/* Step-by-Step interactive guide cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl w-full pt-4">
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-left space-y-1.5 hover:shadow-xs transition-all">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold font-mono">
                          1
                        </span>
                        <h4 className="font-bold text-xs text-slate-700">Identificação</h4>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        Defina a Razão Social e o período de análise da empresa para emissão do laudo técnico.
                      </p>
                    </div>

                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-left space-y-1.5 hover:shadow-xs transition-all">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold font-mono">
                          2
                        </span>
                        <h4 className="font-bold text-xs text-slate-700">Importação</h4>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        Anexe relatórios de Vendas, Compras, Serviços, Folha de Pagamento ou Despesas de caixa.
                      </p>
                    </div>

                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-left space-y-1.5 hover:shadow-xs transition-all">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold font-mono">
                          3
                        </span>
                        <h4 className="font-bold text-xs text-slate-700">Veredito</h4>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        Consulte desvios automáticos sob as regras do Art. 29 da LC 123/2006 e gere o PDF assinado.
                      </p>
                    </div>
                  </div>

                  {/* Regulatory Info Banner */}
                  <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 text-left max-w-2xl w-full flex gap-3 items-start">
                    <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h5 className="font-bold text-xs text-slate-800">Processamento Seguro & Offline</h5>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        Todos os seus livros fiscais e arquivos importados são processados localmente e nunca são enviados para servidores externos. Privacidade em conformidade com as diretrizes do CRC.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                /* COMPLETE ACTIVE AUDIT SYSTEM */
                <div className="space-y-6">
                  {/* HEADER AUDIT ACTION STATUS */}
                  <div className="bg-slate-900 text-white rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg border border-slate-800 shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                        {isAnalyzingImport ? (
                          <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
                        ) : (
                          <FileCheck className="w-5 h-5 text-blue-400 animate-pulse" />
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white uppercase tracking-wider">
                          Auditor Clínico Ativo
                        </p>
                        <p className="text-[11px] text-slate-400 font-mono">
                          {isAnalyzingImport 
                            ? "Analisando com algoritmos Python/Pandas..." 
                            : currentManualValues?.is_manual 
                            ? "Ajustes manuais ativos (persistidos no backend)" 
                            : `Análise consolidada para ${importFiles.length} livro(s) fiscal(is) anexado(s)`}
                        </p>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => setIsPrintModalOpen(true)}
                      disabled={!canExport}
                      className="w-full sm:w-auto px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider shadow-md bg-blue-600 hover:bg-blue-500 text-white cursor-pointer hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Printer className="w-4 h-4 text-white" />
                      Exportar Relatório PDF
                    </button>
                  </div>

                  {/* SCENARIO SELECTOR CONTROL PANEL */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <Scale className="w-4 h-4 text-blue-600" />
                        Escopo da Auditoria Fiscal (Art. 29)
                      </h3>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Selecione quais cenários e limites da LC 123/2006 deseja cruzar e analisar para este contribuinte.
                      </p>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 border border-slate-200 rounded-lg p-1.5 px-3 bg-slate-50 text-slate-700 shadow-2xs hover:bg-slate-100/55 transition-all">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                          Base da Folha:
                        </span>
                        <select
                          value={payrollCalculationBase}
                          onChange={(e) => handlePayrollBaseChange(e.target.value as any)}
                          className="text-xs font-bold text-slate-700 bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer p-0 pr-1"
                        >
                          <option value="custo_func">Custo Func (Recomendado)</option>
                          <option value="sal_hrs_faltas">Sal - Hrs Faltas</option>
                          <option value="sal_base">Sal. Base</option>
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (analyzeScenario1 && !analyzeScenario2) return;
                          setAnalyzeScenario1(!analyzeScenario1);
                        }}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold border flex items-center gap-2 transition-all cursor-pointer ${
                          analyzeScenario1
                            ? "bg-blue-50 border-blue-200 text-blue-700 shadow-2xs font-bold"
                            : "bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100/55"
                        }`}
                      >
                        <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border ${
                          analyzeScenario1 ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white"
                        }`}>
                          {analyzeScenario1 && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                        </div>
                        <span>Cenário 1: Compras (Inciso X - 80%)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (analyzeScenario2 && !analyzeScenario1) return;
                          setAnalyzeScenario2(!analyzeScenario2);
                        }}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold border flex items-center gap-2 transition-all cursor-pointer ${
                          analyzeScenario2
                            ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-2xs font-bold"
                            : "bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100/55"
                        }`}
                      >
                        <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border ${
                          analyzeScenario2 ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white"
                        }`}>
                          {analyzeScenario2 && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                        </div>
                        <span>Cenário 2: Despesas (Inciso IX - 120%)</span>
                      </button>
                    </div>
                  </div>

                  {/* SUMMARY STATISTICS CARDS */}
                  <DashboardCards results={activeResults} />

                  {/* CRITERION INDIVIDUAL PROGRESS GAUGE */}
                  <RiskAnalysisCards 
                    results={activeResults} 
                    analyzeScenario1={analyzeScenario1} 
                    analyzeScenario2={analyzeScenario2} 
                  />

                  {/* ALERTS SECTION */}
                  <AlertManager alerts={filteredImportAlerts} />

                  {/* BRIEF ACCREDITATION LEGAL EXPLANATION */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-2 text-slate-600">
                    <h4 className="font-bold text-xs text-slate-800 uppercase tracking-widest flex items-center gap-1.5 font-mono">
                      <Scale className="w-4 h-4 text-blue-800" />
                      Base Reguladora (LC 123/2006 - Art. 29)
                    </h4>
                    <p className="text-[11px] leading-relaxed">
                      O Simples Nacional prevê que as empresas devem manter perfeita correspondência entre ingressos registrados e dispêndios fiscais. Compras acima de 80% (Inciso X) denotam estoque gerador não declarado, e despesas superiores a 120% (Inciso IX) presumem capital externo omitido do caixa oficial do contribuinte.
                    </p>
                  </div>
                </div>
              )}

            </main>
          </>
        )}

      </div>

      {/* FOOTER SYSTEM STATUS DISPLAY */}
      <footer className="h-9 bg-slate-100 border-t border-slate-200 px-6 flex items-center justify-between text-[10px] text-slate-500 mt-auto no-print font-mono shrink-0">
        <div className="flex gap-4">
          <span>Status: <span className={`${backendStatus === "connected" ? "text-emerald-600" : "text-amber-600"} font-bold uppercase`}>{backendStatus === "connected" ? "Auditoria Python (Offline Privado)" : "Modo Fallback (Offline local)"}</span></span>
          <span>Veredito de Caixa: <span className="font-semibold">{getOverallVerdictText()}</span></span>
        </div>
        <div className="italic text-slate-400 hidden sm:block">
          Simples Nacional Risk Analyzer v2.4.0 — Compliance Tributário S/A
        </div>
      </footer>

      {/* PRINT PREVIEW DIALOG MODAL */}
      <PrintReport
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        companyInfo={activeCompanyInfo}
        results={activeResults}
        files={activeFiles}
        alerts={filteredActiveAlerts}
        analyzeScenario1={analyzeScenario1}
        analyzeScenario2={analyzeScenario2}
      />

    </div>
  );
}

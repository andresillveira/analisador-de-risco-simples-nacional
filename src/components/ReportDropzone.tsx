/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { Upload, FileText, Trash2, Check, AlertCircle, PlusCircle } from "lucide-react";
import { FileItem, ReportType, ReportTypeInfo } from "../types";

interface ReportDropzoneProps {
  files: FileItem[];
  onFilesChange: (files: FileItem[]) => void;
  onClearAll: () => void;
}

export default function ReportDropzone({ files, onFilesChange, onClearAll }: ReportDropzoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [activeTab, setActiveTab] = useState<"upload" | "manual">("upload");
  
  // States for manual creation
  const [manualFileName, setManualFileName] = useState("relatorio_customizado.csv");
  const [manualType, setManualType] = useState<ReportType>("Vendas");
  const [manualContent, setManualContent] = useState(
    `CFOP,Descrição,Valor\n5102,Operação Principal Registrada,R$ 10.000,00`
  );
  
  // Report types loaded from backend
  const [reportTypes, setReportTypes] = useState<Record<string, ReportTypeInfo>>({});
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load report types from backend
  useEffect(() => {
    const loadReportTypes = async () => {
      try {
        const res = await fetch("/api/report-types");
        if (res.ok) {
          const data = await res.json();
          setReportTypes(data);
        }
      } catch (err) {
        // Fallback: use known type names without metadata
        console.warn("Could not load report types from backend", err);
      }
    };
    loadReportTypes();
  }, []);

  // Available report type keys (fallback to static list if backend not loaded yet)
  const reportTypeKeys: ReportType[] = Object.keys(reportTypes).length > 0
    ? (Object.keys(reportTypes) as ReportType[])
    : ["Vendas", "Serviços", "Compras", "Folha de Pagamento", "Outras Despesas"];

  /**
   * handleFiles: 
   * Files are NOT parsed on the client. We create FileItem stubs with minimal info
   * and mark them as processedByBackend: false. The App.tsx useEffect will send them
   * to POST /api/analyze where all parsing/classification happens.
   */
  const handleFiles = (uploadedFiles: FileList) => {
    const newFiles: FileItem[] = [...files];
    let filesProcessed = 0;
    const totalFiles = uploadedFiles.length;
    
    Array.from(uploadedFiles).forEach(file => {
      const fileNameLower = file.name.toLowerCase();
      const isBinary = fileNameLower.endsWith(".xlsx") || fileNameLower.endsWith(".pdf");
      
      if (isBinary) {
        // Binary files — send directly to backend with no pre-processing
        const fileId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        newFiles.push({
          id: fileId,
          name: file.name,
          size: file.size,
          type: "Vendas", // Placeholder — backend will auto-detect the real type
          content: `Arquivo binário (${file.name}). Aguardando processamento pelo servidor.`,
          rowCount: 0,
          detectedTotal: 0,
          fileObject: file,
          processedByBackend: false
        });
        
        filesProcessed++;
        if (filesProcessed === totalFiles) {
          onFilesChange([...newFiles]);
        }
      } else {
        // Text files — read content for display but do NOT parse/analyze
        const reader = new FileReader();
        reader.onload = (e) => {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const utf8Decoder = new TextDecoder("utf-8");
          let text = utf8Decoder.decode(arrayBuffer);
          
          // Encoding fallback for corrupted chars
          if (text.includes("\uFFFD")) {
            try {
              const ansiDecoder = new TextDecoder("windows-1252");
              text = ansiDecoder.decode(arrayBuffer);
            } catch (err) {
              console.warn("Failed to decode using Windows-1252", err);
            }
          }
          
          const fileId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          
          newFiles.push({
            id: fileId,
            name: file.name,
            size: file.size,
            type: "Vendas", // Placeholder — backend will auto-detect the real type
            content: text,
            rowCount: 0,
            detectedTotal: 0,
            fileObject: file,
            processedByBackend: false
          });
          
          filesProcessed++;
          if (filesProcessed === totalFiles) {
            onFilesChange([...newFiles]);
          }
        };
        
        reader.readAsArrayBuffer(file);
      }
    });
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const removeFile = (id: string) => {
    const filtered = files.filter(f => f.id !== id);
    onFilesChange(filtered);
  };

  /**
   * changeFileType: When user changes category, mark file as needing re-analysis.
   * The backend will re-parse with the correct type on next analyze call.
   */
  const changeFileType = (id: string, newType: ReportType) => {
    const updated = files.map(f => {
      if (f.id === id) {
        return { 
          ...f, 
          type: newType,
          processedByBackend: false // Trigger re-analysis with new type
        };
      }
      return f;
    });
    onFilesChange(updated);
  };

  /**
   * handleCreateManual: Create a manual CSV file stub.
   * No parsing happens here — just create the FileItem and let the backend process it.
   */
  const handleCreateManual = () => {
    if (!manualFileName.trim()) return;
    const fileId = `manual-${Date.now()}`;
    const fileName = manualFileName.endsWith(".csv") ? manualFileName : `${manualFileName}.csv`;
    const manualFileObject = new File([manualContent], fileName, { type: "text/csv" });
    
    const newFile: FileItem = {
      id: fileId,
      name: fileName,
      size: manualContent.length * 2,
      type: manualType,
      content: manualContent,
      rowCount: 0,
      detectedTotal: 0,
      fileObject: manualFileObject,
      processedByBackend: false
    };
    
    onFilesChange([...files, newFile]);
    
    // Reset manual form fields
    setManualFileName(`relatorio_${Date.now().toString().slice(-4)}.csv`);
    setManualContent(`CFOP,Descrição,Valor\n5102,Serviço de Desenvolvimento,R$ 5.000,00\n5102,Consultoria de Custos,R$ 15.000,00`);
  };

  // Quick preset template lines for manual csv creation helper
  const setTemplateToManual = (type: ReportType) => {
    setManualType(type);
    if (type === "Vendas") {
      setManualFileName("vendas_producao.csv");
      setManualContent("CFOP,Descrição Operação,Valor Cobrado\n5102,Venda Mercadoria Industrializada,R$ 45000.00\n5102,Revenda de Produtos Farmaceuticos,R$ 22500.00\n5949,Remessa de Demonstração,R$ 4000.00");
    } else if (type === "Serviços") {
      setManualFileName("servicos_prestados_nf.csv");
      setManualContent("CFOP,Tipo de Serviço Prestado,Valor\n9000-01,Serviços de Contabilidade,R$ 12500,00\n9000-01,Auditoria Interna de Controle,R$ 18000,00\n9000-99,Nota Cancelada,R$ 1500,00");
    } else if (type === "Compras") {
      setManualFileName("compra_mercadorias_loja.csv");
      setManualContent("CFOP,Nota de Compra,Valor\n1102,Aço laminado para estoque,R$ 35000,00\n1104,Componentes eletronicos integrados,R$ 28000,00\n1551,Computador iMac Escritório,R$ 12000,00");
    } else if (type === "Folha de Pagamento") {
      setManualFileName("folha_detalhes_rh.csv");
      setManualContent("Rubrica,Item Contábil,Valor Caixa\n101,Pagamento Salários Equipe Comercial,R$ 18000.00\n201,Retirada Pró-Labore Diretores,R$ 8000.00\n104,Encargos Previdenciários Recolhidos,R$ 4200.00");
    } else {
      setManualFileName("despesas_administrativas.csv");
      setManualContent("Item,Despesa Registrada,Valor Pago\n1,Aluguel Loja e IPTU Corrente,R$ 4500,00\n2,Energia Elétrica Comercial,R$ 950,50\n3,Serviço de Logística e Motoboy,R$ 1200,00");
    }
  };

  return (
    <div id="upload-panel-section" className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <Upload className="w-4 h-4 text-blue-600" />
            2. Área de Upload de Relatórios Fiscais
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Anexe arquivos CSV ou adicione linhas manualmente para processar a contabilidade do Simples Nacional.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {files.length > 0 && (
            <button
              onClick={onClearAll}
              id="btn-clear-reports"
              className="px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100/80 rounded-md transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpar Tudo
            </button>
          )}
          <div className="bg-slate-100 p-0.5 rounded-lg flex">
            <button
              onClick={() => setActiveTab("upload")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === "upload" 
                  ? "bg-white text-blue-600 shadow-xs" 
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Arrastar e Soltar
            </button>
            <button
              onClick={() => setActiveTab("manual")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === "manual" 
                  ? "bg-white text-blue-600 shadow-xs" 
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Editor Manual
            </button>
          </div>
        </div>
      </div>

      <div className="p-5">
        {activeTab === "upload" ? (
          <div>
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                isDragActive 
                  ? "border-blue-500 bg-blue-50/50" 
                  : "border-slate-300 hover:border-slate-400 bg-slate-50/[0.2] hover:bg-slate-50/20"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                accept=".csv,.txt,.xlsx,.pdf"
                multiple
                className="hidden"
              />
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-xs">
                <Upload className="w-6 h-6 animate-pulse" />
              </div>
              <h4 className="font-medium text-slate-700 text-sm">
                Arraste e solte seus arquivos fiscais aqui
              </h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Suporta múltiplos relatórios em formato <b className="text-slate-600">.CSV</b>, <b className="text-slate-600">.TXT</b>, <b className="text-slate-600">.XLSX</b> ou <b className="text-slate-600">.PDF</b>. O sistema processa os dados de forma segura no servidor local.
              </p>
              <button
                type="button"
                className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm hover:shadow-md transition-all"
              >
                Selecionar Arquivos do Computador
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <h4 className="text-xs font-bold text-slate-700 mb-3 uppercase tracking-wider flex items-center gap-1.5">
              <PlusCircle className="w-3.5 h-3.5 text-blue-600" />
              Criar Relatório Customizado no Navegador (Simulador)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Nome do Arquivo
                  </label>
                  <input
                    type="text"
                    value={manualFileName}
                    onChange={(e) => setManualFileName(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-md p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    placeholder="vendas_teste.csv"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Tipo de Dados (Classificação Primária)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {reportTypeKeys.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setTemplateToManual(type)}
                        className={`px-2 py-1 text-[10px] font-medium rounded-md border transition-all ${
                          manualType === type
                            ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-blue-50 text-slate-700 p-3 rounded-lg border border-blue-100 text-[11px] space-y-1">
                  <span className="font-bold text-blue-800 block text-xs">Especificações Contábeis do Simples:</span>
                  <p className="text-slate-600">
                    O servidor extrai os números da última coluna.
                  </p>
                  <p className="text-slate-500 italic mt-1">
                    Fórmulas do Art. 29 filtram termos como &quot;Remessa&quot;, &quot;Devolução&quot;, &quot;Cancelado&quot;, e &quot;Imobilizado&quot; descartando esses valores da base elegível.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Conteúdo CSV (Valores do Livro Fiscal)
                  </label>
                  <textarea
                    rows={5}
                    value={manualContent}
                    onChange={(e) => setManualContent(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-md p-2.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    placeholder="CFOP,Descrição,Valor"
                  />
                </div>
                
                <button
                  type="button"
                  onClick={handleCreateManual}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-md shadow-xs transition-colors flex items-center justify-center gap-2"
                >
                  <Check className="w-3.5 h-3.5" />
                  Gerar e Anexar Relatório Fiscal
                </button>
              </div>
            </div>
          </div>
        )}

        {/* List of Files currently attached to the analysis */}
        {files.length > 0 ? (
          <div className="mt-5 pt-5 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Relatórios Computando na Análise ({files.length})
            </h4>
            <div className="space-y-3">
              {files.map((file) => {
                return (
                  <div
                    key={file.id}
                    className="p-3.5 bg-slate-50/50 hover:bg-slate-50 border border-slate-200 rounded-xl transition-all flex flex-col gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-10 h-10 bg-white rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 text-xs shrink-0">
                        <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-slate-700 text-xs font-mono break-all line-clamp-2">
                            {file.name}
                          </span>
                          <span className="text-[10px] text-slate-400 whitespace-nowrap">
                            ({Math.round(file.size / 100) / 10} KB)
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 font-mono">
                          Linhas: <span className="font-bold text-slate-700">{file.rowCount}</span> | Total:{" "}
                          <span className="font-bold text-emerald-600 bg-emerald-50/50 px-1 py-0.5 rounded whitespace-nowrap">
                            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(file.detectedTotal)}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-slate-200/60">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider whitespace-nowrap">
                          Cat:
                        </span>
                        <select
                          value={file.type}
                          onChange={(e) => changeFileType(file.id, e.target.value as ReportType)}
                          className="text-xs font-medium bg-white border border-slate-200 text-slate-700 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full max-w-[160px] truncate"
                        >
                          {reportTypeKeys.map((typeOpt) => (
                            <option key={typeOpt} value={typeOpt}>
                              {typeOpt}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={() => removeFile(file.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 bg-white hover:bg-red-50 border border-slate-200 rounded-lg hover:border-red-200 transition-colors shrink-0 cursor-pointer"
                        title="Delete file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-4 p-6 bg-slate-50/40 border-2 border-dashed border-slate-200 rounded-xl text-center">
            <AlertCircle className="w-6 h-6 text-slate-400 mx-auto mb-2" />
            <p className="text-xs text-slate-500 italic">
              Nenhum arquivo ativo para verificação fiscal. Utilize os templates de simulação abaixo no rodapé da página para carregar relatórios fiscais pré-prontos instantaneamente!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

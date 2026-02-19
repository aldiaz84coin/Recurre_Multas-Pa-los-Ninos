"use client";

import { useState } from "react";
import Link from "next/link";
import { Scale, ArrowLeft, Upload, Plus, X, Zap, FileText, Download, AlertCircle, CheckCircle, Clock } from "lucide-react";
import toast from "react-hot-toast";
import { useDropzone } from "react-dropzone";

interface UploadedFile {
  file: File;
  name: string;
  type: string;
  context?: string;
  preview?: string;
}

interface AgentResult {
  agentName: string;
  status: "pending" | "running" | "done" | "error";
  content: string;
  error?: string;
}

interface RecursoResult {
  mergedDoc: string;
  instructions: string;
  agentResults: AgentResult[];
}

export default function RecursosPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [multaFile, setMultaFile] = useState<UploadedFile | null>(null);
  const [supportFiles, setSupportFiles] = useState<UploadedFile[]>([]);
  const [additionalContext, setAdditionalContext] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [agentResults, setAgentResults] = useState<AgentResult[]>([]);
  const [result, setResult] = useState<RecursoResult | null>(null);

  // Dropzone for multa
  const { getRootProps: getMultaProps, getInputProps: getMultaInputProps, isDragActive: isMultaDrag } = useDropzone({
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxFiles: 1,
    onDrop: (files) => {
      if (files[0]) {
        const f = files[0];
        const reader = new FileReader();
        reader.onload = () => {
          setMultaFile({
            file: f,
            name: f.name,
            type: f.type,
            preview: f.type.startsWith('image/') ? reader.result as string : undefined,
          });
        };
        reader.readAsDataURL(f);
      }
    },
  });

  // Dropzone for support files
  const { getRootProps: getSupportProps, getInputProps: getSupportInputProps, isDragActive: isSupportDrag } = useDropzone({
    accept: { 'application/pdf': ['.pdf'], 'image/*': [], 'text/*': ['.txt'], 'application/msword': [], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
    onDrop: (files) => {
      const newFiles: UploadedFile[] = files.map(f => ({ file: f, name: f.name, type: f.type, context: "" }));
      setSupportFiles(prev => [...prev, ...newFiles]);
    },
  });

  const updateSupportContext = (idx: number, context: string) => {
    setSupportFiles(prev => prev.map((f, i) => i === idx ? { ...f, context } : f));
  };

  const removeSupportFile = (idx: number) => {
    setSupportFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleAnalyze = async () => {
    if (!multaFile) { toast.error("Sube el documento de la multa primero"); return; }

    const agentConfigs = JSON.parse(localStorage.getItem("recursapp_agents") || "[]");
    const activeAgents = agentConfigs.filter((a: { enabled: boolean; apiKey: string }) => a.enabled && a.apiKey);

    if (activeAgents.length === 0) {
      toast.error("Configura al menos un agente con API key en Ajustes");
      return;
    }

    setIsAnalyzing(true);
    setStep(3);

    // Initialize agent results
    const initialResults: AgentResult[] = agentConfigs
      .filter((a: { enabled: boolean }) => a.enabled)
      .map((a: { name: string; apiKey: string }) => ({
        agentName: a.name,
        status: a.apiKey ? "running" : "error",
        content: "",
        error: a.apiKey ? undefined : "Sin API key configurada",
      }));
    setAgentResults(initialResults);

    try {
      // Prepare files as base64
      const multaBase64 = await fileToBase64(multaFile.file);
      const supportFilesData = await Promise.all(
        supportFiles.map(async (sf) => ({
          name: sf.name,
          type: sf.type,
          context: sf.context || "",
          base64: await fileToBase64(sf.file),
        }))
      );

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          multaFile: { name: multaFile.name, type: multaFile.type, base64: multaBase64 },
          supportFiles: supportFilesData,
          additionalContext,
          agentConfigs,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Error al analizar");
      }

      const data = await response.json();
      setAgentResults(data.agentResults);
      setResult(data);
      setStep(4);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast.error("Error: " + msg);
      setIsAnalyzing(false);
      setStep(2);
      return;
    }

    setIsAnalyzing(false);
  };

  const handleDownload = async () => {
    if (!result) return;
    try {
      const response = await fetch("/api/generate-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: result.mergedDoc, instructions: result.instructions }),
      });
      if (!response.ok) throw new Error("Error generando documento");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `recurso-multa-${Date.now()}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Documento descargado");
    } catch {
      toast.error("Error al generar el documento Word");
    }
  };

  return (
    <main className="min-h-screen">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-6 border-b" style={{ borderColor: '#2a2a38' }}>
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity text-sm">
            <ArrowLeft className="w-4 h-4" />
            Inicio
          </Link>
          <div className="flex items-center gap-3">
            <Scale className="w-5 h-5" style={{ color: '#c9a84c' }} />
            <span className="font-display font-bold"
              style={{ background: 'linear-gradient(135deg, #e8cc7a, #c9a84c)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              RecursApp
            </span>
          </div>
        </div>
        <Link href="/settings" className="text-sm opacity-50 hover:opacity-100 transition-opacity"
          style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}>
          ⚙ Configurar agentes
        </Link>
      </nav>

      {/* Steps indicator */}
      <div className="flex items-center justify-center gap-0 px-8 py-8">
        {[
          { n: 1, label: "Multa" },
          { n: 2, label: "Documentos" },
          { n: 3, label: "Analizando" },
          { n: 4, label: "Recurso" },
        ].map(({ n, label }, i) => (
          <div key={n} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all"
                style={{
                  background: step >= n ? 'linear-gradient(135deg, #c9a84c, #9a7530)' : '#1a1a24',
                  color: step >= n ? '#0a0a0f' : '#44445a',
                  border: step >= n ? 'none' : '1px solid #2a2a38',
                  fontFamily: 'JetBrains Mono, monospace',
                  boxShadow: step === n ? '0 0 20px #c9a84c40' : 'none',
                }}>
                {step > n ? '✓' : n}
              </div>
              <span className="text-xs mt-1.5 transition-all"
                style={{ color: step >= n ? '#c9a84c' : '#44445a', fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', letterSpacing: '0.05em' }}>
                {label}
              </span>
            </div>
            {i < 3 && (
              <div className="w-16 h-px mx-2 mb-4 transition-all"
                style={{ background: step > n ? '#c9a84c60' : '#2a2a38' }} />
            )}
          </div>
        ))}
      </div>

      <div className="max-w-3xl mx-auto px-8 pb-20">

        {/* STEP 1: Upload multa */}
        {step === 1 && (
          <div className="animate-fade-up">
            <h1 className="font-display text-4xl mb-2">Sube tu multa</h1>
            <p className="opacity-60 mb-8">Acepta PDF o imagen (foto del documento).</p>

            <div
              {...getMultaProps()}
              className={`border-2 border-dashed rounded-sm p-12 text-center cursor-pointer transition-all ${isMultaDrag ? "dropzone-active" : ""}`}
              style={{ borderColor: multaFile ? '#c9a84c' : '#2a2a38', background: multaFile ? '#c9a84c08' : '#111118' }}>
              <input {...getMultaInputProps()} />

              {multaFile ? (
                <div className="flex flex-col items-center gap-4">
                  {multaFile.preview ? (
                    <img src={multaFile.preview} alt="multa" className="max-h-48 rounded object-contain" />
                  ) : (
                    <div className="w-16 h-16 rounded-full flex items-center justify-center"
                      style={{ background: '#c9a84c20' }}>
                      <FileText className="w-8 h-8" style={{ color: '#c9a84c' }} />
                    </div>
                  )}
                  <div>
                    <p className="font-semibold" style={{ color: '#e8cc7a' }}>{multaFile.name}</p>
                    <p className="text-sm opacity-50 mt-1">{multaFile.type}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setMultaFile(null); }}
                    className="flex items-center gap-1 text-sm opacity-50 hover:opacity-100 transition-opacity">
                    <X className="w-3 h-3" /> Eliminar
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{ background: '#1a1a24', border: '1px solid #2a2a38' }}>
                    <Upload className="w-7 h-7" style={{ color: '#666688' }} />
                  </div>
                  <div>
                    <p className="font-display text-xl mb-1">Arrastra aquí tu multa</p>
                    <p className="opacity-50 text-sm">o haz clic para seleccionar · PDF o imagen</p>
                  </div>
                </div>
              )}
            </div>

            {multaFile && (
              <button
                onClick={() => setStep(2)}
                className="mt-6 w-full py-4 rounded-sm font-semibold text-lg transition-all hover:scale-[1.01]"
                style={{ background: 'linear-gradient(135deg, #c9a84c, #9a7530)', color: '#0a0a0f', fontFamily: 'Playfair Display, serif' }}>
                Continuar →
              </button>
            )}
          </div>
        )}

        {/* STEP 2: Support documents */}
        {step === 2 && (
          <div className="animate-fade-up">
            <div className="flex items-center gap-4 mb-2">
              <button onClick={() => setStep(1)} className="opacity-50 hover:opacity-100">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="font-display text-4xl">Documentación de apoyo</h1>
            </div>
            <p className="opacity-60 mb-8 ml-9">
              Opcional pero recomendado: sube leyes, reglamentos, jurisprudencia o cualquier documento que apoye tu recurso.
            </p>

            {/* Drop zone */}
            <div
              {...getSupportProps()}
              className={`border-2 border-dashed rounded-sm p-8 text-center cursor-pointer transition-all mb-6 ${isSupportDrag ? "dropzone-active" : ""}`}
              style={{ borderColor: '#2a2a38', background: '#111118' }}>
              <input {...getSupportInputProps()} />
              <div className="flex flex-col items-center gap-3">
                <Plus className="w-8 h-8 opacity-30" />
                <p className="opacity-50 text-sm">Añadir documentos de apoyo · PDF, Word, imágenes, texto</p>
              </div>
            </div>

            {/* Uploaded support files */}
            <div className="space-y-4 mb-6">
              {supportFiles.map((sf, idx) => (
                <div key={idx} className="card-dark rounded-sm p-5" style={{ borderColor: '#2a2a38' }}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 flex-shrink-0" style={{ color: '#c9a84c' }} />
                      <span className="text-sm font-semibold truncate max-w-xs">{sf.name}</span>
                    </div>
                    <button onClick={() => removeSupportFile(idx)} className="opacity-40 hover:opacity-100">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={sf.context || ""}
                    onChange={e => updateSupportContext(idx, e.target.value)}
                    placeholder="Describe brevemente este documento (ej: Reglamento de circulación artículo 18...)"
                    className="w-full px-3 py-2 rounded text-sm focus:outline-none"
                    style={{ background: '#0a0a0f', border: '1px solid #2a2a38', color: '#f9f6ef', fontFamily: 'Crimson Text, serif', fontSize: '15px' }}
                  />
                </div>
              ))}
            </div>

            {/* Additional context */}
            <div className="mb-8">
              <label className="block text-xs mb-2 uppercase tracking-wider opacity-50"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                Contexto adicional (opcional)
              </label>
              <textarea
                value={additionalContext}
                onChange={e => setAdditionalContext(e.target.value)}
                rows={4}
                placeholder="¿Hay algo que los agentes deban saber? Ej: 'La señal estaba obstruida por un árbol', 'La multa fue impuesta fuera del horario indicado'..."
                className="w-full px-4 py-3 rounded-sm text-base focus:outline-none resize-none"
                style={{ background: '#111118', border: '1px solid #2a2a38', color: '#f9f6ef', fontFamily: 'Crimson Text, serif', fontSize: '17px' }}
              />
            </div>

            <button
              onClick={handleAnalyze}
              className="w-full py-4 rounded-sm font-semibold text-lg transition-all hover:scale-[1.01] flex items-center justify-center gap-3"
              style={{ background: 'linear-gradient(135deg, #c9a84c, #9a7530)', color: '#0a0a0f', fontFamily: 'Playfair Display, serif', boxShadow: '0 0 40px #c9a84c20' }}>
              <Zap className="w-5 h-5" />
              Analizar con IA y generar recurso
            </button>
          </div>
        )}

        {/* STEP 3: Analyzing */}
        {step === 3 && (
          <div className="animate-fade-up">
            <h1 className="font-display text-4xl mb-2">Agentes trabajando…</h1>
            <p className="opacity-60 mb-8">Cada agente analiza tu multa de forma independiente.</p>

            <div className="space-y-5">
              {agentResults.map((agent, idx) => (
                <div key={idx} className="card-dark rounded-sm p-6" style={{ borderColor: '#2a2a38' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                        style={{
                          background: agent.status === "done" ? '#c9a84c20' : agent.status === "error" ? '#ef444420' : '#1a1a24',
                          color: agent.status === "done" ? '#c9a84c' : agent.status === "error" ? '#ef4444' : '#666688',
                          fontFamily: 'JetBrains Mono, monospace',
                        }}>
                        {idx + 1}
                      </div>
                      <span className="font-display text-lg">{agent.agentName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      {agent.status === "running" && (
                        <>
                          <Clock className="w-4 h-4 animate-spin" style={{ color: '#c9a84c' }} />
                          <span style={{ color: '#c9a84c', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}>analizando…</span>
                        </>
                      )}
                      {agent.status === "done" && (
                        <>
                          <CheckCircle className="w-4 h-4" style={{ color: '#4ade80' }} />
                          <span style={{ color: '#4ade80', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}>listo</span>
                        </>
                      )}
                      {agent.status === "error" && (
                        <>
                          <AlertCircle className="w-4 h-4" style={{ color: '#ef4444' }} />
                          <span style={{ color: '#ef4444', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}>error</span>
                        </>
                      )}
                      {agent.status === "pending" && (
                        <span style={{ color: '#44445a', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}>en cola</span>
                      )}
                    </div>
                  </div>

                  {agent.status === "running" && (
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1a1a24' }}>
                      <div className="h-full rounded-full shimmer" style={{ width: '60%' }} />
                    </div>
                  )}

                  {agent.status === "done" && agent.content && (
                    <div className="mt-3 text-sm opacity-70 line-clamp-3" style={{ fontFamily: 'Crimson Text, serif', fontSize: '15px' }}>
                      {agent.content.slice(0, 200)}…
                    </div>
                  )}

                  {agent.status === "error" && (
                    <p className="text-sm mt-2" style={{ color: '#ef4444' }}>{agent.error}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 4: Result */}
        {step === 4 && result && (
          <div className="animate-fade-up">
            <div className="flex items-center justify-between mb-8">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5" style={{ color: '#4ade80' }} />
                  <span className="text-sm" style={{ color: '#4ade80', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}>
                    RECURSO GENERADO
                  </span>
                </div>
                <h1 className="font-display text-4xl">Tu recurso está listo</h1>
              </div>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-6 py-3 rounded-sm font-semibold transition-all hover:scale-[1.02]"
                style={{ background: 'linear-gradient(135deg, #c9a84c, #9a7530)', color: '#0a0a0f', fontFamily: 'Playfair Display, serif' }}>
                <Download className="w-5 h-5" />
                Descargar .docx
              </button>
            </div>

            {/* Agent results summary */}
            <div className="grid grid-cols-3 gap-3 mb-8">
              {agentResults.map((agent, idx) => (
                <div key={idx} className="p-3 rounded-sm text-center"
                  style={{ background: '#111118', border: '1px solid #2a2a38' }}>
                  <div className="text-xs mb-1" style={{ color: '#c9a84c', fontFamily: 'JetBrains Mono, monospace' }}>
                    Agente {idx + 1}
                  </div>
                  <div className="text-xs opacity-50 truncate">{agent.agentName.split("—")[1]?.trim() || agent.agentName}</div>
                  <div className="mt-1">
                    {agent.status === "done"
                      ? <CheckCircle className="w-4 h-4 mx-auto" style={{ color: '#4ade80' }} />
                      : <AlertCircle className="w-4 h-4 mx-auto" style={{ color: '#ef4444' }} />
                    }
                  </div>
                </div>
              ))}
            </div>

            {/* Merged document */}
            <div className="card-dark rounded-sm p-8 mb-6" style={{ borderColor: '#2a2a38' }}>
              <div className="flex items-center gap-2 mb-6 pb-4 border-b" style={{ borderColor: '#2a2a38' }}>
                <FileText className="w-5 h-5" style={{ color: '#c9a84c' }} />
                <h2 className="font-display text-xl">Documento de recurso</h2>
                <span className="ml-auto text-xs px-2 py-0.5 rounded"
                  style={{ background: '#c9a84c15', color: '#c9a84c', fontFamily: 'JetBrains Mono, monospace' }}>
                  consenso de {agentResults.filter(a => a.status === "done").length} agentes
                </span>
              </div>
              <div className="prose-legal whitespace-pre-wrap max-h-96 overflow-y-auto pr-2">
                {result.mergedDoc}
              </div>
            </div>

            {/* Instructions */}
            <div className="rounded-sm p-8 mb-8" style={{ background: '#c9a84c08', border: '1px solid #c9a84c30' }}>
              <h2 className="font-display text-2xl mb-4" style={{ color: '#e8cc7a' }}>
                📋 Instrucciones para presentar el recurso
              </h2>
              <div className="prose-legal whitespace-pre-wrap opacity-90">
                {result.instructions}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-4 flex-wrap">
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-8 py-4 rounded-sm font-semibold text-lg transition-all hover:scale-[1.02]"
                style={{ background: 'linear-gradient(135deg, #c9a84c, #9a7530)', color: '#0a0a0f', fontFamily: 'Playfair Display, serif', boxShadow: '0 0 40px #c9a84c20' }}>
                <Download className="w-5 h-5" />
                Descargar Word (.docx)
              </button>
              <button
                onClick={() => { setStep(1); setMultaFile(null); setSupportFiles([]); setAdditionalContext(""); setResult(null); setAgentResults([]); }}
                className="flex items-center gap-2 px-8 py-4 rounded-sm font-semibold text-lg border transition-all"
                style={{ borderColor: '#2a2a38', color: '#9898b0', fontFamily: 'Playfair Display, serif' }}>
                Nueva multa
              </button>
            </div>

            <p className="mt-6 text-xs opacity-30 text-center" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              Este documento es generado por IA y no constituye asesoramiento jurídico profesional. Revísalo antes de presentarlo.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

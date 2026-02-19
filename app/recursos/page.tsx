"use client";

import { useState } from "react";
import Link from "next/link";
import { Scale, ArrowLeft, Upload, Plus, X, Zap, FileText, Download, AlertCircle, CheckCircle, Clock, ChevronDown, ChevronUp } from "lucide-react";
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
  agentId: string;
  agentName: string;
  label: string;
  color: string;
  status: "pending" | "running" | "done" | "error" | "skipped";
  content: string;
  error?: string;
}

export default function RecursosPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [multaFile, setMultaFile] = useState<UploadedFile | null>(null);
  const [supportFiles, setSupportFiles] = useState<UploadedFile[]>([]);
  const [additionalContext, setAdditionalContext] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [agentResults, setAgentResults] = useState<AgentResult[]>([]);
  const [instructions, setInstructions] = useState("");
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const { getRootProps: getMultaProps, getInputProps: getMultaInputProps, isDragActive: isMultaDrag } = useDropzone({
    accept: { "application/pdf": [".pdf"], "image/*": [".jpg", ".jpeg", ".png", ".webp"] },
    maxFiles: 1,
    onDrop: (files) => {
      if (files[0]) {
        const f = files[0];
        const reader = new FileReader();
        reader.onload = () => {
          setMultaFile({ file: f, name: f.name, type: f.type, preview: f.type.startsWith("image/") ? reader.result as string : undefined });
        };
        reader.readAsDataURL(f);
      }
    },
  });

  const { getRootProps: getSupportProps, getInputProps: getSupportInputProps, isDragActive: isSupportDrag } = useDropzone({
    accept: { "application/pdf": [".pdf"], "image/*": [], "text/*": [".txt"] },
    onDrop: (files) => {
      setSupportFiles(prev => [...prev, ...files.map(f => ({ file: f, name: f.name, type: f.type, context: "" }))]);
    },
  });

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve((r.result as string).split(",")[1]);
      r.onerror = reject;
      r.readAsDataURL(file);
    });

  const handleAnalyze = async () => {
    if (!multaFile) { toast.error("Sube el documento de la multa primero"); return; }

    setIsAnalyzing(true);
    setStep(3);

    try {
      const multaBase64 = await fileToBase64(multaFile.file);
      const supportFilesData = await Promise.all(
        supportFiles.map(async sf => ({
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
          // Las API keys las lee el servidor desde variables de entorno
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Error al analizar");
      }

      const data = await response.json();
      setAgentResults(data.agentResults);
      setInstructions(data.instructions);
      // Auto-expand first successful result
      const first = data.agentResults.find((r: AgentResult) => r.status === "done");
      if (first) setExpandedAgent(first.agentId);
      setStep(4);
    } catch (err) {
      toast.error("Error: " + (err instanceof Error ? err.message : "Desconocido"));
      setStep(2);
    }
    setIsAnalyzing(false);
  };

  const handleDownloadDoc = async (agentId: string) => {
    const agent = agentResults.find(r => r.agentId === agentId);
    if (!agent?.content) return;
    try {
      const res = await fetch("/api/generate-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: agent.content, instructions }),
      });
      if (!res.ok) throw new Error("Error generando documento");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `recurso-${agentId}-${Date.now()}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Documento descargado");
    } catch {
      toast.error("Error al generar el documento");
    }
  };

  const successCount = agentResults.filter(r => r.status === "done").length;

  return (
    <main className="min-h-screen">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-6 border-b" style={{ borderColor: "#2a2a38" }}>
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity text-sm">
            <ArrowLeft className="w-4 h-4" /> Inicio
          </Link>
          <div className="flex items-center gap-3">
            <Scale className="w-5 h-5" style={{ color: "#c9a84c" }} />
            <span className="font-display font-bold"
              style={{ background: "linear-gradient(135deg, #e8cc7a, #c9a84c)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              RecursApp
            </span>
          </div>
        </div>
        <Link href="/settings" className="text-sm opacity-50 hover:opacity-100 transition-opacity"
          style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "12px" }}>
          ⚙ API Keys
        </Link>
      </nav>

      {/* Steps */}
      <div className="flex items-center justify-center gap-0 px-8 py-8">
        {[{ n: 1, label: "Multa" }, { n: 2, label: "Contexto" }, { n: 3, label: "Analizando" }, { n: 4, label: "Recursos" }].map(({ n, label }, i) => (
          <div key={n} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all"
                style={{
                  background: step >= n ? "linear-gradient(135deg, #c9a84c, #9a7530)" : "#1a1a24",
                  color: step >= n ? "#0a0a0f" : "#44445a",
                  border: step >= n ? "none" : "1px solid #2a2a38",
                  fontFamily: "JetBrains Mono, monospace",
                  boxShadow: step === n ? "0 0 20px #c9a84c40" : "none",
                }}>
                {step > n ? "✓" : n}
              </div>
              <span className="text-xs mt-1.5" style={{ color: step >= n ? "#c9a84c" : "#44445a", fontFamily: "JetBrains Mono, monospace", fontSize: "10px" }}>
                {label}
              </span>
            </div>
            {i < 3 && <div className="w-16 h-px mx-2 mb-4" style={{ background: step > n ? "#c9a84c60" : "#2a2a38" }} />}
          </div>
        ))}
      </div>

      <div className="max-w-3xl mx-auto px-8 pb-20">

        {/* STEP 1: Upload multa */}
        {step === 1 && (
          <div className="animate-fade-up">
            <h1 className="font-display text-4xl mb-2">Sube tu multa</h1>
            <p className="opacity-60 mb-8">PDF o imagen de la notificación.</p>

            <div {...getMultaProps()}
              className={`border-2 border-dashed rounded-sm p-12 text-center cursor-pointer transition-all ${isMultaDrag ? "dropzone-active" : ""}`}
              style={{ borderColor: multaFile ? "#c9a84c" : "#2a2a38", background: multaFile ? "#c9a84c08" : "#111118" }}>
              <input {...getMultaInputProps()} />
              {multaFile ? (
                <div className="flex flex-col items-center gap-4">
                  {multaFile.preview
                    ? <img src={multaFile.preview} alt="multa" className="max-h-48 rounded object-contain" />
                    : <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "#c9a84c20" }}>
                        <FileText className="w-8 h-8" style={{ color: "#c9a84c" }} />
                      </div>
                  }
                  <div>
                    <p className="font-semibold" style={{ color: "#e8cc7a" }}>{multaFile.name}</p>
                    <p className="text-sm opacity-50 mt-1">{multaFile.type}</p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); setMultaFile(null); }} className="text-sm opacity-50 hover:opacity-100 flex items-center gap-1">
                    <X className="w-3 h-3" /> Eliminar
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "#1a1a24", border: "1px solid #2a2a38" }}>
                    <Upload className="w-7 h-7" style={{ color: "#666688" }} />
                  </div>
                  <div>
                    <p className="font-display text-xl mb-1">Arrastra aquí tu multa</p>
                    <p className="opacity-50 text-sm">o haz clic para seleccionar · PDF o imagen</p>
                  </div>
                </div>
              )}
            </div>

            {multaFile && (
              <button onClick={() => setStep(2)} className="mt-6 w-full py-4 rounded-sm font-semibold text-lg transition-all hover:scale-[1.01]"
                style={{ background: "linear-gradient(135deg, #c9a84c, #9a7530)", color: "#0a0a0f", fontFamily: "Playfair Display, serif" }}>
                Continuar →
              </button>
            )}
          </div>
        )}

        {/* STEP 2: Context */}
        {step === 2 && (
          <div className="animate-fade-up">
            <div className="flex items-center gap-4 mb-2">
              <button onClick={() => setStep(1)} className="opacity-50 hover:opacity-100"><ArrowLeft className="w-5 h-5" /></button>
              <h1 className="font-display text-4xl">Contexto adicional</h1>
            </div>
            <p className="opacity-60 mb-8 ml-9">Opcional pero recomendado.</p>

            {/* Support files */}
            <div {...getSupportProps()}
              className={`border-2 border-dashed rounded-sm p-8 text-center cursor-pointer transition-all mb-6 ${isSupportDrag ? "dropzone-active" : ""}`}
              style={{ borderColor: "#2a2a38", background: "#111118" }}>
              <input {...getSupportInputProps()} />
              <div className="flex flex-col items-center gap-3">
                <Plus className="w-8 h-8 opacity-30" />
                <p className="opacity-50 text-sm">Añadir documentación de apoyo (legislación, fotos, contratos…)</p>
              </div>
            </div>

            {supportFiles.length > 0 && (
              <div className="space-y-3 mb-6">
                {supportFiles.map((sf, idx) => (
                  <div key={idx} className="card-dark rounded-sm p-4" style={{ borderColor: "#2a2a38" }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold truncate max-w-xs flex items-center gap-2">
                        <FileText className="w-4 h-4 flex-shrink-0" style={{ color: "#c9a84c" }} /> {sf.name}
                      </span>
                      <button onClick={() => setSupportFiles(p => p.filter((_, i) => i !== idx))} className="opacity-40 hover:opacity-100">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <input type="text" value={sf.context || ""} onChange={e => setSupportFiles(p => p.map((f, i) => i === idx ? { ...f, context: e.target.value } : f))}
                      placeholder="Describe brevemente este documento…"
                      className="w-full px-3 py-2 rounded text-sm focus:outline-none"
                      style={{ background: "#0a0a0f", border: "1px solid #2a2a38", color: "#f9f6ef", fontFamily: "Crimson Text, serif", fontSize: "15px" }} />
                  </div>
                ))}
              </div>
            )}

            <div className="mb-8">
              <label className="block text-xs mb-2 uppercase tracking-wider opacity-50" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                Contexto adicional (opcional)
              </label>
              <textarea value={additionalContext} onChange={e => setAdditionalContext(e.target.value)} rows={4}
                placeholder="Ej: 'La señal estaba obstruida por vegetación', 'La multa fue impuesta fuera del horario indicado'…"
                className="w-full px-4 py-3 rounded-sm text-base focus:outline-none resize-none"
                style={{ background: "#111118", border: "1px solid #2a2a38", color: "#f9f6ef", fontFamily: "Crimson Text, serif", fontSize: "17px" }} />
            </div>

            <button onClick={handleAnalyze}
              className="w-full py-4 rounded-sm font-semibold text-lg transition-all hover:scale-[1.01] flex items-center justify-center gap-3"
              style={{ background: "linear-gradient(135deg, #c9a84c, #9a7530)", color: "#0a0a0f", fontFamily: "Playfair Display, serif", boxShadow: "0 0 40px #c9a84c20" }}>
              <Zap className="w-5 h-5" />
              Generar recursos con IA
            </button>
          </div>
        )}

        {/* STEP 3: Analyzing */}
        {step === 3 && (
          <div className="animate-fade-up">
            <h1 className="font-display text-4xl mb-2">Generando recursos…</h1>
            <p className="opacity-60 mb-8">Cada IA redacta su propio recurso de forma independiente.</p>
            <div className="space-y-4">
              {["Groq · Llama 3.3 70B", "Google Gemini 1.5 Flash", "OpenRouter · Llama 3.3 70B"].map((label, i) => (
                <div key={i} className="card-dark rounded-sm p-6" style={{ borderColor: "#2a2a38" }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                      style={{ background: "#1a1a24", border: "1px solid #2a2a38", color: "#c9a84c", fontFamily: "JetBrains Mono, monospace" }}>
                      {i + 1}
                    </div>
                    <span className="font-display">{label}</span>
                    <div className="flex items-center gap-2 ml-auto text-xs" style={{ color: "#c9a84c", fontFamily: "JetBrains Mono, monospace", fontSize: "12px" }}>
                      <Clock className="w-3.5 h-3.5 animate-spin" /> redactando…
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#1a1a24" }}>
                    <div className="h-full rounded-full shimmer" style={{ width: "70%" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 4: Results */}
        {step === 4 && (
          <div className="animate-fade-up">
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5" style={{ color: "#4ade80" }} />
                <span className="text-sm" style={{ color: "#4ade80", fontFamily: "JetBrains Mono, monospace", fontSize: "12px" }}>
                  {successCount} RECURSO{successCount !== 1 ? "S" : ""} GENERADO{successCount !== 1 ? "S" : ""}
                </span>
              </div>
              <h1 className="font-display text-4xl">Elige tu recurso</h1>
              <p className="opacity-60 mt-2" style={{ fontFamily: "Crimson Text, serif", fontSize: "17px" }}>
                Cada IA ha redactado su versión independiente. Compara y descarga la que más te convenza.
              </p>
            </div>

            <div className="space-y-4 mb-10">
              {agentResults.map((agent) => (
                <div key={agent.agentId} className="rounded-sm overflow-hidden transition-all"
                  style={{
                    border: `1px solid ${agent.status === "done" ? `${agent.color}30` : "#2a2a38"}`,
                    background: "linear-gradient(160deg, #111118, #1a1a24)",
                  }}>
                  {/* Agent header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "#1e1e2a" }}>
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm"
                        style={{ background: `${agent.color}18`, border: `1px solid ${agent.color}35`, color: agent.color, fontFamily: "JetBrains Mono, monospace" }}>
                        {agent.agentId === "agent-groq" ? "G" : agent.agentId === "agent-gemini" ? "AI" : "OR"}
                      </div>
                      <div>
                        <div className="font-display text-lg">{agent.label}</div>
                        {agent.status === "done" && (
                          <div className="text-xs mt-0.5" style={{ color: "#4ade80", fontFamily: "JetBrains Mono, monospace" }}>
                            ✓ {agent.content.length} caracteres
                          </div>
                        )}
                        {agent.status === "error" && (
                          <div className="text-xs mt-0.5" style={{ color: "#f87171", fontFamily: "JetBrains Mono, monospace" }}>
                            ✗ {agent.error}
                          </div>
                        )}
                        {agent.status === "skipped" && (
                          <div className="text-xs mt-0.5" style={{ color: "#666688", fontFamily: "JetBrains Mono, monospace" }}>
                            Sin API key configurada
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {agent.status === "done" && (
                        <>
                          <button onClick={() => handleDownloadDoc(agent.agentId)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-sm text-sm font-semibold transition-all hover:scale-[1.02]"
                            style={{ background: `linear-gradient(135deg, ${agent.color}, ${agent.color}99)`, color: "#0a0a0f", fontFamily: "Crimson Text, serif", fontSize: "15px" }}>
                            <Download className="w-4 h-4" /> Descargar .docx
                          </button>
                          <button onClick={() => setExpandedAgent(expandedAgent === agent.agentId ? null : agent.agentId)}
                            className="p-2 opacity-50 hover:opacity-100 transition-opacity">
                            {expandedAgent === agent.agentId ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                          </button>
                        </>
                      )}
                      {agent.status === "error" && (
                        <AlertCircle className="w-5 h-5" style={{ color: "#f87171" }} />
                      )}
                      {agent.status === "skipped" && (
                        <span className="text-xs px-3 py-1.5 rounded"
                          style={{ background: "#1a1a24", border: "1px solid #2a2a38", color: "#44445a", fontFamily: "JetBrains Mono, monospace" }}>
                          Omitido
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expandable content */}
                  {expandedAgent === agent.agentId && agent.status === "done" && (
                    <div className="px-6 py-6 border-t" style={{ borderColor: "#1e1e2a" }}>
                      <div className="prose-legal whitespace-pre-wrap max-h-[500px] overflow-y-auto pr-2 text-sm leading-relaxed"
                        style={{ fontFamily: "Crimson Text, serif", fontSize: "16px", color: "#d8d8e8" }}>
                        {agent.content}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Instructions */}
            <div className="rounded-sm p-8 mb-8" style={{ background: "#c9a84c08", border: "1px solid #c9a84c30" }}>
              <h2 className="font-display text-2xl mb-4" style={{ color: "#e8cc7a" }}>
                📋 Instrucciones de presentación
              </h2>
              <div className="whitespace-pre-wrap opacity-80" style={{ fontFamily: "Crimson Text, serif", fontSize: "16px", lineHeight: "1.8" }}>
                {instructions}
              </div>
            </div>

            {/* Reset */}
            <div className="flex justify-center">
              <button onClick={() => { setStep(1); setMultaFile(null); setSupportFiles([]); setAdditionalContext(""); setAgentResults([]); setInstructions(""); setExpandedAgent(null); }}
                className="flex items-center gap-2 px-8 py-4 rounded-sm font-semibold text-lg border transition-all"
                style={{ borderColor: "#2a2a38", color: "#9898b0", fontFamily: "Playfair Display, serif" }}>
                Nueva multa
              </button>
            </div>

            <p className="mt-6 text-xs opacity-30 text-center" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              Documentos generados por IA · No constituye asesoramiento jurídico profesional
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

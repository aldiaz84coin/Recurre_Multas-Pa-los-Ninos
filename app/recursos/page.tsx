"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Scale, ArrowLeft, Upload, Plus, X, Zap, FileText,
  Download, AlertCircle, CheckCircle, Clock, ChevronDown, ChevronUp, Star, ExternalLink
} from "lucide-react";
import toast from "react-hot-toast";
import { useDropzone } from "react-dropzone";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UploadedFile {
  file: File; name: string; type: string; context?: string; preview?: string;
}

interface AgentResult {
  agentId: string; agentName: string; label: string; color: string;
  status: "pending" | "running" | "done" | "error" | "skipped";
  content: string; error?: string;
  urlProposal?: { url: string; nombre: string; confianza: string } | null;
}

interface PresentacionUrl { url: string; nombre: string; confianza: string; }

interface PlazoInfo {
  fechaNotificacion: string;
  fechaLimite: string;
  diasRestantes: number;
  tipoRecurso: string;
  baseLegal: string;
  urgencia: "ok" | "aviso" | "urgente" | "vencido";
}

// ── PlazoBanner component ─────────────────────────────────────────────────────

const URGENCY_CFG: Record<string, { bg: string; border: string; color: string; icon: string; label: string }> = {
  ok:      { bg: "#0a1a0a", border: "#4ade8040", color: "#4ade80", icon: "📅", label: "Plazo OK" },
  aviso:   { bg: "#1a140a", border: "#f9a80040", color: "#f9a800", icon: "⚠️",  label: "Plazo próximo" },
  urgente: { bg: "#1a0a0a", border: "#f8717140", color: "#f87171", icon: "🚨", label: "¡URGENTE!" },
  vencido: { bg: "#1a0a0a", border: "#f8717170", color: "#f87171", icon: "❌", label: "Plazo vencido" },
};

function PlazoBanner({ plazo }: { plazo: PlazoInfo }) {
  const cfg = URGENCY_CFG[plazo.urgencia];
  const diasLabel = plazo.urgencia === "vencido"
    ? `Venció hace ${Math.abs(plazo.diasRestantes)} días`
    : plazo.diasRestantes === 0
    ? "¡Vence HOY!"
    : `${plazo.diasRestantes} días restantes`;

  return (
    <div className="rounded-sm px-6 py-5 mb-4"
      style={{ background: cfg.bg, border: `2px solid ${cfg.border}` }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="text-2xl flex-shrink-0 mt-0.5">{cfg.icon}</div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="font-display text-lg" style={{ color: cfg.color }}>{cfg.label}</span>
              <span className="text-xs px-2 py-0.5 rounded font-bold"
                style={{ background: `${cfg.color}20`, color: cfg.color, fontFamily: "JetBrains Mono, monospace" }}>
                {diasLabel}
              </span>
            </div>
            <div className="text-sm opacity-80 mb-2" style={{ fontFamily: "Crimson Text, serif", fontSize: "16px" }}>
              Fecha límite:{" "}
              <strong style={{ color: cfg.color }}>{plazo.fechaLimite}</strong>
            </div>
            <div className="text-xs opacity-50" style={{ fontFamily: "JetBrains Mono, monospace", lineHeight: "1.8" }}>
              <div>Tipo: {plazo.tipoRecurso}</div>
              <div>Base legal: {plazo.baseLegal}</div>
              <div>Notificación: {plazo.fechaNotificacion}</div>
            </div>
          </div>
        </div>
        {plazo.urgencia !== "vencido" && (
          <div className="flex-shrink-0 text-right">
            <div className="font-display text-4xl font-bold" style={{ color: cfg.color, lineHeight: "1" }}>
              {plazo.diasRestantes}
            </div>
            <div className="text-xs opacity-60 mt-1" style={{ fontFamily: "JetBrains Mono, monospace" }}>días</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RecursosPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [multaFile, setMultaFile] = useState<UploadedFile | null>(null);
  const [supportFiles, setSupportFiles] = useState<UploadedFile[]>([]);
  const [additionalContext, setAdditionalContext] = useState("");
  const [agentResults, setAgentResults] = useState<AgentResult[]>([]);
  const [masterRecurso, setMasterRecurso] = useState("");
  const [masterError, setMasterError] = useState("");
  const [instructions, setInstructions] = useState("");
  const [parsedText, setParsedText] = useState("");
  const [presentacionUrl, setPresentacionUrl] = useState<PresentacionUrl | null>(null);
  const [plazoInfo, setPlazoInfo] = useState<PlazoInfo | null>(null);
  const [showParsed, setShowParsed] = useState(true);
  const [activeTab, setActiveTab] = useState<"definitivo" | "borrador-0" | "borrador-1" | "borrador-2">("definitivo");

  const { getRootProps: getMultaProps, getInputProps: getMultaInputProps, isDragActive: isMultaDrag } = useDropzone({
    accept: { "application/pdf": [".pdf"], "image/*": [".jpg", ".jpeg", ".png", ".webp"] },
    maxFiles: 1,
    onDrop: (files) => {
      if (files[0]) {
        const f = files[0];
        const reader = new FileReader();
        reader.onload = () => setMultaFile({
          file: f, name: f.name, type: f.type,
          preview: f.type.startsWith("image/") ? reader.result as string : undefined,
        });
        reader.readAsDataURL(f);
      }
    },
  });

  const { getRootProps: getSupportProps, getInputProps: getSupportInputProps, isDragActive: isSupportDrag } = useDropzone({
    accept: { "application/pdf": [".pdf"], "image/*": [], "text/*": [".txt"] },
    onDrop: (files) => setSupportFiles(prev => [
      ...prev, ...files.map(f => ({ file: f, name: f.name, type: f.type, context: "" }))
    ]),
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
    setStep(3);
    try {
      const multaBase64 = await fileToBase64(multaFile.file);
      const supportFilesData = await Promise.all(
        supportFiles.map(async sf => ({
          name: sf.name, type: sf.type, context: sf.context || "",
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
        }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Error al analizar");
      }
      const data = await response.json();
      setAgentResults(data.agentResults || []);
      setMasterRecurso(data.masterRecurso || "");
      setMasterError(data.masterError || "");
      setInstructions(data.instructions || "");
      if (data.parsedText) setParsedText(data.parsedText);
      if (data.presentacionUrl) setPresentacionUrl(data.presentacionUrl);
      if (data.plazoInfo) setPlazoInfo(data.plazoInfo);
      setActiveTab("definitivo");
      setStep(4);
    } catch (err) {
      toast.error("Error: " + (err instanceof Error ? err.message : "Desconocido"));
      setStep(2);
    }
  };

  const handleDownload = async (content: string, filename: string) => {
    try {
      const res = await fetch("/api/generate-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, instructions }),
      });
      if (!res.ok) throw new Error("Error generando documento");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      toast.success("Documento descargado");
    } catch { toast.error("Error al generar el documento"); }
  };

  const handleReset = () => {
    setStep(1); setMultaFile(null); setSupportFiles([]); setAdditionalContext("");
    setAgentResults([]); setMasterRecurso(""); setMasterError("");
    setInstructions(""); setParsedText(""); setPresentacionUrl(null);
    setPlazoInfo(null); setShowParsed(true); setActiveTab("definitivo");
  };

  const successCount = agentResults.filter(r => r.status === "done").length;
  const doneAgents = agentResults.filter(r => r.status === "done");

  const activeIndex = activeTab === "definitivo" ? -1 : parseInt(activeTab.replace("borrador-", ""));
  const currentContent = activeTab === "definitivo" ? masterRecurso : (doneAgents[activeIndex]?.content || "");
  const currentLabel = activeTab === "definitivo" ? "Recurso Definitivo" : (doneAgents[activeIndex]?.label || "");
  const currentFilename = activeTab === "definitivo"
    ? "recurso-DEFINITIVO-" + Date.now() + ".docx"
    : "recurso-borrador-" + (activeIndex + 1) + "-" + Date.now() + ".docx";

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
          style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "12px" }}>⚙ API Keys</Link>
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

        {/* STEP 1 */}
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
                  <button onClick={e => { e.stopPropagation(); setMultaFile(null); }}
                    className="text-sm opacity-50 hover:opacity-100 flex items-center gap-1">
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
              <button onClick={() => setStep(2)}
                className="mt-6 w-full py-4 rounded-sm font-semibold text-lg transition-all hover:scale-[1.01]"
                style={{ background: "linear-gradient(135deg, #c9a84c, #9a7530)", color: "#0a0a0f", fontFamily: "Playfair Display, serif" }}>
                Continuar →
              </button>
            )}
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="animate-fade-up">
            <div className="flex items-center gap-4 mb-2">
              <button onClick={() => setStep(1)} className="opacity-50 hover:opacity-100"><ArrowLeft className="w-5 h-5" /></button>
              <h1 className="font-display text-4xl">Contexto adicional</h1>
            </div>
            <p className="opacity-60 mb-8 ml-9">Opcional pero recomendado.</p>
            <div {...getSupportProps()}
              className={`border-2 border-dashed rounded-sm p-8 text-center cursor-pointer transition-all mb-6 ${isSupportDrag ? "dropzone-active" : ""}`}
              style={{ borderColor: "#2a2a38", background: "#111118" }}>
              <input {...getSupportInputProps()} />
              <div className="flex flex-col items-center gap-3">
                <Plus className="w-8 h-8 opacity-30" />
                <p className="opacity-50 text-sm">Añadir documentación de apoyo (legislación, fotos…)</p>
              </div>
            </div>
            {supportFiles.length > 0 && (
              <div className="space-y-3 mb-6">
                {supportFiles.map((sf, idx) => (
                  <div key={idx} className="card-dark rounded-sm p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold truncate max-w-xs flex items-center gap-2">
                        <FileText className="w-4 h-4 flex-shrink-0" style={{ color: "#c9a84c" }} /> {sf.name}
                      </span>
                      <button onClick={() => setSupportFiles(p => p.filter((_, i) => i !== idx))}
                        className="opacity-40 hover:opacity-100"><X className="w-4 h-4" /></button>
                    </div>
                    <input type="text" value={sf.context || ""}
                      onChange={e => setSupportFiles(p => p.map((f, i) => i === idx ? { ...f, context: e.target.value } : f))}
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
                placeholder="Ej: 'La señal estaba obstruida', 'La multa fue fuera del horario indicado'…"
                className="w-full px-4 py-3 rounded-sm text-base focus:outline-none resize-none"
                style={{ background: "#111118", border: "1px solid #2a2a38", color: "#f9f6ef", fontFamily: "Crimson Text, serif", fontSize: "17px" }} />
            </div>
            <button onClick={handleAnalyze}
              className="w-full py-4 rounded-sm font-semibold text-lg transition-all hover:scale-[1.01] flex items-center justify-center gap-3"
              style={{ background: "linear-gradient(135deg, #c9a84c, #9a7530)", color: "#0a0a0f", fontFamily: "Playfair Display, serif", boxShadow: "0 0 40px #c9a84c20" }}>
              <Zap className="w-5 h-5" /> Generar recursos con IA
            </button>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div className="animate-fade-up">
            <h1 className="font-display text-4xl mb-2">Trabajando…</h1>
            <p className="opacity-60 mb-8">Parseo → 3 borradores → recurso definitivo.</p>
            <div className="space-y-4">
              {[
                { label: "Leyendo el documento", sublabel: "OpenRouter · parseo visual + URL", color: "#c9a84c" },
                { label: "Agente Mistral Small", sublabel: "redactando borrador 1", color: "#f97316" },
                { label: "Agente Llama 4 Maverick", sublabel: "redactando borrador 2", color: "#8b5cf6" },
                { label: "Agente Llama 4 Scout", sublabel: "redactando borrador 3", color: "#06b6d4" },
                { label: "Agente Maestro · Mistral Large", sublabel: "fusionando los 3 borradores", color: "#e8cc7a" },
              ].map((item, i) => (
                <div key={i} className="card-dark rounded-sm p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: item.color + "20", border: "1px solid " + item.color + "40", color: item.color, fontFamily: "JetBrains Mono, monospace" }}>
                      {i === 4 ? "★" : i + 1}
                    </div>
                    <div>
                      <div className="font-display">{item.label}</div>
                      <div className="text-xs opacity-50" style={{ fontFamily: "JetBrains Mono, monospace" }}>{item.sublabel}</div>
                    </div>
                    <div className="ml-auto flex items-center gap-2 text-xs" style={{ color: item.color, fontFamily: "JetBrains Mono, monospace", fontSize: "11px" }}>
                      <Clock className="w-3.5 h-3.5 animate-spin" /> procesando…
                    </div>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: "#1a1a24" }}>
                    <div className="h-full rounded-full shimmer" style={{ width: "65%" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 4 */}
        {step === 4 && (
          <div className="animate-fade-up">

            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5" style={{ color: "#4ade80" }} />
                <span className="text-sm" style={{ color: "#4ade80", fontFamily: "JetBrains Mono, monospace", fontSize: "12px" }}>
                  {successCount} BORRADOR{successCount !== 1 ? "ES" : ""} + RECURSO DEFINITIVO GENERADOS
                </span>
              </div>
              <h1 className="font-display text-4xl">Tu recurso está listo</h1>
            </div>

            {/* Plazo */}
            {plazoInfo && <PlazoBanner plazo={plazoInfo} />}

            {/* Sede electrónica */}
            {presentacionUrl && (
              <a href={presentacionUrl.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-between px-6 py-4 rounded-sm mb-6 transition-all hover:scale-[1.01] group"
                style={{ background: "linear-gradient(135deg, #0a1a0a, #111118)", border: "2px solid #4ade8040", boxShadow: "0 0 20px #4ade8010" }}>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "#4ade8015", border: "1px solid #4ade8040" }}>
                    <ExternalLink className="w-5 h-5" style={{ color: "#4ade80" }} />
                  </div>
                  <div>
                    <div className="font-display text-base" style={{ color: "#4ade80" }}>Presentar recurso electrónicamente</div>
                    <div className="text-xs mt-0.5 opacity-70" style={{ fontFamily: "JetBrains Mono, monospace", color: "#9898b0" }}>
                      {presentacionUrl.nombre} · {presentacionUrl.url}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded"
                    style={{
                      background: presentacionUrl.confianza === "alta" ? "#4ade8015" : "#f9731615",
                      color: presentacionUrl.confianza === "alta" ? "#4ade80" : "#f97316",
                      border: "1px solid " + (presentacionUrl.confianza === "alta" ? "#4ade8030" : "#f9731630"),
                      fontFamily: "JetBrains Mono, monospace",
                    }}>
                    {presentacionUrl.confianza === "alta" ? "✓ verificado" : "⚠ verifica URL"}
                  </span>
                  <ExternalLink className="w-4 h-4 opacity-40 group-hover:opacity-100 transition-opacity" style={{ color: "#4ade80" }} />
                </div>
              </a>
            )}

            {/* Tabs */}
            <div className="rounded-sm overflow-hidden mb-6"
              style={{ border: "2px solid #c9a84c60", background: "linear-gradient(160deg, #1a1508, #1a1a24)", boxShadow: "0 0 40px #c9a84c15" }}>

              <div className="flex overflow-x-auto" style={{ borderBottom: "1px solid #c9a84c20", background: "#0f0e08" }}>
                <button onClick={() => setActiveTab("definitivo")}
                  className="flex items-center gap-2 px-5 py-3.5 text-sm font-semibold whitespace-nowrap transition-all flex-shrink-0"
                  style={{
                    borderBottom: activeTab === "definitivo" ? "2px solid #c9a84c" : "2px solid transparent",
                    color: activeTab === "definitivo" ? "#e8cc7a" : "#666688",
                    background: activeTab === "definitivo" ? "#c9a84c08" : "transparent",
                    fontFamily: "Crimson Text, serif", fontSize: "15px",
                  }}>
                  <Star className="w-3.5 h-3.5" style={{ color: activeTab === "definitivo" ? "#c9a84c" : "#666688" }} />
                  Definitivo
                </button>

                {doneAgents.map((agent, i) => (
                  <button key={agent.agentId}
                    onClick={() => setActiveTab(("borrador-" + i) as "borrador-0" | "borrador-1" | "borrador-2")}
                    className="flex items-center gap-2 px-4 py-3.5 text-sm whitespace-nowrap transition-all flex-shrink-0"
                    style={{
                      borderBottom: activeTab === "borrador-" + i ? "2px solid " + agent.color : "2px solid transparent",
                      color: activeTab === "borrador-" + i ? agent.color : "#666688",
                      background: activeTab === "borrador-" + i ? agent.color + "08" : "transparent",
                      fontFamily: "JetBrains Mono, monospace", fontSize: "12px",
                    }}>
                    <div className="w-2 h-2 rounded-full" style={{ background: agent.color }} />
                    Borrador {i + 1}
                  </button>
                ))}

                {agentResults.filter(r => r.status === "error" || r.status === "skipped").map(agent => (
                  <div key={agent.agentId}
                    className="flex items-center gap-2 px-4 py-3.5 text-sm whitespace-nowrap flex-shrink-0 opacity-30"
                    style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "12px", color: "#666688" }}>
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    {agent.status === "skipped" ? "Sin key" : "Error"}
                  </div>
                ))}
              </div>

              <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid #1e1e2a" }}>
                <div>
                  <div className="font-display text-lg" style={{ color: activeTab === "definitivo" ? "#e8cc7a" : "#f9f6ef" }}>
                    {currentLabel}
                  </div>
                  {activeTab === "definitivo" && (
                    <div className="text-xs mt-0.5" style={{ color: "#c9a84c", fontFamily: "JetBrains Mono, monospace" }}>
                      Fusión de {successCount} borradores · Mistral Large
                    </div>
                  )}
                </div>
                {currentContent && (
                  <button onClick={() => handleDownload(currentContent, currentFilename)}
                    className="flex items-center gap-2 px-4 py-2 rounded-sm font-semibold transition-all hover:scale-[1.02]"
                    style={{
                      background: activeTab === "definitivo" ? "linear-gradient(135deg, #c9a84c, #9a7530)" : "#1a1a24",
                      color: activeTab === "definitivo" ? "#0a0a0f" : "#9898b0",
                      border: activeTab === "definitivo" ? "none" : "1px solid #2a2a38",
                      fontFamily: "Crimson Text, serif", fontSize: "15px",
                      boxShadow: activeTab === "definitivo" ? "0 0 20px #c9a84c30" : "none",
                    }}>
                    <Download className="w-4 h-4" /> .docx
                  </button>
                )}
              </div>

              {currentContent ? (
                <div className="px-6 py-6">
                  <div className="whitespace-pre-wrap overflow-y-auto pr-2"
                    style={{ fontFamily: "Crimson Text, serif", fontSize: "16px", color: "#e8e8ef", lineHeight: "1.8", maxHeight: "70vh" }}>
                    {currentContent}
                  </div>
                </div>
              ) : activeTab === "definitivo" && masterError ? (
                <div className="px-6 py-8 text-center">
                  <AlertCircle className="w-8 h-8 mx-auto mb-3" style={{ color: "#f87171" }} />
                  <p style={{ color: "#f87171", fontFamily: "JetBrains Mono, monospace", fontSize: "13px" }}>{masterError}</p>
                </div>
              ) : null}
            </div>

            {/* Parseo */}
            {parsedText && (
              <div className="rounded-sm overflow-hidden mb-6" style={{ border: "1px solid #2a2a38", background: "#111118" }}>
                <button onClick={() => setShowParsed(p => !p)}
                  className="w-full flex items-center justify-between px-6 py-4 hover:opacity-80 transition-opacity">
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4" style={{ color: "#c9a84c" }} />
                    <span className="font-display text-base">Datos extraídos del documento</span>
                    <span className="text-xs px-2 py-0.5 rounded"
                      style={{ background: "#4ade8015", color: "#4ade80", border: "1px solid #4ade8030", fontFamily: "JetBrains Mono, monospace" }}>
                      ✓ Parseado
                    </span>
                  </div>
                  {showParsed ? <ChevronUp className="w-4 h-4 opacity-40" /> : <ChevronDown className="w-4 h-4 opacity-40" />}
                </button>
                {showParsed && (
                  <div className="px-6 pb-6 border-t" style={{ borderColor: "#1e1e2a" }}>
                    <pre className="mt-4 text-xs leading-relaxed whitespace-pre-wrap overflow-auto"
                      style={{ fontFamily: "JetBrains Mono, monospace", color: "#9898b0" }}>
                      {parsedText}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Instrucciones */}
            <div className="rounded-sm p-8 mb-8" style={{ background: "#c9a84c08", border: "1px solid #c9a84c30" }}>
              <h2 className="font-display text-2xl mb-4" style={{ color: "#e8cc7a" }}>📋 Instrucciones de presentación</h2>
              <div className="whitespace-pre-wrap opacity-80" style={{ fontFamily: "Crimson Text, serif", fontSize: "16px", lineHeight: "1.8" }}>
                {instructions}
              </div>
            </div>

            <div className="flex justify-center">
              <button onClick={handleReset}
                className="px-8 py-4 rounded-sm font-semibold text-lg border transition-all"
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

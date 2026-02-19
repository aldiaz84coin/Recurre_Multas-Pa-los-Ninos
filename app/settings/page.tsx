"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Scale, ArrowLeft, Save, Eye, EyeOff, CheckCircle, XCircle,
  Loader, Wifi, WifiOff, ExternalLink, AlertTriangle, RefreshCw,
} from "lucide-react";
import toast from "react-hot-toast";

interface AgentConfig {
  id: string;
  name: string;
  provider: "groq" | "gemini" | "openrouter" | "openai" | "custom";
  model: string;
  apiKey: string;
  baseUrl?: string;
  enabled: boolean;
  role: string;
}

type ConnectionStatus = "idle" | "testing" | "ok" | "error";

interface AgentStatus {
  status: ConnectionStatus;
  message: string;
  latency?: number;
}

const PROVIDERS = {
  groq: {
    label: "Groq",
    models: ["llama-3.1-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"],
    baseUrl: "https://api.groq.com/openai/v1",
    freeInfo: "Free tier · 14.4k tokens/min",
    signupUrl: "https://console.groq.com",
    color: "#f97316",
    testModel: "llama-3.1-8b-instant",
  },
  gemini: {
    label: "Google Gemini",
    models: ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash-exp"],
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    freeInfo: "Free tier · 15 RPM flash",
    signupUrl: "https://aistudio.google.com",
    color: "#4285f4",
    testModel: "gemini-1.5-flash",
  },
  openrouter: {
    label: "OpenRouter",
    models: [
      "meta-llama/llama-3.1-8b-instruct:free",
      "mistralai/mistral-7b-instruct:free",
      "google/gemma-2-9b-it:free",
      "qwen/qwen-2-7b-instruct:free",
    ],
    baseUrl: "https://openrouter.ai/api/v1",
    freeInfo: "Modelos :free disponibles",
    signupUrl: "https://openrouter.ai",
    color: "#8b5cf6",
    testModel: "meta-llama/llama-3.1-8b-instruct:free",
  },
  openai: {
    label: "OpenAI",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"],
    baseUrl: "https://api.openai.com/v1",
    freeInfo: "De pago · requiere créditos",
    signupUrl: "https://platform.openai.com",
    color: "#10a37f",
    testModel: "gpt-4o-mini",
  },
  custom: {
    label: "Custom / Ollama",
    models: [],
    baseUrl: "http://localhost:11434/v1",
    freeInfo: "Endpoint OpenAI-compatible propio",
    signupUrl: "",
    color: "#6b7280",
    testModel: "",
  },
};

const ROLES = [
  "Experto en derecho administrativo español",
  "Especialista en tráfico, movilidad y sanciones de tránsito",
  "Redactor jurídico de recursos y escritos legales",
];

const DEFAULT_AGENTS: AgentConfig[] = [
  { id: "agent-1", name: "Agente 1 — Análisis legal", provider: "groq", model: "llama-3.1-70b-versatile", apiKey: "", enabled: true, role: ROLES[0] },
  { id: "agent-2", name: "Agente 2 — Legislación específica", provider: "gemini", model: "gemini-1.5-flash", apiKey: "", enabled: true, role: ROLES[1] },
  { id: "agent-3", name: "Agente 3 — Redacción del recurso", provider: "openrouter", model: "meta-llama/llama-3.1-8b-instruct:free", apiKey: "", enabled: true, role: ROLES[2] },
];

// ─── Connection tester (runs in browser, directly to provider API) ────────────

async function testConnection(agent: AgentConfig): Promise<{ ok: boolean; message: string; latency: number }> {
  const start = Date.now();

  try {
    if (agent.provider === "gemini") {
      const model = agent.model || "gemini-1.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${agent.apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Di solo: OK" }] }],
          generationConfig: { maxOutputTokens: 5, temperature: 0 },
        }),
      });
      const latency = Date.now() - start;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err?.error?.message || `HTTP ${res.status}`;
        return { ok: false, message: msg, latency };
      }
      return { ok: true, message: `Conectado · ${latency}ms`, latency };
    }

    // OpenAI-compatible
    const baseUrl = agent.baseUrl || "https://api.openai.com/v1";
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${agent.apiKey}`,
        ...(agent.provider === "openrouter"
          ? { "HTTP-Referer": "https://recursapp.vercel.app", "X-Title": "RecursApp" }
          : {}),
      },
      body: JSON.stringify({
        model: agent.model,
        messages: [{ role: "user", content: "Di solo: OK" }],
        max_tokens: 5,
        temperature: 0,
      }),
    });
    const latency = Date.now() - start;
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message || `HTTP ${res.status}`;
      return { ok: false, message: msg, latency };
    }
    return { ok: true, message: `Conectado · ${latency}ms`, latency };
  } catch (e: unknown) {
    const latency = Date.now() - start;
    const msg = e instanceof Error ? e.message : "Error de red";
    return { ok: false, message: msg, latency };
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [agents, setAgents] = useState<AgentConfig[]>(DEFAULT_AGENTS);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({});
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("recursapp_agents");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAgents(parsed);
        }
      }
    } catch {
      // ignore malformed storage
    }
  }, []);

  const updateAgent = useCallback((id: string, field: keyof AgentConfig, value: string | boolean) => {
    setAgents((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        const updated = { ...a, [field]: value };
        if (field === "provider") {
          const prov = PROVIDERS[value as keyof typeof PROVIDERS];
          updated.baseUrl = prov.baseUrl;
          updated.model = prov.models[0] || "";
        }
        return updated;
      })
    );
    // Clear status for this agent when config changes
    setStatuses((prev) => ({ ...prev, [id]: { status: "idle", message: "" } }));
    setDirty(true);
    setSaved(false);
  }, []);

  const handleSave = useCallback(() => {
    try {
      localStorage.setItem("recursapp_agents", JSON.stringify(agents));
      setSaved(true);
      setDirty(false);
      toast.success("Configuración guardada correctamente");
      setTimeout(() => setSaved(false), 3000);
    } catch {
      toast.error("Error al guardar en localStorage");
    }
  }, [agents]);

  const testAgent = useCallback(async (agent: AgentConfig) => {
    if (!agent.apiKey) {
      setStatuses((prev) => ({ ...prev, [agent.id]: { status: "error", message: "Introduce una API key primero" } }));
      return;
    }
    setStatuses((prev) => ({ ...prev, [agent.id]: { status: "testing", message: "Probando conexión…" } }));
    const result = await testConnection(agent);
    setStatuses((prev) => ({
      ...prev,
      [agent.id]: {
        status: result.ok ? "ok" : "error",
        message: result.message,
        latency: result.latency,
      },
    }));
  }, []);

  const testAllAgents = useCallback(async () => {
    const enabled = agents.filter((a) => a.enabled && a.apiKey);
    if (enabled.length === 0) {
      toast.error("No hay agentes activos con API key");
      return;
    }
    await Promise.all(enabled.map(testAgent));
  }, [agents, testAgent]);

  const StatusBadge = ({ agentId }: { agentId: string }) => {
    const s = statuses[agentId];
    if (!s || s.status === "idle") return null;

    const cfg = {
      testing: { icon: <Loader className="w-3.5 h-3.5 animate-spin" />, color: "#c9a84c", bg: "#c9a84c15", label: s.message },
      ok: { icon: <CheckCircle className="w-3.5 h-3.5" />, color: "#4ade80", bg: "#4ade8015", label: s.message },
      error: { icon: <XCircle className="w-3.5 h-3.5" />, color: "#f87171", bg: "#f8717115", label: s.message },
    }[s.status];

    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs"
        style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}30`, fontFamily: "JetBrains Mono, monospace" }}>
        {cfg.icon}
        <span className="max-w-xs truncate">{cfg.label}</span>
      </div>
    );
  };

  const ProviderDot = ({ provider }: { provider: keyof typeof PROVIDERS }) => (
    <span className="w-2 h-2 rounded-full inline-block" style={{ background: PROVIDERS[provider].color }} />
  );

  return (
    <main className="min-h-screen">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b sticky top-0 z-50"
        style={{ borderColor: "#2a2a38", background: "#0a0a0fee", backdropFilter: "blur(12px)" }}>
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity text-sm">
            <ArrowLeft className="w-4 h-4" /> Volver
          </Link>
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5" style={{ color: "#c9a84c" }} />
            <span className="font-display font-bold text-lg"
              style={{ background: "linear-gradient(135deg, #e8cc7a, #c9a84c)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              RecursApp
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {dirty && (
            <span className="text-xs flex items-center gap-1.5" style={{ color: "#c9a84c", fontFamily: "JetBrains Mono, monospace" }}>
              <AlertTriangle className="w-3 h-3" /> Sin guardar
            </span>
          )}
          <button onClick={testAllAgents}
            className="flex items-center gap-2 px-4 py-2 rounded-sm text-sm border transition-all hover:opacity-100 opacity-70"
            style={{ borderColor: "#2a2a38", color: "#9898b0", fontFamily: "JetBrains Mono, monospace", fontSize: "12px" }}>
            <Wifi className="w-3.5 h-3.5" /> Probar todos
          </button>
          <button onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2 rounded-sm font-semibold transition-all hover:scale-[1.02]"
            style={{
              background: saved ? "#1a3a1a" : "linear-gradient(135deg, #c9a84c, #9a7530)",
              color: saved ? "#4ade80" : "#0a0a0f",
              fontFamily: "Crimson Text, serif",
              fontSize: "16px",
              border: saved ? "1px solid #4ade8040" : "none",
            }}>
            {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? "Guardado" : "Guardar"}
          </button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-8 py-10">
        <div className="mb-10">
          <h1 className="font-display text-5xl mb-2">Agentes LLM</h1>
          <p className="opacity-50 text-base" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "13px" }}>
            Configura los proveedores · Las API keys se guardan solo en tu navegador
          </p>
        </div>

        {/* Global status overview */}
        <div className="grid grid-cols-3 gap-3 mb-10">
          {agents.map((agent) => {
            const s = statuses[agent.id];
            const isOk = s?.status === "ok";
            const isErr = s?.status === "error";
            const isTesting = s?.status === "testing";
            const hasKey = !!agent.apiKey;

            return (
              <div key={agent.id} className="rounded-sm p-4 flex items-center gap-3"
                style={{
                  background: "#111118",
                  border: `1px solid ${isOk ? "#4ade8030" : isErr ? "#f8717130" : "#2a2a38"}`,
                }}>
                <div className="relative flex-shrink-0">
                  <ProviderDot provider={agent.provider} />
                  {isOk && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate" style={{ color: "#f9f6ef" }}>
                    {PROVIDERS[agent.provider].label}
                  </p>
                  <p className="text-xs truncate" style={{ color: "#44445a", fontFamily: "JetBrains Mono, monospace", fontSize: "11px" }}>
                    {agent.model.split("/").pop()}
                  </p>
                </div>
                <div className="flex-shrink-0">
                  {isTesting ? (
                    <Loader className="w-4 h-4 animate-spin" style={{ color: "#c9a84c" }} />
                  ) : isOk ? (
                    <Wifi className="w-4 h-4" style={{ color: "#4ade80" }} />
                  ) : isErr ? (
                    <WifiOff className="w-4 h-4" style={{ color: "#f87171" }} />
                  ) : hasKey ? (
                    <Wifi className="w-4 h-4 opacity-20" style={{ color: "#9898b0" }} />
                  ) : (
                    <WifiOff className="w-4 h-4 opacity-20" style={{ color: "#44445a" }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Agent cards */}
        <div className="space-y-6">
          {agents.map((agent, idx) => {
            const prov = PROVIDERS[agent.provider];
            const s = statuses[agent.id];

            return (
              <div key={agent.id} className="rounded-sm overflow-hidden"
                style={{
                  border: `1px solid ${s?.status === "ok" ? "#4ade8030" : s?.status === "error" ? "#f8717130" : "#2a2a38"}`,
                  background: "linear-gradient(135deg, #111118, #1a1a24)",
                  opacity: agent.enabled ? 1 : 0.5,
                }}>

                {/* Card header */}
                <div className="flex items-center justify-between px-6 py-4 border-b"
                  style={{ borderColor: "#2a2a38" }}>
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                      style={{ background: `${prov.color}20`, border: `1px solid ${prov.color}40`, color: prov.color, fontFamily: "JetBrains Mono, monospace" }}>
                      {idx + 1}
                    </div>
                    <div>
                      <input type="text" value={agent.name}
                        onChange={(e) => updateAgent(agent.id, "name", e.target.value)}
                        className="bg-transparent font-display text-lg focus:outline-none border-b border-transparent transition-colors"
                        style={{ color: "#f9f6ef" }}
                        onFocus={(e) => (e.target.style.borderColor = "#c9a84c50")}
                        onBlur={(e) => (e.target.style.borderColor = "transparent")}
                      />
                      <div className="flex items-center gap-2 mt-0.5">
                        <ProviderDot provider={agent.provider} />
                        <span className="text-xs" style={{ color: prov.color, fontFamily: "JetBrains Mono, monospace" }}>
                          {prov.label}
                        </span>
                        <span className="text-xs opacity-30">·</span>
                        <span className="text-xs opacity-40" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "11px" }}>
                          {agent.model.split("/").pop()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <StatusBadge agentId={agent.id} />

                    {/* Test button */}
                    <button onClick={() => testAgent(agent)}
                      disabled={s?.status === "testing"}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs border transition-all hover:opacity-100"
                      style={{
                        borderColor: "#2a2a38",
                        color: "#9898b0",
                        fontFamily: "JetBrains Mono, monospace",
                        opacity: s?.status === "testing" ? 0.5 : 0.7,
                        cursor: s?.status === "testing" ? "not-allowed" : "pointer",
                      }}>
                      {s?.status === "testing"
                        ? <Loader className="w-3 h-3 animate-spin" />
                        : <RefreshCw className="w-3 h-3" />}
                      Probar
                    </button>

                    {/* Enable toggle */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs opacity-40" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "11px" }}>
                        {agent.enabled ? "ON" : "OFF"}
                      </span>
                      <button
                        onClick={() => updateAgent(agent.id, "enabled", !agent.enabled)}
                        className="w-10 h-5 rounded-full transition-all relative"
                        style={{ background: agent.enabled ? "#c9a84c" : "#2a2a38" }}>
                        <div className="w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all"
                          style={{ left: agent.enabled ? "22px" : "2px" }} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Card body */}
                <div className="p-6 grid md:grid-cols-2 gap-5">
                  {/* Provider */}
                  <div>
                    <label className="block text-xs mb-2 uppercase tracking-widest opacity-40"
                      style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "10px" }}>
                      Proveedor
                    </label>
                    <select value={agent.provider}
                      onChange={(e) => updateAgent(agent.id, "provider", e.target.value)}
                      className="w-full px-3 py-2.5 rounded-sm text-sm focus:outline-none appearance-none"
                      style={{ background: "#0a0a0f", border: "1px solid #2a2a38", color: "#f9f6ef", fontFamily: "Crimson Text, serif", fontSize: "16px" }}>
                      {Object.entries(PROVIDERS).map(([key, p]) => (
                        <option key={key} value={key}>{p.label}</option>
                      ))}
                    </select>
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-xs" style={{ color: prov.color, fontFamily: "JetBrains Mono, monospace", fontSize: "11px" }}>
                        {prov.freeInfo}
                      </p>
                      {prov.signupUrl && (
                        <a href={prov.signupUrl} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs opacity-40 hover:opacity-100 transition-opacity"
                          style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "11px" }}>
                          Obtener key <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Model */}
                  <div>
                    <label className="block text-xs mb-2 uppercase tracking-widest opacity-40"
                      style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "10px" }}>
                      Modelo
                    </label>
                    {agent.provider === "custom" ? (
                      <input type="text" value={agent.model}
                        onChange={(e) => updateAgent(agent.id, "model", e.target.value)}
                        placeholder="ej: llama3, mistral…"
                        className="w-full px-3 py-2.5 rounded-sm text-sm focus:outline-none"
                        style={{ background: "#0a0a0f", border: "1px solid #2a2a38", color: "#f9f6ef", fontFamily: "JetBrains Mono, monospace", fontSize: "13px" }}
                      />
                    ) : (
                      <select value={agent.model}
                        onChange={(e) => updateAgent(agent.id, "model", e.target.value)}
                        className="w-full px-3 py-2.5 rounded-sm text-sm focus:outline-none appearance-none"
                        style={{ background: "#0a0a0f", border: "1px solid #2a2a38", color: "#f9f6ef", fontFamily: "JetBrains Mono, monospace", fontSize: "13px" }}>
                        {prov.models.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* API Key */}
                  <div>
                    <label className="block text-xs mb-2 uppercase tracking-widest opacity-40"
                      style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "10px" }}>
                      API Key
                    </label>
                    <div className="relative">
                      <input
                        type={showKeys[agent.id] ? "text" : "password"}
                        value={agent.apiKey}
                        onChange={(e) => updateAgent(agent.id, "apiKey", e.target.value)}
                        placeholder={agent.provider === "gemini" ? "AIza…" : "sk-…"}
                        className="w-full px-3 py-2.5 pr-10 rounded-sm text-sm focus:outline-none"
                        style={{
                          background: "#0a0a0f",
                          border: `1px solid ${agent.apiKey ? (s?.status === "ok" ? "#4ade8050" : s?.status === "error" ? "#f8717150" : "#c9a84c40") : "#2a2a38"}`,
                          color: "#f9f6ef",
                          fontFamily: "JetBrains Mono, monospace",
                          fontSize: "13px",
                        }}
                      />
                      <button type="button" onClick={() => setShowKeys((p) => ({ ...p, [agent.id]: !p[agent.id] }))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 opacity-30 hover:opacity-80 transition-opacity">
                        {showKeys[agent.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {/* Key presence indicator */}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {agent.apiKey ? (
                        <>
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#4ade80" }} />
                          <span className="text-xs" style={{ color: "#4ade8080", fontFamily: "JetBrains Mono, monospace", fontSize: "10px" }}>
                            Key introducida · {agent.apiKey.length} caracteres
                          </span>
                        </>
                      ) : (
                        <>
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#44445a" }} />
                          <span className="text-xs opacity-30" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "10px" }}>
                            Sin API key
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Role */}
                  <div>
                    <label className="block text-xs mb-2 uppercase tracking-widest opacity-40"
                      style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "10px" }}>
                      Rol del agente
                    </label>
                    <input type="text" value={agent.role}
                      onChange={(e) => updateAgent(agent.id, "role", e.target.value)}
                      className="w-full px-3 py-2.5 rounded-sm text-sm focus:outline-none"
                      style={{ background: "#0a0a0f", border: "1px solid #2a2a38", color: "#f9f6ef", fontFamily: "Crimson Text, serif", fontSize: "16px" }}
                    />
                  </div>

                  {/* Custom BaseURL */}
                  {agent.provider === "custom" && (
                    <div className="md:col-span-2">
                      <label className="block text-xs mb-2 uppercase tracking-widest opacity-40"
                        style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "10px" }}>
                        Base URL
                      </label>
                      <input type="text" value={agent.baseUrl || ""}
                        onChange={(e) => updateAgent(agent.id, "baseUrl", e.target.value)}
                        placeholder="http://localhost:11434/v1"
                        className="w-full px-3 py-2.5 rounded-sm focus:outline-none"
                        style={{ background: "#0a0a0f", border: "1px solid #2a2a38", color: "#f9f6ef", fontFamily: "JetBrains Mono, monospace", fontSize: "13px" }}
                      />
                    </div>
                  )}
                </div>

                {/* Error detail */}
                {s?.status === "error" && (
                  <div className="px-6 pb-4">
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-sm"
                      style={{ background: "#f8717108", border: "1px solid #f8717130" }}>
                      <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: "#f87171" }} />
                      <p className="text-xs" style={{ color: "#f87171", fontFamily: "JetBrains Mono, monospace", lineHeight: 1.6 }}>
                        {s.message}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom save */}
        <div className="mt-8 flex items-center justify-between pt-8 border-t" style={{ borderColor: "#2a2a38" }}>
          <p className="text-xs opacity-30" style={{ fontFamily: "JetBrains Mono, monospace" }}>
            Las API keys nunca salen de tu navegador — se envían desde el servidor solo al hacer análisis
          </p>
          <button onClick={handleSave}
            className="flex items-center gap-2 px-6 py-3 rounded-sm font-semibold transition-all hover:scale-[1.02]"
            style={{
              background: saved ? "#1a3a1a" : "linear-gradient(135deg, #c9a84c, #9a7530)",
              color: saved ? "#4ade80" : "#0a0a0f",
              fontFamily: "Playfair Display, serif",
              fontSize: "17px",
              border: saved ? "1px solid #4ade8040" : "none",
            }}>
            {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? "Guardado" : "Guardar configuración"}
          </button>
        </div>
      </div>
    </main>
  );
}

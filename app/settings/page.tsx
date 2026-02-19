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
    freeInfo: "Free · 14.4k tokens/min",
    signupUrl: "https://console.groq.com",
    color: "#f97316",
  },
  gemini: {
    label: "Google Gemini",
    models: ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash-exp"],
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    freeInfo: "Free · 15 RPM flash",
    signupUrl: "https://aistudio.google.com",
    color: "#4285f4",
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
  },
  openai: {
    label: "OpenAI",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"],
    baseUrl: "https://api.openai.com/v1",
    freeInfo: "De pago · requiere créditos",
    signupUrl: "https://platform.openai.com",
    color: "#10a37f",
  },
  custom: {
    label: "Custom / Ollama",
    models: [],
    baseUrl: "http://localhost:11434/v1",
    freeInfo: "Endpoint OpenAI-compatible",
    signupUrl: "",
    color: "#6b7280",
  },
};

const ROLES = [
  "Experto en derecho administrativo español",
  "Especialista en tráfico, movilidad y sanciones de tránsito",
  "Redactor jurídico de recursos y escritos legales",
];

const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: "agent-1",
    name: "Agente 1 — Análisis legal",
    provider: "groq",
    model: "llama-3.1-70b-versatile",
    apiKey: "",
    enabled: true,
    role: ROLES[0],
  },
  {
    id: "agent-2",
    name: "Agente 2 — Legislación específica",
    provider: "gemini",
    model: "gemini-1.5-flash",
    apiKey: "",
    enabled: true,
    role: ROLES[1],
  },
  {
    id: "agent-3",
    name: "Agente 3 — Redacción del recurso",
    provider: "openrouter",
    model: "meta-llama/llama-3.1-8b-instruct:free",
    apiKey: "",
    enabled: true,
    role: ROLES[2],
  },
];

const STORAGE_KEY = "recursapp_agents";

function loadAgents(): AgentConfig[] {
  if (typeof window === "undefined") return DEFAULT_AGENTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AGENTS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  return DEFAULT_AGENTS;
}

function saveAgents(agents: AgentConfig[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
    // Verify it actually saved
    const verify = localStorage.getItem(STORAGE_KEY);
    if (!verify) return false;
    JSON.parse(verify); // ensure parseable
    return true;
  } catch {
    return false;
  }
}

export default function SettingsPage() {
  const [agents, setAgents] = useState<AgentConfig[]>(DEFAULT_AGENTS);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({});
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setAgents(loadAgents());
    setMounted(true);
  }, []);

  const updateAgent = useCallback(
    (id: string, field: keyof AgentConfig, value: string | boolean) => {
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
      setStatuses((prev) => ({ ...prev, [id]: { status: "idle", message: "" } }));
      setDirty(true);
      setSaved(false);
    },
    []
  );

  const handleSave = useCallback(() => {
    const ok = saveAgents(agents);
    if (ok) {
      setSaved(true);
      setDirty(false);
      toast.success("Configuración guardada");
      setTimeout(() => setSaved(false), 3000);
    } else {
      toast.error("Error al guardar. ¿Está bloqueado el localStorage?");
    }
  }, [agents]);

  // Test via server endpoint to avoid CORS issues
  const testAgent = useCallback(async (agent: AgentConfig) => {
    if (!agent.apiKey) {
      setStatuses((prev) => ({
        ...prev,
        [agent.id]: { status: "error", message: "Introduce una API key primero" },
      }));
      return;
    }

    setStatuses((prev) => ({
      ...prev,
      [agent.id]: { status: "testing", message: "Conectando…" },
    }));

    try {
      const res = await fetch("/api/test-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: agent.provider,
          model: agent.model,
          apiKey: agent.apiKey,
          baseUrl: agent.baseUrl,
        }),
      });
      const data = await res.json();
      setStatuses((prev) => ({
        ...prev,
        [agent.id]: {
          status: data.ok ? "ok" : "error",
          message: data.message,
          latency: data.latency,
        },
      }));
    } catch {
      setStatuses((prev) => ({
        ...prev,
        [agent.id]: { status: "error", message: "No se pudo contactar con el servidor" },
      }));
    }
  }, []);

  const testAll = useCallback(async () => {
    const withKeys = agents.filter((a) => a.enabled && a.apiKey);
    if (withKeys.length === 0) {
      toast.error("Ningún agente tiene API key configurada");
      return;
    }
    toast("Probando todos los agentes…", { icon: "🔌" });
    await Promise.all(withKeys.map(testAgent));
  }, [agents, testAgent]);

  if (!mounted) return null;

  // Summary counts
  const okCount = Object.values(statuses).filter((s) => s.status === "ok").length;
  const errCount = Object.values(statuses).filter((s) => s.status === "error").length;
  const testedCount = okCount + errCount;

  return (
    <main className="min-h-screen">
      {/* Sticky nav */}
      <nav
        className="flex items-center justify-between px-8 py-5 border-b sticky top-0 z-50"
        style={{
          borderColor: "#2a2a38",
          background: "#0a0a0fee",
          backdropFilter: "blur(16px)",
        }}
      >
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity text-sm"
          >
            <ArrowLeft className="w-4 h-4" /> Volver
          </Link>
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5" style={{ color: "#c9a84c" }} />
            <span
              className="font-display font-bold text-lg"
              style={{
                background: "linear-gradient(135deg, #e8cc7a, #c9a84c)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              RecursApp
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {dirty && (
            <div
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
              style={{
                color: "#c9a84c",
                background: "#c9a84c15",
                border: "1px solid #c9a84c30",
                fontFamily: "JetBrains Mono, monospace",
              }}
            >
              <AlertTriangle className="w-3 h-3" />
              Sin guardar
            </div>
          )}

          <button
            onClick={testAll}
            className="flex items-center gap-2 px-4 py-2 rounded-sm text-sm border transition-all hover:border-gold"
            style={{
              borderColor: "#2a2a38",
              color: "#9898b0",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: "12px",
            }}
          >
            <Wifi className="w-3.5 h-3.5" /> Probar todos
          </button>

          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2 rounded-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: saved
                ? "#1a3a1a"
                : "linear-gradient(135deg, #c9a84c, #9a7530)",
              color: saved ? "#4ade80" : "#0a0a0f",
              fontFamily: "Crimson Text, serif",
              fontSize: "16px",
              border: saved ? "1px solid #4ade8040" : "none",
            }}
          >
            {saved ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saved ? "Guardado ✓" : "Guardar"}
          </button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-8 py-10">
        <div className="mb-8">
          <h1 className="font-display text-5xl mb-2">Agentes LLM</h1>
          <p
            className="opacity-40 text-sm"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            Las API keys se guardan únicamente en tu navegador (localStorage)
          </p>
        </div>

        {/* Status overview bar */}
        {testedCount > 0 && (
          <div
            className="flex items-center gap-4 px-5 py-3 rounded-sm mb-8"
            style={{ background: "#111118", border: "1px solid #2a2a38" }}
          >
            <span
              className="text-xs opacity-50"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Estado de conexión:
            </span>
            {okCount > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span
                  className="text-xs"
                  style={{ color: "#4ade80", fontFamily: "JetBrains Mono, monospace" }}
                >
                  {okCount} conectado{okCount > 1 ? "s" : ""}
                </span>
              </div>
            )}
            {errCount > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <span
                  className="text-xs"
                  style={{ color: "#f87171", fontFamily: "JetBrains Mono, monospace" }}
                >
                  {errCount} con error
                </span>
              </div>
            )}
          </div>
        )}

        {/* Agent cards */}
        <div className="space-y-5">
          {agents.map((agent, idx) => {
            const prov = PROVIDERS[agent.provider];
            const s = statuses[agent.id] ?? { status: "idle" as ConnectionStatus, message: "" };

            const borderColor =
              s.status === "ok"
                ? "#4ade8035"
                : s.status === "error"
                ? "#f8717135"
                : "#2a2a38";

            return (
              <div
                key={agent.id}
                className="rounded-sm overflow-hidden transition-all"
                style={{
                  border: `1px solid ${borderColor}`,
                  background: "linear-gradient(160deg, #111118, #1a1a24)",
                  opacity: agent.enabled ? 1 : 0.45,
                }}
              >
                {/* Header */}
                <div
                  className="flex items-center justify-between px-6 py-4 border-b"
                  style={{ borderColor: "#1e1e2a" }}
                >
                  <div className="flex items-center gap-4">
                    {/* Index badge */}
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                      style={{
                        background: `${prov.color}18`,
                        border: `1px solid ${prov.color}35`,
                        color: prov.color,
                        fontFamily: "JetBrains Mono, monospace",
                      }}
                    >
                      {idx + 1}
                    </div>

                    <div>
                      {/* Editable name */}
                      <input
                        type="text"
                        value={agent.name}
                        onChange={(e) =>
                          updateAgent(agent.id, "name", e.target.value)
                        }
                        className="bg-transparent font-display text-lg focus:outline-none border-b border-transparent transition-colors w-full"
                        style={{ color: "#f9f6ef", maxWidth: 280 }}
                        onFocus={(e) =>
                          (e.target.style.borderColor = "#c9a84c50")
                        }
                        onBlur={(e) =>
                          (e.target.style.borderColor = "transparent")
                        }
                      />
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className="w-1.5 h-1.5 rounded-full inline-block"
                          style={{ background: prov.color }}
                        />
                        <span
                          className="text-xs"
                          style={{
                            color: prov.color,
                            fontFamily: "JetBrains Mono, monospace",
                            fontSize: "11px",
                          }}
                        >
                          {prov.label}
                        </span>
                        <span className="text-xs opacity-20">·</span>
                        <span
                          className="text-xs opacity-40 truncate max-w-[180px]"
                          style={{
                            fontFamily: "JetBrains Mono, monospace",
                            fontSize: "11px",
                          }}
                        >
                          {agent.model.split("/").pop()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {/* Connection status pill */}
                    <div className="min-w-[120px] flex justify-end">
                      {s.status === "idle" && agent.apiKey && (
                        <div
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs"
                          style={{
                            background: "#1a1a24",
                            border: "1px solid #2a2a38",
                            color: "#44445a",
                            fontFamily: "JetBrains Mono, monospace",
                          }}
                        >
                          <WifiOff className="w-3 h-3" />
                          Sin probar
                        </div>
                      )}
                      {s.status === "testing" && (
                        <div
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs"
                          style={{
                            background: "#c9a84c12",
                            border: "1px solid #c9a84c30",
                            color: "#c9a84c",
                            fontFamily: "JetBrains Mono, monospace",
                          }}
                        >
                          <Loader className="w-3 h-3 animate-spin" />
                          Probando…
                        </div>
                      )}
                      {s.status === "ok" && (
                        <div
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs"
                          style={{
                            background: "#4ade8012",
                            border: "1px solid #4ade8035",
                            color: "#4ade80",
                            fontFamily: "JetBrains Mono, monospace",
                          }}
                        >
                          <Wifi className="w-3 h-3" />
                          {s.message}
                        </div>
                      )}
                      {s.status === "error" && (
                        <div
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs max-w-[200px]"
                          style={{
                            background: "#f8717112",
                            border: "1px solid #f8717135",
                            color: "#f87171",
                            fontFamily: "JetBrains Mono, monospace",
                          }}
                        >
                          <XCircle className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{s.message}</span>
                        </div>
                      )}
                    </div>

                    {/* Test button */}
                    <button
                      onClick={() => testAgent(agent)}
                      disabled={s.status === "testing"}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs border transition-all hover:border-gold hover:opacity-100 opacity-60"
                      style={{
                        borderColor: "#2a2a38",
                        color: "#9898b0",
                        fontFamily: "JetBrains Mono, monospace",
                        cursor: s.status === "testing" ? "not-allowed" : "pointer",
                      }}
                    >
                      {s.status === "testing" ? (
                        <Loader className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      Probar
                    </button>

                    {/* Toggle */}
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs"
                        style={{
                          color: agent.enabled ? "#c9a84c" : "#44445a",
                          fontFamily: "JetBrains Mono, monospace",
                          fontSize: "10px",
                        }}
                      >
                        {agent.enabled ? "ON" : "OFF"}
                      </span>
                      <button
                        onClick={() =>
                          updateAgent(agent.id, "enabled", !agent.enabled)
                        }
                        className="w-10 h-5 rounded-full transition-all relative flex-shrink-0"
                        style={{
                          background: agent.enabled ? "#c9a84c" : "#2a2a38",
                        }}
                      >
                        <div
                          className="w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all"
                          style={{ left: agent.enabled ? "22px" : "2px" }}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Error detail banner */}
                {s.status === "error" && (
                  <div
                    className="px-6 py-3 flex items-start gap-2 border-b"
                    style={{
                      background: "#f8717108",
                      borderColor: "#f8717120",
                    }}
                  >
                    <XCircle
                      className="w-4 h-4 flex-shrink-0 mt-0.5"
                      style={{ color: "#f87171" }}
                    />
                    <div>
                      <p
                        className="text-xs font-semibold mb-0.5"
                        style={{
                          color: "#f87171",
                          fontFamily: "JetBrains Mono, monospace",
                        }}
                      >
                        Error de conexión
                      </p>
                      <p
                        className="text-xs opacity-80"
                        style={{
                          color: "#f87171",
                          fontFamily: "JetBrains Mono, monospace",
                          lineHeight: 1.6,
                        }}
                      >
                        {s.message}
                      </p>
                    </div>
                  </div>
                )}

                {/* Body */}
                <div className="p-6 grid md:grid-cols-2 gap-5">
                  {/* Provider */}
                  <div>
                    <label
                      className="block mb-2 uppercase tracking-widest opacity-40"
                      style={{
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: "10px",
                      }}
                    >
                      Proveedor
                    </label>
                    <select
                      value={agent.provider}
                      onChange={(e) =>
                        updateAgent(agent.id, "provider", e.target.value)
                      }
                      className="w-full px-3 py-2.5 rounded-sm focus:outline-none appearance-none"
                      style={{
                        background: "#0a0a0f",
                        border: "1px solid #2a2a38",
                        color: "#f9f6ef",
                        fontFamily: "Crimson Text, serif",
                        fontSize: "16px",
                      }}
                    >
                      {Object.entries(PROVIDERS).map(([key, p]) => (
                        <option key={key} value={key}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center justify-between mt-1.5">
                      <p
                        style={{
                          color: prov.color,
                          fontFamily: "JetBrains Mono, monospace",
                          fontSize: "11px",
                        }}
                      >
                        {prov.freeInfo}
                      </p>
                      {prov.signupUrl && (
                        <a
                          href={prov.signupUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 opacity-40 hover:opacity-100 transition-opacity"
                          style={{
                            fontFamily: "JetBrains Mono, monospace",
                            fontSize: "11px",
                            color: "#9898b0",
                          }}
                        >
                          Obtener key{" "}
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Model */}
                  <div>
                    <label
                      className="block mb-2 uppercase tracking-widest opacity-40"
                      style={{
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: "10px",
                      }}
                    >
                      Modelo
                    </label>
                    {agent.provider === "custom" ? (
                      <input
                        type="text"
                        value={agent.model}
                        onChange={(e) =>
                          updateAgent(agent.id, "model", e.target.value)
                        }
                        placeholder="ej: llama3, mistral…"
                        className="w-full px-3 py-2.5 rounded-sm focus:outline-none"
                        style={{
                          background: "#0a0a0f",
                          border: "1px solid #2a2a38",
                          color: "#f9f6ef",
                          fontFamily: "JetBrains Mono, monospace",
                          fontSize: "13px",
                        }}
                      />
                    ) : (
                      <select
                        value={agent.model}
                        onChange={(e) =>
                          updateAgent(agent.id, "model", e.target.value)
                        }
                        className="w-full px-3 py-2.5 rounded-sm focus:outline-none appearance-none"
                        style={{
                          background: "#0a0a0f",
                          border: "1px solid #2a2a38",
                          color: "#f9f6ef",
                          fontFamily: "JetBrains Mono, monospace",
                          fontSize: "13px",
                        }}
                      >
                        {prov.models.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* API Key */}
                  <div>
                    <label
                      className="block mb-2 uppercase tracking-widest opacity-40"
                      style={{
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: "10px",
                      }}
                    >
                      API Key
                    </label>
                    <div className="relative">
                      <input
                        type={showKeys[agent.id] ? "text" : "password"}
                        value={agent.apiKey}
                        onChange={(e) =>
                          updateAgent(agent.id, "apiKey", e.target.value)
                        }
                        placeholder={
                          agent.provider === "gemini" ? "AIza…" : "sk-…"
                        }
                        className="w-full px-3 py-2.5 pr-10 rounded-sm focus:outline-none"
                        style={{
                          background: "#0a0a0f",
                          border: `1px solid ${
                            s.status === "ok"
                              ? "#4ade8050"
                              : s.status === "error"
                              ? "#f8717150"
                              : agent.apiKey
                              ? "#c9a84c40"
                              : "#2a2a38"
                          }`,
                          color: "#f9f6ef",
                          fontFamily: "JetBrains Mono, monospace",
                          fontSize: "13px",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowKeys((p) => ({
                            ...p,
                            [agent.id]: !p[agent.id],
                          }))
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 opacity-30 hover:opacity-80 transition-opacity"
                      >
                        {showKeys[agent.id] ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    {/* Key indicator */}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {agent.apiKey ? (
                        <>
                          <div
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: "#4ade80" }}
                          />
                          <span
                            style={{
                              color: "#4ade8080",
                              fontFamily: "JetBrains Mono, monospace",
                              fontSize: "10px",
                            }}
                          >
                            Key guardada · {agent.apiKey.length} caracteres
                          </span>
                        </>
                      ) : (
                        <>
                          <div
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: "#44445a" }}
                          />
                          <span
                            style={{
                              color: "#44445a",
                              fontFamily: "JetBrains Mono, monospace",
                              fontSize: "10px",
                            }}
                          >
                            Sin API key — agente inactivo
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Role */}
                  <div>
                    <label
                      className="block mb-2 uppercase tracking-widest opacity-40"
                      style={{
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: "10px",
                      }}
                    >
                      Rol del agente
                    </label>
                    <input
                      type="text"
                      value={agent.role}
                      onChange={(e) =>
                        updateAgent(agent.id, "role", e.target.value)
                      }
                      className="w-full px-3 py-2.5 rounded-sm focus:outline-none"
                      style={{
                        background: "#0a0a0f",
                        border: "1px solid #2a2a38",
                        color: "#f9f6ef",
                        fontFamily: "Crimson Text, serif",
                        fontSize: "16px",
                      }}
                    />
                  </div>

                  {/* Custom base URL */}
                  {agent.provider === "custom" && (
                    <div className="md:col-span-2">
                      <label
                        className="block mb-2 uppercase tracking-widest opacity-40"
                        style={{
                          fontFamily: "JetBrains Mono, monospace",
                          fontSize: "10px",
                        }}
                      >
                        Base URL
                      </label>
                      <input
                        type="text"
                        value={agent.baseUrl || ""}
                        onChange={(e) =>
                          updateAgent(agent.id, "baseUrl", e.target.value)
                        }
                        placeholder="http://localhost:11434/v1"
                        className="w-full px-3 py-2.5 rounded-sm focus:outline-none"
                        style={{
                          background: "#0a0a0f",
                          border: "1px solid #2a2a38",
                          color: "#f9f6ef",
                          fontFamily: "JetBrains Mono, monospace",
                          fontSize: "13px",
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom bar */}
        <div
          className="mt-8 pt-8 flex items-center justify-between border-t"
          style={{ borderColor: "#2a2a38" }}
        >
          <p
            className="text-xs opacity-25"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            Las keys nunca se almacenan en el servidor · Solo se usan al generar el recurso
          </p>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-7 py-3 rounded-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: saved
                ? "#1a3a1a"
                : "linear-gradient(135deg, #c9a84c, #9a7530)",
              color: saved ? "#4ade80" : "#0a0a0f",
              fontFamily: "Playfair Display, serif",
              fontSize: "17px",
              border: saved ? "1px solid #4ade8040" : "none",
            }}
          >
            {saved ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            {saved ? "Guardado" : "Guardar configuración"}
          </button>
        </div>
      </div>
    </main>
  );
}

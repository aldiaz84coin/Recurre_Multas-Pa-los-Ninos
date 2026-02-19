"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Scale, ArrowLeft, Save, Eye, EyeOff, Info, CheckCircle } from "lucide-react";
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

const PROVIDERS = {
  groq: {
    label: "Groq (gratuito)",
    models: ["llama-3.1-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"],
    baseUrl: "https://api.groq.com/openai/v1",
    freeInfo: "Free tier: 14.4k tokens/min",
    signupUrl: "https://console.groq.com",
  },
  gemini: {
    label: "Google Gemini (gratuito)",
    models: ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash-exp"],
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    freeInfo: "Free tier: 15 RPM con gemini-flash",
    signupUrl: "https://aistudio.google.com",
  },
  openrouter: {
    label: "OpenRouter (modelos gratuitos)",
    models: ["meta-llama/llama-3.1-8b-instruct:free", "mistralai/mistral-7b-instruct:free", "google/gemma-2-9b-it:free", "qwen/qwen-2-7b-instruct:free"],
    baseUrl: "https://openrouter.ai/api/v1",
    freeInfo: "Muchos modelos gratuitos disponibles",
    signupUrl: "https://openrouter.ai",
  },
  openai: {
    label: "OpenAI",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"],
    baseUrl: "https://api.openai.com/v1",
    freeInfo: "De pago - requiere créditos",
    signupUrl: "https://platform.openai.com",
  },
  custom: {
    label: "Custom / Local (Ollama…)",
    models: [],
    baseUrl: "http://localhost:11434/v1",
    freeInfo: "Configura tu propio endpoint OpenAI-compatible",
    signupUrl: "",
  },
};

const ROLES = [
  "Experto en derecho administrativo",
  "Especialista en tráfico y movilidad",
  "Redactor jurídico y recursos legales",
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

export default function SettingsPage() {
  const [agents, setAgents] = useState<AgentConfig[]>(DEFAULT_AGENTS);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("recursapp_agents");
    if (stored) {
      try { setAgents(JSON.parse(stored)); } catch {}
    }
  }, []);

  const updateAgent = (id: string, field: keyof AgentConfig, value: string | boolean) => {
    setAgents(prev => prev.map(a => {
      if (a.id !== id) return a;
      const updated = { ...a, [field]: value };
      // Auto-set baseUrl and model when provider changes
      if (field === "provider") {
        const prov = PROVIDERS[value as keyof typeof PROVIDERS];
        updated.baseUrl = prov.baseUrl;
        updated.model = prov.models[0] || "";
      }
      return updated;
    }));
    setSaved(false);
  };

  const handleSave = () => {
    localStorage.setItem("recursapp_agents", JSON.stringify(agents));
    setSaved(true);
    toast.success("Configuración guardada");
    setTimeout(() => setSaved(false), 3000);
  };

  const toggleKey = (id: string) => {
    setShowKeys(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <main className="min-h-screen">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-6 border-b" style={{ borderColor: '#2a2a38' }}>
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity text-sm">
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Link>
          <div className="flex items-center gap-3">
            <Scale className="w-5 h-5" style={{ color: '#c9a84c' }} />
            <span className="font-display font-bold"
              style={{ background: 'linear-gradient(135deg, #e8cc7a, #c9a84c)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              RecursApp
            </span>
          </div>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-6 py-2.5 rounded-sm font-semibold transition-all hover:scale-[1.02]"
          style={{
            background: saved ? '#1a3a1a' : 'linear-gradient(135deg, #c9a84c, #9a7530)',
            color: saved ? '#4ade80' : '#0a0a0f',
            fontFamily: 'Crimson Text, serif',
            fontSize: '16px',
            border: saved ? '1px solid #4ade8040' : 'none',
          }}>
          {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? "Guardado" : "Guardar cambios"}
        </button>
      </nav>

      <div className="max-w-4xl mx-auto px-8 py-12">
        <div className="mb-12">
          <h1 className="font-display text-5xl mb-3">Configuración de agentes</h1>
          <p className="opacity-60 text-lg">
            Configura los tres agentes LLM que analizarán tu multa. Todos los proveedores tienen un nivel gratuito.
          </p>
        </div>

        {/* Info box */}
        <div className="flex gap-3 p-5 rounded-sm mb-10"
          style={{ background: '#c9a84c08', border: '1px solid #c9a84c30' }}>
          <Info className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#c9a84c' }} />
          <div className="text-sm opacity-80">
            <strong style={{ color: '#e8cc7a' }}>Tus API keys se guardan solo en tu navegador</strong> (localStorage).
            Nunca se envían a ningún servidor propio. Las llamadas a los LLMs se hacen directamente desde el servidor Next.js con las keys que configures.
          </div>
        </div>

        {/* Agents */}
        <div className="space-y-8">
          {agents.map((agent, idx) => {
            const prov = PROVIDERS[agent.provider];
            return (
              <div key={agent.id} className="card-dark rounded-sm p-8"
                style={{ borderColor: agent.enabled ? '#2a2a38' : '#1a1a1a', opacity: agent.enabled ? 1 : 0.5 }}>
                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-lg"
                      style={{ background: 'linear-gradient(135deg, #c9a84c30, #9a753030)', border: '1px solid #c9a84c40', color: '#c9a84c' }}>
                      {idx + 1}
                    </div>
                    <div>
                      <input
                        type="text"
                        value={agent.name}
                        onChange={e => updateAgent(agent.id, "name", e.target.value)}
                        className="bg-transparent font-display text-xl focus:outline-none border-b border-transparent focus:border-gold"
                        style={{ color: '#f9f6ef', borderColor: 'transparent' }}
                        onFocus={e => e.target.style.borderColor = '#c9a84c50'}
                        onBlur={e => e.target.style.borderColor = 'transparent'}
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-sm opacity-60">{agent.enabled ? "Activo" : "Inactivo"}</span>
                    <div
                      className="w-10 h-5 rounded-full transition-all cursor-pointer"
                      style={{ background: agent.enabled ? '#c9a84c' : '#2a2a38' }}
                      onClick={() => updateAgent(agent.id, "enabled", !agent.enabled)}>
                      <div className="w-4 h-4 bg-white rounded-full mt-0.5 transition-all"
                        style={{ marginLeft: agent.enabled ? '22px' : '2px' }} />
                    </div>
                  </label>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Provider */}
                  <div>
                    <label className="block text-xs mb-2 uppercase tracking-wider opacity-50"
                      style={{ fontFamily: 'JetBrains Mono, monospace' }}>Proveedor</label>
                    <select
                      value={agent.provider}
                      onChange={e => updateAgent(agent.id, "provider", e.target.value)}
                      className="w-full px-4 py-3 rounded-sm text-base focus:outline-none appearance-none"
                      style={{ background: '#111118', border: '1px solid #2a2a38', color: '#f9f6ef', fontFamily: 'Crimson Text, serif' }}>
                      {Object.entries(PROVIDERS).map(([key, p]) => (
                        <option key={key} value={key}>{p.label}</option>
                      ))}
                    </select>
                    <p className="text-xs mt-1.5 flex items-center gap-1"
                      style={{ color: '#c9a84c', fontFamily: 'JetBrains Mono, monospace' }}>
                      ✓ {prov.freeInfo}
                      {prov.signupUrl && (
                        <a href={prov.signupUrl} target="_blank" rel="noopener noreferrer"
                          className="ml-auto underline opacity-60 hover:opacity-100">
                          Obtener key →
                        </a>
                      )}
                    </p>
                  </div>

                  {/* Model */}
                  <div>
                    <label className="block text-xs mb-2 uppercase tracking-wider opacity-50"
                      style={{ fontFamily: 'JetBrains Mono, monospace' }}>Modelo</label>
                    {agent.provider === "custom" ? (
                      <input
                        type="text"
                        value={agent.model}
                        onChange={e => updateAgent(agent.id, "model", e.target.value)}
                        placeholder="ej: llama3, mistral..."
                        className="w-full px-4 py-3 rounded-sm text-base focus:outline-none"
                        style={{ background: '#111118', border: '1px solid #2a2a38', color: '#f9f6ef', fontFamily: 'Crimson Text, serif' }}
                      />
                    ) : (
                      <select
                        value={agent.model}
                        onChange={e => updateAgent(agent.id, "model", e.target.value)}
                        className="w-full px-4 py-3 rounded-sm text-base focus:outline-none appearance-none"
                        style={{ background: '#111118', border: '1px solid #2a2a38', color: '#f9f6ef', fontFamily: 'Crimson Text, serif' }}>
                        {prov.models.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* API Key */}
                  <div>
                    <label className="block text-xs mb-2 uppercase tracking-wider opacity-50"
                      style={{ fontFamily: 'JetBrains Mono, monospace' }}>API Key</label>
                    <div className="relative">
                      <input
                        type={showKeys[agent.id] ? "text" : "password"}
                        value={agent.apiKey}
                        onChange={e => updateAgent(agent.id, "apiKey", e.target.value)}
                        placeholder="sk-..."
                        className="w-full px-4 py-3 pr-12 rounded-sm text-base focus:outline-none"
                        style={{ background: '#111118', border: '1px solid #2a2a38', color: '#f9f6ef', fontFamily: 'JetBrains Mono, monospace', fontSize: '14px' }}
                      />
                      <button
                        type="button"
                        onClick={() => toggleKey(agent.id)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100 transition-opacity">
                        {showKeys[agent.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Role */}
                  <div>
                    <label className="block text-xs mb-2 uppercase tracking-wider opacity-50"
                      style={{ fontFamily: 'JetBrains Mono, monospace' }}>Rol del agente</label>
                    <input
                      type="text"
                      value={agent.role}
                      onChange={e => updateAgent(agent.id, "role", e.target.value)}
                      className="w-full px-4 py-3 rounded-sm text-base focus:outline-none"
                      style={{ background: '#111118', border: '1px solid #2a2a38', color: '#f9f6ef', fontFamily: 'Crimson Text, serif' }}
                    />
                  </div>

                  {/* Custom BaseURL */}
                  {agent.provider === "custom" && (
                    <div className="md:col-span-2">
                      <label className="block text-xs mb-2 uppercase tracking-wider opacity-50"
                        style={{ fontFamily: 'JetBrains Mono, monospace' }}>Base URL</label>
                      <input
                        type="text"
                        value={agent.baseUrl || ""}
                        onChange={e => updateAgent(agent.id, "baseUrl", e.target.value)}
                        placeholder="http://localhost:11434/v1"
                        className="w-full px-4 py-3 rounded-sm text-base focus:outline-none"
                        style={{ background: '#111118', border: '1px solid #2a2a38', color: '#f9f6ef', fontFamily: 'JetBrains Mono, monospace', fontSize: '14px' }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Save button bottom */}
        <div className="mt-10 flex justify-end">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-8 py-4 rounded-sm font-semibold text-lg transition-all hover:scale-[1.02]"
            style={{
              background: saved ? '#1a3a1a' : 'linear-gradient(135deg, #c9a84c, #9a7530)',
              color: saved ? '#4ade80' : '#0a0a0f',
              fontFamily: 'Playfair Display, serif',
            }}>
            {saved ? <CheckCircle className="w-5 h-5" /> : <Save className="w-5 h-5" />}
            {saved ? "Configuración guardada" : "Guardar configuración"}
          </button>
        </div>
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { Scale, ArrowLeft, ExternalLink, Terminal, CheckCircle } from "lucide-react";
import { FIXED_AGENTS } from "@/lib/llm";

const ENV_VARS: Record<string, string> = {
  mistral: "MISTRAL_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

export default function SettingsPage() {
  return (
    <main className="min-h-screen">
      <nav className="flex items-center justify-between px-8 py-5 border-b sticky top-0 z-50"
        style={{ borderColor: "#2a2a38", background: "#0a0a0fee", backdropFilter: "blur(16px)" }}>
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
      </nav>

      <div className="max-w-2xl mx-auto px-8 py-12">
        <div className="mb-10">
          <h1 className="font-display text-5xl mb-3">Configuración</h1>
          <p className="opacity-60 leading-relaxed" style={{ fontFamily: "Crimson Text, serif", fontSize: "17px" }}>
            Las API keys se configuran como variables de entorno en Vercel. Una vez configuradas,
            funcionan para todos los usuarios del equipo sin necesidad de introducirlas manualmente.
          </p>
        </div>

        {/* Agents info */}
        <div className="space-y-4 mb-10">
          <h2 className="font-display text-2xl mb-4">Agentes configurados</h2>
          {FIXED_AGENTS.map((agent) => (
            <div key={agent.id} className="rounded-sm overflow-hidden"
              style={{ border: "1px solid #2a2a38", background: "linear-gradient(160deg, #111118, #1a1a24)" }}>
              <div className="px-6 py-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
                    style={{ background: `${agent.color}18`, border: `1px solid ${agent.color}40`, color: agent.color, fontFamily: "JetBrains Mono, monospace" }}>
                    {agent.provider === "mistral" ? "M" : "OR"}
                  </div>
                  <div>
                    <div className="font-display text-lg">{agent.label}</div>
                    <div className="text-xs mt-0.5" style={{ color: agent.color, fontFamily: "JetBrains Mono, monospace" }}>
                      {agent.freeInfo}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1.5 rounded text-xs"
                    style={{ background: "#0a0a0f", border: "1px solid #2a2a38", color: "#9898b0", fontFamily: "JetBrains Mono, monospace" }}>
                    {ENV_VARS[agent.provider]}
                  </span>
                  <a href={agent.signupUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 opacity-40 hover:opacity-100 transition-opacity text-xs"
                    style={{ color: "#9898b0", fontFamily: "JetBrains Mono, monospace" }}>
                    Obtener key <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Setup instructions */}
        <div className="rounded-sm p-8 mb-6" style={{ background: "#111118", border: "1px solid #2a2a38" }}>
          <div className="flex items-center gap-3 mb-6">
            <Terminal className="w-5 h-5" style={{ color: "#c9a84c" }} />
            <h2 className="font-display text-xl">Cómo configurar en Vercel</h2>
          </div>

          <ol className="space-y-5" style={{ fontFamily: "Crimson Text, serif", fontSize: "17px" }}>
            <li className="flex gap-4">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                style={{ background: "#c9a84c20", color: "#c9a84c", fontFamily: "JetBrains Mono, monospace" }}>1</span>
              <div>
                <p className="opacity-80">Ve al dashboard de tu proyecto en Vercel</p>
                <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm mt-1 opacity-40 hover:opacity-100 transition-opacity"
                  style={{ color: "#c9a84c", fontFamily: "JetBrains Mono, monospace" }}>
                  vercel.com/dashboard <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                style={{ background: "#c9a84c20", color: "#c9a84c", fontFamily: "JetBrains Mono, monospace" }}>2</span>
              <p className="opacity-80">
                Entra en tu proyecto → <strong>Settings</strong> → <strong>Environment Variables</strong>
              </p>
            </li>
            <li className="flex gap-4">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                style={{ background: "#c9a84c20", color: "#c9a84c", fontFamily: "JetBrains Mono, monospace" }}>3</span>
              <div className="flex-1">
                <p className="opacity-80 mb-3">Añade las variables que quieras activar:</p>
                <div className="space-y-2">
                  {FIXED_AGENTS.map(agent => (
                    <div key={agent.id} className="flex items-center gap-3 px-4 py-2.5 rounded"
                      style={{ background: "#0a0a0f", border: "1px solid #1e1e2a" }}>
                      <div className="w-2 h-2 rounded-full" style={{ background: agent.color }} />
                      <code className="text-sm flex-1" style={{ color: "#e8cc7a", fontFamily: "JetBrains Mono, monospace" }}>
                        {ENV_VARS[agent.provider]}
                      </code>
                      <span className="text-xs opacity-40" style={{ fontFamily: "JetBrains Mono, monospace" }}>= sk-…</span>
                    </div>
                  ))}
                </div>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                style={{ background: "#c9a84c20", color: "#c9a84c", fontFamily: "JetBrains Mono, monospace" }}>4</span>
              <p className="opacity-80">
                Haz <strong>Redeploy</strong> del proyecto para que los cambios surtan efecto.
              </p>
            </li>
          </ol>
        </div>

        {/* Local dev tip */}
        <div className="rounded-sm p-6" style={{ background: "#c9a84c08", border: "1px solid #c9a84c20" }}>
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "#c9a84c" }} />
            <div>
              <p className="font-semibold mb-2" style={{ color: "#e8cc7a" }}>Para desarrollo local</p>
              <p className="opacity-70 text-sm mb-3" style={{ fontFamily: "Crimson Text, serif", fontSize: "16px" }}>
                Crea un archivo <code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "13px" }}>.env.local</code> en la raíz del proyecto:
              </p>
              <div className="px-4 py-3 rounded text-sm" style={{ background: "#0a0a0f", border: "1px solid #1e1e2a", fontFamily: "JetBrains Mono, monospace", fontSize: "13px", color: "#9898b0", lineHeight: "2" }}>
                MISTRAL_API_KEY=…<br />
                OPENROUTER_API_KEY=sk-or-…
              </div>
              <p className="opacity-40 text-xs mt-2" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                No subas este archivo a git — añádelo a .gitignore si no está ya.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link href="/recursos"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-sm font-semibold text-lg transition-all hover:scale-[1.02]"
            style={{ background: "linear-gradient(135deg, #c9a84c, #9a7530)", color: "#0a0a0f", fontFamily: "Playfair Display, serif" }}>
            Ir a recurrir multa →
          </Link>
        </div>
      </div>
    </main>
  );
}

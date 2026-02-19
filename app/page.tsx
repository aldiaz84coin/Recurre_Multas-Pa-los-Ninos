"use client";

import { useState } from "react";
import Link from "next/link";
import { Scale, FileText, Zap, Shield, ArrowRight, Settings } from "lucide-react";

export default function HomePage() {
  const [hovered, setHovered] = useState<number | null>(null);

  const steps = [
    { icon: FileText, title: "Sube tu multa", desc: "PDF o imagen de la notificación de la multa." },
    { icon: Shield, title: "Añade legislación", desc: "Documentos de apoyo: reglamentos, jurisprudencia, alegatos." },
    { icon: Zap, title: "3 IAs trabajan", desc: "Tres agentes LLM analizan y redactan en paralelo." },
    { icon: Scale, title: "Recurso listo", desc: "Documento fusionado y guía de presentación." },
  ];

  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full opacity-5"
          style={{ background: 'radial-gradient(circle, #c9a84c, transparent)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full opacity-5"
          style={{ background: 'radial-gradient(circle, #c9a84c, transparent)' }} />
        {/* Vertical lines */}
        <div className="absolute inset-y-0 left-[10%] w-px opacity-10"
          style={{ background: 'linear-gradient(to bottom, transparent, #c9a84c, transparent)' }} />
        <div className="absolute inset-y-0 right-[10%] w-px opacity-10"
          style={{ background: 'linear-gradient(to bottom, transparent, #c9a84c, transparent)' }} />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <Scale className="w-6 h-6 text-gold" style={{ color: '#c9a84c' }} />
          <span className="font-display font-bold text-xl tracking-tight text-gold-gradient"
            style={{ background: 'linear-gradient(135deg, #e8cc7a, #c9a84c)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            RecursApp
          </span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/settings"
            className="flex items-center gap-2 text-sm opacity-60 hover:opacity-100 transition-opacity"
            style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px' }}>
            <Settings className="w-4 h-4" />
            Configurar agentes
          </Link>
          <Link href="/recursos"
            className="flex items-center gap-2 px-5 py-2.5 rounded-sm text-sm font-semibold transition-all"
            style={{
              background: 'linear-gradient(135deg, #c9a84c, #9a7530)',
              color: '#0a0a0f',
              fontFamily: 'Crimson Text, serif',
              fontSize: '16px',
              letterSpacing: '0.02em',
            }}>
            Recurrir multa
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 max-w-5xl mx-auto px-8 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border mb-8 text-sm"
          style={{ borderColor: '#c9a84c30', background: '#c9a84c08', color: '#e8cc7a', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#c9a84c' }} />
          3 agentes LLM · análisis en paralelo · recurso profesional
        </div>

        <h1 className="font-display text-6xl md:text-7xl leading-tight mb-6"
          style={{ letterSpacing: '-0.02em' }}>
          Recurre tu multa
          <br />
          <em className="not-italic" style={{ background: 'linear-gradient(135deg, #e8cc7a, #c9a84c, #9a7530)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            con inteligencia artificial
          </em>
        </h1>

        <p className="text-xl max-w-2xl mx-auto mb-12 opacity-70" style={{ fontFamily: 'Crimson Text, serif' }}>
          Tres modelos LLM analizan tu multa de forma independiente y generan un recurso jurídico fundamentado,
          listo para presentar ante la administración.
        </p>

        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link href="/recursos"
            className="flex items-center gap-3 px-8 py-4 rounded-sm font-semibold text-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, #c9a84c, #9a7530)',
              color: '#0a0a0f',
              fontFamily: 'Playfair Display, serif',
              boxShadow: '0 0 40px #c9a84c20',
            }}>
            Empezar ahora
            <ArrowRight className="w-5 h-5" />
          </Link>
          <Link href="/settings"
            className="flex items-center gap-3 px-8 py-4 rounded-sm font-semibold text-lg transition-all border"
            style={{ borderColor: '#2a2a38', color: '#9898b0', fontFamily: 'Playfair Display, serif' }}>
            <Settings className="w-5 h-5" />
            Configurar IAs
          </Link>
        </div>
      </section>

      {/* Steps */}
      <section className="relative z-10 max-w-5xl mx-auto px-8 py-20">
        <div className="text-center mb-16">
          <p className="text-sm uppercase tracking-widest mb-3" style={{ color: '#c9a84c', fontFamily: 'JetBrains Mono, monospace', fontSize: '11px' }}>
            Cómo funciona
          </p>
          <h2 className="font-display text-4xl">Cuatro pasos, un recurso</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-0 relative">
          {/* Connector line */}
          <div className="hidden md:block absolute top-8 left-[12.5%] right-[12.5%] h-px"
            style={{ background: 'linear-gradient(to right, transparent, #c9a84c40, #c9a84c40, transparent)' }} />

          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div
                key={i}
                className="relative flex flex-col items-center text-center p-6 cursor-default transition-all"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                <div className="relative z-10 w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-all"
                  style={{
                    background: hovered === i ? 'linear-gradient(135deg, #c9a84c, #9a7530)' : '#1a1a24',
                    border: `1px solid ${hovered === i ? '#c9a84c' : '#2a2a38'}`,
                    boxShadow: hovered === i ? '0 0 30px #c9a84c40' : 'none',
                    transition: 'all 0.3s ease',
                  }}>
                  <Icon className="w-6 h-6" style={{ color: hovered === i ? '#0a0a0f' : '#c9a84c' }} />
                </div>
                <div className="w-6 h-6 rounded-full flex items-center justify-center mb-3 text-xs font-bold"
                  style={{ background: '#2a2a38', color: '#666688', fontFamily: 'JetBrains Mono, monospace' }}>
                  {i + 1}
                </div>
                <h3 className="font-display text-lg mb-2">{step.title}</h3>
                <p className="text-sm opacity-60 leading-relaxed">{step.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 max-w-5xl mx-auto px-8 py-20">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { label: 'Completamente gratuito', desc: 'Usa APIs con tier gratuito. Sin coste ocultos.', badge: 'FREE' },
            { label: 'Tres perspectivas', desc: 'Groq, Gemini y OpenRouter trabajan en paralelo para mayor cobertura jurídica.', badge: '3x LLMs' },
            { label: 'Descarga en Word', desc: 'Documento .docx listo para firmar y presentar, con estructura legal profesional.', badge: '.DOCX' },
          ].map((f, i) => (
            <div key={i} className="card-dark p-6 rounded-sm transition-all hover:border-gold"
              style={{ borderColor: '#2a2a38' }}>
              <div className="inline-flex items-center px-2 py-1 rounded text-xs mb-4"
                style={{ background: '#c9a84c15', color: '#c9a84c', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.1em' }}>
                {f.badge}
              </div>
              <h3 className="font-display text-xl mb-2">{f.label}</h3>
              <p className="opacity-60 text-base">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-3xl mx-auto px-8 py-24 text-center">
        <div className="card-dark rounded-sm p-12 border-gold-animated"
          style={{ borderColor: '#2a2a38' }}>
          <h2 className="font-display text-4xl mb-4">¿Tienes una multa?</h2>
          <p className="opacity-60 mb-8 text-lg">No la pagues sin antes intentar recurrirla. La IA puede ayudarte.</p>
          <Link href="/recursos"
            className="inline-flex items-center gap-3 px-8 py-4 rounded-sm font-semibold text-lg transition-all hover:scale-[1.02]"
            style={{
              background: 'linear-gradient(135deg, #c9a84c, #9a7530)',
              color: '#0a0a0f',
              fontFamily: 'Playfair Display, serif',
            }}>
            Crear mi recurso
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 text-center py-8 border-t opacity-30"
        style={{ borderColor: '#2a2a38', fontSize: '13px', fontFamily: 'JetBrains Mono, monospace' }}>
        RecursApp — Herramienta de apoyo. No constituye asesoramiento jurídico profesional.
      </footer>
    </main>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { Scale, FileText, Zap, Shield, ArrowRight, Settings, Flame } from "lucide-react";

export default function HomePage() {
  const [hovered, setHovered] = useState<number | null>(null);

  const steps = [
    { icon: FileText, title: "Sube tu multa", desc: "PDF o foto de la notificación. Lo que sea que te hayan metido." },
    { icon: Shield, title: "Añade contexto", desc: "Si tienes argumentos, fotos o documentos de apoyo, mejor." },
    { icon: Zap, title: "3 IAs al ataque", desc: "Tres modelos de lenguaje analizan y redactan en paralelo." },
    { icon: Scale, title: "Recurso listo", desc: "Descarga el Word, fírmalo y preséntalo. Así de simple." },
  ];

  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full opacity-5"
          style={{ background: "radial-gradient(circle, #c9a84c, transparent)" }} />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full opacity-5"
          style={{ background: "radial-gradient(circle, #c9a84c, transparent)" }} />
        <div className="absolute inset-y-0 left-[10%] w-px opacity-10"
          style={{ background: "linear-gradient(to bottom, transparent, #c9a84c, transparent)" }} />
        <div className="absolute inset-y-0 right-[10%] w-px opacity-10"
          style={{ background: "linear-gradient(to bottom, transparent, #c9a84c, transparent)" }} />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <Scale className="w-6 h-6" style={{ color: "#c9a84c" }} />
          <span className="font-display font-bold text-xl"
            style={{ background: "linear-gradient(135deg, #e8cc7a, #c9a84c)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            RecursApp
          </span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/settings"
            className="flex items-center gap-2 text-sm opacity-60 hover:opacity-100 transition-opacity"
            style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "13px" }}>
            <Settings className="w-4 h-4" />
            Configuración
          </Link>
          <Link href="/recursos"
            className="flex items-center gap-2 px-5 py-2.5 rounded-sm text-sm font-semibold transition-all hover:scale-[1.02]"
            style={{
              background: "linear-gradient(135deg, #c9a84c, #9a7530)",
              color: "#0a0a0f",
              fontFamily: "Crimson Text, serif",
              fontSize: "16px",
            }}>
            Recurrir multa
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 max-w-5xl mx-auto px-8 pt-20 pb-16 text-center">

        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border mb-8"
          style={{ borderColor: "#c9a84c30", background: "#c9a84c08", color: "#e8cc7a", fontFamily: "JetBrains Mono, monospace", fontSize: "12px" }}>
          <Flame className="w-3.5 h-3.5" style={{ color: "#c9a84c" }} />
          Hecho por amigos, para amigos · 100% libre de orejas
        </div>

        {/* Main title */}
        <h1 className="font-display leading-tight mb-6"
          style={{ fontSize: "clamp(2.2rem, 6vw, 4.5rem)", letterSpacing: "-0.02em" }}>
          <em className="not-italic block" style={{ background: "linear-gradient(135deg, #e8cc7a, #c9a84c, #9a7530)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            ¡¡No más multas
          </em>
          <em className="not-italic block" style={{ background: "linear-gradient(135deg, #e8cc7a, #c9a84c, #9a7530)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            pa los niños, se acabó!!
          </em>
        </h1>

        {/* Subtitle personal */}
        <p className="text-xl max-w-2xl mx-auto mb-6 opacity-80" style={{ fontFamily: "Crimson Text, serif", lineHeight: "1.7" }}>
          Hartos de orejazos y que nos sangren a multas, para que tengamos más para birra, os he hecho esto chavales . Sube la foto de tu multa y tres inteligencias artificiales
          te redactan el recurso administrativo en segundos.
        </p>
        <p className="text-base max-w-xl mx-auto mb-12 opacity-50" style={{ fontFamily: "Crimson Text, serif" }}>
          Sin abogados, sin costes, sin complicaciones. Solo pelea tu multa como mereces.
        </p>

        {/* CTAs */}
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link href="/recursos"
            className="flex items-center gap-3 px-8 py-4 rounded-sm font-semibold text-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, #c9a84c, #9a7530)",
              color: "#0a0a0f",
              fontFamily: "Playfair Display, serif",
              boxShadow: "0 0 40px #c9a84c25",
            }}>
            Recurrir mi oreja ahora
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>

        {/* Social proof line */}
        <p className="mt-8 text-sm opacity-30" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "12px" }}>
          · Mistral Pixtral · Gemini 2.0 Flash · Gemma 3 · análisis en paralelo ·
        </p>
      </section>

      {/* Personal manifesto */}
      <section className="relative z-10 max-w-3xl mx-auto px-8 py-10">
        <div className="rounded-sm p-8 text-center"
          style={{ background: "#c9a84c08", border: "1px solid #c9a84c25" }}>
          <p className="font-display text-2xl mb-4" style={{ color: "#e8cc7a" }}>
            ¿Por qué existe esto?
          </p>
          <p className="opacity-70 leading-relaxed" style={{ fontFamily: "Crimson Text, serif", fontSize: "18px" }}>
            Porque entre el grupo nos caían multas de tráfico, de zona azul, de velocidad...
            y siempre acabábamos pagando sin rechistar. Un día nos hartamos y dijimos:
            <strong style={{ color: "#e8cc7a" }}> "esto se puede recurrir"</strong>.
            Resulta que sí. Muchas veces. Y ahora tenemos IA para hacerlo en 2 minutos.
          </p>
          <p className="mt-4 opacity-50 text-sm" style={{ fontFamily: "JetBrains Mono, monospace" }}>
            — El grupo que se rebeló
          </p>
        </div>
      </section>

      {/* Steps */}
      <section className="relative z-10 max-w-5xl mx-auto px-8 py-16">
        <div className="text-center mb-14">
          <p className="text-sm uppercase tracking-widest mb-3" style={{ color: "#c9a84c", fontFamily: "JetBrains Mono, monospace", fontSize: "11px" }}>
            Cómo funciona
          </p>
          <h2 className="font-display text-4xl">Cuatro pasos, un recurso</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-0 relative">
          <div className="hidden md:block absolute top-8 left-[12.5%] right-[12.5%] h-px"
            style={{ background: "linear-gradient(to right, transparent, #c9a84c40, #c9a84c40, transparent)" }} />

          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={i} className="relative flex flex-col items-center text-center p-6 cursor-default"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}>
                <div className="relative z-10 w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-all"
                  style={{
                    background: hovered === i ? "linear-gradient(135deg, #c9a84c, #9a7530)" : "#1a1a24",
                    border: `1px solid ${hovered === i ? "#c9a84c" : "#2a2a38"}`,
                    boxShadow: hovered === i ? "0 0 30px #c9a84c40" : "none",
                    transition: "all 0.3s ease",
                  }}>
                  <Icon className="w-6 h-6" style={{ color: hovered === i ? "#0a0a0f" : "#c9a84c" }} />
                </div>
                <div className="w-6 h-6 rounded-full flex items-center justify-center mb-3 text-xs font-bold"
                  style={{ background: "#2a2a38", color: "#666688", fontFamily: "JetBrains Mono, monospace" }}>
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
      <section className="relative z-10 max-w-5xl mx-auto px-8 py-10">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { label: "Completamente gratuito", desc: "APIs con tier gratuito. Sin suscripciones, sin pagos, sin letra pequeña.", badge: "FREE" },
            { label: "Tres IAs, tres recursos", desc: "Mistral, Gemini y Gemma analizan la imagen de tu multa y redactan por separado. Eliges el mejor.", badge: "3× IA" },
            { label: "Listo para presentar", desc: "Descarga el .docx, imprímelo o preséntalo electrónicamente. Con instrucciones incluidas.", badge: ".DOCX" },
          ].map((f, i) => (
            <div key={i} className="card-dark p-6 rounded-sm transition-all hover:border-gold"
              style={{ borderColor: "#2a2a38" }}>
              <div className="inline-flex items-center px-2 py-1 rounded text-xs mb-4"
                style={{ background: "#c9a84c15", color: "#c9a84c", fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.1em" }}>
                {f.badge}
              </div>
              <h3 className="font-display text-xl mb-2">{f.label}</h3>
              <p className="opacity-60 text-base">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA bottom */}
      <section className="relative z-10 max-w-3xl mx-auto px-8 py-20 text-center">
        <div className="card-dark rounded-sm p-12 border-gold-animated" style={{ borderColor: "#2a2a38" }}>
          <p className="text-sm mb-3 opacity-40" style={{ fontFamily: "JetBrains Mono, monospace" }}>PARA EL GRUPO</p>
          <h2 className="font-display text-4xl mb-4">¿Te han puesto una multa?</h2>
          <p className="opacity-60 mb-8 text-lg" style={{ fontFamily: "Crimson Text, serif" }}>
            No la pagues sin antes intentar recurrirla. Cuesta 2 minutos y puede ahorrarte un pico.
          </p>
          <Link href="/recursos"
            className="inline-flex items-center gap-3 px-8 py-4 rounded-sm font-semibold text-lg transition-all hover:scale-[1.02]"
            style={{
              background: "linear-gradient(135deg, #c9a84c, #9a7530)",
              color: "#0a0a0f",
              fontFamily: "Playfair Display, serif",
            }}>
            <Flame className="w-5 h-5" />
            Recurrir ahora, gratis
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 text-center py-8 border-t opacity-30"
        style={{ borderColor: "#2a2a38", fontSize: "13px", fontFamily: "JetBrains Mono, monospace" }}>
        RecursApp — Proyecto personal entre amigos. No constituye asesoramiento jurídico profesional.
      </footer>
    </main>
  );
}

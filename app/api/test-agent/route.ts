/**
 * app/api/test-agent/route.ts
 */
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 20;

export async function POST(req: NextRequest) {
  try {
    const { provider, model, apiKey, baseUrl } = await req.json();

    if (!apiKey) {
      return NextResponse.json({ ok: false, message: "Sin API key" });
    }

    const start = Date.now();

    // ── Gemini ────────────────────────────────────────────────────────────────
    if (provider === "gemini") {
      //const m = model || "gemini-1.5-flash";
      const m = model || "gemini-2.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Reply with: OK" }] }],
          generationConfig: { maxOutputTokens: 5, temperature: 0 },
        }),
      });
      const latency = Date.now() - start;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return NextResponse.json({ ok: false, message: err?.error?.message || `HTTP ${res.status}`, latency });
      }
      return NextResponse.json({ ok: true, message: `Conectado · ${latency}ms`, latency });
    }

    // ── OpenRouter ────────────────────────────────────────────────────────────
    if (provider === "openrouter") {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://recursapp.vercel.app",
          "X-Title": "RecursApp",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Reply with: OK" }],
          max_tokens: 5,
          temperature: 0,
        }),
      });
      const latency = Date.now() - start;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err?.error?.message || `HTTP ${res.status}`;
        return NextResponse.json({ ok: false, message: msg, latency });
      }
      return NextResponse.json({ ok: true, message: `Conectado · ${latency}ms`, latency });
    }

    // ── Groq / OpenAI / Custom ────────────────────────────────────────────────
    const base = baseUrl || "https://api.openai.com/v1";
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with: OK" }],
        max_tokens: 5,
        temperature: 0,
      }),
    });
    const latency = Date.now() - start;
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ ok: false, message: err?.error?.message || `HTTP ${res.status}`, latency });
    }
    return NextResponse.json({ ok: true, message: `Conectado · ${latency}ms`, latency });

  } catch (err: unknown) {
    return NextResponse.json({
      ok: false,
      message: err instanceof Error ? err.message : "Error de red",
      latency: 0,
    });
  }
}

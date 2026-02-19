/**
 * app/api/test-agent/route.ts
 */
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 20;

export async function POST(req: NextRequest) {
  let body: { provider?: string; model?: string; apiKey?: string; baseUrl?: string } = {};

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Request body inválido" }, { status: 400 });
  }

  const { provider, model, apiKey, baseUrl } = body;

  if (!apiKey || !apiKey.trim()) {
    return NextResponse.json({ ok: false, message: "Sin API key configurada" });
  }

  if (!provider || !model) {
    return NextResponse.json({ ok: false, message: "Faltan provider o model" });
  }

  const start = Date.now();

  try {
    if (provider === "gemini") {
      const m = model || "gemini-1.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey.trim()}`;

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
        const errBody = await res.json().catch(() => ({}));
        const msg =
          errBody?.error?.message ||
          errBody?.error?.status ||
          `HTTP ${res.status} ${res.statusText}`;
        return NextResponse.json({ ok: false, message: msg, latency });
      }

      return NextResponse.json({ ok: true, message: `Conectado · ${latency}ms`, latency });
    }

    // OpenAI-compatible: Groq, OpenRouter, OpenAI, custom
    const base = (baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
    };

    if (provider === "openrouter") {
      headers["HTTP-Referer"] = "https://recursapp.vercel.app";
      headers["X-Title"] = "RecursApp";
    }

    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with: OK" }],
        max_tokens: 5,
        temperature: 0,
      }),
    });

    const latency = Date.now() - start;

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg =
        errBody?.error?.message ||
        errBody?.error?.code ||
        `HTTP ${res.status} ${res.statusText}`;
      return NextResponse.json({ ok: false, message: msg, latency });
    }

    return NextResponse.json({ ok: true, message: `Conectado · ${latency}ms`, latency });

  } catch (err: unknown) {
    const latency = Date.now() - start;
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, message: `Error de red: ${msg}`, latency });
  }
}

// Return 405 for non-POST with a clear message
export async function GET() {
  return NextResponse.json({ error: "Usa POST" }, { status: 405 });
}

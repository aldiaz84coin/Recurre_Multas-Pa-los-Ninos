/**
 * app/api/test-agent/route.ts
 * Tests a single agent connection server-side (avoids CORS issues)
 */

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 15;

export async function POST(req: NextRequest) {
  try {
    const { provider, model, apiKey, baseUrl } = await req.json();

    if (!apiKey) {
      return NextResponse.json({ ok: false, message: "Sin API key" });
    }

    const start = Date.now();

    if (provider === "gemini") {
      const m = model || "gemini-1.5-flash";
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
        const msg = err?.error?.message || `HTTP ${res.status}`;
        return NextResponse.json({ ok: false, message: msg, latency });
      }
      return NextResponse.json({ ok: true, message: `Conectado · ${latency}ms`, latency });
    }

    // OpenAI-compatible (Groq, OpenRouter, OpenAI, custom)
    const base = baseUrl || "https://api.openai.com/v1";
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(provider === "openrouter"
          ? { "HTTP-Referer": "https://recursapp.vercel.app", "X-Title": "RecursApp" }
          : {}),
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error de red";
    return NextResponse.json({ ok: false, message: msg, latency: 0 });
  }
}

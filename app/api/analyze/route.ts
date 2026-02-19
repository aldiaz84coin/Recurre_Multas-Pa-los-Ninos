/**
 * app/api/analyze/route.ts
 *
 * FASE 1 — Parseo visual (OpenRouter/auto · OPENROUTER_API_KEY)
 *   Lee la imagen/PDF y extrae todos los datos estructurados
 *
 * FASE 2 — 3 agentes en paralelo (Mistral Small + Llama 3.3 + DeepSeek V3)
 *   Cada uno redacta su propio borrador de recurso sobre el texto parseado
 *
 * FASE 3 — Agente maestro fusionador (Mistral Large o DeepSeek fallback)
 *   Recibe los 3 borradores y genera el RECURSO DEFINITIVO unificado
 */

import { NextRequest, NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import { callAgent, callMasterAgent, buildUserPrompt, generateInstructions, FIXED_AGENTS } from "@/lib/llm";

export const maxDuration = 120;

// ─── Prompt de parseo ─────────────────────────────────────────────────────────

const PARSE_PROMPT = `Eres un asistente especializado en leer documentos de multas y sanciones administrativas españolas.

Analiza este documento y extrae TODA la información visible. Rellena cada campo con exactamente lo que veas escrito (si un campo no aparece en el documento, escribe "No indicado"):

=== DATOS DE LA MULTA ===
ORGANISMO SANCIONADOR: 
DIRECCIÓN DEL ORGANISMO: 
EXPEDIENTE / BOLETÍN Nº: 
FECHA DE LA INFRACCIÓN: 
FECHA DE NOTIFICACIÓN: 
PLAZO PARA RECURRIR: 

=== INFRACCIÓN ===
TIPO DE INFRACCIÓN: 
ARTÍCULOS INFRINGIDOS: 
IMPORTE DE LA SANCIÓN: 
PUNTOS RETIRADOS: 
LUGAR DE LA INFRACCIÓN: 
MATRÍCULA / VEHÍCULO: 
MARCA Y MODELO: 

=== DATOS DEL DENUNCIADO ===
NOMBRE: 
DNI/NIF: 
DOMICILIO: 

=== TEXTO LITERAL RELEVANTE ===
[Transcribe el texto más importante: hechos, motivación, base legal citada, advertencias sobre plazos]

=== OBSERVACIONES ===
[Cualquier dato adicional visible útil para redactar el recurso]

Sé exhaustivo. No inventes datos — solo extrae lo que está escrito en el documento.`;

// ─── Fase 1: Parseo con OpenRouter/auto ──────────────────────────────────────

async function parseDocument(openrouterApiKey: string, base64: string, mimeType: string, fileName: string): Promise<string> {
  // PDFs con texto: intentar pdf-parse primero
  if (mimeType === "application/pdf") {
    try {
      const buffer = Buffer.from(base64, "base64");
      const parsed = await pdfParse(buffer);
      const text = (parsed.text || "").trim();
      if (text.length > 100) {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openrouterApiKey}`,
            "HTTP-Referer": "https://recursapp.vercel.app",
            "X-Title": "RecursApp",
          },
          body: JSON.stringify({
            model: "openrouter/auto",
            messages: [{ role: "user", content: `${PARSE_PROMPT}\n\nTEXTO DEL DOCUMENTO:\n${text}` }],
            max_tokens: 2000,
            temperature: 0.1,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const result = data.choices?.[0]?.message?.content || "";
          if (result.length > 50) return result;
        }
      }
    } catch { /* fallback a visión */ }
  }

  // Imagen o PDF escaneado: visión directa
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openrouterApiKey}`,
      "HTTP-Referer": "https://recursapp.vercel.app",
      "X-Title": "RecursApp",
    },
    body: JSON.stringify({
      model: "openrouter/auto",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: PARSE_PROMPT },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
        ],
      }],
      max_tokens: 2000,
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Parseo OCR ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || `[No se pudo parsear: ${fileName}]`;
}

// ─── Keys del servidor ────────────────────────────────────────────────────────

function getServerApiKeys() {
  return {
    mistral: process.env.MISTRAL_API_KEY || "",
    openrouter: process.env.OPENROUTER_API_KEY || "",
  };
}

// ─── Handler principal ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { multaFile, supportFiles, additionalContext } = body;

    if (!multaFile?.base64) {
      return NextResponse.json({ error: "No se proporcionó el documento de la multa" }, { status: 400 });
    }

    const apiKeys = getServerApiKeys();

    if (!apiKeys.openrouter) {
      return NextResponse.json({ error: "Se necesita OPENROUTER_API_KEY. Configúrala en Vercel." }, { status: 500 });
    }

    // ── FASE 1: Parsear ──────────────────────────────────────────────────────
    console.log("Fase 1: parseando documento...");
    let parsedText: string;
    try {
      parsedText = await parseDocument(apiKeys.openrouter, multaFile.base64, multaFile.type, multaFile.name);
      console.log("Parseo OK:", parsedText.slice(0, 120));
    } catch (err) {
      return NextResponse.json(
        { error: `Error al leer el documento: ${err instanceof Error ? err.message : "Error"}` },
        { status: 500 }
      );
    }

    // ── FASE 2: 3 agentes en paralelo ────────────────────────────────────────
    console.log("Fase 2: 3 agentes redactando en paralelo...");
    const supportFilesData = (supportFiles || []).map((sf: { name: string; context: string }) => ({
      name: sf.name, context: sf.context || "",
    }));
    const userPrompt = buildUserPrompt(parsedText, supportFilesData, additionalContext || "");

    const agentPromises = FIXED_AGENTS.map(async (agentDef) => {
      const key = apiKeys[agentDef.provider];
      if (!key) {
        return {
          agentId: agentDef.id, agentName: agentDef.name, label: agentDef.label, color: agentDef.color,
          status: "skipped" as const, content: "", error: "Sin API key configurada",
        };
      }
      const result = await callAgent({ ...agentDef, apiKey: key, enabled: true }, userPrompt);
      return {
        agentId: agentDef.id, agentName: agentDef.name, label: agentDef.label, color: agentDef.color,
        status: result.error ? ("error" as const) : ("done" as const),
        content: result.content, error: result.error,
      };
    });

    const settled = await Promise.allSettled(agentPromises);
    const agentResults = settled.map((r, idx) => {
      if (r.status === "fulfilled") return r.value;
      return {
        agentId: FIXED_AGENTS[idx].id, agentName: FIXED_AGENTS[idx].name,
        label: FIXED_AGENTS[idx].label, color: FIXED_AGENTS[idx].color,
        status: "error" as const, content: "", error: (r.reason as Error)?.message || "Error desconocido",
      };
    });

    // ── FASE 3: Agente maestro fusiona los borradores ────────────────────────
    console.log("Fase 3: agente maestro fusionando borradores...");
    const successfulDrafts = agentResults
      .filter(r => r.status === "done" && r.content)
      .map(r => ({ agentName: r.label, content: r.content }));

    const masterResult = await callMasterAgent(apiKeys, successfulDrafts);

    return NextResponse.json({
      agentResults,
      masterRecurso: masterResult.content,
      masterError: masterResult.error,
      instructions: generateInstructions(),
      parsedText,
    });
  } catch (err) {
    console.error("Analyze error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error interno" }, { status: 500 });
  }
}

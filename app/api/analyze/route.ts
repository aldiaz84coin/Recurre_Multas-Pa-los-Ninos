/**
 * app/api/analyze/route.ts
 *
 * FASE 1 — Parseo visual con Llama 3.2 11B Vision vía OpenRouter (OPENROUTER_API_KEY)
 *   · Modelo especializado en OCR y document parsing, completamente gratuito
 *   · Soporta imágenes y PDFs escaneados con visión nativa
 *   · Una sola key hace el parseo Y uno de los 3 agentes
 *
 * FASE 2 — 3 agentes en paralelo sobre texto limpio (sin imagen)
 *   · Mistral Small, Gemini 2.0 Flash, OpenRouter Gemma 3
 */

import { NextRequest, NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import { callAgent, buildUserPrompt, generateInstructions, FIXED_AGENTS } from "@/lib/llm";

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
[Transcribe aquí el texto más importante del documento: hechos descritos, motivación de la sanción, base legal citada, advertencias sobre plazos y procedimientos]

=== OBSERVACIONES ===
[Cualquier dato adicional visible útil para redactar el recurso]

Sé exhaustivo. Lee todo el documento. No inventes datos — solo extrae lo que está escrito.`;

// ─── Fase 1: Parseo con Qwen2.5-VL via OpenRouter ────────────────────────────

async function parseDocumentWithLlamaVision(
  openrouterApiKey: string,
  base64: string,
  mimeType: string,
  fileName: string
): Promise<string> {

  // Para PDFs con capa de texto, intentamos pdf-parse primero (más rápido)
  if (mimeType === "application/pdf") {
    try {
      const buffer = Buffer.from(base64, "base64");
      const parsed = await pdfParse(buffer);
      const text = (parsed.text || "").trim();
      if (text.length > 100) {
        // PDF con texto: mandamos el texto a Qwen para estructurarlo
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openrouterApiKey}`,
            "HTTP-Referer": "https://recursapp.vercel.app",
            "X-Title": "RecursApp",
          },
          body: JSON.stringify({
            model: "meta-llama/llama-3.2-11b-vision-instruct:free",
            messages: [
              {
                role: "user",
                content: `${PARSE_PROMPT}\n\nTEXTO DEL DOCUMENTO:\n${text}`,
              },
            ],
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
    } catch {
      // Fallback a visión directa
    }
  }

  // Imagen o PDF escaneado: visión directa con Qwen2.5-VL
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openrouterApiKey}`,
      "HTTP-Referer": "https://recursapp.vercel.app",
      "X-Title": "RecursApp",
    },
    body: JSON.stringify({
      model: "meta-llama/llama-3.2-11b-vision-instruct:free",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
            {
              type: "text",
              text: PARSE_PROMPT,
            },
          ],
        },
      ],
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
    gemini: process.env.GEMINI_API_KEY || "",
    openrouter: process.env.OPENROUTER_API_KEY || "",
  };
}

// ─── Handler principal ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { multaFile, supportFiles, additionalContext } = body;

    if (!multaFile?.base64) {
      return NextResponse.json(
        { error: "No se proporcionó el documento de la multa" },
        { status: 400 }
      );
    }

    const apiKeys = getServerApiKeys();

    if (!apiKeys.openrouter) {
      return NextResponse.json(
        { error: "Se necesita OPENROUTER_API_KEY para el parseo del documento. Configúrala en Vercel." },
        { status: 500 }
      );
    }

    // ── FASE 1: Parsear el documento con Qwen2.5-VL via OpenRouter ───────────
    console.log("Fase 1: parseando con Llama-3.2-11B-Vision (OpenRouter)...");
    let parsedText: string;
    try {
      parsedText = await parseDocumentWithLlamaVision(
        apiKeys.openrouter,
        multaFile.base64,
        multaFile.type,
        multaFile.name
      );
      console.log("Parseo OK, primeras líneas:", parsedText.slice(0, 150));
    } catch (err) {
      return NextResponse.json(
        { error: `Error al leer el documento: ${err instanceof Error ? err.message : "Error desconocido"}` },
        { status: 500 }
      );
    }

    // ── FASE 2: Los 3 agentes generan el recurso sobre texto limpio ──────────
    console.log("Fase 2: generando recursos con 3 agentes en paralelo...");
    const supportFilesData = (supportFiles || []).map(
      (sf: { name: string; context: string }) => ({
        name: sf.name,
        context: sf.context || "",
      })
    );

    const userPrompt = buildUserPrompt(parsedText, supportFilesData, additionalContext || "");

    const agentPromises = FIXED_AGENTS.map(async (agentDef) => {
      const key = apiKeys[agentDef.provider];
      if (!key) {
        return {
          agentId: agentDef.id,
          agentName: agentDef.name,
          label: agentDef.label,
          color: agentDef.color,
          status: "skipped" as const,
          content: "",
          error: "Sin API key configurada en el servidor",
        };
      }
      const result = await callAgent(
        { ...agentDef, apiKey: key, enabled: true },
        userPrompt
      );
      return {
        agentId: agentDef.id,
        agentName: agentDef.name,
        label: agentDef.label,
        color: agentDef.color,
        status: result.error ? ("error" as const) : ("done" as const),
        content: result.content,
        error: result.error,
      };
    });

    const settled = await Promise.allSettled(agentPromises);
    const agentResults = settled.map((r, idx) => {
      if (r.status === "fulfilled") return r.value;
      return {
        agentId: FIXED_AGENTS[idx].id,
        agentName: FIXED_AGENTS[idx].name,
        label: FIXED_AGENTS[idx].label,
        color: FIXED_AGENTS[idx].color,
        status: "error" as const,
        content: "",
        error: (r.reason as Error)?.message || "Error desconocido",
      };
    });

    return NextResponse.json({
      agentResults,
      instructions: generateInstructions(),
      parsedText,
    });
  } catch (err) {
    console.error("Analyze error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 }
    );
  }
}

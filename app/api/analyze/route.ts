/**
 * app/api/analyze/route.ts
 *
 * FASE 1 — Parseo visual con Mistral Pixtral 12B (MISTRAL_API_KEY)
 *   · Soporta imágenes y PDFs con visión nativa
 *   · Free tier en La Plateforme (console.mistral.ai)
 *   · Extrae todos los datos de la multa como texto estructurado
 *
 * FASE 2 — 3 agentes en paralelo sobre texto limpio
 *   · Mistral Small, Gemini 2.0 Flash, OpenRouter Gemma 3
 *   · Reciben el texto parseado, sin imagen — sin límites de visión
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

=== DATOS DEL DENUNCIADO ===
NOMBRE: 
DNI/NIF: 
DOMICILIO: 

=== TEXTO LITERAL RELEVANTE ===
[Transcribe aquí el texto más importante del documento: hechos descritos, motivación de la sanción, advertencias legales, y cualquier frase relevante para recurrir]

=== OBSERVACIONES ===
[Cualquier dato adicional visible que pueda ser útil para redactar el recurso]

Sé exhaustivo. No inventes datos — solo extrae lo que está escrito en el documento.`;

// ─── Fase 1: Parseo con Mistral Pixtral 12B ───────────────────────────────────

async function parseDocumentWithMistral(
  mistralApiKey: string,
  base64: string,
  mimeType: string,
  fileName: string
): Promise<string> {
  // Para PDFs con capa de texto, intentamos pdf-parse primero (más rápido y fiable)
  if (mimeType === "application/pdf") {
    try {
      const buffer = Buffer.from(base64, "base64");
      const parsed = await pdfParse(buffer);
      const text = (parsed.text || "").trim();
      if (text.length > 100) {
        // PDF con texto: mandamos el texto a Pixtral para estructurarlo
        const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${mistralApiKey}`,
          },
          body: JSON.stringify({
            model: "pixtral-12b-2409",
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

  // Imagen o PDF escaneado: visión directa con Pixtral
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${mistralApiKey}`,
    },
    body: JSON.stringify({
      model: "pixtral-12b-2409",
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
    throw new Error(`Mistral parseo ${res.status}: ${err.slice(0, 300)}`);
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

    if (!apiKeys.mistral) {
      return NextResponse.json(
        { error: "Se necesita MISTRAL_API_KEY para el parseo del documento. Configúrala en Vercel." },
        { status: 500 }
      );
    }

    const hasAnyAgentKey = apiKeys.mistral || apiKeys.gemini || apiKeys.openrouter;
    if (!hasAnyAgentKey) {
      return NextResponse.json(
        { error: "No hay API keys de agentes configuradas." },
        { status: 500 }
      );
    }

    // ── FASE 1: Parsear el documento con Mistral Pixtral ─────────────────────
    console.log("Fase 1: parseando documento con Mistral Pixtral 12B...");
    let parsedText: string;
    try {
      parsedText = await parseDocumentWithMistral(
        apiKeys.mistral,
        multaFile.base64,
        multaFile.type,
        multaFile.name
      );
      console.log("Parseo OK:", parsedText.slice(0, 120));
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
      parsedText, // devolvemos el parseo por si la UI quiere mostrarlo
    });
  } catch (err) {
    console.error("Analyze error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 }
    );
  }
}

/**
 * app/api/analyze/route.ts
 *
 * Flujo en 2 fases:
 *
 * FASE 1 — Parseo visual (Gemini 2.0 Flash, gratuito)
 *   - Recibe imagen o PDF
 *   - Extrae TODOS los datos de la multa como texto estructurado
 *   - Resultado: texto legible y completo con todos los campos de la multa
 *
 * FASE 2 — Generación del recurso (3 agentes en paralelo)
 *   - Reciben el texto parseado, NO la imagen
 *   - Sin limitaciones de visión, trabajan sobre datos limpios
 *   - Cada uno genera su propio recurso administrativo completo
 */

import { NextRequest, NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import { callAgent, buildUserPrompt, generateInstructions, FIXED_AGENTS } from "@/lib/llm";

export const maxDuration = 120;

// ─── Fase 1: Parseo visual con Gemini ────────────────────────────────────────

const PARSE_PROMPT = `Eres un asistente especializado en leer documentos de multas y sanciones administrativas españolas.

Analiza este documento (imagen o PDF) y extrae TODA la información visible en formato de texto estructurado.

Devuelve exactamente esto, rellenando cada campo con lo que veas en el documento (si un campo no aparece, escribe "No indicado"):

=== DATOS DE LA MULTA ===
ORGANISMO SANCIONADOR: [nombre completo del organismo que emite la multa]
DIRECCIÓN DEL ORGANISMO: [dirección postal si aparece]
EXPEDIENTE Nº: [número de expediente o boletín]
FECHA DE LA DENUNCIA: [fecha en que se cometió la infracción]
FECHA DE NOTIFICACIÓN: [fecha en que se notifica]
PLAZO PARA RECURRIR: [plazo exacto mencionado, ej: "1 mes desde la notificación"]

=== INFRACCIÓN ===
TIPO DE INFRACCIÓN: [descripción de la infracción tal como aparece]
ARTÍCULO(S) INFRINGIDO(S): [todos los artículos citados: ej. Art. 91.2 LSV, RD 1428/2003...]
IMPORTE DE LA SANCIÓN: [cantidad exacta con €]
PUNTOS RETIRADOS: [si aplica]
LUGAR DE LA INFRACCIÓN: [dirección o coordenadas si aparecen]
MATRÍCULA / VEHÍCULO: [si aparece]

=== DATOS DEL DENUNCIADO ===
NOMBRE: [si aparece]
DNI/NIF: [si aparece]
DOMICILIO: [si aparece]

=== TEXTO LITERAL RELEVANTE ===
[Copia aquí cualquier texto importante del documento que no encaje en los campos anteriores, como los hechos descritos, la motivación de la sanción, o cualquier frase relevante para recurrir]

=== OBSERVACIONES ===
[Cualquier dato adicional visible en el documento que pueda ser útil para redactar un recurso]

Sé exhaustivo. No omitas ningún detalle visible. No inventes datos — solo extrae lo que está escrito en el documento.`;

async function parseDocumentWithGemini(
  geminiApiKey: string,
  base64: string,
  mimeType: string,
  fileName: string
): Promise<string> {
  // Si es PDF con texto, intentamos extraer primero con pdf-parse (más fiable)
  if (mimeType === "application/pdf") {
    try {
      const buffer = Buffer.from(base64, "base64");
      const parsed = await pdfParse(buffer);
      const text = (parsed.text || "").trim();
      if (text.length > 100) {
        // PDF con capa de texto — mandamos el texto a Gemini para estructurarlo
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${PARSE_PROMPT}\n\nTEXTO DEL DOCUMENTO:\n${text}` }] }],
            generationConfig: { maxOutputTokens: 2000, temperature: 0.1 },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const parsed = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (parsed.length > 50) return parsed;
        }
      }
    } catch {
      // fallback a visión
    }
  }

  // Imagen o PDF escaneado — visión directa con Gemini
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
  const parts: Array<Record<string, unknown>> = [
    { inlineData: { mimeType, data: base64 } },
    { text: PARSE_PROMPT },
  ];

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { maxOutputTokens: 2000, temperature: 0.1 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini parseo ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || `[No se pudo parsear: ${fileName}]`;
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
    const hasAnyKey = apiKeys.mistral || apiKeys.gemini || apiKeys.openrouter;
    if (!hasAnyKey) {
      return NextResponse.json(
        { error: "No hay API keys configuradas en el servidor. Contacta al administrador." },
        { status: 500 }
      );
    }

    if (!apiKeys.gemini) {
      return NextResponse.json(
        { error: "Se necesita GEMINI_API_KEY para el parseo del documento. Configúrala en Vercel." },
        { status: 500 }
      );
    }

    // ── FASE 1: Parsear el documento con Gemini ──────────────────────────────
    console.log("Fase 1: parseando documento con Gemini...");
    let parsedText: string;
    try {
      parsedText = await parseDocumentWithGemini(
        apiKeys.gemini,
        multaFile.base64,
        multaFile.type,
        multaFile.name
      );
      console.log("Parseo completado:", parsedText.slice(0, 100));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error de parseo";
      return NextResponse.json(
        { error: `Error al leer el documento: ${msg}` },
        { status: 500 }
      );
    }

    // ── FASE 2: Los 3 agentes generan el recurso sobre texto limpio ──────────
    console.log("Fase 2: generando recursos con 3 agentes...");
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
      // Los agentes reciben texto puro — sin imagen
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
      parsedText, // opcional: la UI podría mostrarlo para debug
    });
  } catch (err) {
    console.error("Analyze error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 }
    );
  }
}

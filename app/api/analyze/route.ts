/**
 * app/api/analyze/route.ts
 *
 * FASE 1 — Parseo visual (OpenRouter/auto) → datos estructurados + búsqueda URL sede electrónica
 * FASE 2 — 3 agentes en paralelo → borradores + cada uno propone URL presentación
 * FASE 3 — Agente maestro → recurso definitivo + URL consensuada
 */

import { NextRequest, NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import { callAgent, callMasterAgent, buildUserPrompt, generateInstructions, FIXED_AGENTS } from "@/lib/llm";

export const maxDuration = 120;

// ─── Prompt de parseo ─────────────────────────────────────────────────────────

const PARSE_PROMPT = `Eres un asistente especializado en leer documentos de multas y sanciones administrativas españolas.

Analiza este documento y extrae TODA la información visible. Rellena cada campo con exactamente lo que veas escrito (si un campo no aparece, escribe "No indicado").

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
[Transcribe aquí el texto más importante del documento: hechos denunciados, motivación de la sanción, base legal citada, advertencias sobre plazos y procedimientos. Sé exhaustivo.]

=== OBSERVACIONES ===
[Cualquier dato adicional visible útil para redactar el recurso]

=== URL SEDE ELECTRÓNICA ===
[Basándote en el ORGANISMO SANCIONADOR identificado, indica la URL exacta de la sede electrónica donde se debe presentar el recurso electrónicamente. Ejemplos:
- DGT / Tráfico: https://sede.dgt.gob.es
- Ayuntamiento de Madrid: https://sede.madrid.es
- Ayuntamiento de Barcelona: https://seuelectronica.ajuntament.barcelona.cat
- Servicio Provincial Tributario Granada / Diputación Granada: https://spgr.es o https://sede.dipgra.es
- Junta de Andalucía: https://juntadeandalucia.es/sede
- Agencia Tributaria: https://sede.agenciatributaria.gob.es
Si no estás seguro, proporciona la URL más probable basándote en el organismo. Responde solo con la URL, sin texto adicional.]

Sé exhaustivo con todos los campos. No inventes datos — solo extrae lo que está escrito, excepto la URL que debes inferir del organismo.`;

// ─── Prompt para extraer URL de presentación (por agente) ────────────────────

const URL_EXTRACTION_PROMPT = `Dado este recurso administrativo y los datos de la multa, identifica la URL exacta de la sede electrónica donde debe presentarse este recurso.

Responde SOLO con un objeto JSON con este formato exacto:
{
  "url": "https://...",
  "nombre": "Nombre del portal",
  "confianza": "alta" | "media" | "baja"
}

Si no puedes determinarla con certeza, proporciona la más probable. No incluyas texto adicional, solo el JSON.`;

// ─── Fase 1: Parseo con OpenRouter/auto ──────────────────────────────────────

async function parseDocument(
  openrouterApiKey: string,
  base64: string,
  mimeType: string,
  fileName: string
): Promise<string> {
  // PDFs con capa de texto: extraer con pdf-parse y estructurar con LLM
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
            max_tokens: 3000,
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
      max_tokens: 3000,
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

// ─── Extraer fecha de notificación y calcular plazo máximo ───────────────────

interface PlazoInfo {
  fechaNotificacion: string;
  fechaNotificacionISO: string;
  fechaLimite: string;
  fechaLimiteISO: string;
  diasRestantes: number;
  tipoRecurso: string;
  baseLegal: string;
  urgencia: "ok" | "aviso" | "urgente" | "vencido";
}

function calcularPlazo(parsedText: string): PlazoInfo | null {
  const match = parsedText.match(/FECHA DE NOTIFICACI[OÓ]N:\s*([^\n]+)/i);
  if (!match) return null;
  const rawFecha = match[1].trim();
  if (rawFecha === "No indicado" || rawFecha === "") return null;

  let fechaBase: Date | null = null;

  // DD/MM/YYYY o DD-MM-YYYY
  const m1 = rawFecha.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (m1) fechaBase = new Date(parseInt(m1[3]), parseInt(m1[2]) - 1, parseInt(m1[1]));

  // "19 de febrero de 2026"
  if (!fechaBase) {
    const meses: Record<string, number> = {
      enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,
      julio:6,agosto:7,septiembre:8,octubre:9,noviembre:10,diciembre:11,
    };
    const m2 = rawFecha.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i);
    if (m2) {
      const mes = meses[m2[2].toLowerCase()];
      if (mes !== undefined) fechaBase = new Date(parseInt(m2[3]), mes, parseInt(m2[1]));
    }
  }

  // YYYY-MM-DD
  if (!fechaBase) {
    const m3 = rawFecha.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m3) fechaBase = new Date(parseInt(m3[1]), parseInt(m3[2]) - 1, parseInt(m3[3]));
  }

  if (!fechaBase || isNaN(fechaBase.getTime())) return null;

  const esAlegaciones = /alegaciones|inicio.*procedimiento|procedimiento sancionador|20 d[ií]as naturales/i.test(parsedText);

  let fechaLimite: Date;
  let tipoRecurso: string;
  let baseLegal: string;

  if (esAlegaciones) {
    fechaLimite = new Date(fechaBase);
    fechaLimite.setDate(fechaLimite.getDate() + 20);
    tipoRecurso = "Alegaciones al procedimiento sancionador";
    baseLegal = "Art. 89.1 TRLTSV (RDLeg. 6/2015) — 20 días naturales";
  } else {
    fechaLimite = new Date(fechaBase);
    fechaLimite.setMonth(fechaLimite.getMonth() + 1);
    tipoRecurso = "Recurso de reposición";
    baseLegal = "Art. 123.1 Ley 39/2015 (LPACAP) — 1 mes natural";
  }

  const hoy = new Date(); hoy.setHours(0,0,0,0);
  fechaLimite.setHours(0,0,0,0);
  const diasRestantes = Math.round((fechaLimite.getTime() - hoy.getTime()) / 86400000);

  const formatDate = (d: Date) =>
    d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  const toISO = (d: Date) => d.toISOString().split("T")[0];

  const urgencia: PlazoInfo["urgencia"] =
    diasRestantes < 0 ? "vencido" :
    diasRestantes <= 3 ? "urgente" :
    diasRestantes <= 7 ? "aviso" : "ok";

  return {
    fechaNotificacion: rawFecha,
    fechaNotificacionISO: toISO(fechaBase),
    fechaLimite: formatDate(fechaLimite),
    fechaLimiteISO: toISO(fechaLimite),
    diasRestantes,
    tipoRecurso,
    baseLegal,
    urgencia,
  };
}

// ─── Extraer URL de sede electrónica del texto parseado ──────────────────────

function extractUrlFromParsed(parsedText: string): string {
  const match = parsedText.match(/=== URL SEDE ELECTRÓNICA ===\s*\n([^\n=]+)/i);
  if (match) {
    const candidate = match[1].trim();
    if (candidate.startsWith("http") && candidate.length > 10) return candidate;
  }
  return "";
}

// ─── Consolidar URLs propuestas por los agentes ───────────────────────────────

interface UrlProposal {
  url: string;
  nombre: string;
  confianza: string;
}

function consolidateUrls(proposals: UrlProposal[]): UrlProposal | null {
  const valid = proposals.filter(p => p.url && p.url.startsWith("http"));
  if (valid.length === 0) return null;

  // Contar votos por dominio base
  const votes: Record<string, { count: number; proposal: UrlProposal }> = {};
  for (const p of valid) {
    try {
      const domain = new URL(p.url).hostname;
      if (!votes[domain]) votes[domain] = { count: 0, proposal: p };
      votes[domain].count++;
      // Preferir la de más alta confianza
      if (p.confianza === "alta") votes[domain].proposal = p;
    } catch { /* URL inválida */ }
  }

  // Elegir la más votada
  const sorted = Object.values(votes).sort((a, b) => b.count - a.count);
  return sorted[0]?.proposal || null;
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

    // URL extraída del parseo (fase 1)
    const parsedUrl = extractUrlFromParsed(parsedText);

    // Plazo máximo de presentación
    const plazoInfo = calcularPlazo(parsedText);

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
          urlProposal: null,
        };
      }
      const result = await callAgent({ ...agentDef, apiKey: key, enabled: true }, userPrompt);
      return {
        agentId: agentDef.id, agentName: agentDef.name, label: agentDef.label, color: agentDef.color,
        status: result.error ? ("error" as const) : ("done" as const),
        content: result.content, error: result.error,
        urlProposal: result.urlProposal || null,
      };
    });

    const settled = await Promise.allSettled(agentPromises);
    const agentResults = settled.map((r, idx) => {
      if (r.status === "fulfilled") return r.value;
      return {
        agentId: FIXED_AGENTS[idx].id, agentName: FIXED_AGENTS[idx].name,
        label: FIXED_AGENTS[idx].label, color: FIXED_AGENTS[idx].color,
        status: "error" as const, content: "", error: (r.reason as Error)?.message || "Error desconocido",
        urlProposal: null,
      };
    });

    // ── FASE 3: Agente maestro fusiona borradores ────────────────────────────
    console.log("Fase 3: agente maestro fusionando borradores...");
    const successfulDrafts = agentResults
      .filter(r => r.status === "done" && r.content)
      .map(r => ({ agentName: r.label, content: r.content }));

    const masterResult = await callMasterAgent(apiKeys, successfulDrafts, parsedText);

    // ── Consolidar URL de presentación ───────────────────────────────────────
    const urlProposals: UrlProposal[] = [];
    if (parsedUrl) urlProposals.push({ url: parsedUrl, nombre: "Extraído del documento", confianza: "alta" });
    for (const r of agentResults) {
      if (r.urlProposal) urlProposals.push(r.urlProposal);
    }
    if (masterResult.urlProposal) urlProposals.push(masterResult.urlProposal);
    const presentacionUrl = consolidateUrls(urlProposals);

    return NextResponse.json({
      agentResults,
      masterRecurso: masterResult.content,
      masterError: masterResult.error,
      instructions: generateInstructions(),
      parsedText,
      presentacionUrl,
      plazoInfo,
    });
  } catch (err) {
    console.error("Analyze error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error interno" }, { status: 500 });
  }
}

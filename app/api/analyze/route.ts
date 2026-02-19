/**
 * app/api/analyze/route.ts – versión simplificada
 * 3 agentes fijos, sin consenso, devuelve las 3 respuestas separadas
 */

import { NextRequest, NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import { callAgent, buildUserPrompt, generateInstructions, FIXED_AGENTS } from "@/lib/llm";

export const maxDuration = 120;

async function extractTextFromFile(base64: string, mimeType: string, fileName: string): Promise<{ text: string; isImage: boolean }> {
  const isImage = mimeType.startsWith("image/");
  if (isImage) {
    return { text: `[Imagen adjunta: ${fileName}]`, isImage: true };
  }
  try {
    const buffer = Buffer.from(base64, "base64");
    const parsed = await pdfParse(buffer);
    const text = (parsed.text || "").trim();
    if (text.length > 50) return { text, isImage: false };
    return { text: `[PDF escaneado sin texto extraíble: ${fileName}]`, isImage: false };
  } catch {
    return { text: `[No se pudo extraer texto del PDF: ${fileName}]`, isImage: false };
  }
}

// Las keys se leen siempre del servidor — el cliente nunca las ve ni las envía
function getServerApiKeys() {
  return {
    groq: process.env.GROQ_API_KEY || "",
    gemini: process.env.GEMINI_API_KEY || "",
    openrouter: process.env.OPENROUTER_API_KEY || "",
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { multaFile, supportFiles, additionalContext } = body;
    // ⚠️  apiKeys ya NO viene del cliente — se leen del entorno del servidor

    if (!multaFile?.base64) {
      return NextResponse.json({ error: "No se proporcionó el documento de la multa" }, { status: 400 });
    }

    const apiKeys = getServerApiKeys();
    const hasAnyKey = apiKeys.groq || apiKeys.gemini || apiKeys.openrouter;
    if (!hasAnyKey) {
      return NextResponse.json({ error: "No hay API keys configuradas en el servidor. Contacta al administrador." }, { status: 500 });
    }

    // Extraer texto del PDF o imagen
    const { text: multaText, isImage } = await extractTextFromFile(multaFile.base64, multaFile.type, multaFile.name);
    const imageBase64 = isImage ? multaFile.base64 : undefined;
    const imageMime = isImage ? multaFile.type : undefined;

    const supportFilesData = (supportFiles || []).map((sf: { name: string; context: string }) => ({
      name: sf.name,
      context: sf.context || "",
    }));

    const userPrompt = buildUserPrompt(multaText, supportFilesData, additionalContext || "");

    // Llamar a los 3 agentes en paralelo (solo los que tienen API key)
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
          error: "Sin API key configurada",
        };
      }
      const result = await callAgent({ ...agentDef, apiKey: key, enabled: true }, userPrompt, imageBase64, imageMime);
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

    const instructions = generateInstructions();

    return NextResponse.json({ agentResults, instructions });
  } catch (err) {
    console.error("Analyze error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error interno" }, { status: 500 });
  }
}

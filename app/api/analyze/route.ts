/**
 * app/api/analyze/route.ts
 *
 * Orchestrates the two-phase flow:
 *   1. Extract real text from PDF (pdf-parse) or pass image for vision
 *   2. Phase 1 – All agents extract metadata in parallel → consensus
 *   3. Phase 2 – All agents generate the recurso with enriched context
 */

import { NextRequest, NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import {
  callAgent,
  mergeResponses,
  generateInstructionsFromMetadata,
  extractFineMetadata,
  buildEnrichedPrompt,
  type AgentConfig,
  type FineMetadata,
} from "@/lib/llm";

export const maxDuration = 120;

// ─── File text extraction ─────────────────────────────────────────────────────

async function extractTextFromFile(
  base64: string,
  mimeType: string,
  fileName: string
): Promise<{ text: string; isImage: boolean }> {
  const isImage = mimeType.startsWith("image/");

  if (isImage) {
    // Images are passed directly to vision-capable models; no server-side text extraction
    return { text: `[Imagen de la multa: ${fileName}. Analiza la imagen adjunta.]`, isImage: true };
  }

  // PDF — try to extract text layer
  try {
    const buffer = Buffer.from(base64, "base64");
    const parsed = await pdfParse(buffer);
    const text = (parsed.text || "").trim();
    if (text.length > 50) {
      return { text, isImage: false };
    }
    // Scanned PDF with no text layer
    return {
      text: `[PDF escaneado sin capa de texto: ${fileName}. Intenta extraer la información visible.]`,
      isImage: false,
    };
  } catch {
    return {
      text: `[No se pudo extraer texto del PDF: ${fileName}]`,
      isImage: false,
    };
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { multaFile, supportFiles, additionalContext, agentConfigs } = body;

    if (!multaFile?.base64) {
      return NextResponse.json(
        { error: "No se proporcionó el documento de la multa" },
        { status: 400 }
      );
    }

    const enabledAgents: AgentConfig[] = (agentConfigs || []).filter(
      (a: AgentConfig) => a.enabled && a.apiKey
    );

    if (enabledAgents.length === 0) {
      return NextResponse.json(
        { error: "No hay agentes activos con API key configurada. Ve a Configuración." },
        { status: 400 }
      );
    }

    // ── Extract real text from the uploaded multa file ──────────────────────
    const { text: multaText, isImage } = await extractTextFromFile(
      multaFile.base64,
      multaFile.type,
      multaFile.name
    );

    // Pass image base64 only if it's actually an image (for vision models)
    const imageBase64 = isImage ? multaFile.base64 : undefined;
    const imageMime = isImage ? multaFile.type : undefined;

    const supportFilesData = (supportFiles || []).map(
      (sf: { name: string; context: string }) => ({
        name: sf.name,
        context: sf.context || "",
      })
    );

    // ── PHASE 1: All agents extract metadata in parallel ────────────────────
    let metadata: FineMetadata;
    try {
      metadata = await extractFineMetadata(
        enabledAgents,
        multaText,
        imageBase64,
        imageMime
      );
    } catch {
      metadata = {
        legislation: [],
        organism: "",
        organismAddress: "",
        fineType: "",
        fineAmount: "",
        deadline: "",
        rawSummary: "",
      };
    }

    // ── PHASE 2: All agents generate the recurso in parallel ────────────────
    const userPrompt = buildEnrichedPrompt(
      multaText,
      metadata,
      supportFilesData,
      additionalContext || ""
    );

    const agentPromises = enabledAgents.map(async (agent) => {
      const result = await callAgent(agent, userPrompt, metadata, imageBase64, imageMime);
      return {
        agentName: agent.name,
        status: result.error ? ("error" as const) : ("done" as const),
        content: result.content,
        error: result.error,
      };
    });

    const settled = await Promise.allSettled(agentPromises);
    const resolvedResults = settled.map((r, idx) => {
      if (r.status === "fulfilled") return r.value;
      return {
        agentName: enabledAgents[idx]?.name || `Agente ${idx + 1}`,
        status: "error" as const,
        content: "",
        error: (r.reason as Error)?.message || "Error desconocido",
      };
    });

    // ── Merge + instructions ────────────────────────────────────────────────
    const successful = resolvedResults.filter((r) => r.status === "done" && r.content);
    const mergedDoc = mergeResponses(
      successful.map((r) => ({ agentName: r.agentName, content: r.content }))
    );
    const instructions = generateInstructionsFromMetadata(metadata);

    return NextResponse.json({
      agentResults: resolvedResults,
      mergedDoc,
      instructions,
      metadata, // UI can display extracted organism + legislation
    });
  } catch (err: unknown) {
    console.error("Analyze error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 }
    );
  }
}

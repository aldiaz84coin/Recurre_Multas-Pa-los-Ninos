import { NextRequest, NextResponse } from "next/server";
import {
  callAgent,
  mergeResponses,
  generateInstructionsFromMetadata,
  extractFineMetadata,
  buildEnrichedPrompt,
  type AgentConfig,
  type FineMetadata,
} from "@/lib/llm";

export const maxDuration = 120; // 2 minutes for Vercel

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { multaFile, supportFiles, additionalContext, agentConfigs } = body;

    if (!multaFile) {
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

    // Basic multa content descriptor (real PDF/image parsing would go here)
    const multaContent = `Archivo: ${multaFile.name}\nTipo: ${multaFile.type}\n[Contenido del documento adjunto - analiza el contexto de la multa]`;

    const supportFilesData = (supportFiles || []).map(
      (sf: { name: string; context: string }) => ({
        name: sf.name,
        context: sf.context || "",
      })
    );

    // ── PHASE 1: Extract metadata in parallel from all agents ──────────────────
    let metadata: FineMetadata;
    try {
      metadata = await extractFineMetadata(enabledAgents, multaContent);
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

    // ── PHASE 2: Build enriched prompt and call agents for the recurso ─────────
    const userPrompt = buildEnrichedPrompt(
      multaContent,
      metadata,
      supportFilesData,
      additionalContext || ""
    );

    const agentPromises = enabledAgents.map(async (agent) => {
      const result = await callAgent(agent, userPrompt, metadata);
      return {
        agentName: agent.name,
        status: result.error ? ("error" as const) : ("done" as const),
        content: result.content,
        error: result.error,
      };
    });

    const agentResults = await Promise.allSettled(agentPromises);

    const resolvedResults = agentResults.map((r, idx) => {
      if (r.status === "fulfilled") return r.value;
      return {
        agentName: enabledAgents[idx]?.name || `Agente ${idx + 1}`,
        status: "error" as const,
        content: "",
        error: r.reason?.message || "Error desconocido",
      };
    });

    // ── PHASE 3: Merge and generate instructions ───────────────────────────────
    const successful = resolvedResults.filter((r) => r.status === "done" && r.content);
    const mergedDoc = mergeResponses(
      successful.map((r) => ({ agentName: r.agentName, content: r.content }))
    );

    const instructions = generateInstructionsFromMetadata(metadata);

    return NextResponse.json({
      agentResults: resolvedResults,
      mergedDoc,
      instructions,
      metadata, // send back so UI can display extracted info
    });
  } catch (err: unknown) {
    console.error("Analyze error:", err);
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

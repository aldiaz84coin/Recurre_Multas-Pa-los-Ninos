import { NextRequest, NextResponse } from "next/server";
import { callAgent, mergeResponses, generateInstructions, type AgentConfig } from "@/lib/llm";

export const maxDuration = 120; // 2 minutes for Vercel

function buildUserPrompt(
  multaContent: string,
  supportFiles: { name: string; context: string; textContent?: string }[],
  additionalContext: string
): string {
  let prompt = `=== DOCUMENTO DE LA MULTA ===\n${multaContent}\n\n`;

  if (supportFiles.length > 0) {
    prompt += `=== DOCUMENTACIÓN DE APOYO ===\n`;
    for (const sf of supportFiles) {
      prompt += `\n--- ${sf.name} ---\n`;
      if (sf.context) prompt += `Contexto: ${sf.context}\n`;
      if (sf.textContent) prompt += `Contenido: ${sf.textContent}\n`;
    }
    prompt += "\n";
  }

  if (additionalContext) {
    prompt += `=== CONTEXTO ADICIONAL DEL USUARIO ===\n${additionalContext}\n\n`;
  }

  prompt += `Por favor, redacta un recurso administrativo completo y fundamentado contra esta multa.`;

  return prompt;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { multaFile, supportFiles, additionalContext, agentConfigs } = body;

    if (!multaFile) {
      return NextResponse.json({ error: "No se proporcionó el documento de la multa" }, { status: 400 });
    }

    // For now, use the filename and type as context (image/PDF processing would need additional libs)
    // In production, use pdf-parse for PDFs and OCR/vision for images
    const multaContent = `Archivo: ${multaFile.name}\nTipo: ${multaFile.type}\n[Contenido del documento adjunto - analiza el contexto de la multa]`;

    const supportFilesData = (supportFiles || []).map((sf: { name: string; context: string }) => ({
      name: sf.name,
      context: sf.context || "",
    }));

    const userPrompt = buildUserPrompt(multaContent, supportFilesData, additionalContext || "");

    // Call all enabled agents in parallel
    const enabledAgents: AgentConfig[] = (agentConfigs || []).filter(
      (a: AgentConfig) => a.enabled && a.apiKey
    );

    if (enabledAgents.length === 0) {
      return NextResponse.json(
        { error: "No hay agentes activos con API key configurada. Ve a Configuración." },
        { status: 400 }
      );
    }

    const agentPromises = enabledAgents.map(async (agent) => {
      const result = await callAgent(agent, userPrompt);
      return {
        agentName: agent.name,
        status: result.error ? "error" as const : "done" as const,
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

    // Merge successful responses
    const successful = resolvedResults.filter((r) => r.status === "done" && r.content);
    const mergedDoc = mergeResponses(
      successful.map((r) => ({ agentName: r.agentName, content: r.content }))
    );

    const instructions = generateInstructions(multaContent);

    return NextResponse.json({
      agentResults: resolvedResults,
      mergedDoc,
      instructions,
    });
  } catch (err: unknown) {
    console.error("Analyze error:", err);
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

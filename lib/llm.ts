/**
 * lib/llm.ts
 *
 * Two-phase LLM orchestration:
 *   Phase 1 – All agents extract structured metadata (legislation, organism…)
 *              from the REAL multa text/image in parallel → consensus merge
 *   Phase 2 – All agents generate the recurso enriched with Phase 1 data
 */

export interface AgentConfig {
  id: string;
  name: string;
  provider: "groq" | "gemini" | "openrouter" | "openai" | "custom";
  model: string;
  apiKey: string;
  baseUrl?: string;
  enabled: boolean;
  role: string;
}

export interface LLMResponse {
  content: string;
  error?: string;
}

export interface FineMetadata {
  legislation: string[];      // Articles / norms found in the fine document
  organism: string;           // Exact name of the sanctioning body
  organismAddress: string;    // Address / sede if present
  fineType: string;           // Brief description of the infraction
  fineAmount: string;         // Amount + unit
  deadline: string;           // Appeal deadline if mentioned
  rawSummary: string;         // 2-3 sentence summary of the sanctioned facts
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `Eres un experto en derecho administrativo español.
Se te proporciona el texto completo (o imagen) de una notificación de multa o sanción administrativa española.

Tu única tarea es extraer los siguientes datos en formato JSON estricto, SIN ningún texto adicional ni bloques markdown:

{
  "legislation": ["array con TODOS los artículos, normas y reglamentos citados expresamente en el documento, ej: 'Art. 91.2 LSV', 'RD 1428/2003 art. 52', 'Ordenanza Municipal de Circulación art. 18'"],
  "organism": "nombre EXACTO del organismo que emite la sanción y al que debe dirigirse el recurso, tal como aparece en el documento",
  "organismAddress": "dirección postal completa del organismo si aparece en el documento, cadena vacía si no",
  "fineType": "descripción breve de la infracción tal como aparece en el documento",
  "fineAmount": "importe exacto de la sanción con su moneda, cadena vacía si no aparece",
  "deadline": "plazo exacto para recurrir tal como aparece en el documento, cadena vacía si no",
  "rawSummary": "resumen de 2-3 frases de los hechos sancionados según el documento"
}

IMPORTANTE:
- Copia los artículos y organismos EXACTAMENTE como aparecen en el documento.
- Si un campo no aparece en el documento, usa cadena vacía o array vacío.
- Responde SOLO con el JSON. Ni una palabra más.`;

const RECURSO_SYSTEM_PROMPT = (role: string, metadata: FineMetadata) =>
  `Eres un experto en derecho español actuando como: ${role}.

DATOS EXTRAÍDOS DE LA MULTA (ya verificados por consenso de agentes):
- Organismo sancionador: ${metadata.organism || "ver documento"}
- Legislación citada en la multa: ${metadata.legislation.length > 0 ? metadata.legislation.join(", ") : "no especificada"}
- Tipo de infracción: ${metadata.fineType || "ver documento"}
- Importe: ${metadata.fineAmount || "no especificado"}
- Plazo de recurso: ${metadata.deadline || "1 mes desde la notificación"}
- Resumen: ${metadata.rawSummary || "ver documento"}

Redacta un RECURSO ADMINISTRATIVO profesional con estas reglas:
1. Encabézalo con un bloque de datos del recurrente para rellenar a mano (NOMBRE:___ DNI:___ DOMICILIO:___).
2. Dirígelo EXPLÍCITAMENTE a: ${metadata.organism || "el organismo sancionador"}.
3. Cita y refuta jurídicamente cada artículo detectado: ${metadata.legislation.join(", ") || "los citados en la notificación"}.
4. Añade jurisprudencia o normativa adicional favorable al recurrente.
5. Estructura obligatoria: ENCABEZADO · HECHOS · FUNDAMENTOS DE DERECHO · SÚPLICA.
6. Tono formal y persuasivo.

Responde ÚNICAMENTE con el texto del recurso. Sin comentarios previos ni posteriores.`;

// ─── Low-level API callers ────────────────────────────────────────────────────

async function callOpenAIRaw(
  config: AgentConfig,
  system: string,
  userContent: unknown,
  maxTokens: number,
  temperature: number
): Promise<string> {
  const baseUrl = config.baseUrl || "https://api.openai.com/v1";
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      ...(config.provider === "openrouter"
        ? { "HTTP-Referer": "https://recursapp.vercel.app", "X-Title": "RecursApp" }
        : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      max_tokens: maxTokens,
      temperature,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${config.provider} error ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callGeminiRaw(
  config: AgentConfig,
  textPrompt: string,
  maxTokens: number,
  temperature: number,
  imageBase64?: string,
  imageMime?: string
): Promise<string> {
  const model = config.model || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;

  const parts: Array<Record<string, unknown>> = [];
  if (imageBase64 && imageMime) {
    parts.push({ inlineData: { mimeType: imageMime, data: imageBase64 } });
  }
  parts.push({ text: textPrompt });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { maxOutputTokens: maxTokens, temperature },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ─── Phase 1: Metadata extraction ────────────────────────────────────────────

async function extractWithOneAgent(
  config: AgentConfig,
  multaText: string,
  imageBase64?: string,
  imageMime?: string
): Promise<FineMetadata | null> {
  try {
    let raw = "";

    if (config.provider === "gemini") {
      raw = await callGeminiRaw(
        config,
        `${EXTRACTION_SYSTEM_PROMPT}\n\n---\n\n${multaText}`,
        1000,
        0.1,
        imageBase64,
        imageMime
      );
    } else {
      // Build user content — attach image for vision models (gpt-4o etc.)
      const userContent: Array<Record<string, unknown>> = [];
      if (imageBase64 && imageMime) {
        userContent.push({
          type: "image_url",
          image_url: { url: `data:${imageMime};base64,${imageBase64}` },
        });
      }
      userContent.push({ type: "text", text: multaText });
      raw = await callOpenAIRaw(config, EXTRACTION_SYSTEM_PROMPT, userContent, 1000, 0.1);
    }

    // Strip markdown fences and find JSON object
    const clean = raw.replace(/```json[\s\S]*?```|```[\s\S]*?```/g, "").trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as FineMetadata;
  } catch {
    return null;
  }
}

/**
 * Run extraction across ALL enabled agents in parallel → consensus merge
 */
export async function extractFineMetadata(
  agents: AgentConfig[],
  multaText: string,
  imageBase64?: string,
  imageMime?: string
): Promise<FineMetadata> {
  const settled = await Promise.allSettled(
    agents.map((a) => extractWithOneAgent(a, multaText, imageBase64, imageMime))
  );

  const valid: FineMetadata[] = settled
    .filter(
      (r): r is PromiseFulfilledResult<FineMetadata> =>
        r.status === "fulfilled" && r.value !== null
    )
    .map((r) => r.value);

  if (valid.length === 0) {
    return { legislation: [], organism: "", organismAddress: "", fineType: "", fineAmount: "", deadline: "", rawSummary: "" };
  }

  // Legislation: weighted by how many agents agree, deduped by lowercase key
  const legCount: Record<string, number> = {};
  const legOriginal: Record<string, string> = {};
  for (const v of valid) {
    for (const l of v.legislation) {
      const key = l.trim().toLowerCase();
      if (!key) continue;
      legCount[key] = (legCount[key] || 0) + 1;
      if (!legOriginal[key]) legOriginal[key] = l.trim();
    }
  }
  const legislation = Object.keys(legCount)
    .sort((a, b) => legCount[b] - legCount[a])
    .map((k) => legOriginal[k]);

  // Organism: majority vote
  const orgCount: Record<string, number> = {};
  for (const v of valid) {
    const o = (v.organism || "").trim();
    if (o) orgCount[o] = (orgCount[o] || 0) + 1;
  }
  const organism = Object.entries(orgCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "";

  // Other strings: longest non-empty wins (most detail)
  const pickLongest = (field: keyof Omit<FineMetadata, "legislation">): string =>
    valid
      .map((v) => (v[field] as string) || "")
      .filter((x) => x.length > 0)
      .sort((a, b) => b.length - a.length)[0] || "";

  return {
    legislation,
    organism,
    organismAddress: pickLongest("organismAddress"),
    fineType: pickLongest("fineType"),
    fineAmount: pickLongest("fineAmount"),
    deadline: pickLongest("deadline"),
    rawSummary: pickLongest("rawSummary"),
  };
}

// ─── Phase 2: Recurso generation ─────────────────────────────────────────────

export async function callAgent(
  config: AgentConfig,
  userPrompt: string,
  metadata: FineMetadata,
  imageBase64?: string,
  imageMime?: string
): Promise<LLMResponse> {
  if (!config.apiKey) return { content: "", error: "Sin API key configurada" };

  try {
    const system = RECURSO_SYSTEM_PROMPT(config.role, metadata);
    let content = "";

    if (config.provider === "gemini") {
      content = await callGeminiRaw(
        config,
        `${system}\n\n---\n\n${userPrompt}`,
        3000,
        0.3,
        imageBase64,
        imageMime
      );
    } else {
      const userContent: Array<Record<string, unknown>> = [];
      if (imageBase64 && imageMime) {
        userContent.push({
          type: "image_url",
          image_url: { url: `data:${imageMime};base64,${imageBase64}` },
        });
      }
      userContent.push({ type: "text", text: userPrompt });
      content = await callOpenAIRaw(config, system, userContent, 3000, 0.3);
    }
    return { content };
  } catch (err: unknown) {
    return { content: "", error: err instanceof Error ? err.message : "Error desconocido" };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function buildEnrichedPrompt(
  multaText: string,
  metadata: FineMetadata,
  supportFiles: { name: string; context: string }[],
  additionalContext: string
): string {
  let prompt = `=== CONTENIDO DE LA MULTA ===\n${multaText}\n\n`;

  if (supportFiles.length > 0) {
    prompt += `=== DOCUMENTACIÓN DE APOYO ===\n`;
    for (const sf of supportFiles) {
      prompt += `\n--- ${sf.name} ---\n`;
      if (sf.context) prompt += `Contexto: ${sf.context}\n`;
    }
    prompt += "\n";
  }

  if (additionalContext) {
    prompt += `=== CONTEXTO ADICIONAL ===\n${additionalContext}\n\n`;
  }

  prompt += `Redacta el recurso dirigido a: ${metadata.organism || "el organismo sancionador"}, citando: ${metadata.legislation.join(", ") || "la legislación de la multa"}.`;
  return prompt;
}

export function mergeResponses(responses: { agentName: string; content: string }[]): string {
  const valid = responses.filter((r) => r.content && r.content.length > 100);
  if (valid.length === 0) return "No se pudo generar el recurso. Verifica la configuración de los agentes.";
  if (valid.length === 1) return valid[0].content;

  const sorted = [...valid].sort((a, b) => b.content.length - a.content.length);
  const base = sorted[0].content;
  const uniqueAdditions: string[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const otherParas = sorted[i].content.split(/\n{2,}/).filter((p) => p.trim().length > 100);
    for (const para of otherParas) {
      // Plain array ops — no Set spread, no downlevelIteration error
      const paraWords = para.toLowerCase().split(/\s+/).slice(0, 10);
      const isInBase = base.split(/\n{2,}/).some((basePara) => {
        const baseWords = basePara.toLowerCase().split(/\s+/).slice(0, 10);
        let hits = 0;
        for (let w = 0; w < paraWords.length; w++) {
          if (baseWords.indexOf(paraWords[w]) !== -1) hits++;
        }
        return hits > 6;
      });
      if (!isInBase) uniqueAdditions.push(para.trim());
    }
  }

  if (uniqueAdditions.length === 0) return base;

  const supIdx = base.search(/SUPLICA|SOLICITA|suplica|solicita/i);
  if (supIdx > 0) {
    return base.slice(0, supIdx) + "\n\n" + uniqueAdditions.join("\n\n") + "\n\n" + base.slice(supIdx);
  }
  return base + "\n\n---\n\n" + uniqueAdditions.join("\n\n");
}

export function generateInstructionsFromMetadata(metadata: FineMetadata): string {
  const organism = metadata.organism || "el organismo sancionador";
  const address = metadata.organismAddress ? `\n   • Dirección: ${metadata.organismAddress}` : "";
  const deadline = metadata.deadline || "1 mes desde la notificación (verifica en tu documento)";
  const amount = metadata.fineAmount ? `\n   • Importe de la sanción: ${metadata.fineAmount}` : "";
  const legLines =
    metadata.legislation.length > 0
      ? metadata.legislation.map((l) => `   • ${l}`).join("\n")
      : "   • Ver documento de la multa";

  return `INSTRUCCIONES PARA PRESENTAR EL RECURSO
========================================

ORGANISMO AL QUE DIRIGIR EL RECURSO
   • ${organism}${address}${amount}

LEGISLACIÓN IDENTIFICADA EN LA MULTA
${legLines}

1. PLAZO DE PRESENTACIÓN
   • ${deadline}

2. DÓNDE PRESENTARLO
   • Sede electrónica de: ${organism}${address}
   • Presencialmente en su registro
   • Por correo certificado con acuse de recibo
   • En cualquier registro de la Administración (Ley 39/2015)

3. DOCUMENTACIÓN A ADJUNTAR
   ☐ Este recurso (firmado)
   ☐ Copia de la notificación de la multa
   ☐ DNI/NIE del recurrente
   ☐ Documentación de apoyo (fotos, testigos, mapas…)

4. PRESENTACIÓN ELECTRÓNICA (RECOMENDADA)
   • Necesitas: DNI electrónico, certificado digital o Cl@ve
   • Guarda el justificante con número de registro

5. PRESENTACIÓN PRESENCIAL
   • Lleva 2 copias impresas y firmadas · Pide sello de entrada

6. DESPUÉS DE PRESENTARLO
   • El organismo tiene 3 meses para resolver
   • Silencio negativo si no hay respuesta
   • Recurso contencioso-administrativo si desestiman

7. SUSPENSIÓN DEL PAGO
   • NO se suspende automáticamente al recurrir
   • Solicita suspensión expresa con garantía si lo necesitas

⚠️  NOTA LEGAL: Documento generado con IA. Revísalo antes de presentarlo.
    No constituye asesoramiento jurídico profesional.`;
}

/** Backward-compat */
export function generateInstructions(_: string): string {
  return generateInstructionsFromMetadata({
    legislation: [], organism: "", organismAddress: "",
    fineType: "", fineAmount: "", deadline: "", rawSummary: "",
  });
}

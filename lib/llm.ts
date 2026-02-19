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
  legislation: string[];
  organism: string;
  organismAddress: string;
  fineType: string;
  fineAmount: string;
  deadline: string;
  rawSummary: string;
}

// ─── System prompts ───────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `Eres un experto en derecho administrativo español.
Se te proporciona el contenido o descripción de una notificación de multa/sanción española.

Extrae ÚNICAMENTE la siguiente información en formato JSON estricto, sin texto adicional ni markdown:

{
  "legislation": ["lista de artículos y normas citadas en la multa, ej: Art. 18 RGC, Ley 18/2009"],
  "organism": "nombre exacto del organismo que impuso la sanción y al que hay que dirigir el recurso",
  "organismAddress": "dirección o sede del organismo si aparece, cadena vacía si no",
  "fineType": "tipo de infracción descrita brevemente",
  "fineAmount": "importe de la sanción con unidad, cadena vacía si no aparece",
  "deadline": "plazo para recurrir si se menciona, cadena vacía si no",
  "rawSummary": "resumen en 2-3 frases de los hechos sancionados"
}

Responde SOLO con el JSON, sin texto antes ni después.`;

const SYSTEM_PROMPT_TEMPLATE = (role: string, metadata: FineMetadata | null) => {
  const metaBlock = metadata
    ? `
=== INFORMACIÓN EXTRAÍDA DE LA MULTA ===
- Tipo de infracción: ${metadata.fineType || "no determinado"}
- Legislación aplicable citada: ${metadata.legislation.join(", ") || "no especificada"}
- Organismo sancionador: ${metadata.organism || "no identificado"}
- Importe: ${metadata.fineAmount || "no especificado"}
- Plazo recurso: ${metadata.deadline || "verificar en notificación"}
- Resumen: ${metadata.rawSummary}
=========================================
`
    : "";

  return `Eres un experto en derecho español actuando como: ${role}.
${metaBlock}
Tu tarea es redactar un recurso administrativo profesional contra la multa descrita, dirigido específicamente a: ${metadata?.organism || "el organismo sancionador"}.

El recurso debe:
- Encabezarse con los datos del recurrente (dejar en blanco para que el usuario los complete: Nombre, DNI, Domicilio)
- Dirigirse EXPLÍCITAMENTE a: ${metadata?.organism || "el organismo competente"}
- Citar y refutar jurídicamente los artículos de la multa: ${metadata?.legislation.join(", ") || "los indicados en la notificación"}
- Estructurarse en: Encabezado, Hechos, Fundamentos de Derecho, Petición/Súplica
- Ser formal, preciso y persuasivo
- Añadir jurisprudencia o normativa adicional que apoye el recurso

Responde ÚNICAMENTE con el texto del recurso, sin comentarios adicionales.`;
};

// ─── Low-level API callers ────────────────────────────────────────────────────

async function callOpenAICompatibleRaw(
  config: AgentConfig,
  systemPrompt: string,
  userMessage: string,
  maxTokens = 3000,
  temperature = 0.3
): Promise<string> {
  const baseUrl = config.baseUrl || "https://api.openai.com/v1";
  const response = await fetch(`${baseUrl}/chat/completions`, {
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
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: maxTokens,
      temperature,
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`${config.provider} API error ${response.status}: ${err.slice(0, 200)}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callGeminiRaw(
  config: AgentConfig,
  prompt: string,
  maxTokens = 3000,
  temperature = 0.3
): Promise<string> {
  const model = config.model || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature },
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err.slice(0, 200)}`);
  }
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ─── Metadata extraction ──────────────────────────────────────────────────────

async function extractMetadataWithAgent(
  config: AgentConfig,
  multaContent: string
): Promise<FineMetadata | null> {
  try {
    let raw = "";
    if (config.provider === "gemini") {
      raw = await callGeminiRaw(
        config,
        `${EXTRACTION_SYSTEM_PROMPT}\n\n---\n\n${multaContent}`,
        800,
        0.1
      );
    } else {
      raw = await callOpenAICompatibleRaw(
        config,
        EXTRACTION_SYSTEM_PROMPT,
        multaContent,
        800,
        0.1
      );
    }
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as FineMetadata;
  } catch {
    return null;
  }
}

/**
 * Run metadata extraction in parallel across all enabled agents and merge by consensus
 */
export async function extractFineMetadata(
  agentConfigs: AgentConfig[],
  multaContent: string
): Promise<FineMetadata> {
  const enabled = agentConfigs.filter((a) => a.enabled && a.apiKey);

  const results = await Promise.allSettled(
    enabled.map((a) => extractMetadataWithAgent(a, multaContent))
  );

  const valid: FineMetadata[] = results
    .filter(
      (r): r is PromiseFulfilledResult<FineMetadata> =>
        r.status === "fulfilled" && r.value !== null
    )
    .map((r) => r.value);

  if (valid.length === 0) {
    return {
      legislation: [],
      organism: "",
      organismAddress: "",
      fineType: "",
      fineAmount: "",
      deadline: "",
      rawSummary: "",
    };
  }

  // Legislation: union of all unique entries
  const legislationSet = new Set<string>();
  for (const v of valid) {
    for (const l of v.legislation) {
      legislationSet.add(l.trim());
    }
  }

  // Organism: majority vote
  const organismCounts: Record<string, number> = {};
  for (const v of valid) {
    if (v.organism) {
      organismCounts[v.organism] = (organismCounts[v.organism] || 0) + 1;
    }
  }
  const organism =
    Object.entries(organismCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";

  // Other string fields: pick longest non-empty (most informative)
  const pick = (field: keyof FineMetadata): string => {
    const vals = valid
      .map((v) => v[field])
      .filter((x): x is string => typeof x === "string" && x.length > 0);
    return vals.sort((a, b) => b.length - a.length)[0] || "";
  };

  return {
    legislation: Array.from(legislationSet),
    organism,
    organismAddress: pick("organismAddress"),
    fineType: pick("fineType"),
    fineAmount: pick("fineAmount"),
    deadline: pick("deadline"),
    rawSummary: pick("rawSummary"),
  };
}

// ─── Main agent call ──────────────────────────────────────────────────────────

export async function callAgent(
  config: AgentConfig,
  userMessage: string,
  metadata: FineMetadata | null = null
): Promise<LLMResponse> {
  if (!config.apiKey) {
    return { content: "", error: "Sin API key configurada" };
  }

  try {
    const systemPrompt = SYSTEM_PROMPT_TEMPLATE(config.role, metadata);
    let content = "";

    if (config.provider === "gemini") {
      content = await callGeminiRaw(
        config,
        `${systemPrompt}\n\n---\n\n${userMessage}`,
        3000,
        0.3
      );
    } else {
      content = await callOpenAICompatibleRaw(config, systemPrompt, userMessage, 3000, 0.3);
    }

    return { content };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return { content: "", error: msg };
  }
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

export function buildEnrichedPrompt(
  multaContent: string,
  metadata: FineMetadata,
  supportFiles: { name: string; context: string; textContent?: string }[],
  additionalContext: string
): string {
  let prompt = `=== DOCUMENTO DE LA MULTA ===\n${multaContent}\n\n`;

  prompt += `=== ANÁLISIS PREVIO (consenso de agentes) ===\n`;
  prompt += `Tipo de infracción: ${metadata.fineType || "no determinado"}\n`;
  prompt += `Legislación citada: ${metadata.legislation.length > 0 ? metadata.legislation.join(", ") : "no especificada"}\n`;
  prompt += `Organismo sancionador: ${metadata.organism || "no identificado"}\n`;
  if (metadata.organismAddress) prompt += `Sede: ${metadata.organismAddress}\n`;
  if (metadata.fineAmount) prompt += `Importe: ${metadata.fineAmount}\n`;
  if (metadata.deadline) prompt += `Plazo recurso: ${metadata.deadline}\n`;
  prompt += `Resumen: ${metadata.rawSummary || "ver documento"}\n\n`;

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

  prompt += `Redacta el recurso administrativo dirigido a: ${metadata.organism || "el organismo sancionador"}.`;
  return prompt;
}

// ─── Merge ────────────────────────────────────────────────────────────────────

export function mergeResponses(responses: { agentName: string; content: string }[]): string {
  const valid = responses.filter((r) => r.content && r.content.length > 100);

  if (valid.length === 0) {
    return "No se pudo generar el recurso. Verifica la configuración de los agentes.";
  }
  if (valid.length === 1) {
    return valid[0].content;
  }

  const sorted = [...valid].sort((a, b) => b.content.length - a.content.length);
  const base = sorted[0].content;
  const uniqueAdditions: string[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const otherParagraphs = sorted[i].content
      .split(/\n{2,}/)
      .filter((p) => p.trim().length > 100);

    for (const para of otherParagraphs) {
      // FIX: use plain array instead of Set spread to avoid downlevelIteration error
      const paraWords = para.toLowerCase().split(/\s+/).slice(0, 10);
      const isInBase = base.split(/\n{2,}/).some((basePara) => {
        const baseWordsArr = basePara.toLowerCase().split(/\s+/).slice(0, 10);
        const intersection = paraWords.filter((w) => baseWordsArr.indexOf(w) !== -1);
        return intersection.length > 6;
      });

      if (!isInBase && para.trim().length > 0) {
        uniqueAdditions.push(para.trim());
      }
    }
  }

  if (uniqueAdditions.length === 0) return base;

  const marker = /FUNDAMENTOS DE DERECHO|fundamentos de derecho|III\.|Fundamentos/i;
  const markerIdx = base.search(marker);
  if (markerIdx > 0) {
    const insertPt = base.lastIndexOf("\n\n", base.indexOf("\n\n", markerIdx + 200));
    return (
      base.slice(0, insertPt) +
      "\n\n" +
      uniqueAdditions.join("\n\n") +
      "\n\n" +
      base.slice(insertPt)
    );
  }

  const supIdx = base.search(/SUPLICA|SOLICITA|suplica|solicita/i);
  if (supIdx > 0) {
    return (
      base.slice(0, supIdx) +
      "\n\n" +
      uniqueAdditions.join("\n\n") +
      "\n\n" +
      base.slice(supIdx)
    );
  }

  return base + "\n\n---\n\n" + uniqueAdditions.join("\n\n");
}

// ─── Instructions ─────────────────────────────────────────────────────────────

export function generateInstructionsFromMetadata(metadata: FineMetadata): string {
  const organism = metadata.organism || "el organismo sancionador";
  const address = metadata.organismAddress ? `\n   • Dirección: ${metadata.organismAddress}` : "";
  const deadline = metadata.deadline || "1 mes desde la notificación (verifica en tu notificación)";
  const amount = metadata.fineAmount ? `\n   • Importe de la sanción: ${metadata.fineAmount}` : "";
  const legLines =
    metadata.legislation.length > 0
      ? metadata.legislation.map((l) => `   • ${l}`).join("\n")
      : "   • Consultar el documento de la multa";

  return `INSTRUCCIONES PARA PRESENTAR EL RECURSO
========================================

ORGANISMO AL QUE DIRIGIR EL RECURSO
   • ${organism}${address}${amount}

LEGISLACIÓN IDENTIFICADA EN LA MULTA
${legLines}

1. PLAZO DE PRESENTACIÓN
   • ${deadline}
   • ¡IMPORTANTE! Verifica el plazo exacto en tu notificación

2. DÓNDE PRESENTARLO
   • Sede electrónica del organismo sancionador (preferible, deja registro)
   • Presencialmente en el registro de: ${organism}${address}
   • Por correo certificado con acuse de recibo
   • En cualquier oficina de registro de la Administración (Ley 39/2015)

3. DOCUMENTACIÓN A ADJUNTAR
   ☐ Este recurso (impreso y firmado, o en PDF)
   ☐ Copia de la notificación de la multa
   ☐ DNI/NIE del recurrente
   ☐ Documentación de apoyo (fotos, testigos, mapas, etc.)
   ☐ Si actúas por representación: poder notarial o autorización firmada

4. PRESENTACIÓN ELECTRÓNICA (RECOMENDADA)
   • Necesitas: DNI electrónico, certificado digital o Cl@ve
   • Accede a la sede electrónica de: ${organism}
   • Guarda el justificante de presentación (número de registro)

5. PRESENTACIÓN PRESENCIAL
   • Lleva el recurso impreso y firmado (2 copias)
   • Pide sello de entrada en tu copia
   • Conserva el resguardo

6. DESPUÉS DE PRESENTARLO
   • El organismo tiene 3 meses para resolver
   • Si no hay resolución: silencio administrativo (generalmente negativo)
   • En caso de desestimación: puedes acudir a la vía contencioso-administrativa

7. SUSPENSIÓN DEL PAGO
   • La presentación del recurso NO suspende automáticamente la sanción
   • Para suspender el pago, solicita expresamente la suspensión con garantía
   • O paga con descuento del 50% si la normativa local lo permite (pronto pago)

8. SEGUIMIENTO
   • Solicita número de expediente al presentar
   • Puedes consultar el estado en la sede electrónica de ${organism}
   • Guarda todos los documentos y justificantes

⚠️  NOTA LEGAL: Este recurso ha sido generado con asistencia de inteligencia artificial.
    Se recomienda revisarlo con un abogado antes de presentarlo, especialmente
    si la cuantía es elevada o el caso tiene complejidad jurídica.`;
}

/** Legacy wrapper kept for backward compat */
export function generateInstructions(_fineContent: string): string {
  return generateInstructionsFromMetadata({
    legislation: [],
    organism: "",
    organismAddress: "",
    fineType: "",
    fineAmount: "",
    deadline: "",
    rawSummary: "",
  });
}

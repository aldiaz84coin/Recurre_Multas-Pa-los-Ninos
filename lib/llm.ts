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

const SYSTEM_PROMPT_TEMPLATE = (role: string) => `Eres un experto en derecho español actuando como: ${role}.

Tu tarea es redactar un recurso administrativo profesional contra una multa, basándote en:
1. El documento de la multa proporcionado
2. La documentación de apoyo (legislación, reglamentos, jurisprudencia)
3. El contexto adicional del usuario

El recurso debe:
- Estar estructurado con: Encabezado, Hechos, Fundamentos de Derecho, Petición/Suplica
- Citar artículos específicos del ordenamiento jurídico español aplicables
- Ser formal, preciso y persuasivo
- Incluir argumentos jurídicos sólidos
- Seguir el formato de recurso de alzada/potestativo de reposición según corresponda

Responde ÚNICAMENTE con el texto del recurso, sin comentarios adicionales previos ni posteriores.`;

/**
 * Call any OpenAI-compatible API (Groq, OpenRouter, custom, OpenAI)
 */
async function callOpenAICompatible(
  config: AgentConfig,
  userMessage: string
): Promise<LLMResponse> {
  const baseUrl = config.baseUrl || "https://api.openai.com/v1";
  const url = `${baseUrl}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      // OpenRouter specific
      ...(config.provider === "openrouter"
        ? {
            "HTTP-Referer": "https://recursapp.vercel.app",
            "X-Title": "RecursApp",
          }
        : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT_TEMPLATE(config.role) },
        { role: "user", content: userMessage },
      ],
      max_tokens: 3000,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`${config.provider} API error ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  return { content: data.choices?.[0]?.message?.content || "" };
}

/**
 * Call Google Gemini API (different format)
 */
async function callGemini(
  config: AgentConfig,
  userMessage: string
): Promise<LLMResponse> {
  const model = config.model || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `${SYSTEM_PROMPT_TEMPLATE(config.role)}\n\n---\n\n${userMessage}`,
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 3000,
        temperature: 0.3,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return { content };
}

export async function callAgent(
  config: AgentConfig,
  userMessage: string
): Promise<LLMResponse> {
  if (!config.apiKey) {
    return { content: "", error: "Sin API key configurada" };
  }

  try {
    if (config.provider === "gemini") {
      return await callGemini(config, userMessage);
    } else {
      return await callOpenAICompatible(config, userMessage);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return { content: "", error: msg };
  }
}

/**
 * Merge multiple LLM outputs into a consensus document
 */
export function mergeResponses(responses: { agentName: string; content: string }[]): string {
  const valid = responses.filter((r) => r.content && r.content.length > 100);

  if (valid.length === 0) {
    return "No se pudo generar el recurso. Verifica la configuración de los agentes.";
  }

  if (valid.length === 1) {
    return valid[0].content;
  }

  // For multiple responses: take the longest as base, then add unique arguments
  // Sort by length descending
  const sorted = [...valid].sort((a, b) => b.content.length - a.content.length);
  const base = sorted[0].content;

  // Extract unique sections from other agents not present in base
  // Simple approach: if other agents have paragraphs > 100 chars not in base, append them
  const uniqueAdditions: string[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const otherParagraphs = sorted[i].content
      .split(/\n{2,}/)
      .filter((p) => p.trim().length > 100);

    for (const para of otherParagraphs) {
      // Check if this paragraph has unique content (simple similarity check)
      const paraWords = new Set(para.toLowerCase().split(/\s+/).slice(0, 10));
      const isInBase = base
        .split(/\n{2,}/)
        .some((basePara) => {
          const baseWords = new Set(basePara.toLowerCase().split(/\s+/).slice(0, 10));
          const intersection = [...paraWords].filter((w) => baseWords.has(w));
          return intersection.length > 6; // 60%+ overlap = duplicate
        });

      if (!isInBase && para.trim().length > 0) {
        uniqueAdditions.push(para.trim());
      }
    }
  }

  if (uniqueAdditions.length === 0) {
    return base;
  }

  // Insert unique arguments in the "Fundamentos de Derecho" section if possible
  const marker = /FUNDAMENTOS DE DERECHO|fundamentos de derecho|III\.|Fundamentos/i;
  const markerIdx = base.search(marker);

  if (markerIdx > 0) {
    const insertPt = base.lastIndexOf("\n\n", base.indexOf("\n\n", markerIdx + 200));
    const merged =
      base.slice(0, insertPt) +
      "\n\n" +
      uniqueAdditions.join("\n\n") +
      "\n\n" +
      base.slice(insertPt);
    return merged;
  }

  // Fallback: append before the final SUPLICA/SOLICITA section
  const supMarker = /SUPLICA|SOLICITA|suplica|solicita/i;
  const supIdx = base.search(supMarker);

  if (supIdx > 0) {
    const merged =
      base.slice(0, supIdx) +
      "\n\n" +
      uniqueAdditions.join("\n\n") +
      "\n\n" +
      base.slice(supIdx);
    return merged;
  }

  return base + "\n\n---\n\n" + uniqueAdditions.join("\n\n");
}

export function generateInstructions(fineContent: string): string {
  return `INSTRUCCIONES PARA PRESENTAR EL RECURSO
========================================

1. PLAZO DE PRESENTACIÓN
   • Recurso de reposición: 1 mes desde la notificación de la multa
   • Recurso de alzada: 1 mes desde la notificación (si corresponde)
   • ¡IMPORTANTE! Verifica el plazo exacto en tu notificación

2. DÓNDE PRESENTARLO
   • Sede electrónica del organismo sancionador (preferible, deja registro)
   • Presencialmente en el registro del organismo
   • Por correo certificado con acuse de recibo
   • En cualquier oficina de registro de la Administración (Ley 39/2015)

3. DOCUMENTACIÓN A ADJUNTAR
   ☐ Este recurso (impreso y firmado, o en PDF)
   ☐ Copia de la notificación de la multa
   ☐ DNI/NIE del titular del vehículo
   ☐ Documentación de apoyo (fotos, testigos, mapas, etc.)
   ☐ Si actúas por representación: poder notarial o autorización firmada

4. PRESENTACIÓN ELECTRÓNICA (RECOMENDADA)
   • Necesitas: DNI electrónico, certificado digital o Cl@ve
   • Accede a: sede.gob.es o la sede del organismo
   • Guarda el justificante de presentación

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
   • Puedes consultar el estado en la sede electrónica
   • Guarda todos los documentos y justificantes

⚠️  NOTA LEGAL: Este recurso ha sido generado con asistencia de inteligencia artificial.
    Se recomienda revisarlo con un abogado antes de presentarlo, especialmente
    si la cuantía es elevada o el caso tiene complejidad jurídica.`;
}

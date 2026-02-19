/**
 * lib/llm.ts
 * 3 proveedores con soporte de visión (imagen + PDF escaneado)
 * - Mistral Pixtral 12B  → visión nativa, tier gratuito
 * - Gemini 2.0 Flash     → visión nativa, tier gratuito
 * - OpenRouter Gemma 3   → visión nativa, modelo :free
 */

export interface AgentConfig {
  id: string;
  name: string;
  provider: "mistral" | "gemini" | "openrouter";
  model: string;
  apiKey: string;
  enabled: boolean;
}

export interface LLMResponse {
  content: string;
  error?: string;
}

// ─── 3 agentes fijos ──────────────────────────────────────────────────────────

export const FIXED_AGENTS: {
  id: string;
  name: string;
  provider: "mistral" | "gemini" | "openrouter";
  model: string;
  label: string;
  freeInfo: string;
  signupUrl: string;
  color: string;
}[] = [
  {
    id: "agent-mistral",
    name: "Agente Mistral",
    provider: "mistral",
    model: "pixtral-12b-2409",
    label: "Mistral · Pixtral 12B",
    freeInfo: "Gratis · visión nativa · Sin tarjeta",
    signupUrl: "https://console.mistral.ai/api-keys",
    color: "#f97316",
  },
  {
    id: "agent-gemini",
    name: "Agente Gemini",
    provider: "gemini",
    model: "gemini-2.0-flash",
    label: "Google Gemini 2.0 Flash",
    freeInfo: "Gratis · visión nativa · Sin tarjeta",
    signupUrl: "https://aistudio.google.com/apikey",
    color: "#4285f4",
  },
  {
    id: "agent-openrouter",
    name: "Agente OpenRouter",
    provider: "openrouter",
    model: "google/gemma-3-12b-it:free",
    label: "OpenRouter · Gemma 3 12B :free",
    freeInfo: "Gratis · visión nativa · Sin tarjeta",
    signupUrl: "https://openrouter.ai/keys",
    color: "#8b5cf6",
  },
];

// ─── Prompt del sistema ───────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un experto en derecho administrativo español especializado en recursos de multas y sanciones.

Tu tarea es redactar un RECURSO DE REPOSICIÓN profesional contra una multa o sanción administrativa.

Si se adjunta una imagen o PDF de la multa, analiza su contenido visual para extraer todos los datos relevantes: organismo sancionador, artículos infringidos, importe, fecha, plazo de recurso y hechos descritos.

ESTRUCTURA OBLIGATORIA del recurso:
1. DATOS DEL RECURRENTE (bloque para rellenar: NOMBRE, DNI, DOMICILIO, TELÉFONO, EMAIL)
2. ORGANISMO AL QUE SE DIRIGE (extraído del documento)
3. HECHOS (exposición de los hechos sancionados según el documento)
4. FUNDAMENTOS DE DERECHO (argumentos jurídicos, legislación aplicable, jurisprudencia)
5. SÚPLICA (petición concreta: anulación, reducción, etc.)
6. LUGAR, FECHA Y FIRMA

Reglas:
- Tono formal y persuasivo
- Cita artículos concretos de la legislación española (LSV, LRJPAC, Ley 39/2015, etc.)
- Identifica y refuta cada punto de la multa usando los datos reales del documento
- Añade jurisprudencia o doctrina favorable al recurrente cuando sea posible
- Genera el recurso completo, no un esquema

Responde ÚNICAMENTE con el texto del recurso. Sin comentarios previos ni explicaciones.`;

// ─── Mistral Pixtral (visión nativa) ─────────────────────────────────────────

async function callMistral(
  apiKey: string,
  userPrompt: string,
  imageBase64?: string,
  imageMime?: string
): Promise<string> {
  const userContent: Array<Record<string, unknown>> = [];
  if (imageBase64 && imageMime) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${imageMime};base64,${imageBase64}` },
    });
  }
  userContent.push({ type: "text", text: userPrompt });

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "pixtral-12b-2409",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: imageBase64 ? userContent : userPrompt },
      ],
      max_tokens: 4000,
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Mistral ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ─── Gemini 2.0 Flash (visión nativa) ────────────────────────────────────────

async function callGemini(
  apiKey: string,
  userPrompt: string,
  imageBase64?: string,
  imageMime?: string
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const parts: Array<Record<string, unknown>> = [];
  if (imageBase64 && imageMime) {
    parts.push({ inlineData: { mimeType: imageMime, data: imageBase64 } });
  }
  parts.push({ text: `${SYSTEM_PROMPT}\n\n---\n\n${userPrompt}` });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { maxOutputTokens: 4000, temperature: 0.3 },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ─── OpenRouter Gemma 3 (visión nativa) ──────────────────────────────────────

async function callOpenRouter(
  apiKey: string,
  userPrompt: string,
  imageBase64?: string,
  imageMime?: string
): Promise<string> {
  const userContent: Array<Record<string, unknown>> = [];
  if (imageBase64 && imageMime) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${imageMime};base64,${imageBase64}` },
    });
  }
  userContent.push({ type: "text", text: userPrompt });

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://recursapp.vercel.app",
      "X-Title": "RecursApp",
    },
    body: JSON.stringify({
      model: "google/gemma-3-12b-it:free",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: imageBase64 ? userContent : userPrompt },
      ],
      max_tokens: 4000,
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ─── Función principal ────────────────────────────────────────────────────────

export async function callAgent(
  config: AgentConfig,
  userPrompt: string,
  imageBase64?: string,
  imageMime?: string
): Promise<LLMResponse> {
  if (!config.apiKey) return { content: "", error: "Sin API key configurada" };
  try {
    let content = "";
    if (config.provider === "mistral") {
      content = await callMistral(config.apiKey, userPrompt, imageBase64, imageMime);
    } else if (config.provider === "gemini") {
      content = await callGemini(config.apiKey, userPrompt, imageBase64, imageMime);
    } else if (config.provider === "openrouter") {
      content = await callOpenRouter(config.apiKey, userPrompt, imageBase64, imageMime);
    }
    return { content };
  } catch (err) {
    return {
      content: "",
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

// ─── Prompt de usuario ────────────────────────────────────────────────────────

export function buildUserPrompt(
  multaText: string,
  supportFiles: { name: string; context: string }[],
  additionalContext: string
): string {
  let prompt = `=== CONTENIDO / TEXTO EXTRAÍDO DE LA MULTA ===\n${multaText}\n\n`;
  if (supportFiles.length > 0) {
    prompt += `=== DOCUMENTACIÓN DE APOYO ===\n`;
    for (const sf of supportFiles) {
      prompt += `\n--- ${sf.name} ---\n`;
      if (sf.context) prompt += `Contexto: ${sf.context}\n`;
    }
    prompt += "\n";
  }
  if (additionalContext) {
    prompt += `=== CONTEXTO ADICIONAL DEL USUARIO ===\n${additionalContext}\n\n`;
  }
  prompt += `Analiza el documento adjunto y redacta el recurso administrativo completo y profesional contra esta multa.`;
  return prompt;
}

// ─── Instrucciones de presentación ───────────────────────────────────────────

export function generateInstructions(): string {
  return `INSTRUCCIONES PARA PRESENTAR EL RECURSO
========================================

1. PLAZO DE PRESENTACIÓN
   • Recurso de reposición: 1 mes desde la notificación
   • Verifica el plazo exacto en tu documento de multa

2. DÓNDE PRESENTARLO
   • Sede electrónica del organismo sancionador
   • Presencialmente en su registro de entrada
   • Por correo certificado con acuse de recibo
   • En cualquier registro oficial (Ley 39/2015 art. 16.4)

3. DOCUMENTACIÓN A ADJUNTAR
   ☐ Este recurso (impreso y firmado, o en PDF con firma digital)
   ☐ Copia de la notificación de la multa
   ☐ Copia del DNI/NIE del recurrente
   ☐ Cualquier prueba adicional (fotos, testigos, etc.)

4. PRESENTACIÓN ELECTRÓNICA (RECOMENDADA)
   • Necesitas: DNI electrónico, certificado digital o Cl@ve
   • Guarda siempre el justificante con número de registro

5. PRESENTACIÓN PRESENCIAL
   • Lleva 2 copias firmadas · Pide sello de entrada en la tuya

6. DESPUÉS DE PRESENTARLO
   • El organismo tiene 1 mes para resolver
   • Si no hay respuesta → silencio administrativo negativo
   • Puedes interponer recurso contencioso-administrativo

7. SUSPENSIÓN DEL PAGO
   • Recurrir NO suspende automáticamente la obligación de pago
   • Solicita suspensión cautelar expresa si lo necesitas

⚠️  Este documento es generado por IA y no constituye asesoramiento jurídico profesional.
    Revísalo antes de presentarlo. Considera consultar a un abogado para casos complejos.`;
}

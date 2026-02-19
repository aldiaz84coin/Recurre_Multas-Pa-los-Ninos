/**
 * lib/llm.ts
 *
 * Agentes (solo texto, sin visión — el parseo ya lo hizo OpenRouter/auto):
 * - Mistral Small   → tier gratuito, system prompt estándar
 * - OpenRouter x2  → dos modelos :free distintos sin system prompt (Gemma no lo soporta)
 *
 * Gemini eliminado: rate limits demasiado bajos en free tier.
 */

export interface AgentConfig {
  id: string;
  name: string;
  provider: "mistral" | "openrouter";
  model: string;
  apiKey: string;
  enabled: boolean;
  noSystemPrompt?: boolean; // algunos modelos no aceptan role:system
}

export interface LLMResponse {
  content: string;
  error?: string;
}

// ─── 3 agentes fijos ──────────────────────────────────────────────────────────

export const FIXED_AGENTS: {
  id: string;
  name: string;
  provider: "mistral" | "openrouter";
  model: string;
  label: string;
  freeInfo: string;
  signupUrl: string;
  color: string;
  noSystemPrompt?: boolean;
}[] = [
  {
    id: "agent-mistral",
    name: "Agente Mistral",
    provider: "mistral",
    model: "mistral-small-latest",
    label: "Mistral · Mistral Small",
    freeInfo: "Gratis · tier gratuito · Sin tarjeta",
    signupUrl: "https://console.mistral.ai/api-keys",
    color: "#f97316",
  },
  {
    id: "agent-openrouter-1",
    name: "Agente OpenRouter 1",
    provider: "openrouter",
    model: "meta-llama/llama-3.3-70b-instruct:free",
    label: "OpenRouter · Llama 3.3 70B :free",
    freeInfo: "Gratis · sin coste · Sin tarjeta",
    signupUrl: "https://openrouter.ai/keys",
    color: "#8b5cf6",
    noSystemPrompt: false,
  },
  {
    id: "agent-openrouter-2",
    name: "Agente OpenRouter 2",
    provider: "openrouter",
    model: "deepseek/deepseek-chat-v3-0324:free",
    label: "OpenRouter · DeepSeek V3 :free",
    freeInfo: "Gratis · sin coste · Sin tarjeta",
    signupUrl: "https://openrouter.ai/keys",
    color: "#06b6d4",
    noSystemPrompt: false,
  },
];

// ─── Prompt del sistema ───────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un experto en derecho administrativo español especializado en recursos de multas y sanciones.

Se te proporcionan los datos estructurados de una multa extraídos del documento original.
Tu tarea es redactar un RECURSO DE REPOSICIÓN profesional y completo.

ESTRUCTURA OBLIGATORIA:
1. DATOS DEL RECURRENTE (bloque para rellenar: NOMBRE, DNI, DOMICILIO, TELÉFONO, EMAIL)
2. ORGANISMO AL QUE SE DIRIGE (usa el organismo exacto de los datos)
3. HECHOS (usa los datos reales de la multa)
4. FUNDAMENTOS DE DERECHO
   - Refuta jurídicamente cada artículo citado en la multa
   - Cita jurisprudencia y normativa favorable (Ley 39/2015, LSV, RD 1428/2003...)
   - Argumenta defectos formales si los hay
5. SÚPLICA (petición concreta: nulidad, anulación o reducción)
6. LUGAR, FECHA Y FIRMA

Reglas: tono formal y persuasivo, usa solo datos reales, sé exhaustivo en fundamentos de derecho, genera el recurso completo listo para presentar.

Responde ÚNICAMENTE con el texto del recurso. Sin comentarios ni explicaciones.`;

// ─── Mistral ──────────────────────────────────────────────────────────────────

async function callMistral(apiKey: string, userPrompt: string): Promise<string> {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "mistral-small-latest",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
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

// ─── OpenRouter (sin system prompt separado — va incluido en el user message) ─

async function callOpenRouter(apiKey: string, model: string, userPrompt: string): Promise<string> {
  // Algunos modelos de OpenRouter (Gemma, etc.) no aceptan role:system.
  // Solución universal: incluir el system prompt dentro del user message.
  const fullPrompt = `${SYSTEM_PROMPT}\n\n---\n\n${userPrompt}`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://recursapp.vercel.app",
      "X-Title": "RecursApp",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "user", content: fullPrompt },
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
  userPrompt: string
): Promise<LLMResponse> {
  if (!config.apiKey) return { content: "", error: "Sin API key configurada" };
  try {
    let content = "";
    if (config.provider === "mistral") {
      content = await callMistral(config.apiKey, userPrompt);
    } else if (config.provider === "openrouter") {
      content = await callOpenRouter(config.apiKey, config.model, userPrompt);
    }
    return { content };
  } catch (err) {
    return { content: "", error: err instanceof Error ? err.message : "Error desconocido" };
  }
}

// ─── Prompt de usuario ────────────────────────────────────────────────────────

export function buildUserPrompt(
  parsedMultaText: string,
  supportFiles: { name: string; context: string }[],
  additionalContext: string
): string {
  let prompt = `=== DATOS DE LA MULTA (extraídos del documento) ===\n${parsedMultaText}\n\n`;
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
  prompt += `Con todos estos datos, redacta el recurso administrativo completo y profesional.`;
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

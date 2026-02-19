/**
 * lib/llm.ts
 *
 * FASE 2 — 3 agentes en paralelo generan sus recursos
 * FASE 3 — Mistral Large (el más potente disponible gratis) fusiona los 3 en el RECURSO DEFINITIVO
 */

export interface AgentConfig {
  id: string;
  name: string;
  provider: "mistral" | "openrouter";
  model: string;
  apiKey: string;
  enabled: boolean;
}

export interface LLMResponse {
  content: string;
  error?: string;
}

// ─── 3 agentes de redacción ───────────────────────────────────────────────────

export const FIXED_AGENTS: {
  id: string;
  name: string;
  provider: "mistral" | "openrouter";
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
    model: "mistral-small-latest",
    label: "Mistral · Mistral Small",
    freeInfo: "Gratis · tier gratuito · Sin tarjeta",
    signupUrl: "https://console.mistral.ai/api-keys",
    color: "#f97316",
  },
  {
    id: "agent-openrouter-1",
    name: "Agente Llama",
    provider: "openrouter",
    model: "meta-llama/llama-3.3-70b-instruct:free",
    label: "OpenRouter · Llama 3.3 70B :free",
    freeInfo: "Gratis · sin coste · Sin tarjeta",
    signupUrl: "https://openrouter.ai/keys",
    color: "#8b5cf6",
  },
  {
    id: "agent-openrouter-2",
    name: "Agente DeepSeek",
    provider: "openrouter",
    model: "deepseek/deepseek-chat-v3-0324:free",
    label: "OpenRouter · DeepSeek V3 :free",
    freeInfo: "Gratis · sin coste · Sin tarjeta",
    signupUrl: "https://openrouter.ai/keys",
    color: "#06b6d4",
  },
];

// ─── Prompt de redacción (agentes 1-3) ───────────────────────────────────────

const DRAFT_PROMPT = `Eres un experto en derecho administrativo español especializado en recursos de multas y sanciones.

Se te proporcionan los datos estructurados de una multa. Redacta un RECURSO DE REPOSICIÓN profesional y completo.

ESTRUCTURA OBLIGATORIA:
1. DATOS DEL RECURRENTE (bloque para rellenar: NOMBRE, DNI, DOMICILIO, TELÉFONO, EMAIL)
2. ORGANISMO AL QUE SE DIRIGE (usa el organismo exacto de los datos)
3. HECHOS (usa los datos reales de la multa)
4. FUNDAMENTOS DE DERECHO
   - Refuta jurídicamente cada artículo citado en la multa
   - Cita jurisprudencia y normativa favorable (Ley 39/2015, LSV, RD 1428/2003...)
   - Argumenta defectos formales si los hay (notificación, competencia, plazo...)
5. SÚPLICA (petición concreta: nulidad, anulación o reducción)
6. LUGAR, FECHA Y FIRMA

Reglas: tono formal y persuasivo, usa solo datos reales, sé exhaustivo, genera el recurso completo.
Responde ÚNICAMENTE con el texto del recurso. Sin comentarios ni explicaciones previas.`;

// ─── Prompt de fusión (agente maestro) ───────────────────────────────────────

const MERGE_PROMPT = `Eres el mejor abogado administrativista de España, especializado en recursos de multas y sanciones de tráfico.

Se te presentan TRES borradores de recurso administrativo redactados por diferentes IAs para la misma multa.
Tu misión es crear el RECURSO DEFINITIVO: el más completo, sólido, persuasivo y formalmente correcto posible.

INSTRUCCIONES DE FUSIÓN:
- Analiza los tres borradores y extrae lo mejor de cada uno
- Mantén TODOS los argumentos jurídicos válidos que aparezcan en cualquiera de los tres
- Elige la redacción más clara y formal para cada sección
- Elimina redundancias y contradicciones
- Añade cualquier argumento o jurisprudencia adicional que mejore el recurso
- El resultado debe ser UN SOLO recurso coherente, completo y listo para presentar

ESTRUCTURA OBLIGATORIA del recurso definitivo:
1. DATOS DEL RECURRENTE (bloque para rellenar: NOMBRE, DNI, DOMICILIO, TELÉFONO, EMAIL)
2. ORGANISMO AL QUE SE DIRIGE
3. HECHOS
4. FUNDAMENTOS DE DERECHO (esta sección debe ser especialmente exhaustiva — recoge todos los argumentos válidos de los tres borradores)
5. SÚPLICA
6. LUGAR, FECHA Y FIRMA

Responde ÚNICAMENTE con el texto del recurso definitivo. Sin comentarios, sin explicaciones, sin comparativa de borradores.`;

// ─── Llamadas a APIs ──────────────────────────────────────────────────────────

async function callMistral(apiKey: string, model: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 6000,
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

async function callOpenRouter(apiKey: string, model: string, systemPrompt: string, userPrompt: string): Promise<string> {
  // System prompt embebido en user para compatibilidad universal con todos los modelos
  const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;
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
      messages: [{ role: "user", content: fullPrompt }],
      max_tokens: 6000,
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

// ─── Agente redactor (fase 2) ─────────────────────────────────────────────────

export async function callAgent(config: AgentConfig, userPrompt: string): Promise<LLMResponse> {
  if (!config.apiKey) return { content: "", error: "Sin API key configurada" };
  try {
    let content = "";
    if (config.provider === "mistral") {
      content = await callMistral(config.apiKey, config.model, DRAFT_PROMPT, userPrompt);
    } else {
      content = await callOpenRouter(config.apiKey, config.model, DRAFT_PROMPT, userPrompt);
    }
    return { content };
  } catch (err) {
    return { content: "", error: err instanceof Error ? err.message : "Error desconocido" };
  }
}

// ─── Agente maestro fusionador (fase 3) ──────────────────────────────────────
// Usa Mistral Large si hay key de Mistral, sino DeepSeek V3 via OpenRouter

export async function callMasterAgent(
  apiKeys: { mistral: string; openrouter: string },
  drafts: { agentName: string; content: string }[]
): Promise<LLMResponse> {
  const validDrafts = drafts.filter(d => d.content && d.content.length > 100);
  if (validDrafts.length === 0) return { content: "", error: "No hay borradores válidos para fusionar" };
  if (validDrafts.length === 1) return { content: validDrafts[0].content }; // solo uno, no hace falta fusionar

  const userPrompt = validDrafts
    .map((d, i) => `=== BORRADOR ${i + 1} (${d.agentName}) ===\n\n${d.content}`)
    .join("\n\n" + "─".repeat(60) + "\n\n");

  try {
    // Mistral Large es el más potente disponible con free tier
    if (apiKeys.mistral) {
      const content = await callMistral(apiKeys.mistral, "mistral-large-latest", MERGE_PROMPT, userPrompt);
      if (content.length > 100) return { content };
    }
    // Fallback: DeepSeek V3 via OpenRouter (también muy capaz)
    if (apiKeys.openrouter) {
      const content = await callOpenRouter(apiKeys.openrouter, "deepseek/deepseek-chat-v3-0324:free", MERGE_PROMPT, userPrompt);
      if (content.length > 100) return { content };
    }
    return { content: "", error: "No se pudo generar el recurso definitivo" };
  } catch (err) {
    return { content: "", error: err instanceof Error ? err.message : "Error en fusión" };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

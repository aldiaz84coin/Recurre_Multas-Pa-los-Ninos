/**
 * lib/llm.ts
 *
 * FASE 2 — 3 agentes en paralelo → cada uno genera un borrador + propone URL sede electrónica
 * FASE 3 — Mistral Large fusiona los 3 borradores en el RECURSO DEFINITIVO + URL consensuada
 */

export interface AgentConfig {
  id: string;
  name: string;
  provider: "mistral" | "openrouter";
  model: string;
  apiKey: string;
  enabled: boolean;
}

export interface UrlProposal {
  url: string;
  nombre: string;
  confianza: string;
}

export interface LLMResponse {
  content: string;
  error?: string;
  urlProposal?: UrlProposal;
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
}[] = [
  {
    id: "agent-mistral-small",
    name: "Agente Mistral Small",
    provider: "mistral",
    model: "mistral-small-latest",
    label: "Mistral · Mistral Small",
    freeInfo: "Gratis · tier gratuito · Sin tarjeta",
    signupUrl: "https://console.mistral.ai/api-keys",
    color: "#f97316",
  },
  {
    id: "agent-llama4-maverick",
    name: "Agente Llama 4 Maverick",
    provider: "openrouter",
    model: "meta-llama/llama-4-maverick:free",
    label: "OpenRouter · Llama 4 Maverick :free",
    freeInfo: "Gratis · sin coste · Sin tarjeta",
    signupUrl: "https://openrouter.ai/keys",
    color: "#8b5cf6",
  },
  {
    id: "agent-llama4-scout",
    name: "Agente Llama 4 Scout",
    provider: "openrouter",
    model: "meta-llama/llama-4-scout:free",
    label: "OpenRouter · Llama 4 Scout :free",
    freeInfo: "Gratis · sin coste · Sin tarjeta",
    signupUrl: "https://openrouter.ai/keys",
    color: "#06b6d4",
  },
];

// ─── Prompts ──────────────────────────────────────────────────────────────────

const DRAFT_PROMPT = `Eres un experto en derecho administrativo español especializado en recursos de multas y sanciones.

Se te proporcionan los datos estructurados de una multa. Tu tarea es DOS cosas:

TAREA 1 — Redacta un RECURSO DE REPOSICIÓN profesional y completo con esta estructura:
1. DATOS DEL RECURRENTE (bloque para rellenar: NOMBRE, DNI, DOMICILIO, TELÉFONO, EMAIL)
2. ORGANISMO AL QUE SE DIRIGE (usa el organismo exacto de los datos)
3. HECHOS (usa los datos reales de la multa)
4. FUNDAMENTOS DE DERECHO
   - Refuta jurídicamente cada artículo citado en la multa
   - Cita jurisprudencia y normativa favorable (Ley 39/2015, LSV, RD 1428/2003...)
   - Argumenta defectos formales si los hay
5. SÚPLICA (petición concreta: nulidad, anulación o reducción)
6. LUGAR, FECHA Y FIRMA

TAREA 2 — Al FINAL del recurso, añade una línea con este formato exacto:
|||URL_SEDE:{"url":"https://...","nombre":"Nombre del portal","confianza":"alta|media|baja"}|||

Determina la URL de la sede electrónica basándote en el organismo sancionador. Ejemplos:
- DGT / Jefatura de Tráfico → {"url":"https://sede.dgt.gob.es","nombre":"Sede DGT","confianza":"alta"}
- Ayuntamiento de Madrid → {"url":"https://sede.madrid.es","nombre":"Sede Electrónica Madrid","confianza":"alta"}
- Ayuntamiento de Barcelona → {"url":"https://seuelectronica.ajuntament.barcelona.cat","nombre":"Seu Electrònica Barcelona","confianza":"alta"}
- Diputación / SPT Granada → {"url":"https://spgr.es","nombre":"Servicio Provincial Tributario Granada","confianza":"alta"}
- Diputaciones en general → busca en sede.dip[provincia].es

Reglas para el recurso: tono formal y persuasivo, usa solo datos reales, sé exhaustivo.
Responde ÚNICAMENTE con el texto del recurso + la línea |||URL_SEDE:...||| al final.`;

const MERGE_PROMPT = `Eres el mejor abogado administrativista de España.

Se te presentan TRES borradores de recurso administrativo para la misma multa. Tu misión: crear el RECURSO DEFINITIVO.

INSTRUCCIONES:
- Extrae lo mejor de cada borrador
- Mantén TODOS los argumentos jurídicos válidos de los tres
- Elige la redacción más clara y formal para cada sección
- Elimina redundancias y contradicciones
- El resultado debe ser UN SOLO recurso coherente y completo

ESTRUCTURA OBLIGATORIA:
1. DATOS DEL RECURRENTE (NOMBRE, DNI, DOMICILIO, TELÉFONO, EMAIL)
2. ORGANISMO AL QUE SE DIRIGE
3. HECHOS
4. FUNDAMENTOS DE DERECHO (exhaustivo — recoge todos los argumentos válidos)
5. SÚPLICA
6. LUGAR, FECHA Y FIRMA

Al FINAL del recurso añade:
|||URL_SEDE:{"url":"https://...","nombre":"Nombre","confianza":"alta|media|baja"}|||

Responde ÚNICAMENTE con el recurso definitivo + la línea |||URL_SEDE:...||| Sin comentarios.`;

// ─── Parsear la URL del final del contenido ───────────────────────────────────

function extractAndStripUrl(raw: string): { content: string; urlProposal?: UrlProposal } {
  const match = raw.match(/\|\|\|URL_SEDE:(\{.*?\})\|\|\|/s);
  if (!match) return { content: raw.trim() };
  try {
    const urlProposal = JSON.parse(match[1]) as UrlProposal;
    const content = raw.replace(/\|\|\|URL_SEDE:.*?\|\|\|/s, "").trim();
    return { content, urlProposal };
  } catch {
    return { content: raw.replace(/\|\|\|URL_SEDE:.*?\|\|\|/s, "").trim() };
  }
}

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
    let raw = "";
    if (config.provider === "mistral") {
      raw = await callMistral(config.apiKey, config.model, DRAFT_PROMPT, userPrompt);
    } else {
      raw = await callOpenRouter(config.apiKey, config.model, DRAFT_PROMPT, userPrompt);
    }
    const { content, urlProposal } = extractAndStripUrl(raw);
    return { content, urlProposal };
  } catch (err) {
    return { content: "", error: err instanceof Error ? err.message : "Error desconocido" };
  }
}

// ─── Agente maestro fusionador (fase 3) ──────────────────────────────────────

export async function callMasterAgent(
  apiKeys: { mistral: string; openrouter: string },
  drafts: { agentName: string; content: string }[],
  parsedText?: string
): Promise<LLMResponse> {
  const validDrafts = drafts.filter(d => d.content && d.content.length > 100);
  if (validDrafts.length === 0) return { content: "", error: "No hay borradores válidos para fusionar" };
  if (validDrafts.length === 1) {
    const { content, urlProposal } = extractAndStripUrl(validDrafts[0].content);
    return { content, urlProposal };
  }

  const userPrompt = [
    parsedText ? `=== DATOS ORIGINALES DE LA MULTA ===\n${parsedText}\n\n` : "",
    ...validDrafts.map((d, i) => `=== BORRADOR ${i + 1} (${d.agentName}) ===\n\n${d.content}`)
  ].join("\n\n" + "─".repeat(60) + "\n\n");

  try {
    if (apiKeys.mistral) {
      const raw = await callMistral(apiKeys.mistral, "mistral-large-latest", MERGE_PROMPT, userPrompt);
      if (raw.length > 100) {
        const { content, urlProposal } = extractAndStripUrl(raw);
        return { content, urlProposal };
      }
    }
    // Fallback: Llama 4 Maverick
    if (apiKeys.openrouter) {
      const raw = await callOpenRouter(apiKeys.openrouter, "meta-llama/llama-4-maverick:free", MERGE_PROMPT, userPrompt);
      if (raw.length > 100) {
        const { content, urlProposal } = extractAndStripUrl(raw);
        return { content, urlProposal };
      }
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
  prompt += `Con todos estos datos, realiza las dos tareas descritas.`;
  return prompt;
}

export function generateInstructions(): string {
  return `INSTRUCCIONES PARA PRESENTAR EL RECURSO
========================================

1. PLAZO DE PRESENTACIÓN
   • Recurso de reposición: 1 mes desde la notificación
   • Verifica el plazo exacto en tu documento de multa

2. DÓNDE PRESENTARLO
   • Sede electrónica del organismo sancionador (ver enlace arriba)
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

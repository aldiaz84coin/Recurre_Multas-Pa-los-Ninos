/**
 * lib/llm.ts
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
4. FUNDAMENTOS DE DERECHO (esta sección debe ser especialmente exhaustiva)
5. SÚPLICA
6. LUGAR, FECHA Y FIRMA

Responde ÚNICAMENTE con el texto del recurso definitivo. Sin comentarios, sin explicaciones, sin comparativa de borradores.`;

// ─── Mistral ──────────────────────────────────────────────────────────────────

async function callMistral(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
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

  let data: Record<string, unknown> | null = null;
  try { data = await res.json(); } catch { /* ignore */ }

  if (!res.ok) {
    const errMsg =
      (data?.message as string | undefined) ||
      ((data?.error as Record<string, unknown>)?.message as string | undefined) ||
      `HTTP ${res.status}`;
    throw new Error(`Mistral [${model}] ${res.status}: ${errMsg}`);
  }

  const choices = data?.choices as Array<{ message?: { content?: string } }> | undefined;
  const content = choices?.[0]?.message?.content;
  if (!content) throw new Error(`Mistral [${model}]: respuesta vacía`);
  return content;
}

// ─── OpenRouter ───────────────────────────────────────────────────────────────
// FIX: antes se leía con res.text() y se perdía la estructura del error JSON.
// Ahora siempre parseamos JSON y extraemos data.error.message correctamente.

async function callOpenRouter(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  // System prompt embebido en user — necesario para modelos :free que ignoran system
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

  // SIEMPRE leer como JSON — OpenRouter nunca devuelve texto plano en errores
  let data: Record<string, unknown> | null = null;
  try {
    data = await res.json();
  } catch {
    throw new Error(`OpenRouter [${model}] ${res.status}: respuesta no es JSON válido`);
  }

  if (!res.ok) {
    // OpenRouter estructura de error: { error: { message: string, code: number } }
    const errObj = data?.error as Record<string, unknown> | undefined;
    const errMsg =
      (typeof errObj?.message === "string" ? errObj.message : null) ||
      (typeof data?.message === "string" ? data.message : null) ||
      `HTTP ${res.status}`;
    throw new Error(`OpenRouter [${model}] ${res.status}: ${errMsg}`);
  }

  // Rate limits silenciosos: HTTP 200 pero campo error en body
  if (data?.error) {
    const errObj = data.error as Record<string, unknown>;
    const errMsg =
      (typeof errObj?.message === "string" ? errObj.message : null) ||
      JSON.stringify(data.error).slice(0, 200);
    throw new Error(`OpenRouter [${model}]: ${errMsg}`);
  }

  const choices = data?.choices as Array<{ message?: { content?: string } }> | undefined;
  const content = choices?.[0]?.message?.content;

  if (!content || content.trim() === "") {
    throw new Error(
      `OpenRouter [${model}]: respuesta vacía o sin choices. Body: ${JSON.stringify(data).slice(0, 300)}`
    );
  }

  return content;
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
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error(`[callAgent ${config.id}]`, msg);
    return { content: "", error: msg };
  }
}

// ─── Agente maestro (fase 3) ──────────────────────────────────────────────────

export async function callMasterAgent(
  apiKeys: { mistral: string; openrouter: string },
  drafts: { agentName: string; content: string }[]
): Promise<LLMResponse> {
  const validDrafts = drafts.filter((d) => d.content && d.content.length > 100);
  if (validDrafts.length === 0)
    return { content: "", error: "No hay borradores válidos para fusionar" };
  if (validDrafts.length === 1) return { content: validDrafts[0].content };

  const userPrompt = validDrafts
    .map((d, i) => `=== BORRADOR ${i + 1} (${d.agentName}) ===\n\n${d.content}`)
    .join("\n\n" + "─".repeat(60) + "\n\n");

  try {
    if (apiKeys.mistral) {
      const content = await callMistral(apiKeys.mistral, "mistral-large-latest", MERGE_PROMPT, userPrompt);
      if (content.length > 100) return { content };
    }
    if (apiKeys.openrouter) {
      const content = await callOpenRouter(
        apiKeys.openrouter,
        "deepseek/deepseek-chat-v3-0324:free",
        MERGE_PROMPT,
        userPrompt
      );
      if (content.length > 100) return { content };
    }
    return { content: "", error: "No se pudo generar el recurso definitivo" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error en fusión";
    console.error("[callMasterAgent]", msg);
    return { content: "", error: msg };
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

// ─── Detección de organismo ───────────────────────────────────────────────────

function detectOrganismo(parsedText: string): "dgt" | "ayuntamiento_madrid" | "ayuntamiento_otro" | "otro" {
  const t = parsedText.toLowerCase();
  if (
    t.includes("dirección general de tráfico") ||
    t.includes("jefatura de tráfico") ||
    t.includes("guardia civil de tráfico") ||
    t.includes("agrupación de tráfico") ||
    t.includes("boletín de denuncia") ||
    (t.includes("dgt") && t.includes("tráfico"))
  ) return "dgt";

  if (
    t.includes("ayuntamiento de madrid") ||
    t.includes("agencia tributaria madrid") ||
    t.includes("smassa") ||
    t.includes("emvs")
  ) return "ayuntamiento_madrid";

  if (
    t.includes("ayuntamiento") ||
    t.includes("policía local") ||
    t.includes("policia local") ||
    t.includes("emt") ||
    t.includes("oac")
  ) return "ayuntamiento_otro";

  return "otro";
}

// ─── Instrucciones con links dinámicos según organismo ────────────────────────

export function generateInstructions(parsedText = ""): string {
  const org = detectOrganismo(parsedText);

  let sedeBloque = "";
  let contactoBloque = "";

  if (org === "dgt") {
    sedeBloque = `
   → Sede electrónica DGT (recomendado):
     https://sede.dgt.gob.es/es/multas/presentacion-de-alegacion-o-recurso-a-una-multa/
   → Portal general de multas DGT:
     https://sede.dgt.gob.es/es/multas/
   → Presencialmente: Jefatura Provincial de Tráfico de tu provincia
   → Por correo certificado: CTDA, Apartado de Correos 505, 24080 León`;
    contactoBloque = `   • Teléfono DGT multas: 987 010 559 (L-V 8:00–22:00)`;

  } else if (org === "ayuntamiento_madrid") {
    sedeBloque = `
   → Sede electrónica Madrid — Recurso de reposición:
     https://sede.madrid.es/portal/site/tramites/menuitem.62876cb64654a55e2dbd7003a8a409a0/?vgnextoid=b48a8cf9fc25e210VgnVCM2000000c205a0aRCRD
   → Sede electrónica Madrid — Alegaciones:
     https://sede.madrid.es/portal/site/tramites/menuitem.62876cb64654a55e2dbd7003a8a409a0/?vgnextoid=dd7f048aad32e210VgnVCM1000000b205a0aRCRD
   → Presencialmente: Oficinas de Atención a la Ciudadanía (Línea Madrid)`;
    contactoBloque = `   • Teléfono Ayuntamiento Madrid: 010`;

  } else {
    sedeBloque = `
   → Busca la sede electrónica del organismo sancionador en su web oficial
   → Registro Electrónico General AGE:
     https://sede.administracion.gob.es/pagSedeFront/servicios/registroElectronico.htm
   → Presencialmente: registro de entrada del organismo sancionador
   → Por correo certificado con acuse de recibo`;
    contactoBloque = `   • Consulta la web del organismo sancionador para su teléfono`;
  }

  return `INSTRUCCIONES PARA PRESENTAR EL RECURSO
========================================

1. PLAZO DE PRESENTACIÓN
   • ALEGACIÓN (antes de resolución): 20 días naturales desde la notificación
   • RECURSO DE REPOSICIÓN (tras resolución): 1 mes desde la notificación
   ⚠️  Presentar alegación hace perder el descuento del 50% por pronto pago

2. DÓNDE PRESENTARLO${sedeBloque}

3. CONTACTO
${contactoBloque}

4. DOCUMENTACIÓN A ADJUNTAR
   ☐ Este recurso (impreso y firmado, o PDF con firma digital)
   ☐ Copia de la notificación de la multa
   ☐ Copia del DNI/NIE del recurrente
   ☐ Cualquier prueba adicional (fotos, testigos, informes técnicos...)

5. PRESENTACIÓN ELECTRÓNICA (RECOMENDADA)
   • Necesitas: DNI electrónico, certificado digital o Cl@ve
   • Guarda siempre el justificante con número de registro

6. PRESENTACIÓN PRESENCIAL
   • Lleva 2 copias firmadas y pide sello de entrada en la tuya

7. TRAS LA PRESENTACIÓN
   • DGT: 1 mes para resolver; ayuntamientos: hasta 3 meses
   • Sin respuesta en plazo = silencio administrativo negativo
   • Siguiente paso: recurso contencioso-administrativo

8. SUSPENSIÓN DEL PAGO
   • Recurrir NO suspende automáticamente la obligación de pago
   • Solicita suspensión cautelar por escrito si lo necesitas

⚠️  Documento generado por IA. No constituye asesoramiento jurídico profesional.
    Revísalo antes de presentarlo. Para casos complejos consulta a un abogado.`;
}

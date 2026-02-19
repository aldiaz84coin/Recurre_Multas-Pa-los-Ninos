# RecursApp 🏛️

**Recurre tu multa con inteligencia artificial.** Tres agentes LLM analizan tu multa en paralelo y generan un recurso administrativo profesional listo para presentar.

## Stack

- **Next.js 14** (App Router) → Deploy en Vercel con 0 config
- **TypeScript + Tailwind CSS**
- **3 LLMs en paralelo**: Groq, Gemini, OpenRouter (todos con tier gratuito)
- **docx**: Generación de documento Word profesional

## Características

- 📄 Sube tu multa (PDF o imagen)
- 📎 Adjunta legislación y documentación de apoyo con contexto
- 🤖 3 agentes LLM analizan en paralelo con roles especializados
- 🔀 Fusión inteligente de las 3 respuestas (consenso)
- 📥 Descarga el recurso en Word (.docx) listo para firmar
- 📋 Instrucciones detalladas de cómo y dónde presentarlo
- ⚙️ Configuración visual de los 3 agentes (provider, modelo, API key, rol)
- 🔒 Las API keys se guardan **solo en tu navegador** (localStorage)

## APIs gratuitas compatibles

| Proveedor | Registro | Límite gratuito |
|-----------|----------|-----------------|
| [Groq](https://console.groq.com) | Gratis | 14.4k tokens/min |
| [Google Gemini](https://aistudio.google.com) | Gratis | 15 RPM (Flash) |
| [OpenRouter](https://openrouter.ai) | Gratis | Modelos :free |

## Instalación local

```bash
git clone <tu-repo>
cd multas-app
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

## Deploy en Vercel

```bash
npm install -g vercel
vercel
```

O conecta el repo en [vercel.com](https://vercel.com) → Import → Deploy.

**No necesitas variables de entorno** — las API keys se configuran en la UI y se guardan en el navegador del usuario.

## Uso

1. Ve a **⚙ Configurar agentes** → añade tus API keys gratuitas
2. Ve a **Recurrir multa** → sube el PDF/imagen de tu multa
3. Añade documentación de apoyo (opcional pero recomendado)
4. Haz clic en **Analizar con IA** → los 3 agentes trabajan en paralelo
5. Descarga el **recurso en Word** + sigue las instrucciones de presentación

## Estructura del proyecto

```
multas-app/
├── app/
│   ├── page.tsx              # Landing page
│   ├── layout.tsx            # Root layout
│   ├── globals.css           # Design system + Tailwind
│   ├── settings/
│   │   └── page.tsx          # Configuración de agentes LLM
│   ├── recursos/
│   │   └── page.tsx          # Flujo principal (4 pasos)
│   └── api/
│       ├── analyze/
│       │   └── route.ts      # Orquesta llamadas a los 3 LLMs
│       └── generate-doc/
│           └── route.ts      # Genera el .docx con docx library
├── lib/
│   └── llm.ts                # Adaptadores para Groq/Gemini/OpenRouter
├── vercel.json               # Config de funciones serverless
└── package.json
```

## Personalización

### Añadir un proveedor nuevo
En `app/settings/page.tsx`, añade una entrada a `PROVIDERS`:
```ts
mynewprov: {
  label: "Mi proveedor",
  models: ["model-name"],
  baseUrl: "https://api.miprov.com/v1",
  freeInfo: "Gratis",
  signupUrl: "https://miprov.com",
}
```

En `lib/llm.ts`, en la función `callAgent`, añade el case si usa un formato API distinto al estándar OpenAI.

### Mejorar el parsing de PDFs
Instala `pdf-parse` y úsalo en la API route `/api/analyze` para extraer el texto real del PDF en lugar del placeholder actual.

---

⚠️ **Aviso legal**: RecursApp es una herramienta de apoyo. Los recursos generados deben ser revisados por el usuario antes de presentarse. No constituye asesoramiento jurídico profesional.

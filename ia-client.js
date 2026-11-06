// Cliente genérico de IA (protocolo OpenAI-compatible: DeepSeek, Groq, OpenRouter, etc.)
// Cambia de proveedor solo con variables de entorno, sin tocar código:
//   IA_API_KEY   -> API key del proveedor activo
//   IA_BASE_URL  -> URL base de la API (por defecto Groq, free tier)
//   IA_MODEL     -> modelo a usar (por defecto un modelo gratuito de Groq)
//
// Para usar DeepSeek (pago, reservado para demos/producción) sin cambiar código:
//   IA_API_KEY=<tu api key de DeepSeek>
//   IA_BASE_URL=https://api.deepseek.com
//   IA_MODEL=deepseek-chat

const IA_API_KEY = process.env.IA_API_KEY || "";
const IA_BASE_URL = process.env.IA_BASE_URL || "https://api.groq.com/openai/v1";
const IA_MODEL = process.env.IA_MODEL || "llama-3.1-8b-instant";

async function llamarIA(messages, { temperature = 0.4, maxTokens = 700 } = {}) {
  if (!IA_API_KEY) {
    const error = new Error(
      "La función de IA no está configurada. Agrega IA_API_KEY en el servidor (ver ia-client.js)."
    );
    error.sinApiKey = true;
    throw error;
  }

  const url = `${IA_BASE_URL.replace(/\/$/, "")}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${IA_API_KEY}`,
    },
    body: JSON.stringify({
      model: IA_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const texto = await response.text().catch(() => "");
    throw new Error(
      `El proveedor de IA respondió con error ${response.status}: ${texto.slice(0, 300)}`
    );
  }

  const data = await response.json();
  const contenido = data?.choices?.[0]?.message?.content?.trim();

  if (!contenido) {
    throw new Error("El proveedor de IA no devolvió contenido en la respuesta.");
  }

  return contenido;
}

function manejarErrorIA(err, res) {
  console.error("Error en función de IA:", err);

  if (err?.sinApiKey) {
    return res.status(503).json({ error: err.message });
  }

  return res.status(500).json({ error: "No se pudo completar la solicitud de IA." });
}

export { llamarIA, manejarErrorIA, IA_MODEL, IA_BASE_URL };

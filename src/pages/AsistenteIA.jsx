import { useEffect, useRef, useState } from "react";
import "./AsistenteIA.css";
import { apiRequest } from "../lib/api";
import PageHeader from "../components/PageHeader";

function mensajeErrorIA(e) {
  if (e?.status === 503) {
    return "La IA no está configurada todavía. Pide al administrador que agregue la API key de DeepSeek en el servidor.";
  }
  return e?.data?.error || "No se pudo completar la solicitud de IA.";
}

const PREGUNTAS_SUGERIDAS = [
  "¿Qué clientes potenciales debo priorizar esta semana?",
  "¿Qué facturas están vencidas o por vencer?",
  "¿Cómo va mi tasa de conversión de oportunidades este mes?",
  "¿Qué tareas están atrasadas?",
  "Dame un resumen ejecutivo de mis finanzas este mes.",
  "¿Qué seguimientos debería hacer hoy?",
];

export default function AsistenteIA() {
  const [mensajes, setMensajes] = useState([]);
  const [entrada, setEntrada] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorChat, setErrorChat] = useState("");
  const listaRef = useRef(null);

  const [sugerencias, setSugerencias] = useState("");
  const [cargandoSugerencias, setCargandoSugerencias] = useState(false);
  const [errorSugerencias, setErrorSugerencias] = useState("");

  const [prediccion, setPrediccion] = useState("");
  const [cargandoPrediccion, setCargandoPrediccion] = useState(false);
  const [errorPrediccion, setErrorPrediccion] = useState("");

  useEffect(() => {
    if (listaRef.current) {
      listaRef.current.scrollTop = listaRef.current.scrollHeight;
    }
  }, [mensajes]);

  async function enviarMensaje(e) {
    e.preventDefault();
    await enviarTexto(entrada);
  }

  async function enviarSugerencia(pregunta) {
    await enviarTexto(pregunta);
  }

  async function enviarTexto(valor) {
    const texto = valor.trim();
    if (!texto || enviando) return;

    setErrorChat("");
    const historialParaEnviar = mensajes.map((m) => ({
      rol: m.rol,
      contenido: m.contenido,
    }));

    setMensajes((prev) => [...prev, { rol: "usuario", contenido: texto }]);
    setEntrada("");
    setEnviando(true);

    try {
      const data = await apiRequest("/api/ia/chat", {
        method: "POST",
        body: JSON.stringify({ mensaje: texto, historial: historialParaEnviar }),
      });

      setMensajes((prev) => [
        ...prev,
        { rol: "asistente", contenido: data?.respuesta || "" },
      ]);
    } catch (err) {
      console.error("Error en chat IA", err);
      setErrorChat(mensajeErrorIA(err));
    } finally {
      setEnviando(false);
    }
  }

  async function generarSugerencias() {
    setCargandoSugerencias(true);
    setErrorSugerencias("");

    try {
      const data = await apiRequest("/api/ia/sugerencias-seguimiento");
      setSugerencias(data?.sugerencias || "");
    } catch (err) {
      console.error("Error generando sugerencias IA", err);
      setErrorSugerencias(mensajeErrorIA(err));
    } finally {
      setCargandoSugerencias(false);
    }
  }

  async function generarPrediccion() {
    setCargandoPrediccion(true);
    setErrorPrediccion("");

    try {
      const data = await apiRequest("/api/ia/prediccion-financiera");
      setPrediccion(data?.prediccion || "");
    } catch (err) {
      console.error("Error generando predicción financiera IA", err);
      setErrorPrediccion(mensajeErrorIA(err));
    } finally {
      setCargandoPrediccion(false);
    }
  }

  return (
    <div className="page asistente-ia-page">
      <PageHeader
        title="Asistente de Negocio"
        description="Tu asesor ejecutivo dentro del CRM: pregunta sobre clientes potenciales, oportunidades, facturas, tareas o finanzas y recibe respuestas claras y accionables."
      />

      <section className="ia-section">
        <div className="ia-section-header">
          <div>
            <h3>Chat</h3>
            <p>Pregunta sobre tus clientes, oportunidades, facturas, tareas o finanzas.</p>
          </div>
        </div>

        <div className="ia-chat-panel">
          <div className="ia-chat-mensajes" ref={listaRef}>
            {mensajes.length === 0 ? (
              <div className="ia-bienvenida">
                <p className="ia-empty">
                  Soy tu asistente de negocio. Pregúntame sobre tus clientes
                  potenciales, oportunidades, facturas, tareas o finanzas y te
                  doy una respuesta clara y accionable, basada en los datos
                  reales de tu CRM.
                </p>

                <div className="ia-suggestions">
                  {PREGUNTAS_SUGERIDAS.map((pregunta) => (
                    <button
                      key={pregunta}
                      type="button"
                      className="ia-suggestion-chip"
                      onClick={() => enviarSugerencia(pregunta)}
                      disabled={enviando}
                    >
                      {pregunta}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              mensajes.map((m, i) => (
                <div
                  key={i}
                  className={`ia-chat-msg ${
                    m.rol === "usuario" ? "ia-chat-msg--usuario" : "ia-chat-msg--asistente"
                  }`}
                >
                  {m.contenido}
                </div>
              ))
            )}

            {enviando && (
              <div className="ia-chat-msg ia-chat-msg--asistente ia-chat-msg--cargando">
                Pensando...
              </div>
            )}
          </div>

          {errorChat && <p className="ia-error">{errorChat}</p>}

          <form className="ia-chat-form" onSubmit={enviarMensaje}>
            <input
              type="text"
              value={entrada}
              onChange={(e) => setEntrada(e.target.value)}
              placeholder="Pregúntame sobre tus clientes, ventas o finanzas..."
              disabled={enviando}
            />
            <button type="submit" className="btn-primary" disabled={enviando || !entrada.trim()}>
              Enviar
            </button>
          </form>
        </div>
      </section>

      <section className="ia-section">
        <div className="ia-section-header">
          <div>
            <h3>Sugerencias de seguimiento</h3>
            <p>Prioriza qué clientes, seguimientos y facturas atender primero.</p>
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={generarSugerencias}
            disabled={cargandoSugerencias}
          >
            {cargandoSugerencias ? "Generando..." : "Generar sugerencias"}
          </button>
        </div>

        {errorSugerencias && <p className="ia-error">{errorSugerencias}</p>}

        {sugerencias && <p className="ia-resultado">{sugerencias}</p>}
      </section>

      <section className="ia-section">
        <div className="ia-section-header">
          <div>
            <h3>Predicción financiera</h3>
            <p>Análisis de tendencia y proyección aproximada del próximo mes.</p>
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={generarPrediccion}
            disabled={cargandoPrediccion}
          >
            {cargandoPrediccion ? "Generando..." : "Generar predicción"}
          </button>
        </div>

        {errorPrediccion && <p className="ia-error">{errorPrediccion}</p>}

        {prediccion && <p className="ia-resultado">{prediccion}</p>}
      </section>
    </div>
  );
}

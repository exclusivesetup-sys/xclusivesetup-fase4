import { useEffect, useRef, useState } from "react";
import "./NotificationCenter.css";
import { apiRequest } from "../lib/api";

const NOTIFICACIONES_API_PATH = "/api/notificaciones";
const RESUMEN_API_PATH = "/api/notificaciones/resumen";

const MODULO_A_PAGINA = {
  factura: "facturas",
  seguimiento: "seguimientos",
  cotizacion: "cotizaciones",
  tarea: "tareas",
};

const TIPO_LABELS = {
  factura_vencida: "Factura vencida",
  factura_proxima: "Factura próxima a vencer",
  seguimiento_vencido: "Seguimiento vencido",
  cotizacion_vencida: "Cotización vencida",
  tarea_vencida: "Tarea vencida",
};

function tipoClase(tipo) {
  if (tipo.includes("vencid")) return "notif-dot--danger";
  if (tipo.includes("proxima")) return "notif-dot--warning";
  return "notif-dot--info";
}

function formatFechaHora(value) {
  if (!value) return "—";
  const d = new Date(value.includes(" ") ? value.replace(" ", "T") : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

export default function NotificationCenter({ onNavigate }) {
  const [abierto, setAbierto] = useState(false);
  const [noLeidas, setNoLeidas] = useState(0);
  const [notificaciones, setNotificaciones] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const contenedorRef = useRef(null);

  useEffect(() => {
    fetchResumen();
    const intervalo = setInterval(fetchResumen, 60000);
    return () => clearInterval(intervalo);
  }, []);

  useEffect(() => {
    function handleClickFuera(e) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) {
        setAbierto(false);
      }
    }

    document.addEventListener("mousedown", handleClickFuera);
    return () => document.removeEventListener("mousedown", handleClickFuera);
  }, []);

  async function fetchResumen() {
    try {
      const data = await apiRequest(RESUMEN_API_PATH);
      setNoLeidas(Number(data?.no_leidas || 0));
    } catch (e) {
      console.error("Error cargando resumen de notificaciones", e);
    }
  }

  async function fetchNotificaciones() {
    setCargando(true);
    setError("");

    try {
      const data = await apiRequest(NOTIFICACIONES_API_PATH);
      setNotificaciones(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Error cargando notificaciones", e);
      setError("No se pudieron cargar las notificaciones.");
    } finally {
      setCargando(false);
    }
  }

  function toggleAbierto() {
    const next = !abierto;
    setAbierto(next);
    if (next) {
      fetchNotificaciones();
    }
  }

  async function marcarLeida(notif) {
    if (!notif.leida) {
      setNotificaciones((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, leida: 1 } : n))
      );
      setNoLeidas((prev) => Math.max(0, prev - 1));

      try {
        await apiRequest(`${NOTIFICACIONES_API_PATH}/${notif.id}/leida`, {
          method: "PUT",
          body: JSON.stringify({ leida: true }),
        });
      } catch (e) {
        console.error("Error marcando notificación como leída", e);
      }
    }

    if (notif.modulo && MODULO_A_PAGINA[notif.modulo] && onNavigate) {
      onNavigate(MODULO_A_PAGINA[notif.modulo]);
      setAbierto(false);
    }
  }

  async function marcarTodasLeidas() {
    setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: 1 })));
    setNoLeidas(0);

    try {
      await apiRequest(`${NOTIFICACIONES_API_PATH}/marcar-todas`, {
        method: "PUT",
      });
    } catch (e) {
      console.error("Error marcando todas las notificaciones", e);
    }
  }

  async function eliminarNotificacion(e, id) {
    e.stopPropagation();

    const notifEliminada = notificaciones.find((n) => n.id === id);
    setNotificaciones((prev) => prev.filter((n) => n.id !== id));
    if (notifEliminada && !notifEliminada.leida) {
      setNoLeidas((prev) => Math.max(0, prev - 1));
    }

    try {
      await apiRequest(`${NOTIFICACIONES_API_PATH}/${id}`, {
        method: "DELETE",
      });
    } catch (e2) {
      console.error("Error eliminando notificación", e2);
    }
  }

  return (
    <div className="notif-center" ref={contenedorRef}>
      <button
        type="button"
        className="notif-bell"
        onClick={toggleAbierto}
        aria-label="Notificaciones"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
          <path
            d="M12 3a5 5 0 0 0-5 5v2.6c0 .5-.17 1-.48 1.4L5 14.5c-.6.75-.08 1.85.88 1.85h12.24c.96 0 1.48-1.1.88-1.85l-1.52-1.9a2.3 2.3 0 0 1-.48-1.4V8a5 5 0 0 0-5-5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M9.5 19a2.5 2.5 0 0 0 5 0"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>

        {noLeidas > 0 && (
          <span className="notif-badge">{noLeidas > 99 ? "99+" : noLeidas}</span>
        )}
      </button>

      {abierto && (
        <div className="notif-panel">
          <div className="notif-panel-header">
            <h4>Notificaciones</h4>
            {notificaciones.some((n) => !n.leida) && (
              <button
                type="button"
                className="notif-panel-action"
                onClick={marcarTodasLeidas}
              >
                Marcar todas como leídas
              </button>
            )}
          </div>

          {cargando ? (
            <p className="notif-empty">Cargando...</p>
          ) : error ? (
            <p className="notif-empty notif-empty--error">{error}</p>
          ) : notificaciones.length === 0 ? (
            <p className="notif-empty">No tienes notificaciones por ahora.</p>
          ) : (
            <ul className="notif-list">
              {notificaciones.map((n) => (
                <li
                  key={n.id}
                  className={`notif-item ${n.leida ? "notif-item--leida" : ""}`}
                  onClick={() => marcarLeida(n)}
                >
                  <span className={`notif-dot ${tipoClase(n.tipo)}`} />

                  <div className="notif-item-body">
                    <strong>{TIPO_LABELS[n.tipo] || n.titulo}</strong>
                    <p>{n.mensaje || n.titulo}</p>
                    <span className="notif-item-fecha">
                      {formatFechaHora(n.fecha_creacion)}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="notif-item-remove"
                    onClick={(e) => eliminarNotificacion(e, n.id)}
                    aria-label="Eliminar notificación"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

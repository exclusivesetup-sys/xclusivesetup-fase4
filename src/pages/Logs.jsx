import { useEffect, useState } from "react";
import "./Logs.css";
import { apiRequest } from "../lib/api";
import PageHeader from "../components/PageHeader";

const ACCION_LABELS = {
  login_exitoso: "Login exitoso",
  login_fallido: "Login fallido",
  login_bloqueado: "Login bloqueado",
  cuenta_bloqueada: "Cuenta bloqueada",
  usuario_creado: "Usuario creado",
  usuario_actualizado: "Usuario actualizado",
  usuario_eliminado: "Usuario eliminado",
  cliente_eliminado: "Cliente eliminado",
  finanza_eliminada: "Movimiento financiero eliminado",
  "2fa_activado": "2FA activado",
  "2fa_desactivado": "2FA desactivado",
};

function formatFechaHora(value) {
  if (!value) return "—";
  const d = new Date(value.includes(" ") ? value.replace(" ", "T") : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "medium" });
}

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [accionFiltro, setAccionFiltro] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchLogs(e) {
    if (e) e.preventDefault();
    setCargando(true);
    setError("");

    try {
      const params = new URLSearchParams();
      if (accionFiltro) params.append("accion", accionFiltro);
      if (desde) params.append("desde", desde);
      if (hasta) params.append("hasta", hasta);

      const url = params.toString()
        ? `/api/logs-auditoria?${params.toString()}`
        : "/api/logs-auditoria";

      const data = await apiRequest(url);
      setLogs(Array.isArray(data) ? data : []);
    } catch (e2) {
      console.error("Error cargando logs de auditoría", e2);
      setError("No se pudieron cargar los logs de auditoría.");
    } finally {
      setCargando(false);
    }
  }

  function limpiarFiltros() {
    setAccionFiltro("");
    setDesde("");
    setHasta("");
    setTimeout(fetchLogs, 0);
  }

  return (
    <div className="page logs-page">
      <PageHeader
        title="Auditoría"
        description="Historial de inicios de sesión, bloqueos y acciones sensibles del equipo."
      />

      <section className="logs-section">
        <form className="logs-filters" onSubmit={fetchLogs}>
          <label>
            Acción
            <select value={accionFiltro} onChange={(e) => setAccionFiltro(e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(ACCION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Desde
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>

          <label>
            Hasta
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>

          <div className="logs-filter-actions">
            <button type="submit" className="btn-secondary">
              Filtrar
            </button>
            <button type="button" className="btn-secondary" onClick={limpiarFiltros}>
              Limpiar
            </button>
          </div>
        </form>

        {error && <p className="logs-error">{error}</p>}

        {cargando ? (
          <p className="logs-empty">Cargando logs...</p>
        ) : logs.length === 0 ? (
          <p className="logs-empty">No hay registros con estos filtros.</p>
        ) : (
          <div className="logs-table-wrap">
            <table className="logs-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Usuario</th>
                  <th>Acción</th>
                  <th>Entidad</th>
                  <th>Detalle</th>
                  <th>IP</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatFechaHora(log.fecha)}</td>
                    <td>{log.usuario_nombre || "—"}</td>
                    <td>{ACCION_LABELS[log.accion] || log.accion}</td>
                    <td>
                      {log.entidad
                        ? `${log.entidad}${log.entidad_id ? ` #${log.entidad_id}` : ""}`
                        : "—"}
                    </td>
                    <td>{log.detalle || "—"}</td>
                    <td>{log.ip || "—"}</td>
                    <td>
                      <span
                        className={`logs-resultado ${
                          log.exitoso ? "logs-resultado--ok" : "logs-resultado--fallo"
                        }`}
                      >
                        {log.exitoso ? "OK" : "Fallo"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

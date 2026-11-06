import { useEffect, useMemo, useState } from "react";
import "./Proyectos.css";
import { apiRequest, mensajeDeError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const PROYECTOS_API_PATH = "/api/proyectos";
const CLIENTES_API_PATH = "/api/clientes";
const TAREAS_API_PATH = "/api/tareas";

const ESTADOS = {
  planeado: "Planeado",
  en_progreso: "En progreso",
  en_revision: "En revisión",
  completado: "Completado",
  en_pausa: "En pausa",
  cancelado: "Cancelado",
};

function formatDate(value) {
  if (!value) return "";
  return String(value);
}

export default function Proyectos() {
  const { esAdminOGerente } = useAuth();
  const [proyectos, setProyectos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [cotizacionId, setCotizacionId] = useState(null);
  const [cotizacionTitulo, setCotizacionTitulo] = useState("");
  const [highlightId, setHighlightId] = useState(null);

  const [clienteId, setClienteId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [responsable, setResponsable] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [estado, setEstado] = useState("planeado");
  const [notas, setNotas] = useState("");

  useEffect(() => {
    async function loadProyectosData() {
      setCargando(true);
      setError("");

      const [proyRes, cliRes, tarRes] = await Promise.allSettled([
        apiRequest(PROYECTOS_API_PATH),
        apiRequest(CLIENTES_API_PATH),
        apiRequest(TAREAS_API_PATH),
      ]);

      if (proyRes.status === "fulfilled") {
        setProyectos(Array.isArray(proyRes.value) ? proyRes.value : []);
      } else {
        console.error("Error cargando proyectos", proyRes.reason);
        setError("No se pudieron cargar los proyectos.");
      }

      if (cliRes.status === "fulfilled") {
        setClientes(Array.isArray(cliRes.value) ? cliRes.value : []);
      }

      if (tarRes.status === "fulfilled") {
        setTareas(Array.isArray(tarRes.value) ? tarRes.value : []);
      }

      setCargando(false);
    }

    loadProyectosData();

    function checkHashParam() {
      const raw = window.location.hash;
      if (raw.includes("?")) {
        const params = new URLSearchParams(raw.split("?")[1]);
        const targetId = params.get("id");
        if (targetId) {
          setHighlightId(Number(targetId));
        }
      }
    }
    checkHashParam();
    window.addEventListener("hashchange", checkHashParam);
    return () => window.removeEventListener("hashchange", checkHashParam);
  }, []);

  function resetForm() {
    setEditingId(null);
    setCotizacionId(null);
    setCotizacionTitulo("");
    setClienteId("");
    setTitulo("");
    setResponsable("");
    setFechaInicio("");
    setFechaFin("");
    setEstado("planeado");
    setNotas("");
  }

  function startEdit(proyecto) {
    setEditingId(proyecto.id);
    setCotizacionId(proyecto.cotizacion_id || null);
    setCotizacionTitulo(proyecto.cotizacion_titulo || "");
    setClienteId(proyecto.cliente_id ? String(proyecto.cliente_id) : "");
    setTitulo(proyecto.titulo || "");
    setResponsable(proyecto.responsable || "");
    setFechaInicio(proyecto.fecha_inicio || "");
    setFechaFin(proyecto.fecha_fin || "");
    setEstado(proyecto.estado || "planeado");
    setNotas(proyecto.notas || "");
    setError("");
    setSuccessMsg("");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!titulo.trim()) {
      setError("El título del proyecto es obligatorio.");
      return;
    }

    if (fechaInicio && fechaFin && fechaFin < fechaInicio) {
      setError("La fecha final no puede ser menor que la fecha inicial.");
      return;
    }

    setSaving(true);

    const clienteSeleccionado = clienteId
      ? clientes.find((c) => Number(c.id) === Number(clienteId))
      : null;

    const payload = {
      cliente_id: clienteId ? Number(clienteId) : null,
      cliente: clienteSeleccionado?.nombre || null,
      titulo: titulo.trim(),
      responsable: responsable.trim() || null,
      fecha_inicio: fechaInicio || null,
      fecha_fin: fechaFin || null,
      estado,
      notas: notas.trim() || null,
      cotizacion_id: cotizacionId || null,
    };

    try {
      if (editingId) {
        const updated = await apiRequest(`${PROYECTOS_API_PATH}/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });

        setProyectos((prev) =>
          prev.map((p) => (p.id === editingId ? updated : p))
        );

        setSuccessMsg("Proyecto actualizado correctamente.");
      } else {
        const created = await apiRequest(PROYECTOS_API_PATH, {
          method: "POST",
          body: JSON.stringify(payload),
        });

        setProyectos((prev) => [created, ...prev]);
        setSuccessMsg("Proyecto creado correctamente.");
      }

      resetForm();
    } catch (e) {
      console.error("Error guardando proyecto", e);
      setError(
        mensajeDeError(
          e,
          editingId
            ? "No se pudo actualizar el proyecto."
            : "No se pudo guardar el proyecto."
        )
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("¿Eliminar este proyecto?")) return;

    setError("");
    setSuccessMsg("");

    try {
      await apiRequest(`${PROYECTOS_API_PATH}/${id}`, {
        method: "DELETE",
      });

      setProyectos((prev) => prev.filter((p) => p.id !== id));

      if (editingId === id) {
        resetForm();
      }

      setSuccessMsg("Proyecto eliminado correctamente.");
    } catch (e) {
      console.error("Error eliminando proyecto", e);
      setError(mensajeDeError(e, "No se pudo eliminar el proyecto."));
    }
  }

  function cancelarEdicion() {
    resetForm();
    setError("");
    setSuccessMsg("");
  }

  const avancePorProyecto = useMemo(() => {
    const map = {};

    tareas.forEach((t) => {
      const pid = Number(t.proyecto_id);
      if (!map[pid]) map[pid] = { total: 0, completadas: 0 };
      map[pid].total += 1;
      if (String(t.estado || "").toLowerCase() === "completado") {
        map[pid].completadas += 1;
      }
    });

    return map;
  }, [tareas]);

  const proyectosOrdenados = useMemo(() => {
    return [...proyectos].sort((a, b) => {
      const fa = String(a.fecha_inicio || "");
      const fb = String(b.fecha_inicio || "");

      if (fa && fb) {
        if (fa < fb) return -1;
        if (fa > fb) return 1;
      }

      return Number(b.id || 0) - Number(a.id || 0);
    });
  }, [proyectos]);

  return (
    <div className="page">
      <div className="page-header">
        <h2>Proyectos</h2>
        <p>
          Organiza proyectos con cliente, responsable, fechas y estado para
          tener una vista clara de tu operación.
        </p>
      </div>

      {error && <p className="pro-error">{error}</p>}
      {successMsg && <p className="pro-success">{successMsg}</p>}

      <div className="pro-layout">
        <section className="pro-form">
          <h3>{editingId ? "Editar proyecto" : "Nuevo proyecto"}</h3>

          {editingId && cotizacionId && (
            <div className="pro-origin-banner">
              <span className="pro-origin-title">Cotización de origen:</span>
              <span className="pro-origin-value">
                Cotización #{cotizacionId} {cotizacionTitulo ? `— "${cotizacionTitulo}"` : ""}
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="pro-form-fields">
              <label>
                Cliente
                <select
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                >
                  <option value="">Sin cliente asignado</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Título del proyecto
                <input
                  type="text"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ej. Landing nueva, Implementación CRM, Campaña Q3..."
                />
              </label>

              <label>
                Responsable
                <input
                  type="text"
                  value={responsable}
                  onChange={(e) => setResponsable(e.target.value)}
                  placeholder="Quién lidera este proyecto"
                />
              </label>

              <div className="pro-form-row">
                <label>
                  Fecha inicio
                  <input
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                  />
                </label>

                <label>
                  Fecha fin
                  <input
                    type="date"
                    value={fechaFin}
                    onChange={(e) => setFechaFin(e.target.value)}
                  />
                </label>
              </div>

              <label>
                Estado
                <select value={estado} onChange={(e) => setEstado(e.target.value)}>
                  <option value="planeado">Planeado</option>
                  <option value="en_progreso">En progreso</option>
                  <option value="en_revision">En revisión</option>
                  <option value="completado">Completado</option>
                  <option value="en_pausa">En pausa</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </label>

              <label className="pro-field-notes">
                Notas
                <textarea
                  rows={3}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Contexto adicional del proyecto."
                />
              </label>
            </div>

            <div className="pro-form-actions">
              {editingId && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={cancelarEdicion}
                >
                  Cancelar edición
                </button>
              )}

              <button type="submit" disabled={saving}>
                {saving
                  ? editingId
                    ? "Guardando cambios..."
                    : "Creando proyecto..."
                  : editingId
                  ? "Guardar cambios"
                  : "Crear proyecto"}
              </button>
            </div>
          </form>
        </section>

        <section className="pro-list">
          <h3>Proyectos</h3>

          {cargando ? (
            <p className="pro-empty">Cargando proyectos...</p>
          ) : proyectosOrdenados.length === 0 ? (
            <p className="pro-empty">
              Aún no tienes proyectos registrados. Crea tu primer proyecto para
              empezar a organizar tu trabajo.
            </p>
          ) : (
            <div
              className="pro-table-container"
              tabIndex={0}
              role="region"
              aria-label="Listado de proyectos desplazable"
            >
              <table className="pro-table">
                <thead>
                  <tr>
                    <th className="pro-col-proyecto">Proyecto</th>
                    <th className="pro-col-cliente">Cliente</th>
                    <th className="pro-col-cotizacion">Cotización de origen</th>
                    <th className="pro-col-responsable">Responsable</th>
                    <th className="pro-col-fechas">Fechas</th>
                    <th className="pro-col-estado">Estado</th>
                    <th className="pro-col-avance">Avance</th>
                    <th className="pro-col-acciones">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {proyectosOrdenados.map((p) => {
                    const avance = avancePorProyecto[Number(p.id)];
                    const isHighlighted = highlightId === Number(p.id);

                    return (
                    <tr key={p.id} className={isHighlighted ? "pro-row-highlight" : ""}>
                      <td className="pro-col-proyecto">
                        <div className="pro-title">{p.titulo}</div>
                        {p.notas && (
                          <div className="pro-notes">
                            {p.notas.length > 120
                              ? `${p.notas.slice(0, 120)}…`
                              : p.notas}
                          </div>
                        )}
                      </td>
                      <td className="pro-col-cliente">{p.cliente || "—"}</td>
                      <td className="pro-col-cotizacion">
                        {p.cotizacion_id ? (
                          <span
                            className="pro-cot-badge"
                            title={p.cotizacion_titulo ? `Cotización #${p.cotizacion_id}: ${p.cotizacion_titulo}` : `Cotización #${p.cotizacion_id}`}
                          >
                            Cotización #{p.cotizacion_id}
                          </span>
                        ) : (
                          <span className="pro-no-cot">—</span>
                        )}
                      </td>
                      <td className="pro-col-responsable">{p.responsable || "—"}</td>
                      <td className="pro-col-fechas">
                        <div className="pro-date-row">
                          <span className="pro-date-lbl">Inicio:</span>
                          <span className="pro-date-val">{formatDate(p.fecha_inicio) || "Sin inicio"}</span>
                        </div>
                        <div className="pro-date-row">
                          <span className="pro-date-lbl">Fin:</span>
                          <span className="pro-date-val">{formatDate(p.fecha_fin) || "Sin fin"}</span>
                        </div>
                      </td>
                      <td className="pro-col-estado">
                        <span className={`pro-status pro-status--${p.estado}`}>
                          {ESTADOS[p.estado] || p.estado}
                        </span>
                      </td>
                      <td className="pro-col-avance">
                        {avance ? (
                          <span className="pro-avance">
                            {avance.completadas}/{avance.total} tareas
                          </span>
                        ) : (
                          <span className="pro-avance pro-avance--empty">
                            Sin tareas
                          </span>
                        )}
                      </td>
                      <td className="pro-col-acciones">
                        <div className="pro-actions">
                          <button
                            type="button"
                            className="pro-action-btn pro-action-btn--tasks"
                            onClick={() => (window.location.hash = `#tareas?proyecto=${p.id}`)}
                            title={`Ver y gestionar tareas del proyecto #${p.id}`}
                          >
                            Tareas
                          </button>
                          {esAdminOGerente && (
                            <button
                              type="button"
                              className="pro-action-btn"
                              onClick={() => startEdit(p)}
                            >
                              Editar
                            </button>
                          )}
                          {esAdminOGerente && (
                            <button
                              type="button"
                              className="pro-action-btn pro-action-btn--danger"
                              onClick={() => handleDelete(p.id)}
                            >
                              Eliminar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
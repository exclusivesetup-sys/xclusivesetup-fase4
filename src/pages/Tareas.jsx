import { useEffect, useMemo, useState } from "react";
import "./Tareas.css";
import { apiRequest, mensajeDeError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const PROYECTOS_API_PATH = "/api/proyectos";
const TAREAS_API_PATH = "/api/tareas";

const ESTADO_LABELS = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  en_revision: "En revisión",
  completado: "Completado",
};

const PRIORIDAD_LABELS = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  urgente: "Urgente",
};

export default function Tareas() {
  const { esAdminOGerente } = useAuth();
  const [proyectos, setProyectos] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [proyectoId, setProyectoId] = useState("");
  const [filtroProyecto, setFiltroProyecto] = useState("");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [prioridad, setPrioridad] = useState("media");
  const [responsable, setResponsable] = useState("");
  const [estado, setEstado] = useState("pendiente");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaLimite, setFechaLimite] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    async function loadTareasData() {
      setCargando(true);
      setError("");

      const [proyectosRes, tareasRes] = await Promise.allSettled([
        apiRequest(PROYECTOS_API_PATH),
        apiRequest(TAREAS_API_PATH),
      ]);

      if (proyectosRes.status === "fulfilled") {
        setProyectos(Array.isArray(proyectosRes.value) ? proyectosRes.value : []);
      } else {
        console.error("Error al cargar proyectos para tareas", proyectosRes.reason);
      }

      if (tareasRes.status === "fulfilled") {
        setTareas(Array.isArray(tareasRes.value) ? tareasRes.value : []);
      } else {
        console.error("Error al cargar tareas", tareasRes.reason);
        setError("No se pudieron cargar las tareas.");
      }

      setCargando(false);
    }

    loadTareasData();

    function checkHashParam() {
      const raw = window.location.hash;
      if (raw.includes("?")) {
        const params = new URLSearchParams(raw.split("?")[1]);
        const projParam = params.get("proyecto") || params.get("proyecto_id");
        if (projParam) {
          setProyectoId(String(projParam));
          setFiltroProyecto(String(projParam));
        }
      }
    }
    checkHashParam();
    window.addEventListener("hashchange", checkHashParam);
    return () => window.removeEventListener("hashchange", checkHashParam);
  }, []);

  function resetForm() {
    setTitulo("");
    setDescripcion("");
    setPrioridad("media");
    setResponsable("");
    setEstado("pendiente");
    setFechaInicio("");
    setFechaLimite("");
    setEditingId(null);
  }

  function startEdit(tarea) {
    setEditingId(tarea.id);
    setProyectoId(String(tarea.proyecto_id || ""));
    setTitulo(tarea.titulo || "");
    setDescripcion(tarea.descripcion || "");
    setPrioridad(tarea.prioridad || "media");
    setResponsable(tarea.responsable || "");
    setEstado(tarea.estado || "pendiente");
    setFechaInicio(tarea.fecha_inicio || "");
    setFechaLimite(tarea.fecha_limite || "");
    setError("");
    setSuccessMsg("");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!proyectoId || !titulo.trim()) {
      setError("Debes seleccionar un proyecto y escribir un título.");
      return;
    }

    if (fechaInicio && fechaLimite && fechaLimite < fechaInicio) {
      setError("La fecha límite (vencimiento) no puede ser anterior a la fecha de inicio.");
      return;
    }

    setGuardando(true);

    const payload = {
      proyecto_id: Number(proyectoId),
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || null,
      prioridad,
      responsable: responsable.trim() || null,
      estado,
      fecha_inicio: fechaInicio || null,
      fecha_limite: fechaLimite || null,
    };

    try {
      if (editingId) {
        const updated = await apiRequest(`${TAREAS_API_PATH}/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });

        setTareas((prev) =>
          prev.map((item) => (item.id === editingId ? updated : item))
        );

        setSuccessMsg("Tarea actualizada correctamente.");
      } else {
        const created = await apiRequest(TAREAS_API_PATH, {
          method: "POST",
          body: JSON.stringify(payload),
        });

        setTareas((prev) => [created, ...prev]);
        setSuccessMsg("Tarea creada correctamente.");
      }

      resetForm();
    } catch (e) {
      console.error("Error guardando tarea", e);
      setError(
        mensajeDeError(
          e,
          editingId
            ? "No se pudo actualizar la tarea."
            : "No se pudo guardar la tarea."
        )
      );
    } finally {
      setGuardando(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("¿Eliminar esta tarea?")) return;

    setError("");
    setSuccessMsg("");

    try {
      await apiRequest(`${TAREAS_API_PATH}/${id}`, {
        method: "DELETE",
      });

      setTareas((prev) => prev.filter((item) => item.id !== id));

      if (editingId === id) {
        resetForm();
      }

      setSuccessMsg("Tarea eliminada correctamente.");
    } catch (e) {
      console.error("Error eliminando tarea", e);
      setError(mensajeDeError(e, "No se pudo eliminar la tarea."));
    }
  }

  function cancelarEdicion() {
    resetForm();
    setError("");
    setSuccessMsg("");
  }

  function getProyectoNombre(id) {
    const proyecto = proyectos.find((p) => Number(p.id) === Number(id));
    return proyecto?.titulo || "Proyecto no encontrado";
  }

  const tareasFiltradas = useMemo(() => {
    let list = [...tareas];
    if (filtroProyecto) {
      list = list.filter((t) => Number(t.proyecto_id) === Number(filtroProyecto));
    }
    return list.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
  }, [tareas, filtroProyecto]);

  return (
    <div className="page">
      <div className="page-header">
        <h2>Tareas</h2>
        <p>
          Administra tareas por proyecto con responsable, prioridad, estado y
          rango de fechas (inicio y vencimiento).
        </p>
      </div>

      {error && <p className="task-error">{error}</p>}
      {successMsg && <p className="task-success">{successMsg}</p>}

      <div className="task-layout">
        <section className="task-form-card">
          <h3>{editingId ? "Editar tarea" : "Nueva tarea"}</h3>

          <form className="task-form" onSubmit={handleSubmit}>
            <label>
              Proyecto *
              <select
                value={proyectoId}
                onChange={(e) => setProyectoId(e.target.value)}
              >
                <option value="">Selecciona un proyecto</option>
                {proyectos.map((proyecto) => (
                  <option key={proyecto.id} value={proyecto.id}>
                    {proyecto.titulo}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Título *
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ej. Revisar propuesta, diseñar home, validar entrega..."
              />
            </label>

            <label>
              Descripción
              <textarea
                rows={3}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Detalles de la tarea"
              />
            </label>

            <div className="task-grid-2">
              <label>
                Prioridad
                <select
                  value={prioridad}
                  onChange={(e) => setPrioridad(e.target.value)}
                >
                  <option value="baja">Baja</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </select>
              </label>

              <label>
                Estado
                <select
                  value={estado}
                  onChange={(e) => setEstado(e.target.value)}
                >
                  <option value="pendiente">Pendiente</option>
                  <option value="en_progreso">En progreso</option>
                  <option value="en_revision">En revisión</option>
                  <option value="completado">Completado</option>
                </select>
              </label>
            </div>

            <label>
              Responsable
              <input
                type="text"
                value={responsable}
                onChange={(e) => setResponsable(e.target.value)}
                placeholder="Quién ejecuta la tarea"
              />
            </label>

            <div className="task-grid-2">
              <label>
                Fecha inicio
                <input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                />
              </label>

              <label>
                Fecha límite (vencimiento)
                <input
                  type="date"
                  value={fechaLimite}
                  onChange={(e) => setFechaLimite(e.target.value)}
                />
              </label>
            </div>

            <div className="task-actions">
              {editingId && (
                <button
                  type="button"
                  className="task-btn task-btn--secondary"
                  onClick={cancelarEdicion}
                >
                  Cancelar
                </button>
              )}

              <button
                type="submit"
                className="task-btn"
                disabled={guardando}
              >
                {guardando
                  ? editingId
                    ? "Guardando cambios..."
                    : "Creando tarea..."
                  : editingId
                  ? "Guardar cambios"
                  : "Crear tarea"}
              </button>
            </div>
          </form>
        </section>

        <section className="task-list-card">
          <div className="task-list-header">
            <h3>Listado de tareas</h3>

            <div className="task-filter-wrap">
              <label htmlFor="filtro-proyecto-select">Filtrar por proyecto:</label>
              <select
                id="filtro-proyecto-select"
                value={filtroProyecto}
                onChange={(e) => setFiltroProyecto(e.target.value)}
              >
                <option value="">Todos los proyectos ({tareas.length})</option>
                {proyectos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.titulo}
                  </option>
                ))}
              </select>
              {filtroProyecto && (
                <button
                  type="button"
                  className="task-clear-btn"
                  onClick={() => setFiltroProyecto("")}
                >
                  Limpiar filtro
                </button>
              )}
            </div>
          </div>

          {cargando ? (
            <p className="task-empty">Cargando tareas...</p>
          ) : tareasFiltradas.length === 0 ? (
            <p className="task-empty">
              {filtroProyecto
                ? "No hay tareas registradas para este proyecto."
                : "No hay tareas registradas todavía."}
            </p>
          ) : (
            <div
              className="task-table-container"
              tabIndex={0}
              role="region"
              aria-label="Listado de tareas desplazable"
            >
              <table className="task-table">
                <thead>
                  <tr>
                    <th className="task-col-tarea">Tarea</th>
                    <th className="task-col-proyecto">Proyecto</th>
                    <th className="task-col-prioridad">Prioridad</th>
                    <th className="task-col-responsable">Responsable</th>
                    <th className="task-col-estado">Estado</th>
                    <th className="task-col-fechas">Fechas</th>
                    <th className="task-col-acciones">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {tareasFiltradas.map((tarea) => (
                    <tr key={tarea.id}>
                      <td className="task-col-tarea">
                        <div className="task-title">{tarea.titulo}</div>
                        {tarea.descripcion && (
                          <div className="task-subtitle">{tarea.descripcion}</div>
                        )}
                      </td>
                      <td className="task-col-proyecto">{getProyectoNombre(tarea.proyecto_id)}</td>
                      <td className="task-col-prioridad">
                        <span
                          className={`task-badge task-badge--${tarea.prioridad}`}
                        >
                          {PRIORIDAD_LABELS[tarea.prioridad] || tarea.prioridad}
                        </span>
                      </td>
                      <td className="task-col-responsable">{tarea.responsable || "—"}</td>
                      <td className="task-col-estado">
                        <span
                          className={`task-status task-status--${tarea.estado}`}
                        >
                          {ESTADO_LABELS[tarea.estado] || tarea.estado}
                        </span>
                      </td>
                      <td className="task-col-fechas">
                        <div className="task-date-row">
                          <small>Inicio:</small> {tarea.fecha_inicio || "—"}
                        </div>
                        <div className="task-date-row">
                          <small>Límite:</small> {tarea.fecha_limite || "—"}
                        </div>
                      </td>
                      <td className="task-col-acciones">
                        <div className="task-row-actions">
                          {esAdminOGerente && (
                            <button
                              type="button"
                              className="task-mini-btn"
                              onClick={() => startEdit(tarea)}
                            >
                              Editar
                            </button>
                          )}
                          {esAdminOGerente && (
                            <button
                              type="button"
                              className="task-mini-btn task-mini-btn--danger"
                              onClick={() => handleDelete(tarea.id)}
                            >
                              Eliminar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
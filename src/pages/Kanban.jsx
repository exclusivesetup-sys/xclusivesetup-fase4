import { useEffect, useMemo, useState } from "react";
import "./Kanban.css";
import { apiRequest } from "../lib/api";

const PROYECTOS_API_PATH = "/api/proyectos";
const TAREAS_API_PATH = "/api/tareas";

const COLUMNS = [
  { key: "pendiente", label: "Pendiente" },
  { key: "en_progreso", label: "En progreso" },
  { key: "en_revision", label: "En revisión" },
  { key: "completado", label: "Completado" },
];

const PRIORIDAD_LABELS = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  urgente: "Urgente",
};

export default function Kanban() {
  const [proyectos, setProyectos] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [proyectoFiltro, setProyectoFiltro] = useState("");
  const [cargando, setCargando] = useState(false);
  const [actualizandoId, setActualizandoId] = useState(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    setCargando(true);
    setError("");

    try {
      const [proyectosData, tareasData] = await Promise.all([
        apiRequest(PROYECTOS_API_PATH),
        apiRequest(TAREAS_API_PATH),
      ]);

      setProyectos(Array.isArray(proyectosData) ? proyectosData : []);
      setTareas(Array.isArray(tareasData) ? tareasData : []);
    } catch (e) {
      console.error("Error al cargar datos del kanban", e);
      setError("No se pudieron cargar las tareas del tablero.");
    } finally {
      setCargando(false);
    }
  }

  async function fetchTareas() {
    setCargando(true);
    setError("");
    setSuccessMsg("");

    try {
      const data = await apiRequest(TAREAS_API_PATH);
      setTareas(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Error al cargar tareas", e);
      setError("No se pudieron cargar las tareas.");
    } finally {
      setCargando(false);
    }
  }

  function getProyectoNombre(id) {
    const proyecto = proyectos.find((proj) => Number(proj.id) === Number(id));
    return proyecto?.titulo || "Proyecto";
  }

  const tareasFiltradas = useMemo(() => {
    let filtered = [...tareas];

    if (proyectoFiltro) {
      filtered = filtered.filter(
        (t) => Number(t.proyecto_id) === Number(proyectoFiltro)
      );
    }

    return filtered;
  }, [tareas, proyectoFiltro]);

  const tareasPorColumna = useMemo(() => {
    const map = {};

    COLUMNS.forEach((col) => {
      map[col.key] = [];
    });

    tareasFiltradas.forEach((t) => {
      const key = COLUMNS.some((c) => c.key === t.estado)
        ? t.estado
        : "pendiente";

      map[key].push(t);
    });

    return map;
  }, [tareasFiltradas]);

  async function cambiarEstado(tareaId, nuevoEstado) {
    setError("");
    setSuccessMsg("");
    setActualizandoId(tareaId);

    try {
      let data;

      try {
        data = await apiRequest(`${TAREAS_API_PATH}/${tareaId}/estado`, {
          method: "PUT",
          body: JSON.stringify({ estado: nuevoEstado }),
        });
      } catch {
        data = await apiRequest(`${TAREAS_API_PATH}/${tareaId}`, {
          method: "PUT",
          body: JSON.stringify({ estado: nuevoEstado }),
        });
      }

      setTareas((prev) =>
        prev.map((t) =>
          t.id === tareaId
            ? {
                ...t,
                ...data,
                estado: data?.estado || nuevoEstado,
              }
            : t
        )
      );

      setSuccessMsg("Estado de tarea actualizado correctamente.");
    } catch (e) {
      console.error("Error al cambiar estado de tarea", e);
      setError("No se pudo cambiar el estado de la tarea.");
    } finally {
      setActualizandoId(null);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Tablero de tareas</h2>
        <p>
          Visualiza las tareas por estado y proyecto para gestionar mejor el
          flujo de trabajo.
        </p>
      </div>

      {error && <p className="kanban-error">{error}</p>}
      {successMsg && <p className="kanban-success">{successMsg}</p>}

      <div className="kanban-filters">
        <label>
          Proyecto
          <select
            value={proyectoFiltro}
            onChange={(e) => setProyectoFiltro(e.target.value)}
          >
            <option value="">Todos los proyectos</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.titulo}
              </option>
            ))}
          </select>
        </label>

        <div className="kanban-filter-action">
          <button
            type="button"
            className="kanban-refresh-btn"
            onClick={fetchTareas}
            disabled={cargando}
          >
            {cargando ? "Recargando..." : "Recargar tareas"}
          </button>
        </div>
      </div>

      {cargando ? (
        <p className="kanban-empty">Cargando tareas...</p>
      ) : (
        <div className="kanban-board">
          {COLUMNS.map((col) => {
            const items = tareasPorColumna[col.key] || [];

            return (
              <section key={col.key} className="kanban-column">
                <header className="kanban-column-header">
                  <h3>{col.label}</h3>
                  <span className="kanban-count">{items.length}</span>
                </header>

                {items.length === 0 ? (
                  <p className="kanban-column-empty">
                    Sin tareas en esta columna.
                  </p>
                ) : (
                  <div className="kanban-column-body">
                    {items.map((t) => (
                      <article key={t.id} className="kanban-card">
                        <div className="kanban-card-header">
                          <h4>{t.titulo}</h4>
                          <span
                            className={`kanban-priority kanban-priority--${t.prioridad}`}
                          >
                            {PRIORIDAD_LABELS[t.prioridad] || t.prioridad}
                          </span>
                        </div>

                        {t.descripcion && (
                          <p className="kanban-card-desc">{t.descripcion}</p>
                        )}

                        <div className="kanban-card-meta">
                          <span className="kanban-project">
                            {getProyectoNombre(t.proyecto_id)}
                          </span>
                          <span className="kanban-responsable">
                            {t.responsable || "Sin responsable"}
                          </span>
                          <span className="kanban-fecha">
                            {t.fecha_limite
                              ? `Fecha límite: ${t.fecha_limite}`
                              : "Sin fecha límite"}
                          </span>
                        </div>

                        <div className="kanban-card-actions">
                          {COLUMNS.map((target) => {
                            const isActive = target.key === t.estado;
                            const isUpdating = actualizandoId === t.id;

                            return (
                              <button
                                key={target.key}
                                type="button"
                                className={
                                  isActive
                                    ? "kanban-status-btn kanban-status-btn--active"
                                    : "kanban-status-btn"
                                }
                                onClick={() =>
                                  isActive || isUpdating
                                    ? null
                                    : cambiarEstado(t.id, target.key)
                                }
                                disabled={isActive || isUpdating}
                              >
                                {isUpdating && !isActive
                                  ? "Actualizando..."
                                  : target.label}
                              </button>
                            );
                          })}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
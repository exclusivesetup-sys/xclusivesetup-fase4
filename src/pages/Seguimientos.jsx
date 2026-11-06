import { useEffect, useMemo, useState } from "react";
import "./Seguimientos.css";
import { apiRequest, mensajeDeError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const SEGUIMIENTOS_API_PATH = "/api/seguimientos";
const CLIENTES_API_PATH = "/api/clientes";

const initialForm = {
  cliente_id: null,
  cliente: "",
  titulo: "",
  descripcion: "",
  prioridad: "media",
  estado: "pendiente",
  fecha_limite: "",
  recordatorio: "",
};

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("es-CO");
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

export default function Seguimientos() {
  const { esAdminOGerente } = useAuth();
  const [tareas, setTareas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [formData, setFormData] = useState(initialForm);

  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem("nuevoSeguimientoCliente");
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);

      setFormData({
        ...initialForm,
        cliente_id: parsed.cliente_id || null,
        cliente: parsed.cliente_nombre || "",
      });

      setEditandoId(null);
      setMostrarFormulario(true);
      setError("");
      setSuccessMsg("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      console.error("Error leyendo cliente precargado para seguimiento", e);
    } finally {
      sessionStorage.removeItem("nuevoSeguimientoCliente");
    }
  }, []);

  async function fetchData() {
    setCargando(true);
    setError("");

    try {
      const [seguimientosData, clientesData] = await Promise.all([
        apiRequest(SEGUIMIENTOS_API_PATH),
        apiRequest(CLIENTES_API_PATH),
      ]);

      setTareas(Array.isArray(seguimientosData) ? seguimientosData : []);
      setClientes(Array.isArray(clientesData) ? clientesData : []);
    } catch (e) {
      console.error("Error cargando seguimientos", e);
      setError("No se pudo cargar la información de seguimientos.");
    } finally {
      setCargando(false);
    }
  }

  function handleChange(e) {
    const { name, value } = e.target;

    setFormData((prev) => {
      const next = {
        ...prev,
        [name]: value,
      };

      if (name === "cliente") {
        const clienteEncontrado = clientes.find(
          (c) => normalizeText(c.nombre) === normalizeText(value)
        );
        next.cliente_id = clienteEncontrado ? clienteEncontrado.id : null;
      }

      return next;
    });
  }

  function abrirNuevoSeguimiento() {
    setFormData(initialForm);
    setEditandoId(null);
    setMostrarFormulario(true);
    setError("");
    setSuccessMsg("");
  }

  function cerrarFormulario() {
    setFormData(initialForm);
    setEditandoId(null);
    setMostrarFormulario(false);
    setError("");
    setSuccessMsg("");
  }

  function estadoClass(valor) {
    const estado = normalizeText(valor);
    if (estado === "en progreso") return "estado-en-progreso";
    if (estado === "completado") return "estado-completado";
    if (estado === "cancelado") return "estado-cancelado";
    return "estado-pendiente";
  }

  function prioridadClass(valor) {
    const prioridad = normalizeText(valor);
    if (prioridad === "baja") return "prioridad-baja";
    if (prioridad === "alta") return "prioridad-alta";
    if (prioridad === "urgente") return "prioridad-urgente";
    return "prioridad-media";
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!formData.titulo.trim()) {
      setError("El título es obligatorio.");
      setSuccessMsg("");
      return;
    }

    if (!formData.estado.trim()) {
      setError("El estado es obligatorio.");
      setSuccessMsg("");
      return;
    }

    if (!formData.prioridad.trim()) {
      setError("La prioridad es obligatoria.");
      setSuccessMsg("");
      return;
    }

    setGuardando(true);
    setError("");
    setSuccessMsg("");

    const payload = {
      cliente_id: formData.cliente_id || null,
      cliente: formData.cliente.trim() || null,
      titulo: formData.titulo.trim(),
      descripcion: formData.descripcion.trim() || null,
      prioridad: formData.prioridad,
      estado: formData.estado,
      fecha_limite: formData.fecha_limite || null,
      recordatorio: formData.recordatorio || null,
    };

    try {
      const tareaGuardada = await apiRequest(
        editandoId == null
          ? SEGUIMIENTOS_API_PATH
          : `${SEGUIMIENTOS_API_PATH}/${editandoId}`,
        {
          method: editandoId == null ? "POST" : "PUT",
          body: JSON.stringify(payload),
        }
      );

      if (editandoId == null) {
        setTareas((prev) => [tareaGuardada, ...prev]);
      } else {
        setTareas((prev) =>
          prev.map((t) => (t.id === editandoId ? tareaGuardada : t))
        );
      }

      cerrarFormulario();
    } catch (e) {
      console.error("Error guardando seguimiento", e);
      setError(
        mensajeDeError(
          e,
          editandoId == null
            ? "No se pudo guardar el seguimiento."
            : "No se pudo actualizar el seguimiento."
        )
      );
      setSuccessMsg("");
    } finally {
      setGuardando(false);
    }
  }

  async function handleDelete(id) {
    const confirmar = window.confirm(
      "¿Seguro que quieres eliminar este seguimiento?"
    );
    if (!confirmar) return;

    try {
      await apiRequest(`${SEGUIMIENTOS_API_PATH}/${id}`, {
        method: "DELETE",
      });

      setTareas((prev) => prev.filter((t) => t.id !== id));

      if (editandoId === id) {
        cerrarFormulario();
      }

      setError("");
      setSuccessMsg("");
    } catch (e) {
      console.error("Error eliminando seguimiento", e);
      setError(mensajeDeError(e, "No se pudo eliminar el seguimiento."));
    }
  }

  function handleEdit(tarea) {
    setEditandoId(tarea.id);
    setMostrarFormulario(true);
    setError("");
    setSuccessMsg("");

    setFormData({
      cliente_id: tarea.cliente_id || null,
      cliente: tarea.cliente || "",
      titulo: tarea.titulo || "",
      descripcion: tarea.descripcion || "",
      prioridad: tarea.prioridad || "media",
      estado: tarea.estado || "pendiente",
      fecha_limite: tarea.fecha_limite || "",
      recordatorio: tarea.recordatorio || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const resumen = useMemo(() => {
    return {
      total: tareas.length,
      pendientes: tareas.filter(
        (t) => normalizeText(t.estado) === "pendiente"
      ).length,
      enProgreso: tareas.filter(
        (t) => normalizeText(t.estado) === "en progreso"
      ).length,
      completados: tareas.filter(
        (t) => normalizeText(t.estado) === "completado"
      ).length,
    };
  }, [tareas]);

  return (
    <div className="seguimientos-wrap">
      <h2>Seguimientos</h2>
      <p className="seguimientos-subtitle">
        Gestiona tus tareas, recordatorios y próximos contactos.
      </p>

      <div className="seguimientos-header-actions">
        {!mostrarFormulario && (
          <button
            type="button"
            className="btn-primary"
            onClick={abrirNuevoSeguimiento}
          >
            Nuevo seguimiento
          </button>
        )}
      </div>

      <section className="seguimientos-section">
        <div className="seguimientos-summary-grid">
          <div className="seguimientos-stat-card">
            <div className="seguimientos-stat-label">Total</div>
            <div className="seguimientos-stat-value">{resumen.total}</div>
          </div>

          <div className="seguimientos-stat-card">
            <div className="seguimientos-stat-label">Pendientes</div>
            <div className="seguimientos-stat-value">{resumen.pendientes}</div>
          </div>

          <div className="seguimientos-stat-card">
            <div className="seguimientos-stat-label">En progreso</div>
            <div className="seguimientos-stat-value">{resumen.enProgreso}</div>
          </div>

          <div className="seguimientos-stat-card">
            <div className="seguimientos-stat-label">Completados</div>
            <div className="seguimientos-stat-value">{resumen.completados}</div>
          </div>
        </div>
      </section>

      {mostrarFormulario && (
        <section className="seguimientos-section">
          <h3>{editandoId ? "Editar seguimiento" : "Nuevo seguimiento"}</h3>

          <div className="seguimientos-card">
            {error && <p className="seguimientos-error">{error}</p>}
            {successMsg && <p className="seguimientos-success">{successMsg}</p>}

            <form onSubmit={handleSubmit} className="seguimientos-form">
              <label>
                Cliente asociado
                <input
                  list="clientes-seguimiento"
                  type="text"
                  name="cliente"
                  value={formData.cliente}
                  onChange={handleChange}
                  placeholder="Selecciona o escribe un cliente"
                />
                <datalist id="clientes-seguimiento">
                  {clientes.map((c) => (
                    <option key={c.id} value={c.nombre} />
                  ))}
                </datalist>
              </label>

              <label>
                Título
                <input
                  type="text"
                  name="titulo"
                  value={formData.titulo}
                  onChange={handleChange}
                  placeholder="Ej. Llamar a Luis, Enviar propuesta a Leidy"
                />
              </label>

              <label>
                Descripción
                <textarea
                  name="descripcion"
                  value={formData.descripcion}
                  onChange={handleChange}
                  placeholder="Detalles del seguimiento, acuerdos, etc."
                  rows={3}
                />
              </label>

              <label>
                Prioridad
                <select
                  name="prioridad"
                  value={formData.prioridad}
                  onChange={handleChange}
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
                  name="estado"
                  value={formData.estado}
                  onChange={handleChange}
                >
                  <option value="pendiente">Pendiente</option>
                  <option value="en progreso">En progreso</option>
                  <option value="completado">Completado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </label>

              <label>
                Fecha límite
                <input
                  type="date"
                  name="fecha_limite"
                  value={formData.fecha_limite}
                  onChange={handleChange}
                />
              </label>

              <label>
                Recordatorio
                <input
                  type="date"
                  name="recordatorio"
                  value={formData.recordatorio}
                  onChange={handleChange}
                />
              </label>

              <div className="seguimientos-actions">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={guardando}
                >
                  {guardando
                    ? "Guardando..."
                    : editandoId
                    ? "Actualizar seguimiento"
                    : "Guardar seguimiento"}
                </button>

                <button
                  type="button"
                  onClick={cerrarFormulario}
                  className="btn-secondary"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </section>
      )}

      <section className="seguimientos-section">
        <h3>Lista de seguimientos</h3>

        {cargando ? (
          <p>Cargando seguimientos...</p>
        ) : tareas.length === 0 ? (
          <p>Aún no tienes seguimientos registrados.</p>
        ) : (
          <div className="seguimientos-table-wrap">
            <table className="seguimientos-table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Cliente</th>
                  <th>Prioridad</th>
                  <th>Estado</th>
                  <th>Fecha límite</th>
                  <th>Recordatorio</th>
                  <th>Descripción</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {tareas.map((tarea) => (
                  <tr key={tarea.id}>
                    <td>{tarea.titulo || "—"}</td>
                    <td>{tarea.cliente || "—"}</td>
                    <td>
                      <span
                        className={`prioridad-badge ${prioridadClass(
                          tarea.prioridad
                        )}`}
                      >
                        {tarea.prioridad || "media"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`estado-badge ${estadoClass(tarea.estado)}`}
                      >
                        {tarea.estado || "pendiente"}
                      </span>
                    </td>
                    <td>{formatDate(tarea.fecha_limite)}</td>
                    <td>{formatDate(tarea.recordatorio)}</td>
                    <td>{tarea.descripcion || "—"}</td>
                    <td>
                      <div className="seguimientos-actions">
                        {esAdminOGerente && (
                          <button
                            type="button"
                            onClick={() => handleEdit(tarea)}
                            className="btn-edit"
                          >
                            Editar
                          </button>
                        )}

                        {esAdminOGerente && (
                          <button
                            type="button"
                            onClick={() => handleDelete(tarea.id)}
                            className="btn-danger"
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
  );
}
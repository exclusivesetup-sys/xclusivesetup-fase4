import { useEffect, useMemo, useState } from "react";
import "./Ventas.css";
import { apiRequest, mensajeDeError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const VENTAS_API_PATH = "/api/ventas";

const initialForm = {
  nombre: "",
  categoria: "",
  precio: "",
  descripcion: "",
  estado_servicio: "activo",
  tiempo_estimado: "",
  nota: "",
};

function formatMoney(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export default function Ventas() {
  const { esAdminOGerente } = useAuth();
  const [ventas, setVentas] = useState([]);
  const [formData, setFormData] = useState(initialForm);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [search, setSearch] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [accionLoadingId, setAccionLoadingId] = useState(null);

  useEffect(() => {
    fetchVentas();
  }, []);

  async function fetchVentas() {
    setCargando(true);
    setError("");

    try {
      const data = await apiRequest(VENTAS_API_PATH);
      setVentas(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Error cargando ventas", e);
      setError("No se pudo cargar la lista de servicios.");
    } finally {
      setCargando(false);
    }
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function resetForm() {
    setFormData(initialForm);
    setEditandoId(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const precioNum = Number(formData.precio);

    if (!formData.nombre.trim() || formData.precio === "") {
      setError("Nombre y precio son obligatorios.");
      setSuccessMsg("");
      return;
    }

    if (Number.isNaN(precioNum) || precioNum <= 0) {
      setError("El precio debe ser un número mayor que 0.");
      setSuccessMsg("");
      return;
    }

    setGuardando(true);
    setError("");
    setSuccessMsg("");

    const payload = {
      nombre: formData.nombre.trim(),
      categoria: formData.categoria.trim() || null,
      precio: precioNum,
      descripcion: formData.descripcion.trim() || null,
      estado_servicio: formData.estado_servicio,
      tiempo_estimado: formData.tiempo_estimado.trim() || null,
      nota: formData.nota.trim() || null,
    };

    try {
      if (editandoId == null) {
        const nuevaVenta = await apiRequest(VENTAS_API_PATH, {
          method: "POST",
          body: JSON.stringify(payload),
        });

        setVentas((prev) => [nuevaVenta, ...prev]);
        setSuccessMsg("Servicio creado correctamente.");
      } else {
        const ventaActualizada = await apiRequest(
          `${VENTAS_API_PATH}/${editandoId}`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          }
        );

        setVentas((prev) =>
          prev.map((v) => (v.id === editandoId ? ventaActualizada : v))
        );

        setSuccessMsg("Servicio actualizado correctamente.");
      }

      resetForm();
    } catch (e) {
      console.error("Error guardando servicio", e);
      setError(
        mensajeDeError(
          e,
          editandoId == null
            ? "No se pudo guardar el servicio."
            : "No se pudo actualizar el servicio."
        )
      );
      setSuccessMsg("");
    } finally {
      setGuardando(false);
    }
  }

  async function handleDelete(id) {
    const confirmar = window.confirm(
      "¿Seguro que quieres eliminar este servicio?"
    );
    if (!confirmar) return;

    setAccionLoadingId(id);
    setError("");
    setSuccessMsg("");

    try {
      await apiRequest(`${VENTAS_API_PATH}/${id}`, {
        method: "DELETE",
      });

      setVentas((prev) => prev.filter((v) => v.id !== id));

      if (editandoId === id) {
        resetForm();
      }

      setSuccessMsg("Servicio eliminado correctamente.");
    } catch (e) {
      console.error("Error eliminando servicio", e);
      setError(mensajeDeError(e, "No se pudo eliminar el servicio."));
      setSuccessMsg("");
    } finally {
      setAccionLoadingId(null);
    }
  }

  function handleEdit(venta) {
    setEditandoId(venta.id);
    setError("");
    setSuccessMsg("");

    setFormData({
      nombre: venta.nombre || "",
      categoria: venta.categoria || "",
      precio: String(venta.precio ?? ""),
      descripcion: venta.descripcion || "",
      estado_servicio: venta.estado_servicio || "activo",
      tiempo_estimado: venta.tiempo_estimado || "",
      nota: venta.nota || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDuplicar(venta) {
    setAccionLoadingId(venta.id);
    setError("");
    setSuccessMsg("");

    try {
      const payload = {
        nombre: `${venta.nombre} (copia)`,
        categoria: venta.categoria || null,
        precio: Number(venta.precio || 0),
        descripcion: venta.descripcion || null,
        estado_servicio: venta.estado_servicio || "activo",
        tiempo_estimado: venta.tiempo_estimado || null,
        nota: venta.nota || null,
        duplicado_de: venta.id,
      };

      const duplicado = await apiRequest(VENTAS_API_PATH, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setVentas((prev) => [duplicado, ...prev]);
      setSuccessMsg("Servicio duplicado correctamente.");
    } catch (e) {
      console.error("Error duplicando servicio", e);
      setError(mensajeDeError(e, "No se pudo duplicar el servicio."));
      setSuccessMsg("");
    } finally {
      setAccionLoadingId(null);
    }
  }

  function cancelarEdicion() {
    resetForm();
    setError("");
    setSuccessMsg("");
  }

  const ventasFiltradas = useMemo(() => {
    return ventas.filter((venta) => {
      const matchSearch =
        !search.trim() ||
        [venta.nombre, venta.categoria, venta.descripcion, venta.nota]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(search.trim().toLowerCase())
          );

      const matchEstado =
        !estadoFiltro || venta.estado_servicio === estadoFiltro;

      return matchSearch && matchEstado;
    });
  }, [ventas, search, estadoFiltro]);

  const resumen = useMemo(() => {
    return {
      total: ventas.length,
      activos: ventas.filter((v) => v.estado_servicio === "activo").length,
      borrador: ventas.filter((v) => v.estado_servicio === "borrador").length,
      inactivos: ventas.filter((v) => v.estado_servicio === "inactivo").length,
    };
  }, [ventas]);

  return (
    <div className="page">
      <div className="page-header">
        <h2>Servicios</h2>
        <p>
          Administra tu catálogo comercial con precios, estado, tiempo
          estimado y descripción.
        </p>
      </div>

      <section className="ventas-summary">
        <div className="summary-card">
          <div className="summary-label">Total</div>
          <div className="summary-value">{resumen.total}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Activos</div>
          <div className="summary-value">{resumen.activos}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Borrador</div>
          <div className="summary-value">{resumen.borrador}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Inactivos</div>
          <div className="summary-value">{resumen.inactivos}</div>
        </div>
      </section>

      <section className="ventas-section">
        <h3>{editandoId ? "Editar servicio" : "Nuevo servicio"}</h3>

        {error && <p className="form-message error">{error}</p>}
        {successMsg && <p className="form-message success">{successMsg}</p>}

        <div className="ventas-card">
          <form className="ventas-form" onSubmit={handleSubmit}>
            <div className="ventas-grid">
              <label>
                Nombre del servicio
                <input
                  type="text"
                  name="nombre"
                  value={formData.nombre}
                  onChange={handleChange}
                  placeholder="Ej. Página web básica"
                  disabled={guardando}
                />
              </label>

              <label>
                Categoría
                <input
                  type="text"
                  name="categoria"
                  value={formData.categoria}
                  onChange={handleChange}
                  placeholder="Ej. Desarrollo"
                  disabled={guardando}
                />
              </label>

              <label>
                Precio
                <input
                  type="number"
                  step="0.01"
                  name="precio"
                  value={formData.precio}
                  onChange={handleChange}
                  placeholder="Ej. 500000"
                  disabled={guardando}
                />
              </label>

              <label>
                Estado
                <select
                  name="estado_servicio"
                  value={formData.estado_servicio}
                  onChange={handleChange}
                  disabled={guardando}
                >
                  <option value="activo">Activo</option>
                  <option value="borrador">Borrador</option>
                  <option value="inactivo">Inactivo</option>
                </select>
              </label>

              <label>
                Tiempo estimado
                <input
                  type="text"
                  name="tiempo_estimado"
                  value={formData.tiempo_estimado}
                  onChange={handleChange}
                  placeholder="Ej. 5 días"
                  disabled={guardando}
                />
              </label>
            </div>

            <label>
              Descripción
              <textarea
                name="descripcion"
                value={formData.descripcion}
                onChange={handleChange}
                placeholder="Describe qué incluye este servicio"
                rows={4}
                disabled={guardando}
              />
            </label>

            <label>
              Nota interna
              <textarea
                name="nota"
                value={formData.nota}
                onChange={handleChange}
                placeholder="Ej. Incluye hosting por 1 año"
                rows={3}
                disabled={guardando}
              />
            </label>

            <div className="form-actions">
              <button
                className="btn-primary"
                type="submit"
                disabled={guardando}
              >
                {guardando
                  ? "Guardando..."
                  : editandoId
                  ? "Actualizar servicio"
                  : "Guardar servicio"}
              </button>

              {editandoId && (
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={cancelarEdicion}
                  disabled={guardando}
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>
      </section>

      <section className="ventas-section">
        <h3>Catálogo de servicios</h3>

        <div className="ventas-card">
          <div className="ventas-filters">
            <label>
              Buscar
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, categoría o texto"
              />
            </label>

            <label>
              Filtrar por estado
              <select
                value={estadoFiltro}
                onChange={(e) => setEstadoFiltro(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="activo">Activo</option>
                <option value="borrador">Borrador</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </label>
          </div>

          {cargando ? (
            <p className="loading-state">Cargando servicios...</p>
          ) : ventasFiltradas.length === 0 ? (
            <p className="empty-state">
              {search || estadoFiltro
                ? "No hay servicios que coincidan con los filtros."
                : "Aún no tienes servicios registrados."}
            </p>
          ) : (
            <div className="ventas-table-wrap">
              <table className="ventas-table">
                <thead>
                  <tr>
                    <th>Servicio</th>
                    <th>Categoría</th>
                    <th>Estado</th>
                    <th>Tiempo</th>
                    <th>Precio</th>
                    <th>Detalle</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {ventasFiltradas.map((venta) => {
                    const filaBloqueada = accionLoadingId === venta.id;

                    return (
                      <tr key={venta.id}>
                        <td>
                          <div className="venta-main">
                            <strong>{venta.nombre}</strong>
                          </div>
                        </td>
                        <td>{venta.categoria || "—"}</td>
                        <td>
                          <span
                            className={`estado-badge ${String(
                              venta.estado_servicio || "activo"
                            ).toLowerCase()}`}
                          >
                            {venta.estado_servicio || "activo"}
                          </span>
                        </td>
                        <td>{venta.tiempo_estimado || "—"}</td>
                        <td className="venta-price">
                          {formatMoney(venta.precio)}
                        </td>
                        <td>
                          <div className="venta-main">
                            <span>
                              {venta.descripcion || venta.nota || "Sin detalle"}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="table-actions">
                            {esAdminOGerente && (
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => handleEdit(venta)}
                                disabled={filaBloqueada}
                              >
                                Editar
                              </button>
                            )}
                            {esAdminOGerente && (
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => handleDuplicar(venta)}
                                disabled={filaBloqueada}
                              >
                                {filaBloqueada ? "Procesando..." : "Duplicar"}
                              </button>
                            )}
                            {esAdminOGerente && (
                              <button
                                type="button"
                                className="btn-danger"
                                onClick={() => handleDelete(venta.id)}
                                disabled={filaBloqueada}
                              >
                                {filaBloqueada ? "Eliminando..." : "Eliminar"}
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
        </div>
      </section>
    </div>
  );
}
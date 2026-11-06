import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./Clientes.css";
import ClienteDetalle from "./ClienteDetalle";
import { apiRequest, mensajeDeError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const CLIENTES_API_PATH = "/api/clientes";

const ETIQUETA_COLOR_FALLBACKS = {
  vip: "gold",
  frecuente: "blue",
  nuevo: "green",
  empresa: "violet",
  freelance: "cyan",
  freelancer: "cyan",
  moroso: "red",
  prospecto: "orange",
};

function getEtiquetaColor(etiqueta) {
  if (etiqueta?.color) return etiqueta.color;
  const key = String(etiqueta?.nombre || etiqueta || "").trim().toLowerCase();
  return ETIQUETA_COLOR_FALLBACKS[key] || "slate";
}

const initialForm = {
  nombre: "",
  empresa: "",
  email: "",
  telefono: "",
  direccion: "",
  ciudad: "",
  pais: "",
  estadocliente: "activo",
  fechacreacion: new Date().toISOString().slice(0, 10),
  ultimocontacto: "",
  notas: "",
};

function normalizeEstado(value) {
  return String(value || "").trim().toLowerCase();
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("es-CO");
}

export default function Clientes() {
  const { esAdminOGerente } = useAuth();
  const [clientes, setClientes] = useState([]);
  const [formData, setFormData] = useState(initialForm);

  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [editandoId, setEditandoId] = useState(null);

  const [search, setSearch] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [clienteDetalle, setClienteDetalle] = useState(null);

  const lastRequestIdRef = useRef(0);

  const fetchClientes = useCallback(async () => {
    const requestId = ++lastRequestIdRef.current;
    setCargando(true);
    setError("");

    try {
      const params = new URLSearchParams();
      if (search.trim()) params.append("q", search.trim());
      if (estadoFiltro) params.append("estado", estadoFiltro);

      const url = params.toString()
        ? `${CLIENTES_API_PATH}?${params.toString()}`
        : CLIENTES_API_PATH;

      const data = await apiRequest(url);

      if (requestId !== lastRequestIdRef.current) return;
      const lista = Array.isArray(data) ? data : [];
      setClientes(lista);

      if (lista.length > 0) {
        const conEtiquetas = await Promise.all(
          lista.map(async (cli) => {
            try {
              const ets = await apiRequest(`/api/clientes/${cli.id}/etiquetas`);
              return { ...cli, etiquetas: Array.isArray(ets) ? ets : [] };
            } catch {
              return { ...cli, etiquetas: [] };
            }
          })
        );
        if (requestId !== lastRequestIdRef.current) return;
        setClientes(conEtiquetas);
      }
    } catch (e) {
      if (requestId !== lastRequestIdRef.current) return;
      console.error("Error cargando clientes", e);
      setError("No se pudo cargar la lista de clientes.");
    } finally {
      if (requestId === lastRequestIdRef.current) {
        setCargando(false);
      }
    }
  }, [search, estadoFiltro]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchClientes();
    }, 250);

    return () => clearTimeout(timeout);
  }, [fetchClientes]);

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function resetForm() {
    setFormData({
      ...initialForm,
      fechacreacion: new Date().toISOString().slice(0, 10),
    });
    setEditandoId(null);
  }

  function clearFilters() {
    setSearch("");
    setEstadoFiltro("");
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!formData.nombre.trim() || !formData.email.trim()) {
      setError("Nombre y email son obligatorios.");
      setSuccessMsg("");
      return;
    }

    setGuardando(true);
    setError("");
    setSuccessMsg("");

    try {
      const payload = {
        nombre: formData.nombre.trim(),
        empresa: formData.empresa.trim(),
        email: formData.email.trim(),
        telefono: formData.telefono.trim(),
        direccion: formData.direccion.trim(),
        ciudad: formData.ciudad.trim(),
        pais: formData.pais.trim(),
        estadocliente: formData.estadocliente,
        fechacreacion: formData.fechacreacion || null,
        ultimocontacto: formData.ultimocontacto || null,
        notas: formData.notas.trim(),
      };

      if (editandoId == null) {
        await apiRequest(CLIENTES_API_PATH, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setSuccessMsg("Cliente creado correctamente.");
      } else {
        await apiRequest(`${CLIENTES_API_PATH}/${editandoId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setSuccessMsg("Cliente actualizado correctamente.");
      }

      resetForm();
      await fetchClientes();
    } catch (e) {
      console.error("Error guardando cliente", e);
      setError(
        mensajeDeError(
          e,
          editandoId == null
            ? "No se pudo guardar el cliente."
            : "No se pudo actualizar el cliente."
        )
      );
      setSuccessMsg("");
    } finally {
      setGuardando(false);
    }
  }

  async function handleDelete(id) {
    const confirmar = window.confirm("¿Seguro que quieres eliminar este cliente?");
    if (!confirmar) return;

    try {
      await apiRequest(`${CLIENTES_API_PATH}/${id}`, {
        method: "DELETE",
      });

      if (editandoId === id) {
        resetForm();
      }

      if (clienteDetalle?.id === id) {
        setClienteDetalle(null);
      }

      setSuccessMsg("Cliente eliminado correctamente.");
      setError("");
      await fetchClientes();
    } catch (e) {
      console.error("Error eliminando cliente", e);
      setError(mensajeDeError(e, "No se pudo eliminar el cliente."));
      setSuccessMsg("");
    }
  }

  function handleEdit(cliente) {
    setEditandoId(cliente.id);
    setError("");
    setSuccessMsg("");

    setFormData({
      nombre: cliente.nombre || "",
      empresa: cliente.empresa || "",
      email: cliente.email || "",
      telefono: cliente.telefono || "",
      direccion: cliente.direccion || "",
      ciudad: cliente.ciudad || "",
      pais: cliente.pais || "",
      estadocliente: cliente.estadocliente || "activo",
      fechacreacion:
        cliente.fechacreacion || new Date().toISOString().slice(0, 10),
      ultimocontacto: cliente.ultimocontacto || "",
      notas: cliente.notas || "",
    });

    setClienteDetalle(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelarEdicion() {
    resetForm();
    setError("");
    setSuccessMsg("");
  }

  const resumen = useMemo(() => {
    return {
      total: clientes.length,
      activos: clientes.filter(
        (c) => normalizeEstado(c.estadocliente) === "activo"
      ).length,
      prospectos: clientes.filter(
        (c) => normalizeEstado(c.estadocliente) === "prospecto"
      ).length,
      morosos: clientes.filter(
        (c) => normalizeEstado(c.estadocliente) === "moroso"
      ).length,
    };
  }, [clientes]);

  return (
    <>
      <div className="page">
        <div className="page-header">
          <h2>Clientes</h2>
          <p>
            Administra tu base de clientes con información comercial y de
            contacto.
          </p>
        </div>

        <section className="clientes-summary">
          <div className="clientes-summary-grid">
            <div className="clientes-stat-card">
              <div className="clientes-stat-label">Total</div>
              <div className="clientes-stat-value">{resumen.total}</div>
            </div>

            <div className="clientes-stat-card">
              <div className="clientes-stat-label">Activos</div>
              <div className="clientes-stat-value">{resumen.activos}</div>
            </div>

            <div className="clientes-stat-card">
              <div className="clientes-stat-label">Prospectos</div>
              <div className="clientes-stat-value">{resumen.prospectos}</div>
            </div>

            <div className="clientes-stat-card">
              <div className="clientes-stat-label">Morosos</div>
              <div className="clientes-stat-value">{resumen.morosos}</div>
            </div>
          </div>
        </section>

        <section className="clientes-section">
          <h3>{editandoId ? "Editar cliente" : "Nuevo cliente"}</h3>

          {error && <p className="clientes-error">{error}</p>}
          {successMsg && <p className="clientes-success">{successMsg}</p>}

          <form onSubmit={handleSubmit} className="clientes-form">
            <div className="clientes-grid">
              <label>
                Nombre
                <input
                  type="text"
                  name="nombre"
                  value={formData.nombre}
                  onChange={handleChange}
                  placeholder="Ej. Juan Pérez"
                />
              </label>

              <label>
                Empresa
                <input
                  type="text"
                  name="empresa"
                  value={formData.empresa}
                  onChange={handleChange}
                  placeholder="Ej. Xclusive Studio"
                />
              </label>

              <label>
                Email
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="Ej. juan@correo.com"
                />
              </label>

              <label>
                Teléfono
                <input
                  type="tel"
                  name="telefono"
                  value={formData.telefono}
                  onChange={handleChange}
                  placeholder="Ej. +57 300 000 0000"
                />
              </label>

              <label>
                Dirección
                <input
                  type="text"
                  name="direccion"
                  value={formData.direccion}
                  onChange={handleChange}
                  placeholder="Ej. Calle 123 #45-67"
                />
              </label>

              <label>
                Ciudad
                <input
                  type="text"
                  name="ciudad"
                  value={formData.ciudad}
                  onChange={handleChange}
                  placeholder="Ej. Medellín"
                />
              </label>

              <label>
                País
                <input
                  type="text"
                  name="pais"
                  value={formData.pais}
                  onChange={handleChange}
                  placeholder="Ej. Colombia"
                />
              </label>

              <label>
                Estado del cliente
                <select
                  name="estadocliente"
                  value={formData.estadocliente}
                  onChange={handleChange}
                >
                  <option value="activo">Activo</option>
                  <option value="prospecto">Prospecto</option>
                  <option value="inactivo">Inactivo</option>
                  <option value="moroso">Moroso</option>
                </select>
              </label>

              <label>
                Fecha de creación
                <input
                  type="date"
                  name="fechacreacion"
                  value={formData.fechacreacion}
                  onChange={handleChange}
                />
              </label>

              <label>
                Último contacto
                <input
                  type="date"
                  name="ultimocontacto"
                  value={formData.ultimocontacto}
                  onChange={handleChange}
                />
              </label>
            </div>

            <label>
              Notas
              <textarea
                name="notas"
                value={formData.notas}
                onChange={handleChange}
                placeholder="Notas internas sobre este cliente"
                rows={4}
              />
            </label>

            <div className="clientes-actions">
              <button type="submit" disabled={guardando}>
                {guardando
                  ? "Guardando..."
                  : editandoId
                  ? "Actualizar cliente"
                  : "Guardar cliente"}
              </button>

              {editandoId && (
                <button
                  type="button"
                  onClick={cancelarEdicion}
                  className="secondary"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="clientes-section">
          <h3>Lista de clientes</h3>

          <div className="clientes-filters">
            <label>
              Buscar
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nombre, empresa, email, ciudad, país..."
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
                <option value="prospecto">Prospecto</option>
                <option value="inactivo">Inactivo</option>
                <option value="moroso">Moroso</option>
              </select>
            </label>

            <div className="clientes-filter-actions">
              <button
                type="button"
                className="secondary"
                onClick={clearFilters}
                disabled={!search && !estadoFiltro}
              >
                Limpiar filtros
              </button>
            </div>
          </div>

          {cargando ? (
            <p className="clientes-empty">Cargando clientes...</p>
          ) : clientes.length === 0 ? (
            <p className="clientes-empty">
              Aún no tienes clientes registrados.
            </p>
          ) : (
            <div
              className="clientes-table-wrap"
              tabIndex={0}
              role="region"
              aria-label="Listado de clientes desplazable"
            >
              <table className="clientes-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Empresa</th>
                    <th>Email</th>
                    <th>Teléfono</th>
                    <th>Ciudad / País</th>
                    <th>Notas</th>
                    <th>Estado</th>
                    <th>Último contacto</th>
                    <th>Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {clientes.map((cliente) => {
                    const estado = normalizeEstado(
                      cliente.estadocliente || "activo"
                    );

                    return (
                      <tr key={cliente.id}>
                        <td>
                          <div className="cliente-nombre-cell">
                            <button
                              type="button"
                              className="cliente-link-button"
                              onClick={() => setClienteDetalle(cliente)}
                            >
                              <strong>{cliente.nombre || "—"}</strong>
                            </button>

                            {Array.isArray(cliente.etiquetas) &&
                              cliente.etiquetas.length > 0 && (
                                <div
                                  className="cliente-etiquetas-list"
                                  aria-label={`Etiquetas de ${cliente.nombre || "cliente"}`}
                                >
                                  {cliente.etiquetas.map((et, idx) => (
                                    <span
                                      key={et.id || `${et.nombre}-${idx}`}
                                      className={`etiqueta-chip etiqueta-chip--table etiqueta-color-${getEtiquetaColor(et)}`}
                                    >
                                      {et.nombre}
                                    </span>
                                  ))}
                                </div>
                              )}
                          </div>
                        </td>
                        <td>{cliente.empresa || "—"}</td>
                        <td>{cliente.email || "—"}</td>
                        <td>{cliente.telefono || "—"}</td>
                        <td>
                          {[cliente.ciudad, cliente.pais]
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </td>
                        <td>{cliente.notas?.trim() || cliente.direccion || "—"}</td>
                        <td>
                          <span className={`estado-badge ${estado}`}>
                            {cliente.estadocliente || "activo"}
                          </span>
                        </td>
                        <td>{formatDate(cliente.ultimocontacto)}</td>
                        <td>
                          <div className="clientes-row-actions">
                            {esAdminOGerente && (
                              <button
                                type="button"
                                className="chip chip-edit"
                                onClick={() => handleEdit(cliente)}
                              >
                                Editar
                              </button>
                            )}

                            {esAdminOGerente && (
                              <button
                                type="button"
                                className="chip chip-delete"
                                onClick={() => handleDelete(cliente.id)}
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

      {clienteDetalle && (
        <ClienteDetalle
          cliente={clienteDetalle}
          onClose={() => {
            setClienteDetalle(null);
            fetchClientes();
          }}
          onEdit={handleEdit}
        />
      )}
    </>
  );
}
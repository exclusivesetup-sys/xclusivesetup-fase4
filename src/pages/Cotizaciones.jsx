import { useEffect, useMemo, useState } from "react";
import "./Cotizaciones.css";
import { apiRequest, mensajeDeError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const COTIZACIONES_API_PATH = "/api/cotizaciones";
const CLIENTES_API_PATH = "/api/clientes";

const estadosLabels = {
  borrador: "Borrador",
  enviada: "Enviada",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
};

const estadosList = ["borrador", "enviada", "aceptada", "rechazada"];

const initialForm = {
  titulo: "",
  cliente_id: "",
  descripcion: "",
  subtotal: "",
  impuestos: "",
  estado: "borrador",
  fecha: "",
  vigencia: "",
};

function formatMoney(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function Cotizaciones() {
  const { esAdminOGerente } = useAuth();
  const [cotizaciones, setCotizaciones] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [formData, setFormData] = useState(initialForm);
  const [editandoId, setEditandoId] = useState(null);

  const totalCalculado = useMemo(() => {
    return (Number(formData.subtotal) || 0) + (Number(formData.impuestos) || 0);
  }, [formData.subtotal, formData.impuestos]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setErrorMsg("");

      const [cotizacionesRes, clientesRes] = await Promise.allSettled([
        apiRequest(COTIZACIONES_API_PATH),
        apiRequest(CLIENTES_API_PATH),
      ]);

      if (cotizacionesRes.status === "fulfilled") {
        setCotizaciones(
          Array.isArray(cotizacionesRes.value) ? cotizacionesRes.value : []
        );
      } else {
        console.error("Error cargando cotizaciones", cotizacionesRes.reason);
        setErrorMsg("No se pudieron cargar las cotizaciones.");
      }

      if (clientesRes.status === "fulfilled") {
        setClientes(Array.isArray(clientesRes.value) ? clientesRes.value : []);
      } else {
        console.error("Error cargando clientes para cotizaciones", clientesRes.reason);
        setErrorMsg((prev) =>
          prev
            ? `${prev} No se pudieron cargar los clientes.`
            : "No se pudieron cargar los clientes."
        );
      }

      setLoading(false);
    }

    loadData();
  }, []);

  function renderEstado(estado) {
    if (!estado) return "Sin estado";
    return estadosLabels[estado] || estado;
  }

  function getClienteNombre(clienteId) {
    if (!clienteId) return "-";
    const c = clientes.find((cli) => Number(cli.id) === Number(clienteId));
    return c ? c.nombre : "-";
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!formData.titulo.trim()) {
      setErrorMsg("El título es obligatorio.");
      return;
    }

    if (formData.subtotal === "" || formData.impuestos === "") {
      setErrorMsg("Subtotal e impuestos son obligatorios.");
      return;
    }

    if (
      Number.isNaN(Number(formData.subtotal)) ||
      Number.isNaN(Number(formData.impuestos))
    ) {
      setErrorMsg("Subtotal e impuestos deben ser valores numéricos válidos.");
      return;
    }

    if (Number(formData.subtotal) < 0 || Number(formData.impuestos) < 0) {
      setErrorMsg("Subtotal e impuestos no pueden ser negativos.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        cliente_id: formData.cliente_id ? Number(formData.cliente_id) : null,
        oportunidad_id: null,
        titulo: formData.titulo.trim(),
        descripcion: formData.descripcion.trim() || null,
        subtotal: Number(formData.subtotal) || 0,
        impuestos: Number(formData.impuestos) || 0,
        total: totalCalculado,
        estado: formData.estado,
        fecha: formData.fecha || new Date().toISOString().slice(0, 10),
        vigencia: formData.vigencia || null,
      };

      if (editandoId == null) {
        const nuevaCotizacion = await apiRequest(COTIZACIONES_API_PATH, {
          method: "POST",
          body: JSON.stringify(payload),
        });

        if (!nuevaCotizacion?.id) {
          setErrorMsg("El servidor no devolvió un ID válido.");
          return;
        }

        setCotizaciones((prev) => [nuevaCotizacion, ...prev]);
        setSuccessMsg("Cotización creada correctamente.");
      } else {
        const actualizada = await apiRequest(
          `${COTIZACIONES_API_PATH}/${editandoId}`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          }
        );

        setCotizaciones((prev) =>
          prev.map((c) => (c.id === editandoId ? actualizada : c))
        );
        setSuccessMsg("Cotización actualizada correctamente.");
      }

      setFormData(initialForm);
      setEditandoId(null);
    } catch (err) {
      console.error("Error guardando cotización", err);
      setErrorMsg(
        mensajeDeError(
          err,
          editandoId == null
            ? "No se pudo crear la cotización."
            : "No se pudo actualizar la cotización."
        )
      );
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(cotizacion) {
    setErrorMsg("");
    setSuccessMsg("");
    setEditandoId(cotizacion.id);
    setFormData({
      titulo: cotizacion.titulo || "",
      cliente_id: cotizacion.cliente_id ? String(cotizacion.cliente_id) : "",
      descripcion: cotizacion.descripcion || "",
      subtotal: cotizacion.subtotal != null ? String(cotizacion.subtotal) : "",
      impuestos: cotizacion.impuestos != null ? String(cotizacion.impuestos) : "",
      estado: cotizacion.estado || "borrador",
      fecha: cotizacion.fecha || "",
      vigencia: cotizacion.vigencia || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setFormData(initialForm);
    setErrorMsg("");
    setSuccessMsg("");
  }

  async function eliminarCotizacion(id) {
    const confirmar = window.confirm(
      "¿Seguro que quieres eliminar esta cotización?"
    );
    if (!confirmar) return;

    setErrorMsg("");
    setSuccessMsg("");
    setActionLoadingId(id);

    try {
      await apiRequest(`${COTIZACIONES_API_PATH}/${id}`, {
        method: "DELETE",
      });

      setCotizaciones((prev) => prev.filter((c) => c.id !== id));

      if (editandoId === id) {
        cancelarEdicion();
      }

      setSuccessMsg("Cotización eliminada correctamente.");
    } catch (err) {
      console.error("Error eliminando cotización", err);
      setErrorMsg(mensajeDeError(err, "No se pudo eliminar la cotización."));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function actualizarEstado(id, nuevoEstado) {
    setErrorMsg("");
    setSuccessMsg("");
    setActionLoadingId(id);

    try {
      await apiRequest(`${COTIZACIONES_API_PATH}/${id}/estado`, {
        method: "PUT",
        body: JSON.stringify({ estado: nuevoEstado }),
      });

      setCotizaciones((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                estado: nuevoEstado,
              }
            : c
        )
      );

      setSuccessMsg("Estado de cotización actualizado.");
    } catch (err) {
      console.error("Error actualizando estado de cotización", err);
      setErrorMsg("No se pudo actualizar el estado de la cotización.");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function convertirEnProyecto(cotizacion) {
    if (cotizacion.estado !== "aceptada") {
      setErrorMsg("Solo se pueden convertir a proyecto las cotizaciones con estado 'aceptada'.");
      return;
    }

    const confirmar = window.confirm(
      `¿Deseas crear un nuevo proyecto a partir de la cotización "${cotizacion.titulo}"?`
    );
    if (!confirmar) return;

    setErrorMsg("");
    setSuccessMsg("");
    setActionLoadingId(cotizacion.id);

    try {
      const res = await apiRequest(`${COTIZACIONES_API_PATH}/${cotizacion.id}/convertir-a-proyecto`, {
        method: "POST",
      });

      const proyectoId = res.id || res.proyecto?.id;

      setCotizaciones((prev) =>
        prev.map((c) =>
          c.id === cotizacion.id
            ? { ...c, proyecto_id: proyectoId }
            : c
        )
      );

      if (res.yaExistia) {
        setSuccessMsg(`La cotización ya tenía el proyecto #${proyectoId} asociado. Navegando al proyecto...`);
      } else {
        setSuccessMsg(`¡Proyecto #${proyectoId} creado exitosamente! Navegando al proyecto...`);
      }

      setTimeout(() => {
        window.location.hash = `#proyectos?id=${proyectoId}`;
      }, 700);
    } catch (err) {
      console.error("Error al convertir cotización a proyecto", err);
      setErrorMsg(mensajeDeError(err, "No se pudo convertir la cotización a proyecto."));
    } finally {
      setActionLoadingId(null);
    }
  }

  function verProyecto(proyectoId) {
    window.location.hash = `#proyectos?id=${proyectoId}`;
  }


  return (
    <div className="page">
      <div className="page-header">
        <h2>Cotizaciones</h2>
        <p>
          Gestiona tus propuestas comerciales: crea cotizaciones y actualiza su
          estado según el avance con el cliente.
        </p>
      </div>

      <form className="cot-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-field">
            <label>Título</label>
            <input
              type="text"
              name="titulo"
              value={formData.titulo}
              onChange={handleChange}
              placeholder="Ej: Cotización sitio web Clínica Nova"
              disabled={saving}
            />
          </div>

          <div className="form-field">
            <label>Cliente</label>
            <select
              name="cliente_id"
              value={formData.cliente_id}
              onChange={handleChange}
              disabled={saving}
            >
              <option value="">Sin cliente asignado</option>
              {clientes.map((cli) => (
                <option key={cli.id} value={cli.id}>
                  {cli.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Subtotal</label>
            <input
              type="number"
              name="subtotal"
              value={formData.subtotal}
              onChange={handleChange}
              placeholder="Ej: 1500"
              min="0"
              disabled={saving}
            />
          </div>

          <div className="form-field">
            <label>Impuestos</label>
            <input
              type="number"
              name="impuestos"
              value={formData.impuestos}
              onChange={handleChange}
              placeholder="Ej: 285"
              min="0"
              disabled={saving}
            />
          </div>

          <div className="form-field">
            <label>Total</label>
            <input type="text" value={totalCalculado} readOnly disabled />
          </div>

          <div className="form-field">
            <label>Estado</label>
            <select
              name="estado"
              value={formData.estado}
              onChange={handleChange}
              disabled={saving}
            >
              {estadosList.map((e) => (
                <option key={e} value={e}>
                  {renderEstado(e)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label>Descripción</label>
            <textarea
              name="descripcion"
              value={formData.descripcion}
              onChange={handleChange}
              placeholder="Resumen de servicios incluidos en la cotización"
              rows={2}
              disabled={saving}
            />
          </div>

          <div className="form-field">
            <label>Fecha</label>
            <input
              type="date"
              name="fecha"
              value={formData.fecha}
              onChange={handleChange}
              disabled={saving}
            />
          </div>

          <div className="form-field">
            <label>Vigencia</label>
            <input
              type="date"
              name="vigencia"
              value={formData.vigencia}
              onChange={handleChange}
              disabled={saving}
            />
          </div>
        </div>

        <div className="form-actions-row">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving
              ? "Guardando..."
              : editandoId
              ? "Actualizar cotización"
              : "Crear cotización"}
          </button>

          {editandoId && (
            <button
              type="button"
              className="btn-secondary"
              onClick={cancelarEdicion}
              disabled={saving}
            >
              Cancelar
            </button>
          )}
        </div>

        {errorMsg && <p className="form-message error">{errorMsg}</p>}
        {successMsg && <p className="form-message success">{successMsg}</p>}
      </form>

      {loading ? (
        <p className="pipeline-status">Cargando cotizaciones…</p>
      ) : cotizaciones.length === 0 ? (
        <p className="pipeline-status">Aún no tienes cotizaciones registradas.</p>
      ) : (
        <div
          className="cot-table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Listado de cotizaciones desplazable"
        >
          <table className="cot-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Título</th>
                <th>Cliente</th>
                <th className="is-right">Subtotal</th>
                <th className="is-right">Impuestos</th>
                <th className="is-right">Total</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Vigencia</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cotizaciones.map((c) => {
                const disabled = actionLoadingId === c.id;

                return (
                  <tr key={c.id}>
                    <td>{c.id}</td>
                    <td>{c.titulo}</td>
                    <td>{getClienteNombre(c.cliente_id)}</td>
                    <td className="is-right">{formatMoney(c.subtotal)}</td>
                    <td className="is-right">{formatMoney(c.impuestos)}</td>
                    <td className="is-right">{formatMoney(c.total)}</td>
                    <td>
                      <span
                        className={`cot-badge cot-badge--${
                          c.estado || "borrador"
                        }`}
                      >
                        {renderEstado(c.estado)}
                      </span>
                    </td>
                    <td>{c.fecha || "-"}</td>
                    <td>{c.vigencia || "-"}</td>
                    <td>
                      <div className="cot-actions">
                        <button
                          type="button"
                          onClick={() => actualizarEstado(c.id, "enviada")}
                          disabled={disabled || c.estado === "enviada"}
                        >
                          {disabled && c.estado !== "enviada"
                            ? "Procesando..."
                            : "Enviada"}
                        </button>

                        <button
                          type="button"
                          onClick={() => actualizarEstado(c.id, "aceptada")}
                          disabled={disabled || c.estado === "aceptada"}
                        >
                          {disabled && c.estado !== "aceptada"
                            ? "Procesando..."
                            : "Aceptada"}
                        </button>

                        <button
                          type="button"
                          onClick={() => actualizarEstado(c.id, "rechazada")}
                          disabled={disabled || c.estado === "rechazada"}
                        >
                          {disabled && c.estado !== "rechazada"
                            ? "Procesando..."
                            : "Rechazada"}
                        </button>

                        {c.estado === "aceptada" && (
                          c.proyecto_id ? (
                            <button
                              type="button"
                              className="cot-btn-ver-proyecto"
                              onClick={() => verProyecto(c.proyecto_id)}
                              title={`Ver proyecto asociado #${c.proyecto_id}`}
                            >
                              Ver proyecto
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="cot-btn-crear-proyecto"
                              onClick={() => convertirEnProyecto(c)}
                              disabled={disabled}
                              title="Crear proyecto desde esta cotización aceptada"
                            >
                              {disabled ? "Creando..." : "Crear proyecto"}
                            </button>
                          )
                        )}


                        {esAdminOGerente && (
                          <button
                            type="button"
                            onClick={() => handleEdit(c)}
                            disabled={disabled}
                          >
                            Editar
                          </button>
                        )}

                        {esAdminOGerente && (
                          <button
                            type="button"
                            className="cot-btn-danger"
                            onClick={() => eliminarCotizacion(c.id)}
                            disabled={disabled}
                          >
                            {disabled ? "Procesando..." : "Eliminar"}
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
  );
}

export default Cotizaciones;
import React, { useEffect, useMemo, useState } from "react";
import "./Pipeline.css";
import "../components/CardActions.css";
import { apiRequest, mensajeDeError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const OPORTUNIDADES_API_PATH = "/api/oportunidades";
const CLIENTES_API_PATH = "/api/clientes";
const COTIZACIONES_API_PATH = "/api/cotizaciones";

const STAGES = [
  { value: "nuevo", label: "Nuevo" },
  { value: "contactado", label: "Contactado" },
  { value: "propuesta", label: "Propuesta enviada" },
  { value: "negociacion", label: "Negociación" },
  { value: "ganado", label: "Ganado" },
  { value: "perdido", label: "Perdido" },
];

const initialForm = {
  titulo: "",
  cliente_id: "",
  servicio: "",
  monto: "",
  etapa: "nuevo",
  responsable: "",
};

function formatFecha(value) {
  if (!value) return "Sin fecha";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("es-CO");
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function Pipeline() {
  const { esAdminOGerente } = useAuth();
  const [oportunidades, setOportunidades] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState(initialForm);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [updatingId, setUpdatingId] = useState(null);
  const [quoteLoadingId, setQuoteLoadingId] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setErrorMsg("");

    try {
      const [oppData, cliData] = await Promise.all([
        apiRequest(OPORTUNIDADES_API_PATH),
        apiRequest(CLIENTES_API_PATH),
      ]);

      setOportunidades(Array.isArray(oppData) ? oppData : []);
      setClientes(Array.isArray(cliData) ? cliData : []);
    } catch (err) {
      console.error("Error cargando datos del pipeline", err);
      setErrorMsg("No se pudieron cargar oportunidades o clientes.");
    } finally {
      setLoading(false);
    }
  }

  function getStageLabel(value) {
    return STAGES.find((stage) => stage.value === value)?.label || "Nuevo";
  }

  const porEtapa = useMemo(() => {
    const base = STAGES.reduce((acc, stage) => {
      acc[stage.value] = [];
      return acc;
    }, {});

    oportunidades.forEach((opp) => {
      const etapaValida = STAGES.some((stage) => stage.value === opp.etapa)
        ? opp.etapa
        : "nuevo";

      base[etapaValida].push(opp);
    });

    return base;
  }, [oportunidades]);

  function getClienteNombre(clienteId) {
    if (!clienteId) return null;

    const clienteIdNum = Number(clienteId);
    const cliente = clientes.find((cli) => Number(cli.id) === clienteIdNum);

    return cliente ? cliente.nombre : null;
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

    if (formData.monto !== "" && Number(formData.monto) < 0) {
      setErrorMsg("El importe estimado no puede ser negativo.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        titulo: formData.titulo.trim(),
        cliente_id: formData.cliente_id ? Number(formData.cliente_id) : null,
        servicio: formData.servicio.trim() || null,
        monto: Number(formData.monto) || 0,
        etapa: formData.etapa || "nuevo",
        responsable: formData.responsable.trim() || null,
      };

      if (editandoId == null) {
        const result = await apiRequest(OPORTUNIDADES_API_PATH, {
          method: "POST",
          body: JSON.stringify(payload),
        });

        if (!result?.id) {
          setErrorMsg("El servidor no devolvió un ID válido.");
          return;
        }

        setOportunidades((prev) => [result, ...prev]);
        setSuccessMsg("Oportunidad creada correctamente.");
      } else {
        const result = await apiRequest(
          `${OPORTUNIDADES_API_PATH}/${editandoId}`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          }
        );

        setOportunidades((prev) =>
          prev.map((item) => (item.id === editandoId ? result : item))
        );
        setSuccessMsg("Oportunidad actualizada correctamente.");
      }

      setFormData(initialForm);
      setEditandoId(null);
    } catch (err) {
      console.error("Error guardando oportunidad", err);
      setErrorMsg(
        mensajeDeError(
          err,
          editandoId == null
            ? "No se pudo crear la oportunidad."
            : "No se pudo actualizar la oportunidad."
        )
      );
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(opp) {
    setErrorMsg("");
    setSuccessMsg("");
    setEditandoId(opp.id);
    setFormData({
      titulo: opp.titulo || "",
      cliente_id: opp.cliente_id ? String(opp.cliente_id) : "",
      servicio: opp.servicio || "",
      monto: opp.monto != null ? String(opp.monto) : "",
      etapa: STAGES.some((s) => s.value === opp.etapa) ? opp.etapa : "nuevo",
      responsable: opp.responsable || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setFormData(initialForm);
    setErrorMsg("");
    setSuccessMsg("");
  }

  async function handleDelete(opp) {
    const confirmar = window.confirm(
      "¿Seguro que quieres eliminar esta oportunidad?"
    );
    if (!confirmar) return;

    setErrorMsg("");
    setSuccessMsg("");
    setDeletingId(opp.id);

    try {
      await apiRequest(`${OPORTUNIDADES_API_PATH}/${opp.id}`, {
        method: "DELETE",
      });

      setOportunidades((prev) => prev.filter((item) => item.id !== opp.id));

      if (editandoId === opp.id) {
        cancelarEdicion();
      }

      setSuccessMsg("Oportunidad eliminada correctamente.");
    } catch (err) {
      console.error("Error eliminando oportunidad", err);
      setErrorMsg(mensajeDeError(err, "No se pudo eliminar la oportunidad."));
    } finally {
      setDeletingId(null);
    }
  }

  async function updateStage(opp, nuevaEtapa) {
    if (!nuevaEtapa || nuevaEtapa === opp.etapa) return;

    setErrorMsg("");
    setSuccessMsg("");
    setUpdatingId(opp.id);

    try {
      const result = await apiRequest(
        `${OPORTUNIDADES_API_PATH}/${opp.id}/etapa`,
        {
          method: "PUT",
          body: JSON.stringify({ etapa: nuevaEtapa }),
        }
      );

      setOportunidades((prev) =>
        prev.map((item) =>
          item.id === opp.id
            ? {
                ...item,
                etapa: result.etapa ?? nuevaEtapa,
                ultimo_movimiento:
                  result.ultimo_movimiento ?? `Movido a "${nuevaEtapa}"`,
              }
            : item
        )
      );

      setSuccessMsg(
        `Oportunidad movida a "${getStageLabel(
          result.etapa ?? nuevaEtapa
        )}".`
      );
    } catch (err) {
      console.error("Error actualizando etapa de oportunidad", err);
      setErrorMsg("No se pudo cambiar la etapa de la oportunidad.");
    } finally {
      setUpdatingId(null);
    }
  }

  function moveToNextStage(opp) {
    const currentStage = STAGES.some((stage) => stage.value === opp.etapa)
      ? opp.etapa
      : "nuevo";

    const currentIndex = STAGES.findIndex(
      (stage) => stage.value === currentStage
    );

    if (currentIndex === -1 || currentIndex === STAGES.length - 1) return;

    const nextStage = STAGES[currentIndex + 1].value;
    updateStage(opp, nextStage);
  }

  async function crearCotizacionDesdeOportunidad(opp) {
    setErrorMsg("");
    setSuccessMsg("");
    setQuoteLoadingId(opp.id);

    try {
      const clienteNombre = getClienteNombre(opp.cliente_id);
      const tituloCotizacion = `Cotización - ${
        clienteNombre || opp.titulo || "Sin cliente"
      }`;

      const subtotal = Number(opp.monto) || 0;
      const impuestos = 0;
      const total = subtotal + impuestos;

      await apiRequest(COTIZACIONES_API_PATH, {
        method: "POST",
        body: JSON.stringify({
          cliente_id: opp.cliente_id ? Number(opp.cliente_id) : null,
          oportunidad_id: opp.id,
          titulo: tituloCotizacion,
          descripcion: opp.servicio || opp.titulo || null,
          subtotal,
          impuestos,
          total,
          estado: "borrador",
          fecha: new Date().toISOString().slice(0, 10),
          vigencia: null,
        }),
      });

      setSuccessMsg("Cotización creada correctamente en borrador.");
    } catch (err) {
      console.error("Error creando cotización", err);
      setErrorMsg("No se pudo crear la cotización desde esta oportunidad.");
    } finally {
      setQuoteLoadingId(null);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Oportunidades comercial</h2>
        <p>
          Visualiza el estado de tus oportunidades de venta, desde nuevos
          contactos hasta negocios ganados o perdidos.
        </p>
      </div>

      <form className="pipeline-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-field">
            <label>Título de la oportunidad</label>
            <input
              type="text"
              name="titulo"
              value={formData.titulo}
              onChange={handleChange}
              placeholder="Ej: Clínica Nova - Sitio web"
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
            <label>Servicio</label>
            <input
              type="text"
              name="servicio"
              value={formData.servicio}
              onChange={handleChange}
              placeholder="Ej: Desarrollo web"
              disabled={saving}
            />
          </div>

          <div className="form-field">
            <label>Importe estimado</label>
            <input
              type="number"
              name="monto"
              value={formData.monto}
              onChange={handleChange}
              placeholder="Ej: 1500000"
              min="0"
              disabled={saving}
            />
          </div>

          <div className="form-field">
            <label>Etapa</label>
            <select
              name="etapa"
              value={formData.etapa}
              onChange={handleChange}
              disabled={saving}
            >
              {STAGES.map((stage) => (
                <option key={stage.value} value={stage.value}>
                  {stage.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Responsable</label>
            <input
              type="text"
              name="responsable"
              value={formData.responsable}
              onChange={handleChange}
              placeholder="Ej: Alejandra"
              disabled={saving}
            />
          </div>
        </div>

        <div className="form-actions-row">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving
              ? "Guardando..."
              : editandoId
              ? "Actualizar oportunidad"
              : "Agregar oportunidad"}
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
        <p className="pipeline-status">Cargando oportunidades y clientes…</p>
      ) : (
        <div className="kanban">
          {STAGES.map((stage) => (
            <div key={stage.value} className="kanban-column">
              <div className="kanban-title">
                {stage.label} ({porEtapa[stage.value].length})
              </div>

              {porEtapa[stage.value].length === 0 ? (
                <p className="kanban-empty">Sin oportunidades en esta etapa.</p>
              ) : (
                porEtapa[stage.value].map((opp) => {
                  const clienteNombre = getClienteNombre(opp.cliente_id);
                  const bloqueado =
                    updatingId === opp.id ||
                    quoteLoadingId === opp.id ||
                    deletingId === opp.id;

                  return (
                    <div key={opp.id} className="kanban-card">
                      <strong>{opp.titulo}</strong>

                      {clienteNombre && <small>Cliente: {clienteNombre}</small>}
                      {opp.servicio && <small>Servicio: {opp.servicio}</small>}

                      <small>
                        Importe estimado: {formatMoney(opp.monto)}
                      </small>

                      <small>
                        Responsable: {opp.responsable || "Sin asignar"}
                      </small>

                      <small>Fecha: {formatFecha(opp.fecha_creacion)}</small>

                      <small>
                        Último movimiento:{" "}
                        {opp.ultimo_movimiento || "Sin registro"}
                      </small>

                      <div className="card-actions">
                        <div>
                          <span className="card-stage-label">Etapa</span>
                          <select
                            className="card-stage-select full-width"
                            value={
                              STAGES.some((s) => s.value === opp.etapa)
                                ? opp.etapa
                                : "nuevo"
                            }
                            onChange={(e) => updateStage(opp, e.target.value)}
                            disabled={bloqueado}
                          >
                            {STAGES.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {opp.etapa !== "perdido" && opp.etapa !== "ganado" && (
                          <button
                            type="button"
                            className="card-action-btn card-action-btn--secondary card-action-btn--block"
                            onClick={() => moveToNextStage(opp)}
                            disabled={bloqueado}
                          >
                            {updatingId === opp.id
                              ? "Moviendo..."
                              : "Mover a siguiente etapa"}
                          </button>
                        )}

                        <button
                          type="button"
                          className="card-action-btn card-action-btn--secondary card-action-btn--block"
                          onClick={() => crearCotizacionDesdeOportunidad(opp)}
                          disabled={bloqueado}
                        >
                          {quoteLoadingId === opp.id
                            ? "Creando cotización..."
                            : "Crear cotización"}
                        </button>

                        <div className="card-actions-inline">
                          {esAdminOGerente && (
                            <button
                              type="button"
                              className="card-action-btn card-action-btn--secondary"
                              onClick={() => handleEdit(opp)}
                              disabled={bloqueado}
                            >
                              Editar
                            </button>
                          )}

                          {esAdminOGerente && (
                            <button
                              type="button"
                              className="card-action-btn card-action-btn--danger"
                              onClick={() => handleDelete(opp)}
                              disabled={bloqueado}
                            >
                              {deletingId === opp.id
                                ? "Eliminando..."
                                : "Eliminar"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Pipeline;
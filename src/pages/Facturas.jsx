import React, { useEffect, useMemo, useState } from "react";
import "./Facturas.css";
import "../components/CardActions.css";
import { apiRequest, mensajeDeError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const FACTURAS_API_PATH = "/api/facturas";
const CLIENTES_API_PATH = "/api/clientes";

const estadosLabels = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  pagada: "Pagada",
  vencida: "Vencida",
  cancelada: "Cancelada",
};

const initialFacturaForm = {
  titulo: "",
  cliente_id: "",
  subtotal: "",
  impuestos: "",
  fecha: "",
  vencimiento: "",
  descripcion: "",
};

const initialPagoForm = {
  monto: "",
  fecha: "",
  metodo: "",
  referencia: "",
  nota: "",
};

function diasHasta(fechaStr) {
  if (!fechaStr) return null;
  const hoy = new Date();
  const fecha = new Date(fechaStr);
  const diffMs = fecha.getTime() - hoy.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function getEstadoVisual(factura) {
  const { estado, vencimiento } = factura;

  if (estado === "vencida") return "fac-row-vencida";

  const d = diasHasta(vencimiento);
  if (d != null && d >= 0 && d <= 7 && estado !== "pagada") {
    return "fac-row-proxima";
  }

  return "";
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function normalizeResumenPagos(data) {
  if (!data) return null;

  return {
    factura_id: Number(data.factura_id ?? data.facturaid ?? 0),
    total_factura: Number(data.total_factura ?? data.totalfactura ?? 0),
    total_pagado: Number(data.total_pagado ?? data.totalpagado ?? 0),
    saldo_pendiente: Number(data.saldo_pendiente ?? data.saldopendiente ?? 0),
    estado: data.estado ?? "pendiente",
  };
}

function getBadgeClass(estado) {
  switch (estado) {
    case "pagada":
      return "is-paid";
    case "parcial":
      return "is-partial";
    case "vencida":
      return "is-overdue";
    case "cancelada":
      return "is-cancelled";
    default:
      return "is-pending";
  }
}

function Facturas() {
  const { esAdminOGerente } = useAuth();
  const [facturas, setFacturas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null);
  const [pagos, setPagos] = useState([]);
  const [resumenPagos, setResumenPagos] = useState(null);
  const [loadingPagos, setLoadingPagos] = useState(false);
  const [errorPagos, setErrorPagos] = useState("");

  const [pagoForm, setPagoForm] = useState(initialPagoForm);
  const [savingPago, setSavingPago] = useState(false);

  const [facturaForm, setFacturaForm] = useState(initialFacturaForm);
  const [savingFactura, setSavingFactura] = useState(false);
  const [errorNuevaFactura, setErrorNuevaFactura] = useState("");
  const [estadoLoadingId, setEstadoLoadingId] = useState(null);

  const [editingFactura, setEditingFactura] = useState(false);
  const [editFacturaForm, setEditFacturaForm] = useState({
    ...initialFacturaForm,
    estado: "pendiente",
  });
  const [savingEditFactura, setSavingEditFactura] = useState(false);
  const [deletingPagoId, setDeletingPagoId] = useState(null);

  const facturaTotalCalculado = useMemo(() => {
    return (Number(facturaForm.subtotal) || 0) + (Number(facturaForm.impuestos) || 0);
  }, [facturaForm.subtotal, facturaForm.impuestos]);

  const editFacturaTotalCalculado = useMemo(() => {
    return (Number(editFacturaForm.subtotal) || 0) + (Number(editFacturaForm.impuestos) || 0);
  }, [editFacturaForm.subtotal, editFacturaForm.impuestos]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setErrorMsg("");

      const [facturasRes, clientesRes] = await Promise.allSettled([
        apiRequest(FACTURAS_API_PATH),
        apiRequest(CLIENTES_API_PATH),
      ]);

      if (facturasRes.status === "fulfilled") {
        setFacturas(Array.isArray(facturasRes.value) ? facturasRes.value : []);
      } else {
        console.error("Error cargando facturas", facturasRes.reason);
        setErrorMsg("No se pudieron cargar las facturas.");
      }

      if (clientesRes.status === "fulfilled") {
        setClientes(Array.isArray(clientesRes.value) ? clientesRes.value : []);
      } else {
        console.error("Error cargando clientes para facturas", clientesRes.reason);
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

  function getClienteNombre(clienteId) {
    if (!clienteId) return "-";
    const c = clientes.find((cli) => Number(cli.id) === Number(clienteId));
    return c ? c.nombre : "-";
  }

  function renderEstado(estado) {
    if (!estado) return "Sin estado";
    return estadosLabels[estado] || estado;
  }

  function handleFacturaChange(e) {
    const { name, value } = e.target;
    setFacturaForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function handlePagoChange(e) {
    const { name, value } = e.target;
    setPagoForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function handleEditFacturaChange(e) {
    const { name, value } = e.target;
    setEditFacturaForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function actualizarEstado(id, nuevoEstado) {
    setErrorMsg("");
    setSuccessMsg("");
    setEstadoLoadingId(id);

    try {
      await apiRequest(`${FACTURAS_API_PATH}/${id}/estado`, {
        method: "PUT",
        body: JSON.stringify({ estado: nuevoEstado }),
      });

      setFacturas((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                estado: nuevoEstado,
              }
            : f
        )
      );

      if (facturaSeleccionada?.id === id) {
        setFacturaSeleccionada((prev) =>
          prev ? { ...prev, estado: nuevoEstado } : prev
        );

        setResumenPagos((prev) =>
          prev ? { ...prev, estado: nuevoEstado } : prev
        );
      }

      setSuccessMsg("Estado de factura actualizado.");
    } catch (err) {
      console.error("Error actualizando estado de factura", err);
      setErrorMsg(mensajeDeError(err, "No se pudo actualizar el estado de la factura."));
    } finally {
      setEstadoLoadingId(null);
    }
  }

  async function cargarPagosFactura(factura) {
    setFacturaSeleccionada(factura);
    setPagos([]);
    setResumenPagos(null);
    setErrorPagos("");
    setLoadingPagos(true);
    setPagoForm(initialPagoForm);
    setEditingFactura(false);

    try {
      const [dataPagos, dataResumen] = await Promise.all([
        apiRequest(`${FACTURAS_API_PATH}/${factura.id}/pagos`),
        apiRequest(`${FACTURAS_API_PATH}/${factura.id}/resumen-pagos`),
      ]);

      setPagos(Array.isArray(dataPagos) ? dataPagos : []);
      setResumenPagos(normalizeResumenPagos(dataResumen));
    } catch (err) {
      console.error("Error cargando pagos de factura", err);
      setErrorPagos("No se pudieron cargar los pagos de esta factura.");
    } finally {
      setLoadingPagos(false);
    }
  }

  async function registrarPago(e) {
    e.preventDefault();
    if (!facturaSeleccionada) return;

    setErrorPagos("");
    setSuccessMsg("");

    if (!pagoForm.monto || Number(pagoForm.monto) <= 0) {
      setErrorPagos("El monto del pago debe ser mayor a 0.");
      return;
    }

    setSavingPago(true);

    try {
      const data = await apiRequest(
        `${FACTURAS_API_PATH}/${facturaSeleccionada.id}/pagos`,
        {
          method: "POST",
          body: JSON.stringify({
            monto: Number(pagoForm.monto),
            fecha: pagoForm.fecha || null,
            metodo: pagoForm.metodo || null,
            referencia: pagoForm.referencia || null,
            nota: pagoForm.nota || null,
          }),
        }
      );

      setPagos((prev) => [data.pago, ...prev]);

      setResumenPagos(
        normalizeResumenPagos({
          factura_id: data.factura?.id,
          total_factura: data.factura?.total,
          total_pagado: data.total_pagado ?? data.totalpagado,
          saldo_pendiente: data.saldo_pendiente ?? data.saldopendiente,
          estado: data.factura?.estado,
        })
      );

      setFacturas((prev) =>
        prev.map((f) =>
          f.id === facturaSeleccionada.id
            ? { ...f, estado: data.factura.estado }
            : f
        )
      );

      setFacturaSeleccionada((prev) =>
        prev ? { ...prev, estado: data.factura.estado } : prev
      );

      setPagoForm(initialPagoForm);
      setSuccessMsg("Pago registrado correctamente.");
    } catch (err) {
      console.error("Error registrando pago", err);
      setErrorPagos(mensajeDeError(err, "No se pudo registrar el pago."));
    } finally {
      setSavingPago(false);
    }
  }

  async function crearFactura(e) {
    e.preventDefault();
    setErrorNuevaFactura("");
    setSuccessMsg("");

    if (!facturaForm.titulo.trim()) {
      setErrorNuevaFactura("El título es obligatorio.");
      return;
    }

    if (
      facturaForm.subtotal === "" ||
      facturaForm.impuestos === "" ||
      Number.isNaN(Number(facturaForm.subtotal)) ||
      Number.isNaN(Number(facturaForm.impuestos))
    ) {
      setErrorNuevaFactura(
        "Subtotal e impuestos deben ser valores numéricos válidos."
      );
      return;
    }

    setSavingFactura(true);

    try {
      const payload = {
        cliente_id: facturaForm.cliente_id
          ? Number(facturaForm.cliente_id)
          : null,
        cotizacion_id: null,
        numero: null,
        titulo: facturaForm.titulo.trim(),
        descripcion: facturaForm.descripcion.trim() || null,
        subtotal: Number(facturaForm.subtotal),
        impuestos: Number(facturaForm.impuestos),
        total: facturaTotalCalculado,
        estado: "pendiente",
        fecha: facturaForm.fecha || new Date().toISOString().slice(0, 10),
        vencimiento: facturaForm.vencimiento || null,
      };

      const nueva = await apiRequest(FACTURAS_API_PATH, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setFacturas((prev) => [nueva, ...prev]);
      setFacturaForm(initialFacturaForm);
      setSuccessMsg("Factura creada correctamente.");
    } catch (err) {
      console.error("Error creando factura", err);
      setErrorNuevaFactura(mensajeDeError(err, "No se pudo crear la factura."));
    } finally {
      setSavingFactura(false);
    }
  }

  function abrirEdicionFactura() {
    if (!facturaSeleccionada) return;

    setEditFacturaForm({
      titulo: facturaSeleccionada.titulo || "",
      cliente_id: facturaSeleccionada.cliente_id
        ? String(facturaSeleccionada.cliente_id)
        : "",
      subtotal: String(facturaSeleccionada.subtotal ?? ""),
      impuestos: String(facturaSeleccionada.impuestos ?? ""),
      fecha: facturaSeleccionada.fecha || "",
      vencimiento: facturaSeleccionada.vencimiento || "",
      descripcion: facturaSeleccionada.descripcion || "",
      estado: facturaSeleccionada.estado || "pendiente",
    });

    setEditingFactura(true);
    setErrorPagos("");
    setSuccessMsg("");
  }

  function cancelarEdicionFactura() {
    setEditingFactura(false);
    setEditFacturaForm({
      ...initialFacturaForm,
      estado: "pendiente",
    });
  }

  async function guardarEdicionFactura(e) {
    e.preventDefault();
    if (!facturaSeleccionada) return;

    setErrorPagos("");
    setSuccessMsg("");

    if (!editFacturaForm.titulo.trim()) {
      setErrorPagos("El título de la factura es obligatorio.");
      return;
    }

    if (
      editFacturaForm.subtotal === "" ||
      editFacturaForm.impuestos === "" ||
      Number.isNaN(Number(editFacturaForm.subtotal)) ||
      Number.isNaN(Number(editFacturaForm.impuestos))
    ) {
      setErrorPagos(
        "Subtotal e impuestos deben ser valores numéricos válidos."
      );
      return;
    }

    setSavingEditFactura(true);

    try {
      const payload = {
        cliente_id: editFacturaForm.cliente_id
          ? Number(editFacturaForm.cliente_id)
          : null,
        cotizacion_id: null,
        numero: facturaSeleccionada.numero || null,
        titulo: editFacturaForm.titulo.trim(),
        descripcion: editFacturaForm.descripcion.trim() || null,
        subtotal: Number(editFacturaForm.subtotal),
        impuestos: Number(editFacturaForm.impuestos),
        total: editFacturaTotalCalculado,
        estado: editFacturaForm.estado || "pendiente",
        fecha: editFacturaForm.fecha || null,
        vencimiento: editFacturaForm.vencimiento || null,
      };

      const actualizada = await apiRequest(
        `${FACTURAS_API_PATH}/${facturaSeleccionada.id}`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
        }
      );

      setFacturas((prev) =>
        prev.map((f) =>
          f.id === facturaSeleccionada.id ? { ...f, ...actualizada } : f
        )
      );

      const nuevaSeleccion = { ...facturaSeleccionada, ...actualizada };
      setFacturaSeleccionada(nuevaSeleccion);

      if (resumenPagos) {
        setResumenPagos((prev) =>
          prev
            ? {
                ...prev,
                total_factura: Number(actualizada.total ?? editFacturaTotalCalculado),
                estado: actualizada.estado,
                saldo_pendiente:
                  Number(actualizada.total ?? editFacturaTotalCalculado) -
                  Number(prev.total_pagado || 0),
              }
            : prev
        );
      }

      setEditingFactura(false);
      setSuccessMsg("Factura actualizada correctamente.");
    } catch (err) {
      console.error("Error editando factura", err);
      setErrorPagos(mensajeDeError(err, "No se pudo actualizar la factura."));
    } finally {
      setSavingEditFactura(false);
    }
  }

  async function eliminarPago(pagoId) {
    if (!facturaSeleccionada || !pagoId) return;

    const confirmado = window.confirm(
      "¿Seguro que deseas anular este pago? Esta acción recalculará el saldo de la factura."
    );

    if (!confirmado) return;

    setDeletingPagoId(pagoId);
    setErrorPagos("");
    setSuccessMsg("");

    try {
      const data = await apiRequest(
        `${FACTURAS_API_PATH}/${facturaSeleccionada.id}/pagos/${pagoId}`,
        {
          method: "DELETE",
        }
      );

      setPagos((prev) => prev.filter((p) => Number(p.id) !== Number(pagoId)));

      setResumenPagos((prev) =>
        prev
          ? {
              ...prev,
              total_pagado: Number(data.total_pagado ?? 0),
              saldo_pendiente: Number(data.saldo_pendiente ?? 0),
              estado: data.factura?.estado || prev.estado,
            }
          : prev
      );

      setFacturas((prev) =>
        prev.map((f) =>
          f.id === facturaSeleccionada.id
            ? { ...f, estado: data.factura?.estado || f.estado }
            : f
        )
      );

      setFacturaSeleccionada((prev) =>
        prev
          ? { ...prev, estado: data.factura?.estado || prev.estado }
          : prev
      );

      setSuccessMsg("Pago anulado correctamente.");
    } catch (err) {
      console.error("Error anulando pago", err);
      setErrorPagos(mensajeDeError(err, "No se pudo anular el pago."));
    } finally {
      setDeletingPagoId(null);
    }
  }

  const facturaResumenTexto = useMemo(() => {
    if (!facturaSeleccionada) return "";
    const numero = facturaSeleccionada.numero || `#${facturaSeleccionada.id}`;
    return `Factura ${numero} — ${facturaSeleccionada.titulo}`;
  }, [facturaSeleccionada]);

  const facturaClienteSeleccionado = useMemo(() => {
    if (!facturaSeleccionada) return "";
    return getClienteNombre(facturaSeleccionada.cliente_id);
  }, [facturaSeleccionada, clientes]);

  const ultimoPago = useMemo(() => {
    if (!pagos.length) return null;
    return pagos[0];
  }, [pagos]);

  const estadoActualPanel =
    resumenPagos?.estado || facturaSeleccionada?.estado || "pendiente";

  return (
    <div className="page">
      <div className="page-header">
        <h2>Facturas</h2>
        <p>
          Controla tus facturas emitidas, sus pagos y el saldo pendiente por
          cobrar.
        </p>
      </div>

      {errorMsg && <p className="form-message error">{errorMsg}</p>}
      {successMsg && <p className="form-message success">{successMsg}</p>}

      {esAdminOGerente && (
      <section className="fac-new">
        <h3>Nueva factura</h3>

        {errorNuevaFactura && (
          <p className="form-message error">{errorNuevaFactura}</p>
        )}

        <form className="fac-new-form" onSubmit={crearFactura}>
          <label>
            Título
            <input
              type="text"
              name="titulo"
              value={facturaForm.titulo}
              onChange={handleFacturaChange}
              placeholder="Ej. Implementación CRM"
              disabled={savingFactura}
            />
          </label>

          <label>
            Cliente
            <select
              name="cliente_id"
              value={facturaForm.cliente_id}
              onChange={handleFacturaChange}
              disabled={savingFactura}
            >
              <option value="">Selecciona cliente</option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nombre}
                </option>
              ))}
            </select>
          </label>

          <label>
            Subtotal
            <input
              type="number"
              step="0.01"
              name="subtotal"
              value={facturaForm.subtotal}
              onChange={handleFacturaChange}
              placeholder="0.00"
              disabled={savingFactura}
            />
          </label>

          <label>
            Impuestos
            <input
              type="number"
              step="0.01"
              name="impuestos"
              value={facturaForm.impuestos}
              onChange={handleFacturaChange}
              placeholder="0.00"
              disabled={savingFactura}
            />
          </label>

          <label>
            Total
            <input
              type="number"
              step="0.01"
              value={facturaTotalCalculado}
              readOnly
              placeholder="0.00"
              disabled
            />
          </label>

          <label>
            Fecha
            <input
              type="date"
              name="fecha"
              value={facturaForm.fecha}
              onChange={handleFacturaChange}
              disabled={savingFactura}
            />
          </label>

          <label>
            Vencimiento
            <input
              type="date"
              name="vencimiento"
              value={facturaForm.vencimiento}
              onChange={handleFacturaChange}
              disabled={savingFactura}
            />
          </label>

          <label style={{ gridColumn: "1 / -1" }}>
            Descripción
            <textarea
              name="descripcion"
              value={facturaForm.descripcion}
              onChange={handleFacturaChange}
              placeholder="Detalle de la factura"
              disabled={savingFactura}
            />
          </label>

          <button type="submit" disabled={savingFactura}>
            {savingFactura ? "Creando..." : "Crear factura"}
          </button>
        </form>
      </section>
      )}

      <div className="fac-layout">
        <section className="fac-main">
          {loading ? (
            <p className="pipeline-status">Cargando facturas...</p>
          ) : (
            <table className="fac-table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Título</th>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th>Vencimiento</th>
                  <th className="is-right">Total</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {facturas.length === 0 ? (
                  <tr>
                    <td colSpan="8">No hay facturas registradas.</td>
                  </tr>
                ) : (
                  facturas.map((factura) => {
                    const isSelected =
                      Number(facturaSeleccionada?.id) === Number(factura.id);

                    return (
                      <tr
                        key={factura.id}
                        className={`${getEstadoVisual(factura)} ${
                          isSelected ? "fac-row-selected" : ""
                        }`.trim()}
                      >
                        <td>{factura.numero || `#${factura.id}`}</td>
                        <td>{factura.titulo}</td>
                        <td>{getClienteNombre(factura.cliente_id)}</td>
                        <td>{renderEstado(factura.estado)}</td>
                        <td>{factura.fecha || "-"}</td>
                        <td>{factura.vencimiento || "-"}</td>
                        <td className="is-right">{formatMoney(factura.total)}</td>
                        <td>
                          <div className="fac-actions">
                            <button
                              type="button"
                              className="card-action-btn card-action-btn--primary card-action-btn--block"
                              onClick={() => cargarPagosFactura(factura)}
                            >
                              Ver pagos
                            </button>

                            {esAdminOGerente && (
                              <button
                                type="button"
                                className="card-action-btn card-action-btn--secondary card-action-btn--block"
                                onClick={() =>
                                  actualizarEstado(factura.id, "pagada")
                                }
                                disabled={estadoLoadingId === factura.id}
                              >
                                {estadoLoadingId === factura.id
                                  ? "Actualizando..."
                                  : "Marcar pagada"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </section>

        <aside className="fac-payments-panel">
          {!facturaSeleccionada ? (
            <div className="fac-empty-panel">
              <div className="fac-panel-top">
                <h3>Centro de cobro</h3>
                <p>
                  Selecciona una factura desde la tabla para ver sus pagos,
                  saldo pendiente y acciones disponibles.
                </p>
              </div>
            </div>
          ) : loadingPagos ? (
            <p className="pipeline-status">Cargando detalle de factura...</p>
          ) : (
            <>
              <div className="fac-panel-top">
                <h3>Centro de cobro</h3>
                <p>{facturaResumenTexto}</p>
              </div>

              <div className="fac-selected-head">
                <div>
                  <p className="fac-selected-eyebrow">Factura seleccionada</p>
                  <h4>{facturaSeleccionada.titulo}</h4>
                  <p className="fac-selected-caption">
                    Cliente: {facturaClienteSeleccionado}
                  </p>
                </div>

                <span
                  className={`fac-status-badge ${getBadgeClass(
                    estadoActualPanel
                  )}`}
                >
                  {renderEstado(estadoActualPanel)}
                </span>
              </div>

              <div className="fac-kpi-grid">
                <div className="fac-kpi-card">
                  <span>Total factura</span>
                  <strong>
                    {formatMoney(
                      resumenPagos?.total_factura ?? facturaSeleccionada.total
                    )}
                  </strong>
                </div>

                <div className="fac-kpi-card">
                  <span>Total pagado</span>
                  <strong>{formatMoney(resumenPagos?.total_pagado)}</strong>
                </div>

                <div className="fac-kpi-card fac-kpi-card--wide">
                  <span>Saldo pendiente</span>
                  <strong>{formatMoney(resumenPagos?.saldo_pendiente)}</strong>
                </div>
              </div>

              <div className="fac-inline-meta">
                <span>Fecha: {facturaSeleccionada.fecha || "-"}</span>
                <span>Vence: {facturaSeleccionada.vencimiento || "-"}</span>
              </div>

              <div
                className={`fac-last-payment ${
                  !ultimoPago ? "fac-last-payment--empty" : ""
                }`}
              >
                {ultimoPago ? (
                  <>
                    <strong>Último pago:</strong> {formatMoney(ultimoPago.monto)} ·{" "}
                    {ultimoPago.fecha || "Sin fecha"} ·{" "}
                    {ultimoPago.metodo || "Sin método"}
                  </>
                ) : (
                  "Todavía no hay pagos registrados para esta factura."
                )}
              </div>

              {esAdminOGerente && (
              <div className="fac-quick-actions">
                <button
                  type="button"
                  className="card-action-btn card-action-btn--primary"
                  onClick={abrirEdicionFactura}
                >
                  Editar factura
                </button>

                <button
                  type="button"
                  className="card-action-btn card-action-btn--secondary"
                  onClick={() =>
                    actualizarEstado(facturaSeleccionada.id, "pagada")
                  }
                  disabled={estadoLoadingId === facturaSeleccionada.id}
                >
                  {estadoLoadingId === facturaSeleccionada.id
                    ? "Actualizando..."
                    : "Marcar pagada"}
                </button>

                <button
                  type="button"
                  className="card-action-btn card-action-btn--ghost"
                  onClick={() =>
                    actualizarEstado(facturaSeleccionada.id, "pendiente")
                  }
                  disabled={estadoLoadingId === facturaSeleccionada.id}
                >
                  Restablecer
                </button>
              </div>
              )}

              {esAdminOGerente && (editingFactura ? (
                <form className="fac-payment-form" onSubmit={guardarEdicionFactura}>
                  <div className="fac-form-head">
                    <h4>Editar factura</h4>
                    <p>
                      Actualiza datos clave de esta factura sin salir del panel.
                    </p>
                  </div>

                  {errorPagos && <p className="form-message error">{errorPagos}</p>}

                  <label>
                    Título
                    <input
                      type="text"
                      name="titulo"
                      value={editFacturaForm.titulo}
                      onChange={handleEditFacturaChange}
                    />
                  </label>

                  <label>
                    Cliente
                    <select
                      name="cliente_id"
                      value={editFacturaForm.cliente_id}
                      onChange={handleEditFacturaChange}
                    >
                      <option value="">Selecciona cliente</option>
                      {clientes.map((cliente) => (
                        <option key={cliente.id} value={cliente.id}>
                          {cliente.nombre}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Subtotal
                    <input
                      type="number"
                      step="0.01"
                      name="subtotal"
                      value={editFacturaForm.subtotal}
                      onChange={handleEditFacturaChange}
                    />
                  </label>

                  <label>
                    Impuestos
                    <input
                      type="number"
                      step="0.01"
                      name="impuestos"
                      value={editFacturaForm.impuestos}
                      onChange={handleEditFacturaChange}
                    />
                  </label>

                  <label>
                    Total
                    <input
                      type="number"
                      step="0.01"
                      value={editFacturaTotalCalculado}
                      readOnly
                      disabled
                    />
                  </label>

                  <label>
                    Estado
                    <select
                      name="estado"
                      value={editFacturaForm.estado || "pendiente"}
                      onChange={handleEditFacturaChange}
                    >
                      <option value="pendiente">Pendiente</option>
                      <option value="parcial">Parcial</option>
                      <option value="pagada">Pagada</option>
                      <option value="vencida">Vencida</option>
                      <option value="cancelada">Cancelada</option>
                    </select>
                  </label>

                  <label>
                    Fecha
                    <input
                      type="date"
                      name="fecha"
                      value={editFacturaForm.fecha}
                      onChange={handleEditFacturaChange}
                    />
                  </label>

                  <label>
                    Vencimiento
                    <input
                      type="date"
                      name="vencimiento"
                      value={editFacturaForm.vencimiento}
                      onChange={handleEditFacturaChange}
                    />
                  </label>

                  <label>
                    Descripción
                    <textarea
                      name="descripcion"
                      value={editFacturaForm.descripcion}
                      onChange={handleEditFacturaChange}
                    />
                  </label>

                  <div className="fac-quick-actions">
                    <button
                      type="submit"
                      className="card-action-btn card-action-btn--primary"
                      disabled={savingEditFactura}
                    >
                      {savingEditFactura ? "Guardando..." : "Guardar cambios"}
                    </button>

                    <button
                      type="button"
                      className="card-action-btn card-action-btn--secondary"
                      onClick={cancelarEdicionFactura}
                      disabled={savingEditFactura}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <form className="fac-payment-form" onSubmit={registrarPago}>
                  <div className="fac-form-head">
                    <h4>Registrar pago</h4>
                    <p>Ingresa un pago nuevo para actualizar el saldo pendiente.</p>
                  </div>

                  {errorPagos && <p className="form-message error">{errorPagos}</p>}

                  <label>
                    Monto
                    <input
                      type="number"
                      step="0.01"
                      name="monto"
                      value={pagoForm.monto}
                      onChange={handlePagoChange}
                      placeholder="0.00"
                    />
                  </label>

                  <label>
                    Fecha
                    <input
                      type="date"
                      name="fecha"
                      value={pagoForm.fecha}
                      onChange={handlePagoChange}
                    />
                  </label>

                  <label>
                    Método
                    <input
                      type="text"
                      name="metodo"
                      value={pagoForm.metodo}
                      onChange={handlePagoChange}
                      placeholder="Transferencia, efectivo, tarjeta..."
                    />
                  </label>

                  <label>
                    Referencia
                    <input
                      type="text"
                      name="referencia"
                      value={pagoForm.referencia}
                      onChange={handlePagoChange}
                      placeholder="Comprobante o referencia"
                    />
                  </label>

                  <label>
                    Nota
                    <textarea
                      name="nota"
                      value={pagoForm.nota}
                      onChange={handlePagoChange}
                      placeholder="Observaciones del pago"
                    />
                  </label>

                  <button type="submit" disabled={savingPago}>
                    {savingPago ? "Guardando..." : "Registrar pago"}
                  </button>
                </form>
              ))}

              <div className="fac-payments-list">
                <h4>Historial de pagos</h4>

                {pagos.length === 0 ? (
                  <p className="pipeline-status">
                    Esta factura todavía no tiene pagos registrados.
                  </p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Monto</th>
                        <th>Método</th>
                        <th>Referencia</th>
                        <th>Acción</th>
                      </tr>
                    </thead>

                    <tbody>
                      {pagos.map((pago) => (
                        <tr key={pago.id}>
                          <td>{pago.fecha || "-"}</td>
                          <td>{formatMoney(pago.monto)}</td>
                          <td>{pago.metodo || "-"}</td>
                          <td>{pago.referencia || "-"}</td>
                          <td>
                            {esAdminOGerente && (
                              <button
                                type="button"
                                className="card-action-btn card-action-btn--danger"
                                onClick={() => eliminarPago(pago.id)}
                                disabled={deletingPagoId === pago.id}
                              >
                                {deletingPagoId === pago.id
                                  ? "Anulando..."
                                  : "Anular"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

export default Facturas;
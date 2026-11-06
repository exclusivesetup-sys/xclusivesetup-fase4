import { useEffect, useMemo, useState } from "react";
import "./Finanzas.css";
import { apiRequest, mensajeDeError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const FINANZAS_API_PATH = "/api/finanzas";
const BALANCE_TOTAL_API_PATH = "/api/finanzas/balance-total";
const RESUMEN_MENSUAL_API_PATH = "/api/finanzas/resumen-mensual";
const CLIENTES_API_PATH = "/api/clientes";

const METODOS_PAGO = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "otro", label: "Otro" },
];

function formatMoney(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

export default function Finanzas() {
  const { esAdminOGerente } = useAuth();
  const [movimientos, setMovimientos] = useState([]);
  const [clientes, setClientes] = useState([]);

  const [tipo, setTipo] = useState("ingreso");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState("");
  const [nota, setNota] = useState("");
  const [categoria, setCategoria] = useState("");
  const [cliente, setCliente] = useState("");
  const [clienteId, setClienteId] = useState(null);
  const [metodoPago, setMetodoPago] = useState("");
  const [proveedor, setProveedor] = useState("");

  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [editandoId, setEditandoId] = useState(null);

  const [balanceGlobal, setBalanceGlobal] = useState({
    ingresosfacturas: 0,
    ingresosmanual: 0,
    gastosmanual: 0,
    balancetotal: 0,
  });
  const [errorGlobal, setErrorGlobal] = useState("");

  const [resumenMensual, setResumenMensual] = useState({
    balance: 0,
    ingresos_mes: 0,
    gastos_mes: 0,
    flujo_caja: 0,
  });
  const [errorResumenMensual, setErrorResumenMensual] = useState("");

  function resetForm() {
    setTipo("ingreso");
    setConcepto("");
    setMonto("");
    setFecha("");
    setNota("");
    setCategoria("");
    setCliente("");
    setClienteId(null);
    setMetodoPago("");
    setProveedor("");
    setEditandoId(null);
  }

  async function fetchMovimientos() {
    setCargando(true);
    setError("");

    try {
      const data = await apiRequest(FINANZAS_API_PATH);
      setMovimientos(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Error cargando finanzas", e);
      setError("No se pudo cargar la lista de finanzas.");
    } finally {
      setCargando(false);
    }
  }

  async function fetchClientes() {
    try {
      const data = await apiRequest(CLIENTES_API_PATH);
      setClientes(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Error cargando clientes para finanzas", e);
    }
  }

  async function fetchBalanceGlobal() {
    try {
      setErrorGlobal("");
      const data = await apiRequest(BALANCE_TOTAL_API_PATH);

      setBalanceGlobal({
        ingresosfacturas: Number(data?.ingresosfacturas || 0),
        ingresosmanual: Number(data?.ingresosmanual || 0),
        gastosmanual: Number(data?.gastosmanual || 0),
        balancetotal: Number(data?.balancetotal || 0),
      });
    } catch (e) {
      console.error("Error cargando balance total combinado", e);
      setErrorGlobal("No se pudo cargar el balance total.");
    }
  }

  async function fetchResumenMensual() {
    try {
      setErrorResumenMensual("");
      const data = await apiRequest(RESUMEN_MENSUAL_API_PATH);

      setResumenMensual({
        balance: Number(data?.balance || 0),
        ingresos_mes: Number(data?.ingresos_mes || 0),
        gastos_mes: Number(data?.gastos_mes || 0),
        flujo_caja: Number(data?.flujo_caja || 0),
      });
    } catch (e) {
      console.error("Error cargando resumen mensual de finanzas", e);
      setErrorResumenMensual("No se pudo cargar el resumen del mes.");
    }
  }

  async function refreshData() {
    await Promise.allSettled([
      fetchMovimientos(),
      fetchBalanceGlobal(),
      fetchResumenMensual(),
      fetchClientes(),
    ]);
  }

  useEffect(() => {
    refreshData();
  }, []);

  function handleClienteChange(e) {
    const value = e.target.value;
    setCliente(value);

    const encontrado = clientes.find(
      (c) => normalizeText(c.nombre) === normalizeText(value)
    );
    setClienteId(encontrado ? encontrado.id : null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    const montoNum = Number(monto);

    if (!tipo || !concepto.trim() || monto === "") {
      setError("Tipo, concepto y monto son obligatorios.");
      return;
    }

    if (Number.isNaN(montoNum) || montoNum <= 0) {
      setError("El monto debe ser un número mayor que 0.");
      return;
    }

    if (!fecha) {
      setError("La fecha es obligatoria.");
      return;
    }

    if (!categoria.trim()) {
      setError("La categoría es obligatoria.");
      return;
    }

    if (tipo === "ingreso" && (!cliente.trim() || !metodoPago)) {
      setError("Cliente y método de pago son obligatorios para un ingreso.");
      return;
    }

    if (tipo === "gasto" && !proveedor.trim()) {
      setError("El proveedor es obligatorio para un gasto.");
      return;
    }

    setGuardando(true);

    const payload = {
      tipo,
      concepto: concepto.trim(),
      monto: montoNum,
      fecha,
      nota: nota.trim() || null,
      categoria: categoria.trim(),
      cliente_id: tipo === "ingreso" ? clienteId : null,
      cliente: tipo === "ingreso" ? cliente.trim() : null,
      metodo_pago: tipo === "ingreso" ? metodoPago : null,
      proveedor: tipo === "gasto" ? proveedor.trim() : null,
    };

    try {
      if (editandoId == null) {
        const nuevo = await apiRequest(FINANZAS_API_PATH, {
          method: "POST",
          body: JSON.stringify(payload),
        });

        setMovimientos((prev) => [nuevo, ...prev]);
        setSuccessMsg("Movimiento guardado correctamente.");
      } else {
        const actualizado = await apiRequest(`${FINANZAS_API_PATH}/${editandoId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });

        setMovimientos((prev) =>
          prev.map((m) => (m.id === editandoId ? actualizado : m))
        );

        setSuccessMsg("Movimiento actualizado correctamente.");
      }

      resetForm();
      await Promise.allSettled([fetchBalanceGlobal(), fetchResumenMensual()]);
    } catch (e) {
      console.error("Error guardando movimiento", e);
      setError(
        mensajeDeError(
          e,
          editandoId == null
            ? "No se pudo guardar el movimiento financiero."
            : "No se pudo actualizar el movimiento financiero."
        )
      );
      setSuccessMsg("");
    } finally {
      setGuardando(false);
    }
  }

  async function handleDelete(id) {
    const confirmar = window.confirm(
      "¿Seguro que quieres eliminar este movimiento?"
    );
    if (!confirmar) return;

    setError("");
    setSuccessMsg("");

    try {
      await apiRequest(`${FINANZAS_API_PATH}/${id}`, {
        method: "DELETE",
      });

      setMovimientos((prev) => prev.filter((m) => m.id !== id));

      if (editandoId === id) {
        resetForm();
      }

      await Promise.allSettled([fetchBalanceGlobal(), fetchResumenMensual()]);
      setSuccessMsg("Movimiento eliminado correctamente.");
    } catch (e) {
      console.error("Error eliminando movimiento", e);
      setError(mensajeDeError(e, "No se pudo eliminar el movimiento financiero."));
      setSuccessMsg("");
    }
  }

  function handleEdit(mov) {
    setError("");
    setSuccessMsg("");
    setEditandoId(mov.id);
    setTipo(mov.tipo || "ingreso");
    setConcepto(mov.concepto || "");
    setMonto(String(mov.monto ?? ""));
    setFecha(mov.fecha || "");
    setNota(mov.nota || "");
    setCategoria(mov.categoria || "");
    setCliente(mov.cliente || "");
    setClienteId(mov.cliente_id || null);
    setMetodoPago(mov.metodo_pago || "");
    setProveedor(mov.proveedor || "");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelarEdicion() {
    setError("");
    setSuccessMsg("");
    resetForm();
  }

  const movimientosConDetalle = useMemo(() => {
    return movimientos.map((mov) => ({
      ...mov,
      contraparte: mov.tipo === "gasto" ? mov.proveedor : mov.cliente,
    }));
  }, [movimientos]);

  return (
    <div className="page finanzas-page">
      <div className="page-header">
        <h2>Finanzas</h2>
        <p>Ingresos, gastos y resumen del mes combinado con facturas.</p>
      </div>

      <section className="finanzas-card">
        <h3>Balance total (facturas + movimientos)</h3>

        <div className="finanzas-stats">
          <div className="finanzas-stat">
            <span>Ingresos por facturas</span>
            <strong>{formatMoney(balanceGlobal.ingresosfacturas)}</strong>
          </div>

          <div className="finanzas-stat">
            <span>Ingresos manuales</span>
            <strong>{formatMoney(balanceGlobal.ingresosmanual)}</strong>
          </div>

          <div className="finanzas-stat">
            <span>Gastos manuales</span>
            <strong>{formatMoney(balanceGlobal.gastosmanual)}</strong>
          </div>

          <div className="finanzas-stat finanzas-stat--accent">
            <span>Balance total</span>
            <strong>{formatMoney(balanceGlobal.balancetotal)}</strong>
          </div>
        </div>

        {errorGlobal && <p className="finanzas-error">{errorGlobal}</p>}
      </section>

      <section className="finanzas-card">
        <h3>Resumen del mes</h3>

        <div className="finanzas-stats">
          <div className="finanzas-stat">
            <span>Balance</span>
            <strong>{formatMoney(resumenMensual.balance)}</strong>
          </div>

          <div className="finanzas-stat">
            <span>Ingresos del mes</span>
            <strong>{formatMoney(resumenMensual.ingresos_mes)}</strong>
          </div>

          <div className="finanzas-stat">
            <span>Gastos del mes</span>
            <strong>{formatMoney(resumenMensual.gastos_mes)}</strong>
          </div>

          <div className="finanzas-stat finanzas-stat--accent">
            <span>Flujo de caja</span>
            <strong>{formatMoney(resumenMensual.flujo_caja)}</strong>
          </div>
        </div>

        {errorResumenMensual && (
          <p className="finanzas-error">{errorResumenMensual}</p>
        )}
      </section>

      {esAdminOGerente && (
      <section className="finanzas-card">
        <h3>{editandoId ? "Editar movimiento" : "Nuevo movimiento"}</h3>

        {error && <p className="finanzas-error">{error}</p>}
        {successMsg && <p className="finanzas-success">{successMsg}</p>}

        <form onSubmit={handleSubmit} className="finanzas-form">
          <label>
            <span>Tipo</span>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="ingreso">Ingreso</option>
              <option value="gasto">Gasto</option>
            </select>
          </label>

          <label>
            <span>Concepto</span>
            <input
              type="text"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Ej. Pago cliente Luis, Hosting, Ads..."
            />
          </label>

          <label>
            <span>Monto</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="Ej. 150000"
            />
          </label>

          <label>
            <span>Fecha</span>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </label>

          <label>
            <span>Categoría</span>
            <input
              type="text"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="Ej. Servicios, Software, Marketing..."
            />
          </label>

          {tipo === "ingreso" ? (
            <>
              <label>
                <span>Cliente</span>
                <input
                  list="finanzas-clientes"
                  type="text"
                  value={cliente}
                  onChange={handleClienteChange}
                  placeholder="Selecciona o escribe un cliente"
                />
                <datalist id="finanzas-clientes">
                  {clientes.map((c) => (
                    <option key={c.id} value={c.nombre} />
                  ))}
                </datalist>
              </label>

              <label>
                <span>Método de pago</span>
                <select
                  value={metodoPago}
                  onChange={(e) => setMetodoPago(e.target.value)}
                >
                  <option value="">Selecciona un método</option>
                  {METODOS_PAGO.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <label>
              <span>Proveedor</span>
              <input
                type="text"
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                placeholder="Ej. Hostinger, Meta Ads..."
              />
            </label>
          )}

          <label className="finanzas-form-full">
            <span>Nota</span>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Detalle extra si lo necesitas."
              rows={3}
            />
          </label>

          <div className="finanzas-actions finanzas-form-full">
            <button
              type="submit"
              className="finanzas-btn finanzas-btn--primary"
              disabled={guardando}
            >
              {guardando
                ? "Guardando..."
                : editandoId
                ? "Actualizar movimiento"
                : "Guardar movimiento"}
            </button>

            {editandoId && (
              <button
                type="button"
                onClick={cancelarEdicion}
                className="finanzas-btn finanzas-btn--secondary"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </section>
      )}

      <section className="finanzas-card">
        <h3>Lista de movimientos</h3>

        {cargando ? (
          <p className="finanzas-muted">Cargando finanzas...</p>
        ) : movimientosConDetalle.length === 0 ? (
          <p className="finanzas-muted">Aún no tienes movimientos registrados.</p>
        ) : (
          <div className="finanzas-table-wrap">
            <table className="finanzas-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Concepto</th>
                  <th>Categoría</th>
                  <th>Cliente / Proveedor</th>
                  <th>Método de pago</th>
                  <th className="is-right">Monto</th>
                  <th>Fecha</th>
                  <th>Nota</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {movimientosConDetalle.map((mov) => {
                  const isIngreso = mov.tipo === "ingreso";

                  return (
                    <tr key={mov.id}>
                      <td>
                        <span
                          className={
                            isIngreso
                              ? "finanzas-badge finanzas-badge--success"
                              : "finanzas-badge finanzas-badge--danger"
                          }
                        >
                          {mov.tipo}
                        </span>
                      </td>

                      <td>{mov.concepto}</td>
                      <td>{mov.categoria || "—"}</td>
                      <td>{mov.contraparte || "—"}</td>
                      <td>
                        {isIngreso
                          ? METODOS_PAGO.find((m) => m.value === mov.metodo_pago)
                              ?.label || mov.metodo_pago || "—"
                          : "—"}
                      </td>
                      <td className="is-right">{formatMoney(mov.monto)}</td>
                      <td>{mov.fecha || "-"}</td>
                      <td>{mov.nota || "-"}</td>

                      <td>
                        <div className="finanzas-actions">
                          {esAdminOGerente && (
                            <button
                              type="button"
                              onClick={() => handleEdit(mov)}
                              className="finanzas-btn finanzas-btn--secondary finanzas-btn--small"
                            >
                              Editar
                            </button>
                          )}

                          {esAdminOGerente && (
                            <button
                              type="button"
                              onClick={() => handleDelete(mov.id)}
                              className="finanzas-btn finanzas-btn--danger finanzas-btn--small"
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
  );
}

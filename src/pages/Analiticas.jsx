import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import "./Analiticas.css";
import { apiRequest } from "../lib/api";
import PageHeader from "../components/PageHeader";
import StatGrid, { StatCard } from "../components/StatGrid";

const ETAPA_LABELS = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  propuesta: "Propuesta",
  negociacion: "Negociación",
  ganado: "Ganado",
  perdido: "Perdido",
};

const ESTADO_CLIENTE_LABELS = {
  activo: "Activo",
  prospecto: "Prospecto",
  inactivo: "Inactivo",
  moroso: "Moroso",
};

function formatMoney(value) {
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatPct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function tooltipStyle() {
  return {
    background: "#0f172a",
    border: "1px solid rgba(148, 163, 184, 0.16)",
    borderRadius: 12,
    fontSize: "0.85rem",
    color: "#e6edf6",
  };
}

export default function Analiticas() {
  const [resumen, setResumen] = useState(null);
  const [clientesPorMes, setClientesPorMes] = useState([]);
  const [clientesPorEstado, setClientesPorEstado] = useState([]);
  const [pipelineConversion, setPipelineConversion] = useState([]);
  const [topClientes, setTopClientes] = useState([]);
  const [gastosPorCategoria, setGastosPorCategoria] = useState([]);

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function cargarTodo() {
      setCargando(true);
      setError("");

      try {
        const [
          resumenRes,
          clientesMesRes,
          clientesEstadoRes,
          pipelineRes,
          topClientesRes,
          gastosRes,
        ] = await Promise.all([
          apiRequest("/api/analitica/resumen-general"),
          apiRequest("/api/analitica/clientes-por-mes"),
          apiRequest("/api/analitica/clientes-por-estado"),
          apiRequest("/api/analitica/pipeline-conversion"),
          apiRequest("/api/analitica/top-clientes"),
          apiRequest("/api/analitica/gastos-por-categoria"),
        ]);

        setResumen(resumenRes || null);
        setClientesPorMes(Array.isArray(clientesMesRes) ? clientesMesRes : []);
        setClientesPorEstado(
          Array.isArray(clientesEstadoRes) ? clientesEstadoRes : []
        );
        setPipelineConversion(
          Array.isArray(pipelineRes) ? pipelineRes : []
        );
        setTopClientes(Array.isArray(topClientesRes) ? topClientesRes : []);
        setGastosPorCategoria(Array.isArray(gastosRes) ? gastosRes : []);
      } catch (e) {
        console.error("Error cargando analíticas", e);
        setError("No se pudieron cargar las analíticas.");
      } finally {
        setCargando(false);
      }
    }

    cargarTodo();
  }, []);

  const chartClientesPorMes = useMemo(
    () =>
      clientesPorMes.map((row) => ({
        periodo: row.periodo,
        nuevos: Number(row.nuevos || 0),
      })),
    [clientesPorMes]
  );

  const chartClientesPorEstado = useMemo(
    () =>
      clientesPorEstado.map((row) => ({
        estado: ESTADO_CLIENTE_LABELS[row.estado] || row.estado,
        cantidad: Number(row.cantidad || 0),
      })),
    [clientesPorEstado]
  );

  const chartPipeline = useMemo(
    () =>
      pipelineConversion.map((row) => ({
        etapa: ETAPA_LABELS[row.etapa] || row.etapa,
        cantidad: Number(row.cantidad || 0),
        monto: Number(row.monto || 0),
      })),
    [pipelineConversion]
  );

  const chartGastos = useMemo(
    () =>
      gastosPorCategoria.map((row) => ({
        categoria: row.categoria,
        total: Number(row.total || 0),
      })),
    [gastosPorCategoria]
  );

  return (
    <div className="page analiticas-page">
      <PageHeader
        title="Reportes"
        description="Indicadores clave de clientes, ventas, cobranza y gastos en un solo lugar."
      />

      {error && <p className="analitica-error">{error}</p>}

      {cargando ? (
        <p className="analitica-empty">Cargando analíticas...</p>
      ) : (
        <>
          <StatGrid>
            <StatCard
              label="Clientes totales"
              value={resumen?.clientes_total ?? 0}
              sub={<span>Nuevos este mes: {resumen?.clientes_nuevos_mes ?? 0}</span>}
            />

            <StatCard
              label="Conversión de clientes potenciales"
              value={formatPct(resumen?.leads_tasa_conversion)}
              sub={
                <span>
                  {resumen?.leads_convertidos ?? 0} de {resumen?.leads_total ?? 0} clientes potenciales
                </span>
              }
            />

            <StatCard
              label="Tasa de cierre (oportunidades)"
              value={formatPct(resumen?.oportunidades_tasa_cierre)}
              sub={
                <span>
                  Ganadas: {resumen?.oportunidades_ganadas ?? 0} · Perdidas:{" "}
                  {resumen?.oportunidades_perdidas ?? 0}
                </span>
              }
            />

            <StatCard
              accent
              label="Tasa de cobro"
              value={formatPct(resumen?.facturas_tasa_cobro)}
              sub={
                <span>
                  {resumen?.facturas_pagadas ?? 0} de {resumen?.facturas_total ?? 0} facturas · Ticket promedio: $
                  {formatMoney(resumen?.ticket_promedio)}
                </span>
              }
            />
          </StatGrid>

          <section className="analitica-section">
            <div className="analitica-section-header">
              <div>
                <h3>Clientes nuevos por mes</h3>
                <p>Últimos 12 meses con clientes registrados.</p>
              </div>
            </div>

            {chartClientesPorMes.length === 0 ? (
              <p className="analitica-empty">Aún no hay suficientes datos.</p>
            ) : (
              <div className="analitica-panel">
                <div className="analitica-chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartClientesPorMes}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#273244" />
                      <XAxis dataKey="periodo" stroke="#9fb0c7" />
                      <YAxis stroke="#9fb0c7" allowDecimals={false} />
                      <Tooltip
                        contentStyle={tooltipStyle()}
                        formatter={(value) => [Number(value), "Clientes nuevos"]}
                      />
                      <Bar dataKey="nuevos" fill="#38bdf8" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </section>

          <section className="analitica-section">
            <div className="analitica-section-header">
              <div>
                <h3>Clientes por estado</h3>
                <p>Distribución actual de tu base de clientes.</p>
              </div>
            </div>

            {chartClientesPorEstado.length === 0 ? (
              <p className="analitica-empty">Aún no tienes clientes registrados.</p>
            ) : (
              <div className="analitica-panel">
                <div className="analitica-chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartClientesPorEstado}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#273244" />
                      <XAxis dataKey="estado" stroke="#9fb0c7" />
                      <YAxis stroke="#9fb0c7" allowDecimals={false} />
                      <Tooltip
                        contentStyle={tooltipStyle()}
                        formatter={(value) => [Number(value), "Clientes"]}
                      />
                      <Bar dataKey="cantidad" fill="#60a5fa" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </section>

          <section className="analitica-section">
            <div className="analitica-section-header">
              <div>
                <h3>Oportunidades por etapa</h3>
                <p>Cantidad de oportunidades en cada etapa del pipeline.</p>
              </div>
            </div>

            {chartPipeline.length === 0 ? (
              <p className="analitica-empty">
                Aún no tienes oportunidades registradas.
              </p>
            ) : (
              <div className="analitica-panel">
                <div className="analitica-chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartPipeline}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#273244" />
                      <XAxis dataKey="etapa" stroke="#9fb0c7" />
                      <YAxis stroke="#9fb0c7" allowDecimals={false} />
                      <Tooltip
                        contentStyle={tooltipStyle()}
                        formatter={(value, name) =>
                          name === "cantidad"
                            ? [Number(value), "Oportunidades"]
                            : [`$${formatMoney(value)}`, "Monto"]
                        }
                      />
                      <Bar dataKey="cantidad" fill="#a78bfa" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </section>

          <section className="analitica-section">
            <div className="analitica-section-header">
              <div>
                <h3>Top 5 clientes por facturación</h3>
                <p>Suma de facturas pagadas por cliente.</p>
              </div>
            </div>

            {topClientes.length === 0 ? (
              <p className="analitica-empty">
                Aún no tienes facturas pagadas para calcular este ranking.
              </p>
            ) : (
              <ul className="analitica-ranking">
                {topClientes.map((c, index) => (
                  <li key={c.id} className="analitica-ranking-item">
                    <span className="analitica-ranking-pos">{index + 1}</span>
                    <span className="analitica-ranking-nombre">{c.nombre}</span>
                    <span className="analitica-ranking-valor">
                      ${formatMoney(c.total_facturado)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="analitica-section">
            <div className="analitica-section-header">
              <div>
                <h3>Gastos por categoría</h3>
                <p>Top categorías de gasto registradas en Finanzas.</p>
              </div>
            </div>

            {chartGastos.length === 0 ? (
              <p className="analitica-empty">
                Aún no tienes gastos categorizados en Finanzas.
              </p>
            ) : (
              <div className="analitica-panel">
                <div className="analitica-chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartGastos} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#273244" />
                      <XAxis type="number" stroke="#9fb0c7" />
                      <YAxis
                        type="category"
                        dataKey="categoria"
                        stroke="#9fb0c7"
                        width={120}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle()}
                        formatter={(value) => [`$${formatMoney(value)}`, "Gasto"]}
                      />
                      <Bar dataKey="total" fill="#f87171" radius={[0, 8, 8, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

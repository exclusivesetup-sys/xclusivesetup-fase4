import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import "./Dashboard.css";
import { apiRequest } from "../lib/api";
import PageHeader from "../components/PageHeader";
import StatGrid, { StatCard } from "../components/StatGrid";

const API_CLIENTES = "/api/clientes";
const API_COTIZACIONES = "/api/cotizaciones";
const API_PROYECTOS = "/api/proyectos";
const API_TAREAS = "/api/tareas";

const ESTADOS_PROYECTO_LABELS = {
  planeado: "Planeado",
  en_progreso: "En progreso",
  en_revision: "En revisión",
  completado: "Completado",
  en_pausa: "En pausa",
  cancelado: "Cancelado",
};

const PRIORIDAD_LABELS = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  urgente: "Urgente",
};

function formatMoney(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("es-CO");
}

export default function Dashboard() {
  const [clientes, setClientes] = useState([]);
  const [cotizaciones, setCotizaciones] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [tareas, setTareas] = useState([]);

  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function loadDashboardData() {
      setCargando(true);
      setErrorMsg("");

      try {
        const [clientesRes, cotizacionesRes, proyectosRes, tareasRes] =
          await Promise.allSettled([
            apiRequest(API_CLIENTES),
            apiRequest(API_COTIZACIONES),
            apiRequest(API_PROYECTOS),
            apiRequest(API_TAREAS),
          ]);

        const errores = [];

        if (clientesRes.status === "fulfilled") {
          setClientes(Array.isArray(clientesRes.value) ? clientesRes.value : []);
        } else {
          errores.push("clientes");
          console.error("Error al cargar clientes en Dashboard:", clientesRes.reason);
        }

        if (cotizacionesRes.status === "fulfilled") {
          setCotizaciones(
            Array.isArray(cotizacionesRes.value) ? cotizacionesRes.value : []
          );
        } else {
          errores.push("cotizaciones");
          console.error("Error al cargar cotizaciones en Dashboard:", cotizacionesRes.reason);
        }

        if (proyectosRes.status === "fulfilled") {
          setProyectos(
            Array.isArray(proyectosRes.value) ? proyectosRes.value : []
          );
        } else {
          errores.push("proyectos");
          console.error("Error al cargar proyectos en Dashboard:", proyectosRes.reason);
        }

        if (tareasRes.status === "fulfilled") {
          setTareas(Array.isArray(tareasRes.value) ? tareasRes.value : []);
        } else {
          errores.push("tareas");
          console.error("Error al cargar tareas en Dashboard:", tareasRes.reason);
        }

        if (errores.length > 0) {
          setErrorMsg(
            `No se pudieron sincronizar algunos módulos: ${errores.join(", ")}.`
          );
        }
      } catch (err) {
        console.error("Error general en Dashboard:", err);
        setErrorMsg("Ocurrió un error al cargar los datos del panel resumen.");
      } finally {
        setCargando(false);
      }
    }

    loadDashboardData();
  }, []);

  // 1. Métricas de Clientes
  const metricasClientes = useMemo(() => {
    const total = clientes.length;
    const activos = clientes.filter(
      (c) => String(c.estado_cliente || "").toLowerCase() === "activo"
    ).length;
    return { total, activos };
  }, [clientes]);

  // 2. Métricas de Cotizaciones por estado
  const metricasCotizaciones = useMemo(() => {
    const total = cotizaciones.length;
    const aceptadas = cotizaciones.filter((c) => c.estado === "aceptada").length;
    const enviadas = cotizaciones.filter((c) => c.estado === "enviada").length;
    const borradores = cotizaciones.filter((c) => c.estado === "borrador").length;
    const rechazadas = cotizaciones.filter((c) => c.estado === "rechazada").length;
    const totalMonto = cotizaciones.reduce(
      (acc, c) => acc + (Number(c.total) || 0),
      0
    );
    const montoAceptado = cotizaciones
      .filter((c) => c.estado === "aceptada")
      .reduce((acc, c) => acc + (Number(c.total) || 0), 0);

    const dataGrafico = [
      { estado: "Borrador", cantidad: borradores, color: "#94a3b8" },
      { estado: "Enviada", cantidad: enviadas, color: "#3b82f6" },
      { estado: "Aceptada", cantidad: aceptadas, color: "#10b981" },
      { estado: "Rechazada", cantidad: rechazadas, color: "#ef4444" },
    ];

    return {
      total,
      aceptadas,
      enviadas,
      borradores,
      rechazadas,
      totalMonto,
      montoAceptado,
      dataGrafico,
    };
  }, [cotizaciones]);

  // 3. Métricas de Proyectos
  const metricasProyectos = useMemo(() => {
    const total = proyectos.length;
    const activos = proyectos.filter((p) =>
      ["en_progreso", "planeado", "en_revision"].includes(p.estado)
    ).length;
    const completados = proyectos.filter(
      (p) => p.estado === "completado"
    ).length;
    return { total, activos, completados };
  }, [proyectos]);

  // 4. Métricas de Tareas
  const metricasTareas = useMemo(() => {
    const total = tareas.length;
    const pendientes = tareas.filter((t) => t.estado !== "completado").length;
    const completadas = tareas.filter((t) => t.estado === "completado").length;
    const urgentes = tareas.filter(
      (t) =>
        (t.prioridad === "alta" || t.prioridad === "urgente") &&
        t.estado !== "completado"
    ).length;
    return { total, pendientes, completadas, urgentes };
  }, [tareas]);

  // Cálculo de avance de proyectos en base a tareas
  const proyectosConAvance = useMemo(() => {
    return proyectos.map((p) => {
      const tareasDelProyecto = tareas.filter(
        (t) => Number(t.proyecto_id) === Number(p.id)
      );
      const totalT = tareasDelProyecto.length;
      const complT = tareasDelProyecto.filter(
        (t) => t.estado === "completado"
      ).length;
      const porcentaje = totalT > 0 ? Math.round((complT / totalT) * 100) : 0;
      return {
        ...p,
        totalTareas: totalT,
        tareasCompletadas: complT,
        porcentajeAvance: porcentaje,
      };
    });
  }, [proyectos, tareas]);

  const tareasPendientesLista = useMemo(() => {
    return tareas
      .filter((t) => t.estado !== "completado")
      .slice(0, 5);
  }, [tareas]);

  return (
    <div className="page dashboard-page">
      <PageHeader
        title="Panel Resumen"
        description="Métricas consolidadas de Clientes, Cotizaciones, Proyectos y Tareas del prototipo académico XclusiveSetup."
      />

      {errorMsg && (
        <div className="dash-error" style={{ color: "#ef4444", marginBottom: 16 }}>
          {errorMsg}
        </div>
      )}

      {cargando ? (
        <div className="dash-empty" style={{ padding: "32px 0", textAlign: "center" }}>
          Cargando métricas del prototipo académico...
        </div>
      ) : (
        <>
          {/* Tarjetas Principales de los 4 Módulos */}
          <StatGrid hero>
            <StatCard
              label="Total de Clientes"
              value={metricasClientes.total}
              sub={`${metricasClientes.activos} activos actualmente`}
              accent
            />
            <StatCard
              label="Cotizaciones Registradas"
              value={metricasCotizaciones.total}
              sub={`${metricasCotizaciones.aceptadas} aceptadas · ${metricasCotizaciones.enviadas} enviadas`}
            />
            <StatCard
              label="Proyectos Activos"
              value={metricasProyectos.activos}
              sub={`${metricasProyectos.completados} completados de ${metricasProyectos.total}`}
            />
            <StatCard
              label="Tareas Pendientes"
              value={metricasTareas.pendientes}
              sub={`${metricasTareas.completadas} completadas de ${metricasTareas.total}`}
            />
          </StatGrid>

          {/* Gráfico y Distribución de Cotizaciones */}
          <section className="dash-section">
            <div className="dash-section-header">
              <div>
                <h3>Cotizaciones por Estado</h3>
                <p>
                  Distribución comercial del prototipo: borradores, enviadas,
                  aceptadas y rechazadas.
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: "0.85rem", color: "var(--text-muted-2)" }}>
                  Valor cotizado aceptado:
                </span>
                <div style={{ fontWeight: 700, color: "#10b981", fontSize: "1.1rem" }}>
                  {formatMoney(metricasCotizaciones.montoAceptado)}
                </div>
              </div>
            </div>

            <div className="dash-panel">
              <div className="dash-chart-wrap">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={metricasCotizaciones.dataGrafico}
                    margin={{ top: 20, right: 20, left: -10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis
                      dataKey="estado"
                      stroke="var(--text-muted-2)"
                      fontSize={13}
                    />
                    <YAxis
                      allowDecimals={false}
                      stroke="var(--text-muted-2)"
                      fontSize={13}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(255, 255, 255, 0.05)" }}
                      formatter={(val) => [`${val} cotizaciones`, "Cantidad"]}
                      contentStyle={{
                        background: "var(--card-bg-1, #1e293b)",
                        borderColor: "var(--border-accent, #334155)",
                        borderRadius: "8px",
                      }}
                    />
                    <Bar dataKey="cantidad" radius={[6, 6, 0, 0]}>
                      {metricasCotizaciones.dataGrafico.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* Estado Operativo: Proyectos y Tareas */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 24,
              marginTop: 34,
            }}
          >
            {/* Proyectos Activos */}
            <section className="dash-section" style={{ margin: 0 }}>
              <div className="dash-section-header">
                <div>
                  <h3>Proyectos en Curso</h3>
                  <p>Avance estimado según tareas finalizadas.</p>
                </div>
              </div>

              <div className="dash-panel" style={{ padding: "16px 20px" }}>
                {proyectosConAvance.length === 0 ? (
                  <p className="dash-empty">No hay proyectos registrados aún.</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {proyectosConAvance.slice(0, 4).map((p) => (
                      <li
                        key={p.id}
                        style={{
                          padding: "12px 0",
                          borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 6,
                          }}
                        >
                          <strong style={{ fontSize: "0.95rem" }}>{p.titulo}</strong>
                          <span
                            style={{
                              fontSize: "0.78rem",
                              padding: "2px 8px",
                              borderRadius: "6px",
                              background: "rgba(59, 130, 246, 0.15)",
                              color: "#60a5fa",
                            }}
                          >
                            {ESTADOS_PROYECTO_LABELS[p.estado] || p.estado}
                          </span>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "0.82rem",
                            color: "var(--text-muted-2)",
                            marginBottom: 6,
                          }}
                        >
                          <span>Cliente: {p.cliente || "Sin asignar"}</span>
                          <span>
                            {p.tareasCompletadas}/{p.totalTareas} tareas ({p.porcentajeAvance}%)
                          </span>
                        </div>
                        <div
                          style={{
                            height: 6,
                            background: "rgba(255,255,255,0.08)",
                            borderRadius: 3,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${p.porcentajeAvance}%`,
                              height: "100%",
                              background:
                                p.porcentajeAvance === 100
                                  ? "#10b981"
                                  : "linear-gradient(90deg, #3b82f6, #60a5fa)",
                              transition: "width 0.4s ease",
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Tareas Pendientes */}
            <section className="dash-section" style={{ margin: 0 }}>
              <div className="dash-section-header">
                <div>
                  <h3>Tareas Pendientes</h3>
                  <p>Próximas entregas operativas.</p>
                </div>
              </div>

              <div className="dash-panel" style={{ padding: "16px 20px" }}>
                {tareasPendientesLista.length === 0 ? (
                  <p className="dash-empty">No hay tareas pendientes por ahora.</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {tareasPendientesLista.map((t) => (
                      <li
                        key={t.id}
                        style={{
                          padding: "12px 0",
                          borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <div>
                          <strong style={{ fontSize: "0.93rem", display: "block" }}>
                            {t.titulo}
                          </strong>
                          <span
                            style={{
                              fontSize: "0.8rem",
                              color: "var(--text-muted-2)",
                            }}
                          >
                            Límite: {formatDate(t.fecha_limite)} · Resp:{" "}
                            {t.responsable || "Equipo"}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: "0.78rem",
                            padding: "3px 8px",
                            borderRadius: "6px",
                            fontWeight: 600,
                            background:
                              t.prioridad === "alta" || t.prioridad === "urgente"
                                ? "rgba(239, 68, 68, 0.15)"
                                : "rgba(234, 179, 8, 0.15)",
                            color:
                              t.prioridad === "alta" || t.prioridad === "urgente"
                                ? "#f87171"
                                : "#facc15",
                          }}
                        >
                          {PRIORIDAD_LABELS[t.prioridad] || t.prioridad}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
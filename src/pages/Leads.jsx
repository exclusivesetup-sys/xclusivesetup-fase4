import { useEffect, useMemo, useState } from "react";
import "./Leads.css";
import { apiRequest, mensajeDeError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import PageHeader from "../components/PageHeader";
import StatGrid, { StatCard } from "../components/StatGrid";

const LEADS_API_PATH = "/api/leads";

const ESTADOS = [
  { value: "nuevo", label: "Nuevo" },
  { value: "descartado", label: "Descartado" },
  { value: "archivado", label: "Archivado" },
];

const ESTADO_LABELS = {
  nuevo: "Nuevo",
  convertido: "Convertido",
  descartado: "Descartado",
  archivado: "Archivado",
};

const initialForm = {
  nombre: "",
  empresa: "",
  telefono: "",
  email: "",
  fuente: "",
  valor_potencial: "",
  notas: "",
};

function formatMoney(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function normalizeEstado(value) {
  return String(value || "nuevo").trim().toLowerCase();
}

export default function Leads() {
  const { esAdminOGerente } = useAuth();
  const [leads, setLeads] = useState([]);
  const [formData, setFormData] = useState(initialForm);

  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [accionLoadingId, setAccionLoadingId] = useState(null);

  const [search, setSearch] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("");

  useEffect(() => {
    fetchLeads();
  }, []);

  async function fetchLeads() {
    setCargando(true);
    setError("");

    try {
      const data = await apiRequest(LEADS_API_PATH);
      setLeads(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Error cargando leads", e);
      setError("No se pudo cargar la lista de clientes potenciales.");
    } finally {
      setCargando(false);
    }
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  function resetForm() {
    setFormData(initialForm);
    setEditandoId(null);
  }

  function cancelarEdicion() {
    resetForm();
    setError("");
    setSuccessMsg("");
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!formData.nombre.trim()) {
      setError("El nombre es obligatorio.");
      setSuccessMsg("");
      return;
    }

    setGuardando(true);
    setError("");
    setSuccessMsg("");

    const payload = {
      nombre: formData.nombre.trim(),
      empresa: formData.empresa.trim() || null,
      telefono: formData.telefono.trim() || null,
      email: formData.email.trim() || null,
      fuente: formData.fuente.trim() || null,
      valor_potencial: Number(formData.valor_potencial) || 0,
      notas: formData.notas.trim() || null,
    };

    try {
      if (editandoId == null) {
        const nuevo = await apiRequest(LEADS_API_PATH, {
          method: "POST",
          body: JSON.stringify(payload),
        });

        setLeads((prev) => [nuevo, ...prev]);
        setSuccessMsg("Cliente potencial creado correctamente.");
      } else {
        const actualizado = await apiRequest(`${LEADS_API_PATH}/${editandoId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });

        setLeads((prev) =>
          prev.map((l) => (l.id === editandoId ? actualizado : l))
        );
        setSuccessMsg("Cliente potencial actualizado correctamente.");
      }

      resetForm();
    } catch (e) {
      console.error("Error guardando lead", e);
      setError(
        mensajeDeError(
          e,
          editandoId == null
            ? "No se pudo guardar el cliente potencial."
            : "No se pudo actualizar el cliente potencial."
        )
      );
      setSuccessMsg("");
    } finally {
      setGuardando(false);
    }
  }

  function handleEdit(lead) {
    setEditandoId(lead.id);
    setError("");
    setSuccessMsg("");

    setFormData({
      nombre: lead.nombre || "",
      empresa: lead.empresa || "",
      telefono: lead.telefono || "",
      email: lead.email || "",
      fuente: lead.fuente || "",
      valor_potencial:
        lead.valor_potencial != null ? String(lead.valor_potencial) : "",
      notas: lead.notas || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id) {
    const confirmar = window.confirm(
      "¿Seguro que quieres eliminar este cliente potencial?"
    );
    if (!confirmar) return;

    setAccionLoadingId(id);
    setError("");
    setSuccessMsg("");

    try {
      await apiRequest(`${LEADS_API_PATH}/${id}`, { method: "DELETE" });

      setLeads((prev) => prev.filter((l) => l.id !== id));

      if (editandoId === id) {
        resetForm();
      }

      setSuccessMsg("Cliente potencial eliminado correctamente.");
    } catch (e) {
      console.error("Error eliminando lead", e);
      setError(mensajeDeError(e, "No se pudo eliminar el cliente potencial."));
      setSuccessMsg("");
    } finally {
      setAccionLoadingId(null);
    }
  }

  async function handleCambiarEstado(lead, nuevoEstado) {
    if (!nuevoEstado || nuevoEstado === lead.estado) return;

    setAccionLoadingId(lead.id);
    setError("");
    setSuccessMsg("");

    try {
      await apiRequest(`${LEADS_API_PATH}/${lead.id}/estado`, {
        method: "PUT",
        body: JSON.stringify({ estado: nuevoEstado }),
      });

      setLeads((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, estado: nuevoEstado } : l))
      );
      setSuccessMsg(
        `Cliente potencial marcado como "${ESTADO_LABELS[nuevoEstado] || nuevoEstado}".`
      );
    } catch (e) {
      console.error("Error cambiando estado del lead", e);
      setError("No se pudo cambiar el estado del cliente potencial.");
    } finally {
      setAccionLoadingId(null);
    }
  }

  async function handleConvertir(lead) {
    const confirmar = window.confirm(
      `¿Convertir a "${lead.nombre}" en cliente? Se creará un cliente nuevo con estos datos.`
    );
    if (!confirmar) return;

    setAccionLoadingId(lead.id);
    setError("");
    setSuccessMsg("");

    try {
      await apiRequest(`${LEADS_API_PATH}/${lead.id}/convertir`, {
        method: "POST",
      });

      setLeads((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, estado: "convertido" } : l))
      );
      setSuccessMsg(
        `"${lead.nombre}" fue convertido en cliente. Revisa el módulo Clientes.`
      );
    } catch (e) {
      console.error("Error convirtiendo lead", e);
      setError(e?.data?.error || "No se pudo completar la conversión a cliente.");
    } finally {
      setAccionLoadingId(null);
    }
  }

  const leadsFiltrados = useMemo(() => {
    return leads.filter((lead) => {
      const matchSearch =
        !search.trim() ||
        [lead.nombre, lead.empresa, lead.email, lead.telefono, lead.fuente]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(search.trim().toLowerCase())
          );

      const matchEstado =
        !estadoFiltro || normalizeEstado(lead.estado) === estadoFiltro;

      return matchSearch && matchEstado;
    });
  }, [leads, search, estadoFiltro]);

  const resumen = useMemo(() => {
    return {
      total: leads.length,
      nuevos: leads.filter((l) => normalizeEstado(l.estado) === "nuevo").length,
      convertidos: leads.filter(
        (l) => normalizeEstado(l.estado) === "convertido"
      ).length,
      descartados: leads.filter((l) =>
        ["descartado", "archivado"].includes(normalizeEstado(l.estado))
      ).length,
    };
  }, [leads]);

  return (
    <div className="page leads-page">
      <PageHeader
        title="Clientes potenciales"
        description="Contactos antes de convertirse en clientes: da seguimiento, descarta o archiva."
      />

      <StatGrid>
        <StatCard label="Total" value={resumen.total} />
        <StatCard label="Nuevos" value={resumen.nuevos} />
        <StatCard label="Convertidos" value={resumen.convertidos} />
        <StatCard label="Descartados / archivados" value={resumen.descartados} />
      </StatGrid>

      <section className="leads-section">
        <h3>{editandoId ? "Editar cliente potencial" : "Nuevo cliente potencial"}</h3>

        {error && <p className="leads-error">{error}</p>}
        {successMsg && <p className="leads-success">{successMsg}</p>}

        <form onSubmit={handleSubmit} className="leads-form">
          <div className="leads-grid">
            <label>
              Nombre
              <input
                type="text"
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                placeholder="Ej. Camila Restrepo"
                disabled={guardando}
              />
            </label>

            <label>
              Empresa
              <input
                type="text"
                name="empresa"
                value={formData.empresa}
                onChange={handleChange}
                placeholder="Ej. Estudio Nova"
                disabled={guardando}
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
                disabled={guardando}
              />
            </label>

            <label>
              Email
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Ej. camila@correo.com"
                disabled={guardando}
              />
            </label>

            <label>
              Fuente
              <input
                type="text"
                name="fuente"
                value={formData.fuente}
                onChange={handleChange}
                placeholder="Ej. Instagram, referido, formulario web..."
                disabled={guardando}
              />
            </label>

            <label>
              Valor potencial
              <input
                type="number"
                step="0.01"
                min="0"
                name="valor_potencial"
                value={formData.valor_potencial}
                onChange={handleChange}
                placeholder="Ej. 800000"
                disabled={guardando}
              />
            </label>
          </div>

          <label>
            Notas
            <textarea
              name="notas"
              value={formData.notas}
              onChange={handleChange}
              placeholder="Contexto del contacto, próximos pasos, etc."
              rows={3}
              disabled={guardando}
            />
          </label>

          <div className="leads-actions">
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando
                ? "Guardando..."
                : editandoId
                ? "Actualizar"
                : "Guardar"}
            </button>

            {editandoId && (
              <button
                type="button"
                className="btn-secondary"
                onClick={cancelarEdicion}
                disabled={guardando}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="leads-section">
        <h3>Lista de clientes potenciales</h3>

        <div className="leads-filters">
          <label>
            Buscar
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre, empresa, email, teléfono, fuente..."
            />
          </label>

          <label>
            Filtrar por estado
            <select
              value={estadoFiltro}
              onChange={(e) => setEstadoFiltro(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="nuevo">Nuevo</option>
              <option value="convertido">Convertido</option>
              <option value="descartado">Descartado</option>
              <option value="archivado">Archivado</option>
            </select>
          </label>
        </div>

        {cargando ? (
          <p className="leads-empty">Cargando clientes potenciales...</p>
        ) : leadsFiltrados.length === 0 ? (
          <p className="leads-empty">
            {search || estadoFiltro
              ? "No hay clientes potenciales que coincidan con los filtros."
              : "Aún no tienes clientes potenciales registrados."}
          </p>
        ) : (
          <div className="leads-table-wrap">
            <table className="leads-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Empresa</th>
                  <th>Contacto</th>
                  <th>Fuente</th>
                  <th className="is-right">Valor potencial</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {leadsFiltrados.map((lead) => {
                  const estado = normalizeEstado(lead.estado);
                  const yaConvertido = estado === "convertido";
                  const bloqueado = accionLoadingId === lead.id;

                  return (
                    <tr key={lead.id}>
                      <td>
                        <strong>{lead.nombre}</strong>
                      </td>
                      <td>{lead.empresa || "—"}</td>
                      <td>
                        {lead.telefono || "—"}
                        {lead.email ? ` / ${lead.email}` : ""}
                      </td>
                      <td>{lead.fuente || "—"}</td>
                      <td className="is-right">
                        {formatMoney(lead.valor_potencial)}
                      </td>
                      <td>
                        <span className={`estado-badge estado-${estado}`}>
                          {ESTADO_LABELS[estado] || estado}
                        </span>
                      </td>
                      <td>
                        <div className="leads-row-actions">
                          <select
                            className="leads-estado-select"
                            value={ESTADOS.some((e) => e.value === estado) ? estado : "nuevo"}
                            onChange={(e) =>
                              handleCambiarEstado(lead, e.target.value)
                            }
                            disabled={bloqueado || yaConvertido}
                          >
                            {ESTADOS.map((e) => (
                              <option key={e.value} value={e.value}>
                                {e.label}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            className="chip chip-convert"
                            onClick={() => handleConvertir(lead)}
                            disabled={bloqueado || yaConvertido}
                          >
                            {yaConvertido ? "Convertido" : "Convertir"}
                          </button>

                          {esAdminOGerente && (
                            <button
                              type="button"
                              className="chip chip-edit"
                              onClick={() => handleEdit(lead)}
                              disabled={bloqueado}
                            >
                              Editar
                            </button>
                          )}

                          {esAdminOGerente && (
                            <button
                              type="button"
                              className="chip chip-delete"
                              onClick={() => handleDelete(lead.id)}
                              disabled={bloqueado}
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

import { useEffect, useMemo, useState } from "react";
import "./ClienteDetalle.css";
import { apiRequest, API_BASE_URL, mensajeDeError, getToken } from "../lib/api";
import { useAuth } from "../context/AuthContext";


const ETIQUETAS_PRESET = [
  { nombre: "VIP", color: "gold" },
  { nombre: "Frecuente", color: "blue" },
  { nombre: "Nuevo", color: "green" },
  { nombre: "Empresa", color: "violet" },
  { nombre: "Freelancer", color: "cyan" },
  { nombre: "Moroso", color: "red" },
  { nombre: "Prospecto", color: "orange" },
];

function normalizeTag(value) {
  return String(value || "").trim().toLowerCase();
}

const HISTORIAL_TIPOS = [
  { value: "nota", label: "Nota" },
  { value: "llamada", label: "Llamada" },
  { value: "reunion", label: "Reunión" },
  { value: "otro", label: "Otro" },
];

const HISTORIAL_TIPO_LABELS = {
  cliente_creado: "Cliente creado",
  lead_convertido: "Cliente potencial convertido",
  nota: "Nota",
  llamada: "Llamada",
  reunion: "Reunión",
  otro: "Otro",
};

function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatFechaHora(value) {
  if (!value) return "—";
  const d = new Date(value.includes(" ") ? value.replace(" ", "T") : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("es-CO");
}


export default function ClienteDetalle({
  cliente,
  onClose,
  onEdit,
}) {
  const { esAdminOGerente } = useAuth();

  const [etiquetas, setEtiquetas] = useState([]);
  const [cargandoEtiquetas, setCargandoEtiquetas] = useState(false);
  const [errorEtiquetas, setErrorEtiquetas] = useState("");
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState("");
  const [guardandoEtiqueta, setGuardandoEtiqueta] = useState(false);
  const [eliminandoEtiquetaId, setEliminandoEtiquetaId] = useState(null);

  const [historial, setHistorial] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [errorHistorial, setErrorHistorial] = useState("");
  const [historialForm, setHistorialForm] = useState({
    tipo: "nota",
    titulo: "",
    descripcion: "",
  });
  const [guardandoHistorial, setGuardandoHistorial] = useState(false);

  const [notasInternas, setNotasInternas] = useState([]);
  const [cargandoNotas, setCargandoNotas] = useState(false);
  const [errorNotas, setErrorNotas] = useState("");
  const [nuevaNotaInterna, setNuevaNotaInterna] = useState("");
  const [guardandoNotaInterna, setGuardandoNotaInterna] = useState(false);
  const [eliminandoNotaId, setEliminandoNotaId] = useState(null);

  const [archivos, setArchivos] = useState([]);
  const [cargandoArchivos, setCargandoArchivos] = useState(false);
  const [errorArchivos, setErrorArchivos] = useState("");
  const [archivoSeleccionado, setArchivoSeleccionado] = useState(null);
  const [subiendoArchivo, setSubiendoArchivo] = useState(false);
  const [eliminandoArchivoId, setEliminandoArchivoId] = useState(null);

  useEffect(() => {
    if (!cliente?.id) return;
    let cancelado = false;

    async function cargarDetalles() {
      setCargandoEtiquetas(true);
      setCargandoHistorial(true);
      setCargandoNotas(true);
      setCargandoArchivos(true);

      setErrorEtiquetas("");
      setErrorHistorial("");
      setErrorNotas("");
      setErrorArchivos("");

      try {
        const [etRes, histRes, notasRes, archRes] = await Promise.allSettled([
          apiRequest(`/api/clientes/${cliente.id}/etiquetas`),
          apiRequest(`/api/clientes/${cliente.id}/historial`),
          apiRequest(`/api/clientes/${cliente.id}/notas`),
          apiRequest(`/api/clientes/${cliente.id}/archivos`),
        ]);

        if (cancelado) return;

        if (etRes.status === "fulfilled") {
          setEtiquetas(Array.isArray(etRes.value) ? etRes.value : []);
        } else {
          console.error("Error cargando etiquetas del cliente", etRes.reason);
          setErrorEtiquetas("No se pudieron cargar las etiquetas.");
          setEtiquetas([]);
        }

        if (histRes.status === "fulfilled") {
          setHistorial(Array.isArray(histRes.value) ? histRes.value : []);
        } else {
          console.error("Error cargando historial del cliente", histRes.reason);
          setErrorHistorial("No se pudo cargar el historial.");
          setHistorial([]);
        }

        if (notasRes.status === "fulfilled") {
          setNotasInternas(Array.isArray(notasRes.value) ? notasRes.value : []);
        } else {
          console.error("Error cargando notas internas del cliente", notasRes.reason);
          setErrorNotas("No se pudieron cargar las notas.");
          setNotasInternas([]);
        }

        if (archRes.status === "fulfilled") {
          setArchivos(Array.isArray(archRes.value) ? archRes.value : []);
        } else {
          console.error("Error cargando archivos del cliente", archRes.reason);
          setErrorArchivos("No se pudieron cargar los archivos.");
          setArchivos([]);
        }
      } finally {
        if (!cancelado) {
          setCargandoEtiquetas(false);
          setCargandoHistorial(false);
          setCargandoNotas(false);
          setCargandoArchivos(false);
        }
      }
    }

    cargarDetalles();

    return () => {
      cancelado = true;
    };
  }, [cliente?.id]);

  function handleHistorialChange(e) {
    const { name, value } = e.target;
    setHistorialForm((prev) => ({ ...prev, [name]: value }));
  }

  async function agregarHistorial(e) {
    e.preventDefault();
    if (!cliente?.id || !historialForm.titulo.trim()) return;

    setGuardandoHistorial(true);
    setErrorHistorial("");

    try {
      const nueva = await apiRequest(`/api/clientes/${cliente.id}/historial`, {
        method: "POST",
        body: JSON.stringify({
          tipo: historialForm.tipo,
          titulo: historialForm.titulo.trim(),
          descripcion: historialForm.descripcion.trim() || null,
        }),
      });

      setHistorial((prev) => [nueva, ...prev]);
      setHistorialForm({ tipo: "nota", titulo: "", descripcion: "" });
    } catch (e) {
      console.error("Error agregando historial", e);
      setErrorHistorial("No se pudo agregar la entrada al historial.");
    } finally {
      setGuardandoHistorial(false);
    }
  }


  async function agregarNotaInterna(e) {
    e.preventDefault();
    if (!cliente?.id || !nuevaNotaInterna.trim()) return;

    setGuardandoNotaInterna(true);
    setErrorNotas("");

    try {
      const nueva = await apiRequest(`/api/clientes/${cliente.id}/notas`, {
        method: "POST",
        body: JSON.stringify({ contenido: nuevaNotaInterna.trim() }),
      });

      setNotasInternas((prev) => [nueva, ...prev]);
      setNuevaNotaInterna("");
    } catch (e) {
      console.error("Error agregando nota interna", e);
      setErrorNotas("No se pudo agregar la nota.");
    } finally {
      setGuardandoNotaInterna(false);
    }
  }

  async function quitarNotaInterna(notaId) {
    if (!cliente?.id) return;

    setEliminandoNotaId(notaId);
    setErrorNotas("");

    try {
      await apiRequest(`/api/clientes/${cliente.id}/notas/${notaId}`, {
        method: "DELETE",
      });

      setNotasInternas((prev) => prev.filter((n) => n.id !== notaId));
    } catch (e) {
      console.error("Error quitando nota interna", e);
      setErrorNotas(mensajeDeError(e, "No se pudo quitar la nota."));
    } finally {
      setEliminandoNotaId(null);
    }
  }


  async function subirArchivo(e) {
    e.preventDefault();
    if (!cliente?.id || !archivoSeleccionado) return;

    setSubiendoArchivo(true);
    setErrorArchivos("");

    try {
      const formData = new FormData();
      formData.append("archivo", archivoSeleccionado);

      const nuevo = await apiRequest(`/api/clientes/${cliente.id}/archivos`, {
        method: "POST",
        body: formData,
      });

      setArchivos((prev) => [nuevo, ...prev]);
      setArchivoSeleccionado(null);
      const input = document.getElementById("cliente-detalle-archivo-input");
      if (input) input.value = "";
    } catch (e) {
      console.error("Error subiendo archivo", e);
      setErrorArchivos(e?.message || "No se pudo subir el archivo.");
    } finally {
      setSubiendoArchivo(false);
    }
  }

  async function abrirArchivo(archivo) {
    setErrorArchivos("");

    try {
      const res = await fetch(`${API_BASE_URL}${archivo.url}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!res.ok) {
        throw new Error("No se pudo abrir el archivo.");
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (e) {
      console.error("Error abriendo archivo", e);
      setErrorArchivos("No se pudo abrir el archivo.");
    }
  }

  async function quitarArchivo(archivoId) {
    if (!cliente?.id) return;

    const confirmar = window.confirm("¿Seguro que quieres eliminar este archivo?");
    if (!confirmar) return;

    setEliminandoArchivoId(archivoId);
    setErrorArchivos("");

    try {
      await apiRequest(`/api/clientes/${cliente.id}/archivos/${archivoId}`, {
        method: "DELETE",
      });

      setArchivos((prev) => prev.filter((a) => a.id !== archivoId));
    } catch (e) {
      console.error("Error quitando archivo", e);
      setErrorArchivos(mensajeDeError(e, "No se pudo eliminar el archivo."));
    } finally {
      setEliminandoArchivoId(null);
    }
  }


  async function agregarEtiqueta(nombre, color) {
    if (!cliente?.id || !nombre.trim()) return;

    const yaExiste = etiquetas.some(
      (e) => normalizeTag(e.nombre) === normalizeTag(nombre)
    );
    if (yaExiste) return;

    setGuardandoEtiqueta(true);
    setErrorEtiquetas("");

    try {
      const nueva = await apiRequest(`/api/clientes/${cliente.id}/etiquetas`, {
        method: "POST",
        body: JSON.stringify({ nombre: nombre.trim(), color: color || "slate" }),
      });

      setEtiquetas((prev) => [...prev, nueva]);
      setNuevaEtiqueta("");
    } catch (e) {
      console.error("Error agregando etiqueta", e);
      setErrorEtiquetas("No se pudo agregar la etiqueta.");
    } finally {
      setGuardandoEtiqueta(false);
    }
  }

  async function quitarEtiqueta(etiquetaId) {
    if (!cliente?.id) return;

    setEliminandoEtiquetaId(etiquetaId);
    setErrorEtiquetas("");

    try {
      await apiRequest(
        `/api/clientes/${cliente.id}/etiquetas/${etiquetaId}`,
        { method: "DELETE" }
      );

      setEtiquetas((prev) => prev.filter((e) => e.id !== etiquetaId));
    } catch (e) {
      console.error("Error quitando etiqueta", e);
      setErrorEtiquetas(mensajeDeError(e, "No se pudo quitar la etiqueta."));
    } finally {
      setEliminandoEtiquetaId(null);
    }
  }


  const presetsDisponibles = useMemo(() => {
    return ETIQUETAS_PRESET.filter(
      (preset) =>
        !etiquetas.some((e) => normalizeTag(e.nombre) === normalizeTag(preset.nombre))
    );
  }, [etiquetas]);



  if (!cliente) return null;

  return (
    <div className="cliente-detalle-overlay">
      <div className="cliente-detalle-panel">
        <div className="cliente-detalle-header">
          <div>
            <h3>{cliente.nombre || "Cliente"}</h3>
            <p className="cliente-detalle-subtitle">
              Detalle completo y notas relacionadas.
            </p>
          </div>

          <div className="cliente-detalle-header-actions">

            {onEdit && esAdminOGerente && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onEdit(cliente)}
              >
                Editar cliente
              </button>
            )}

            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
            >
              Cerrar
            </button>
          </div>
        </div>

        <div className="cliente-detalle-content">
          <div className="cliente-detalle-main">
            <section className="cliente-detalle-card">
              <h4>Información básica</h4>

              <div className="cliente-detalle-grid">
                <div>
                  <span className="label">Nombre</span>
                  <p>{cliente.nombre || "—"}</p>
                </div>

                <div>
                  <span className="label">Empresa</span>
                  <p>{cliente.empresa || "—"}</p>
                </div>

                <div>
                  <span className="label">Email</span>
                  <p>{cliente.email || "—"}</p>
                </div>

                <div>
                  <span className="label">Teléfono</span>
                  <p>{cliente.telefono || "—"}</p>
                </div>

                <div>
                  <span className="label">Dirección</span>
                  <p>{cliente.direccion || "—"}</p>
                </div>

                <div>
                  <span className="label">Ciudad / País</span>
                  <p>
                    {[cliente.ciudad, cliente.pais].filter(Boolean).join(", ") ||
                      "—"}
                  </p>
                </div>

                <div>
                  <span className="label">Estado</span>
                  <p>{cliente.estadocliente || "—"}</p>
                </div>

                <div>
                  <span className="label">Fecha de creación</span>
                  <p>{formatDate(cliente.fechacreacion)}</p>
                </div>

                <div>
                  <span className="label">Último contacto</span>
                  <p>{formatDate(cliente.ultimocontacto)}</p>
                </div>
              </div>
            </section>


            <section className="cliente-detalle-card">
              <h4>Notas</h4>
              <p className="cliente-detalle-notas">
                {cliente.notas?.trim() ||
                  "Sin notas registradas para este cliente."}
              </p>
            </section>

            <section className="cliente-detalle-card">
              <h4>Historial</h4>

              <form className="historial-form" onSubmit={agregarHistorial}>
                <select
                  name="tipo"
                  value={historialForm.tipo}
                  onChange={handleHistorialChange}
                  disabled={guardandoHistorial}
                >
                  {HISTORIAL_TIPOS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  name="titulo"
                  value={historialForm.titulo}
                  onChange={handleHistorialChange}
                  placeholder="Ej. Llamada de seguimiento"
                  disabled={guardandoHistorial}
                />

                <input
                  type="text"
                  name="descripcion"
                  value={historialForm.descripcion}
                  onChange={handleHistorialChange}
                  placeholder="Detalle (opcional)"
                  disabled={guardandoHistorial}
                />

                <button
                  type="submit"
                  className="btn-secondary"
                  disabled={guardandoHistorial || !historialForm.titulo.trim()}
                >
                  {guardandoHistorial ? "Guardando..." : "Agregar"}
                </button>
              </form>

              {errorHistorial && (
                <p className="cliente-detalle-error">{errorHistorial}</p>
              )}

              {cargandoHistorial ? (
                <p className="cliente-detalle-empty">Cargando historial...</p>
              ) : historial.length === 0 ? (
                <p className="cliente-detalle-empty">
                  Este cliente aún no tiene historial registrado.
                </p>
              ) : (
                <ul className="historial-timeline">
                  {historial.map((h) => (
                    <li key={h.id} className="historial-item">
                      <div className="historial-item-top">
                        <span className="historial-tipo">
                          {HISTORIAL_TIPO_LABELS[h.tipo] || h.tipo}
                        </span>
                        <span className="historial-fecha">
                          {formatFechaHora(h.fecha)}
                        </span>
                      </div>
                      <strong className="historial-titulo">{h.titulo}</strong>
                      {h.descripcion && (
                        <p className="historial-descripcion">
                          {h.descripcion}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="cliente-detalle-card">
              <h4>Notas internas</h4>

              <form className="notas-internas-form" onSubmit={agregarNotaInterna}>
                <textarea
                  value={nuevaNotaInterna}
                  onChange={(e) => setNuevaNotaInterna(e.target.value)}
                  placeholder="Escribe una nota privada sobre este cliente..."
                  rows={2}
                  disabled={guardandoNotaInterna}
                />
                <button
                  type="submit"
                  className="btn-secondary"
                  disabled={guardandoNotaInterna || !nuevaNotaInterna.trim()}
                >
                  {guardandoNotaInterna ? "Guardando..." : "Agregar nota"}
                </button>
              </form>

              {errorNotas && (
                <p className="cliente-detalle-error">{errorNotas}</p>
              )}

              {cargandoNotas ? (
                <p className="cliente-detalle-empty">Cargando notas...</p>
              ) : notasInternas.length === 0 ? (
                <p className="cliente-detalle-empty">
                  Este cliente aún no tiene notas internas.
                </p>
              ) : (
                <ul className="notas-internas-list">
                  {notasInternas.map((n) => (
                    <li key={n.id} className="notas-internas-item">
                      <p>{n.contenido}</p>
                      <div className="notas-internas-meta">
                        <span>{formatFechaHora(n.fecha_creacion)}</span>
                        {esAdminOGerente && (
                          <button
                            type="button"
                            className="notas-internas-remove"
                            onClick={() => quitarNotaInterna(n.id)}
                            disabled={eliminandoNotaId === n.id}
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="cliente-detalle-card">
              <h4>Archivos</h4>

              <form className="archivos-form" onSubmit={subirArchivo}>
                <input
                  id="cliente-detalle-archivo-input"
                  type="file"
                  onChange={(e) =>
                    setArchivoSeleccionado(e.target.files?.[0] || null)
                  }
                  disabled={subiendoArchivo}
                />
                <button
                  type="submit"
                  className="btn-secondary"
                  disabled={subiendoArchivo || !archivoSeleccionado}
                >
                  {subiendoArchivo ? "Subiendo..." : "Subir archivo"}
                </button>
              </form>

              {errorArchivos && (
                <p className="cliente-detalle-error">{errorArchivos}</p>
              )}

              {cargandoArchivos ? (
                <p className="cliente-detalle-empty">Cargando archivos...</p>
              ) : archivos.length === 0 ? (
                <p className="cliente-detalle-empty">
                  Este cliente aún no tiene archivos.
                </p>
              ) : (
                <ul className="archivos-list">
                  {archivos.map((a) => (
                    <li key={a.id} className="archivos-item">
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          abrirArchivo(a);
                        }}
                        className="archivos-item-link"
                      >
                        {a.nombre_original}
                      </a>
                      <span className="archivos-item-meta">
                        {formatFileSize(a.tamano)} ·{" "}
                        {formatFechaHora(a.fecha_creacion)}
                      </span>
                      {esAdminOGerente && (
                        <button
                          type="button"
                          className="notas-internas-remove"
                          onClick={() => quitarArchivo(a.id)}
                          disabled={eliminandoArchivoId === a.id}
                        >
                          Eliminar
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="cliente-detalle-side">
            <section className="cliente-detalle-card">
              <div className="cliente-detalle-side-header">
                <h4>Etiquetas</h4>
              </div>

              {errorEtiquetas && (
                <p className="cliente-detalle-error">{errorEtiquetas}</p>
              )}

              {cargandoEtiquetas ? (
                <p className="cliente-detalle-empty">Cargando etiquetas...</p>
              ) : (
                <>
                  {etiquetas.length === 0 ? (
                    <p className="cliente-detalle-empty">
                      Este cliente aún no tiene etiquetas.
                    </p>
                  ) : (
                    <div className="etiquetas-list">
                      {etiquetas.map((et) => (
                        <span
                          key={et.id}
                          className={`etiqueta-chip etiqueta-color-${et.color || "slate"}`}
                        >
                          {et.nombre}
                          {esAdminOGerente && (
                            <button
                              type="button"
                              className="etiqueta-chip-remove"
                              onClick={() => quitarEtiqueta(et.id)}
                              disabled={eliminandoEtiquetaId === et.id}
                              aria-label={`Quitar etiqueta ${et.nombre}`}
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  )}

                  {presetsDisponibles.length > 0 && (
                    <div className="etiquetas-presets">
                      {presetsDisponibles.map((preset) => (
                        <button
                          key={preset.nombre}
                          type="button"
                          className={`etiqueta-chip etiqueta-chip--add etiqueta-color-${preset.color}`}
                          onClick={() =>
                            agregarEtiqueta(preset.nombre, preset.color)
                          }
                          disabled={guardandoEtiqueta}
                        >
                          + {preset.nombre}
                        </button>
                      ))}
                    </div>
                  )}

                  <form
                    className="etiquetas-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      agregarEtiqueta(nuevaEtiqueta, "slate");
                    }}
                  >
                    <input
                      type="text"
                      value={nuevaEtiqueta}
                      onChange={(ev) => setNuevaEtiqueta(ev.target.value)}
                      placeholder="Etiqueta personalizada"
                      disabled={guardandoEtiqueta}
                    />
                    <button
                      type="submit"
                      className="btn-secondary"
                      disabled={guardandoEtiqueta || !nuevaEtiqueta.trim()}
                    >
                      Agregar
                    </button>
                  </form>
                </>
              )}
            </section>


          </aside>
        </div>
      </div>
    </div>
  );
}
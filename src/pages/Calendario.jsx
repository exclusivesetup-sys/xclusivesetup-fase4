import React, { useEffect, useMemo, useState } from "react";
import "./Calendario.css";
import { apiRequest, mensajeDeError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const EVENTOS_API_PATH = "/api/calendario/eventos";

const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const TIPO_LABELS = {
  reunion: "Reunión",
  entrega: "Entrega",
  pago: "Pago",
  factura: "Factura",
  seguimiento: "Seguimiento",
  proyecto: "Proyecto",
  tarea: "Tarea",
  otro: "Evento",
};

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayISO() {
  return toISODate(new Date());
}

function getMonthInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function parseMonthInput(value) {
  const [year, month] = String(value).split("-");
  return new Date(Number(year), Number(month) - 1, 1);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function getCalendarDays(currentDate) {
  const first = startOfMonth(currentDate);
  const last = endOfMonth(currentDate);
  const firstDay = first.getDay() === 0 ? 7 : first.getDay();
  const days = [];

  for (let i = firstDay - 1; i > 0; i--) {
    const d = new Date(first);
    d.setDate(first.getDate() - i);
    days.push({ date: d, currentMonth: false });
  }

  for (let d = 1; d <= last.getDate(); d++) {
    days.push({
      date: new Date(currentDate.getFullYear(), currentDate.getMonth(), d),
      currentMonth: true,
    });
  }

  while (days.length % 7 !== 0) {
    const lastDate = days[days.length - 1].date;
    const d = new Date(lastDate);
    d.setDate(lastDate.getDate() + 1);
    days.push({ date: d, currentMonth: false });
  }

  while (days.length < 42) {
    const lastDate = days[days.length - 1].date;
    const d = new Date(lastDate);
    d.setDate(lastDate.getDate() + 1);
    days.push({ date: d, currentMonth: false });
  }

  return days;
}

function getTipoLabel(tipo) {
  return TIPO_LABELS[tipo] || tipo || "Evento";
}

function getColorByTipo(tipo) {
  if (tipo === "seguimiento") return "orange";
  if (tipo === "factura") return "red";
  if (tipo === "pago") return "emerald";
  if (tipo === "proyecto") return "green";
  if (tipo === "entrega") return "blue";
  if (tipo === "reunion") return "violet";
  if (tipo === "tarea") return "cyan";
  return "slate";
}

function formatFechaBonita(fecha) {
  if (!fecha) return "";
  const [year, month, day] = String(fecha).split("-");
  const date = new Date(Number(year), Number(month) - 1, Number(day));

  return date.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function normalizeEventos(data) {
  return Array.isArray(data)
    ? data.map((item) => ({
        ...item,
        color: item.color || getColorByTipo(item.tipo),
        etiqueta: item.etiqueta || getTipoLabel(item.tipo),
      }))
    : [];
}

export default function Calendario() {
  const { esAdminOGerente } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(getTodayISO());
  const [eventos, setEventos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [showEventModal, setShowEventModal] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState(null);
  const [eventError, setEventError] = useState("");
  const [newEvent, setNewEvent] = useState({
    tipo: "reunion",
    titulo: "",
    fecha: "",
    descripcion: "",
  });

  const selectedMonth = getMonthInputValue(currentDate);

  async function fetchEventos(monthValue = selectedMonth) {
    setCargando(true);
    setError("");

    try {
      const data = await apiRequest(`${EVENTOS_API_PATH}?mes=${monthValue}`);
      setEventos(normalizeEventos(data));
    } catch (e) {
      console.error("Error cargando eventos del calendario", e);
      setError("No se pudieron cargar los eventos del calendario.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    fetchEventos(selectedMonth);
  }, [selectedMonth]);

  const eventosPorFecha = useMemo(() => {
    return eventos.reduce((acc, ev) => {
      const dia = String(ev.fecha || "");
      if (!dia) return acc;
      if (!acc[dia]) acc[dia] = [];
      acc[dia].push(ev);
      return acc;
    }, {});
  }, [eventos]);

  const eventosDelDia = useMemo(() => {
    return eventosPorFecha[selectedDate] || [];
  }, [eventosPorFecha, selectedDate]);

  const days = useMemo(() => getCalendarDays(currentDate), [currentDate]);

  function prevMonth() {
    setCurrentDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
    );
  }

  function nextMonth() {
    setCurrentDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
    );
  }

  function goToday() {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(getTodayISO());
  }

  function handleMonthChange(e) {
    const next = parseMonthInput(e.target.value);
    setCurrentDate(next);
  }

  function openEventModal() {
    setEventError("");
    setSuccessMsg("");
    setNewEvent({
      tipo: "reunion",
      titulo: "",
      fecha: selectedDate || getTodayISO(),
      descripcion: "",
    });
    setShowEventModal(true);
  }

  function closeEventModal() {
    if (savingEvent) return;
    setShowEventModal(false);
    setEventError("");
  }

  function handleEventInputChange(e) {
    const { name, value } = e.target;
    setNewEvent((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function handleCreateEvent(e) {
    e.preventDefault();
    setEventError("");
    setSuccessMsg("");

    if (!newEvent.tipo || !newEvent.titulo.trim() || !newEvent.fecha) {
      setEventError("Tipo, título y fecha son obligatorios.");
      return;
    }

    try {
      setSavingEvent(true);

      await apiRequest(EVENTOS_API_PATH, {
        method: "POST",
        body: JSON.stringify({
          tipo: newEvent.tipo,
          titulo: newEvent.titulo.trim(),
          fecha: newEvent.fecha,
          descripcion: newEvent.descripcion.trim(),
        }),
      });

      setShowEventModal(false);
      setSelectedDate(newEvent.fecha);
      setEventError("");
      setSuccessMsg("Evento creado correctamente.");

      if (String(newEvent.fecha).slice(0, 7) !== selectedMonth) {
        setCurrentDate(parseMonthInput(String(newEvent.fecha).slice(0, 7)));
      } else {
        await fetchEventos(selectedMonth);
      }
    } catch (err) {
      setEventError(err.message || "Error al crear el evento");
    } finally {
      setSavingEvent(false);
    }
  }

  async function handleDeleteEvent(id) {
    const confirmDelete = window.confirm(
      "¿Seguro que quieres eliminar este evento?"
    );
    if (!confirmDelete) return;

    try {
      setDeletingEventId(id);
      setError("");
      setSuccessMsg("");

      await apiRequest(`${EVENTOS_API_PATH}/${id}`, {
        method: "DELETE",
      });

      setEventos((prev) => prev.filter((evento) => evento.id !== id));
      setSuccessMsg("Evento eliminado correctamente.");
    } catch (err) {
      setError(mensajeDeError(err, "Error al eliminar el evento"));
    } finally {
      setDeletingEventId(null);
    }
  }

  useEffect(() => {
    if (!showEventModal) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        closeEventModal();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showEventModal, savingEvent]);

  return (
    <div className="page">
      <div className="page-header">
        <h2>Calendario</h2>
        <p>Vista mensual de reuniones, entregas, pagos, facturas y seguimientos.</p>
      </div>

      {error && <p className="calendar-error">{error}</p>}
      {successMsg && <p className="calendar-success">{successMsg}</p>}

      <div className="calendar-toolbar">
        <div className="calendar-toolbar-left">
          <button type="button" className="calendar-btn" onClick={prevMonth}>
            ←
          </button>
          <button type="button" className="calendar-btn" onClick={nextMonth}>
            →
          </button>
          <button
            type="button"
            className="calendar-btn calendar-btn--ghost"
            onClick={goToday}
          >
            Hoy
          </button>
        </div>

        <div className="calendar-toolbar-title">
          {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
        </div>

        <div className="calendar-toolbar-right">
          <input
            type="month"
            className="calendar-month-input"
            value={selectedMonth}
            onChange={handleMonthChange}
          />
          <button
            type="button"
            className="calendar-btn calendar-btn--ghost"
            onClick={() => fetchEventos(selectedMonth)}
            disabled={cargando}
          >
            {cargando ? "Recargando..." : "Recargar"}
          </button>
          <button
            type="button"
            className="calendar-btn"
            onClick={openEventModal}
          >
            + Nuevo evento
          </button>
        </div>
      </div>

      {cargando ? (
        <p className="calendar-empty">Cargando eventos...</p>
      ) : (
        <div className="calendar-layout">
          <section className="calendar-grid-card">
            <div className="calendar-weekdays">
              {WEEKDAYS.map((day) => (
                <div key={day} className="calendar-weekday">
                  {day}
                </div>
              ))}
            </div>

            <div className="calendar-grid">
              {days.map(({ date, currentMonth }, index) => {
                const iso = toISODate(date);
                const eventosDia = eventosPorFecha[iso] || [];
                const isToday = iso === getTodayISO();
                const isSelected = iso === selectedDate;

                return (
                  <button
                    type="button"
                    key={`${iso}-${index}`}
                    className={[
                      "calendar-day",
                      currentMonth ? "" : "calendar-day--muted",
                      isToday ? "calendar-day--today" : "",
                      isSelected ? "calendar-day--selected" : "",
                    ]
                      .join(" ")
                      .trim()}
                    onClick={() => setSelectedDate(iso)}
                  >
                    <div className="calendar-day-head">
                      <span className="calendar-day-number">
                        {date.getDate()}
                      </span>
                      {eventosDia.length > 0 && (
                        <span className="calendar-day-count">
                          {eventosDia.length}
                        </span>
                      )}
                    </div>

                    <div className="calendar-day-events">
                      {eventosDia.slice(0, 3).map((evento) => {
                        const color = evento.color || getColorByTipo(evento.tipo);

                        return (
                          <span
                            key={`${evento.tipo}-${evento.id}`}
                            className={`calendar-dot calendar-dot--${color}`}
                            title={evento.titulo}
                          >
                            {evento.etiqueta || getTipoLabel(evento.tipo)}
                          </span>
                        );
                      })}

                      {eventosDia.length > 3 && (
                        <span className="calendar-more">
                          +{eventosDia.length - 3} más
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="calendar-sidebar">
            <div className="calendar-sidebar-card">
              <h3>Eventos del día</h3>
              <p className="calendar-selected-date">
                {formatFechaBonita(selectedDate)}
              </p>

              {eventosDelDia.length === 0 ? (
                <p className="calendar-empty">No hay eventos para esta fecha.</p>
              ) : (
                <div className="calendar-event-list">
                  {eventosDelDia.map((evento) => {
                    const color = evento.color || getColorByTipo(evento.tipo);

                    return (
                      <article
                        key={`${evento.tipo}-${evento.id}`}
                        className="calendar-event-item"
                      >
                        <div className="calendar-event-top">
                          <span className={`calendar-pill calendar-pill--${color}`}>
                            {evento.etiqueta || getTipoLabel(evento.tipo)}
                          </span>

                          <div className="calendar-event-actions">
                            <span className="calendar-event-state">
                              {evento.estado || evento.modulo || evento.tipo}
                            </span>

                            {esAdminOGerente && (
                              <button
                                type="button"
                                className="calendar-delete-btn"
                                onClick={() => handleDeleteEvent(evento.id)}
                                disabled={deletingEventId === evento.id}
                              >
                                {deletingEventId === evento.id
                                  ? "Eliminando..."
                                  : "Eliminar"}
                              </button>
                            )}
                          </div>
                        </div>

                        <h4>{evento.titulo}</h4>
                        {evento.descripcion ? <p>{evento.descripcion}</p> : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="calendar-sidebar-card">
              <h3>Leyenda</h3>
              <div className="calendar-legend">
                <span>
                  <i className="calendar-legend-dot calendar-legend-dot--violet" />{" "}
                  Reuniones
                </span>
                <span>
                  <i className="calendar-legend-dot calendar-legend-dot--blue" />{" "}
                  Entregas
                </span>
                <span>
                  <i className="calendar-legend-dot calendar-legend-dot--orange" />{" "}
                  Seguimientos
                </span>
                <span>
                  <i className="calendar-legend-dot calendar-legend-dot--green" />{" "}
                  Proyectos
                </span>
                <span>
                  <i className="calendar-legend-dot calendar-legend-dot--red" />{" "}
                  Facturas
                </span>
                <span>
                  <i className="calendar-legend-dot calendar-legend-dot--emerald" />{" "}
                  Pagos
                </span>
                <span>
                  <i className="calendar-legend-dot calendar-legend-dot--cyan" />{" "}
                  Tareas
                </span>
              </div>
            </div>
          </aside>
        </div>
      )}

      {showEventModal && (
        <div className="calendar-modal-backdrop" onClick={closeEventModal}>
          <div className="calendar-modal" onClick={(e) => e.stopPropagation()}>
            <div className="calendar-modal-header">
              <div>
                <h3>Nuevo evento</h3>
                <p className="calendar-modal-subtitle">
                  Crea un evento manual para tu calendario del portal.
                </p>
              </div>

              <button
                type="button"
                className="calendar-modal-close"
                onClick={closeEventModal}
                disabled={savingEvent}
              >
                ✕
              </button>
            </div>

            {eventError && <p className="calendar-error">{eventError}</p>}

            <form className="calendar-modal-form" onSubmit={handleCreateEvent}>
              <label>
                Tipo
                <select
                  name="tipo"
                  value={newEvent.tipo}
                  onChange={handleEventInputChange}
                >
                  <option value="reunion">Reunión</option>
                  <option value="seguimiento">Seguimiento</option>
                  <option value="factura">Factura</option>
                  <option value="pago">Pago</option>
                  <option value="entrega">Entrega</option>
                  <option value="proyecto">Proyecto</option>
                  <option value="otro">Otro</option>
                </select>
              </label>

              <label>
                Título
                <input
                  type="text"
                  name="titulo"
                  value={newEvent.titulo}
                  onChange={handleEventInputChange}
                  placeholder="Ej: Reunión con cliente"
                />
              </label>

              <label>
                Fecha
                <input
                  type="date"
                  name="fecha"
                  value={newEvent.fecha}
                  onChange={handleEventInputChange}
                />
              </label>

              <label>
                Descripción
                <textarea
                  name="descripcion"
                  value={newEvent.descripcion}
                  onChange={handleEventInputChange}
                  placeholder="Detalles opcionales del evento"
                />
              </label>

              <div className="calendar-modal-actions">
                <button
                  type="button"
                  className="calendar-btn calendar-btn--ghost"
                  onClick={closeEventModal}
                  disabled={savingEvent}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="calendar-btn calendar-btn--primary"
                  disabled={savingEvent}
                >
                  {savingEvent ? "Guardando..." : "Guardar evento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
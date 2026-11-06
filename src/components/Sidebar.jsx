import { useEffect, useRef } from "react";
import "./Sidebar.css";
import { useAuth } from "../context/AuthContext";

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

function ClientesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function CotizacionesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}

function ProyectosIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3" />
    </svg>
  );
}

function TareasIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 11 3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

const NAV_GROUPS = [
  {
    id: "general",
    label: "General",
    items: [
      { key: "dashboard", label: "Panel resumen", icon: DashboardIcon },
    ],
  },
  {
    id: "modulos",
    label: "Módulos",
    items: [
      { key: "clientes", label: "Clientes", icon: ClientesIcon },
      { key: "cotizaciones", label: "Cotizaciones", icon: CotizacionesIcon },
      { key: "proyectos", label: "Proyectos", icon: ProyectosIcon },
      { key: "tareas", label: "Tareas", icon: TareasIcon },
    ],
  },
];

export default function Sidebar({
  currentPage = "dashboard",
  onNavigate = () => {},
  collapsed = false,
  onToggleCollapse = () => {},
  mobileOpen = false,
  onCloseMobile = () => {},
}) {
  const { esAdmin } = useAuth();
  const closeBtnRef = useRef(null);
  const prevActiveElementRef = useRef(null);

  useEffect(() => {
    if (!mobileOpen) return;

    prevActiveElementRef.current = document.activeElement;

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseMobile();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    const timer = setTimeout(() => {
      if (closeBtnRef.current) {
        closeBtnRef.current.focus();
      }
    }, 50);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timer);
      if (
        prevActiveElementRef.current &&
        typeof prevActiveElementRef.current.focus === "function"
      ) {
        prevActiveElementRef.current.focus();
      }
    };
  }, [mobileOpen, onCloseMobile]);

  const visibleGroups = NAV_GROUPS.filter(
    (group) => !group.adminOnly || esAdmin
  );

  function handleItemClick(key) {
    onNavigate(key);
    onCloseMobile();
  }

  return (
    <>
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        id="crm-sidebar"
        className={`crm-sidebar ${collapsed ? "crm-sidebar--collapsed" : ""} ${
          mobileOpen ? "crm-sidebar--mobile-open" : ""
        }`}
        aria-label="Navegación del CRM"
      >
        <div className="crm-sidebar__header">
          <button
            type="button"
            className="crm-sidebar__brand"
            onClick={() => handleItemClick("dashboard")}
            aria-label="Ir al panel principal"
            title="Ir a Dashboard"
          >
            <div className="crm-sidebar__logo" aria-hidden="true">
              XS
            </div>
            {!collapsed && (
              <div className="crm-sidebar__brand-text">
                <strong>XclusiveSetup</strong>
                <span>Prototipo académico</span>
              </div>
            )}
          </button>

          <button
            ref={closeBtnRef}
            type="button"
            className="crm-sidebar__close-mobile"
            onClick={onCloseMobile}
            aria-label="Cerrar navegación"
            title="Cerrar"
          >
            ✕
          </button>
        </div>

        <nav className="crm-sidebar__nav">
          {visibleGroups.map((group) => {
            const hasActiveItem = group.items.some(
              (item) => item.key === currentPage
            );

            return (
              <div
                key={group.id}
                className={`crm-sidebar__group ${
                  hasActiveItem ? "crm-sidebar__group--active" : ""
                }`}
              >
                {!collapsed && (
                  <div className="crm-sidebar__group-title">
                    <span>{group.label}</span>
                  </div>
                )}

                <div className="crm-sidebar__group-items">
                  {group.items.map((item) => {
                    const isActive = currentPage === item.key;
                    const IconComponent = item.icon;

                    return (
                      <button
                        key={item.key}
                        type="button"
                        className={`crm-sidebar__item ${
                          isActive ? "crm-sidebar__item--active" : ""
                        }`}
                        onClick={() => handleItemClick(item.key)}
                        title={collapsed ? item.label : undefined}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <span className="crm-sidebar__item-icon" aria-hidden="true">
                          <IconComponent />
                        </span>
                        {!collapsed && (
                          <span className="crm-sidebar__item-label">
                            {item.label}
                          </span>
                        )}
                        {isActive && !collapsed && (
                          <span className="crm-sidebar__active-dot" aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="crm-sidebar__footer">
          <button
            type="button"
            className="crm-sidebar__collapse-btn"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expandir menú lateral" : "Colapsar menú lateral"}
            title={collapsed ? "Expandir menú lateral" : "Colapsar menú lateral"}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`crm-sidebar__collapse-icon ${
                collapsed ? "crm-sidebar__collapse-icon--collapsed" : ""
              }`}
              aria-hidden="true"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {!collapsed && <span>Colapsar menú</span>}
          </button>
        </div>
      </aside>
    </>
  );
}

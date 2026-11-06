import "./Topbar.css";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

const PAGE_META = {
  dashboard: { group: "General", label: "Panel resumen" },
  clientes: { group: "Módulos", label: "Clientes" },
  cotizaciones: { group: "Módulos", label: "Cotizaciones" },
  proyectos: { group: "Módulos", label: "Proyectos" },
  tareas: { group: "Módulos", label: "Tareas" },
  perfil: { group: "Cuenta", label: "Mi perfil" },
};

const ROL_LABELS = {
  admin: "Administrador",
  gerente: "Gerente",
  empleado: "Empleado",
};

function Topbar({
  currentPage = "dashboard",
  onNavigate = () => {},
  onOpenMobileSidebar = () => {},
  mobileOpen = false,
}) {
  const { usuario, logout } = useAuth();
  const { tema, alternarTema } = useTheme();

  const currentMeta = PAGE_META[currentPage] || {
    group: "Módulo",
    label: currentPage,
  };

  return (
    <header className="topbar">
      <div className="topbar-shell">
        <div className="topbar-left">
          <button
            type="button"
            className="topbar-menu-toggle"
            onClick={onOpenMobileSidebar}
            aria-expanded={mobileOpen}
            aria-controls="crm-sidebar"
            aria-label="Abrir menú de navegación"
            title="Abrir menú"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <div className="topbar-breadcrumb">
            <span className="topbar-breadcrumb__group">{currentMeta.group}</span>
            <span className="topbar-breadcrumb__separator" aria-hidden="true">
              /
            </span>
            <strong className="topbar-breadcrumb__current">
              {currentMeta.label}
            </strong>
          </div>
        </div>

        <div className="topbar-right">
          <button
            type="button"
            className="theme-toggle"
            onClick={alternarTema}
            aria-label={
              tema === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"
            }
            title={
              tema === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"
            }
          >
            {tema === "dark" ? (
              <svg
                viewBox="0 0 24 24"
                width="19"
                height="19"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="4.4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path
                  d="M12 2.6v2.2M12 19.2v2.2M4.9 4.9l1.55 1.55M17.55 17.55l1.55 1.55M2.6 12h2.2M19.2 12h2.2M4.9 19.1l1.55-1.55M17.55 6.45l1.55-1.55"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                width="19"
                height="19"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M20.5 14.4a8.5 8.5 0 1 1-9.9-11 7 7 0 0 0 9.9 11Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>

          <div className="topbar-user">
            <button
              type="button"
              className="topbar-user__info topbar-user__info--btn"
              onClick={() => onNavigate("perfil")}
              title="Mi perfil"
            >
              <strong>{usuario?.nombre}</strong>
              <span>{ROL_LABELS[usuario?.rol] || usuario?.rol}</span>
            </button>

            <button
              type="button"
              className="topbar-user__logout"
              onClick={logout}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              Salir
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Topbar;
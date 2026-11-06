import { useEffect, useState } from "react";
import "./App.css";
import Topbar from "./components/Topbar";
import Dashboard from "./pages/Dashboard";
import Clientes from "./pages/Clientes";
import Cotizaciones from "./pages/Cotizaciones";
import Proyectos from "./pages/Proyectos";
import Tareas from "./pages/Tareas";
import Perfil from "./pages/Perfil";
import Login from "./pages/Login";
import { useAuth } from "./context/AuthContext";
import Sidebar from "./components/Sidebar";

const PAGE_COMPONENTS = {
  dashboard: Dashboard,
  clientes: Clientes,
  cotizaciones: Cotizaciones,
  proyectos: Proyectos,
  tareas: Tareas,
  perfil: Perfil,
};

const DEFAULT_PAGE = "dashboard";

function getPageFromHash() {
  const raw = window.location.hash.replace("#", "").trim();
  const [pagePart] = raw.split("?");
  const page = (pagePart || "").toLowerCase();
  if (PAGE_COMPONENTS[page]) {
    return page;
  }
  if (page && page !== DEFAULT_PAGE) {
    window.location.hash = DEFAULT_PAGE;
  }
  return DEFAULT_PAGE;
}

function App() {
  const [page, setPage] = useState(getPageFromHash);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem("xs_sidebar_collapsed") === "true";
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { autenticado, cargando } = useAuth();

  useEffect(() => {
    function handleHashChange() {
      setPage(getPageFromHash());
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  function handleNavigate(nextPage) {
    const [pagePart] = nextPage.split("?");
    const safePage = PAGE_COMPONENTS[pagePart] ? pagePart : DEFAULT_PAGE;
    setPage(safePage);
    window.location.hash = nextPage;
  }

  function handleToggleCollapse() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("xs_sidebar_collapsed", String(next));
      return next;
    });
  }

  if (cargando) {
    return <div className="app-loading">Cargando XclusiveSetup CRM...</div>;
  }

  if (!autenticado) {
    return <Login />;
  }

  const paginaSolicitada = PAGE_COMPONENTS[page] ? page : DEFAULT_PAGE;
  const ActivePage = PAGE_COMPONENTS[paginaSolicitada] || Dashboard;

  return (
    <div
      className={`app app-shell app-layout ${
        sidebarCollapsed ? "app-layout--collapsed" : ""
      }`}
    >
      <Sidebar
        currentPage={paginaSolicitada}
        onNavigate={handleNavigate}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleCollapse}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      <div className="app-main-wrapper">
        <Topbar
          currentPage={paginaSolicitada}
          onNavigate={handleNavigate}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          mobileOpen={mobileSidebarOpen}
        />

        <main
          id="main-content"
          tabIndex={-1}
          className={`main page-shell page-shell--${paginaSolicitada}`}
        >
          <ActivePage />
        </main>
      </div>
    </div>
  );
}

export default App;
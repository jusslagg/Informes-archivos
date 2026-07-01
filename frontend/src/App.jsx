import {
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  LayoutDashboard,
  ListChecks,
  Menu,
  Network,
  SearchCheck,
  Table2,
} from "lucide-react";
import { Component, useState } from "react";
import DashboardPage from "./pages/DashboardPage.jsx";
import HierarchyPage from "./pages/HierarchyPage.jsx";
import QualityPage from "./pages/QualityPage.jsx";
import RequeridosPage from "./pages/RequeridosPage.jsx";
import RequeridosSummaryPage from "./pages/RequeridosSummaryPage.jsx";
import UploadPage from "./pages/UploadPage.jsx";

const pages = [
  { id: "upload", label: "Importar", icon: FileSpreadsheet, component: UploadPage },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, component: DashboardPage },
  { id: "estructura", label: "Estructura", icon: Network, component: HierarchyPage },
  { id: "requeridos", label: "Requeridos", icon: ListChecks, component: RequeridosPage, hidden: true },
  { id: "resumen-requeridos", label: "Resumen", icon: Table2, component: RequeridosSummaryPage, hidden: true },
  { id: "quality", label: "Calidad", icon: SearchCheck, component: QualityPage },
];

class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(previousProps) {
    if (previousProps.pageId !== this.props.pageId && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return <div className="alert error">No se pudo cargar esta vista: {this.state.error.message || "error inesperado"}</div>;
    }
    return this.props.children;
  }
}

export default function App() {
  const [activePage, setActivePage] = useState("upload");
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const visiblePages = pages.filter((page) => !page.hidden);
  const CurrentPage = pages.find((page) => page.id === activePage)?.component || UploadPage;

  const navigate = (pageId) => {
    setActivePage(pageId);
    setMobileMenuOpen(false);
  };

  return (
    <main className={sidebarHidden ? "app-shell sidebar-collapsed" : "app-shell"}>
      <header className="mobile-topbar">
        <button className="icon-button" onClick={() => setMobileMenuOpen(true)} title="Abrir menú">
          <Menu size={20} />
        </button>
        <div className="mobile-title">
          <strong>Análisis Nómina</strong>
          <small>Workforce intelligence</small>
        </div>
      </header>

      <button
        className="desktop-sidebar-toggle"
        onClick={() => setSidebarHidden((current) => !current)}
        title={sidebarHidden ? "Mostrar menú" : "Ocultar menú"}
      >
        {sidebarHidden ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>

      {mobileMenuOpen && <button className="sidebar-backdrop" onClick={() => setMobileMenuOpen(false)} aria-label="Cerrar menú" />}

      <aside className={mobileMenuOpen ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <span className="brand-mark">AN</span>
          <div>
            <strong>Análisis Nómina</strong>
            <small>Workforce intelligence</small>
          </div>
        </div>
        <nav className="nav-list">
          {visiblePages.map((page) => {
            const Icon = page.icon;
            return (
              <button
                key={page.id}
                className={activePage === page.id ? "nav-item active" : "nav-item"}
                onClick={() => navigate(page.id)}
                title={page.label}
              >
                <Icon size={18} />
                <span>{page.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <section className="content">
        <PageErrorBoundary pageId={activePage}>
          <CurrentPage navigate={navigate} />
        </PageErrorBoundary>
      </section>
    </main>
  );
}

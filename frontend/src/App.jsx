import {
  FileSpreadsheet,
  LayoutDashboard,
  Menu,
  SearchCheck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import DashboardPage from "./pages/DashboardPage.jsx";
import QualityPage from "./pages/QualityPage.jsx";
import UploadPage from "./pages/UploadPage.jsx";

const pages = [
  { id: "upload", label: "Importar", icon: FileSpreadsheet, component: UploadPage },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, component: DashboardPage },
  { id: "quality", label: "Calidad", icon: SearchCheck, component: QualityPage },
];

export default function App() {
  const [activePage, setActivePage] = useState("upload");
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const CurrentPage = pages.find((page) => page.id === activePage)?.component || UploadPage;

  const navigate = (pageId) => {
    setActivePage(pageId);
    setMobileMenuOpen(false);
  };

  return (
    <main className={sidebarHidden ? "app-shell sidebar-collapsed" : "app-shell"}>
      <header className="mobile-topbar">
        <button className="icon-button" onClick={() => setMobileMenuOpen(true)} title="Abrir menu">
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
        title={sidebarHidden ? "Mostrar menu" : "Ocultar menu"}
      >
        {sidebarHidden ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>

      {mobileMenuOpen && (
        <button className="sidebar-backdrop" onClick={() => setMobileMenuOpen(false)} aria-label="Cerrar menu" />
      )}

      <aside className={mobileMenuOpen ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <span className="brand-mark">AN</span>
          <div>
            <strong>Análisis Nómina</strong>
            <small>Workforce intelligence</small>
          </div>
        </div>
        <nav className="nav-list">
          {pages.map((page) => {
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
        <CurrentPage navigate={navigate} />
      </section>
    </main>
  );
}

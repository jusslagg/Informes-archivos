import { BarChart3, FileSpreadsheet, LayoutDashboard, SearchCheck } from "lucide-react";
import { useState } from "react";
import AnalysisPage from "./pages/AnalysisPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import QualityPage from "./pages/QualityPage.jsx";
import UploadPage from "./pages/UploadPage.jsx";

const pages = [
  { id: "upload", label: "Importar", icon: FileSpreadsheet, component: UploadPage },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, component: DashboardPage },
  { id: "analysis", label: "Análisis", icon: BarChart3, component: AnalysisPage },
  { id: "quality", label: "Calidad", icon: SearchCheck, component: QualityPage },
];

export default function App() {
  const [activePage, setActivePage] = useState("upload");
  const CurrentPage = pages.find((page) => page.id === activePage)?.component || UploadPage;

  return (
    <main className="app-shell">
      <aside className="sidebar">
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
                onClick={() => setActivePage(page.id)}
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
        <CurrentPage navigate={setActivePage} />
      </section>
    </main>
  );
}

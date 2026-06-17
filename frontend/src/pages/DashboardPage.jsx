import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Download,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  exportUrl,
  getBajasByMonth,
  getBajasByReason,
  getBajasByTenure,
  getBajasReasonByCampaign,
  getDatasetMetadata,
  getFilteredDashboard,
  getFilteredRecords,
  getStaffingByCampaign,
  usesBrowserData,
} from "../api/client.js";
import BajasByMonthTable from "../components/BajasByMonthTable.jsx";
import BajasReasonByCampaignTable from "../components/BajasReasonByCampaignTable.jsx";
import BajasReasonTable from "../components/BajasReasonTable.jsx";
import BajasTenureTable from "../components/BajasTenureTable.jsx";
import DataTable from "../components/DataTable.jsx";
import FilterBar, { toFilterSpecs } from "../components/FilterBar.jsx";
import StaffingRequirements from "../components/StaffingRequirements.jsx";
import { readDashboardState, saveDashboardState } from "../lib/payrollSession.js";
import { exportDashboardReport } from "../utils/reportExport.js";

const number = new Intl.NumberFormat("es-AR");

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getTopItem(rows = []) {
  return rows.find((row) => row?.name && Number(row.value) > 0) || rows[0] || null;
}

function getDashboardMode(filters = {}) {
  const estadoEntry = Object.entries(filters).find(([column]) => normalizeText(column) === "ESTADO");
  const selectedStates = (estadoEntry?.[1] || []).map(normalizeText);
  const hasActive = selectedStates.some((value) => value === "ACTIVO");
  const hasBaja = selectedStates.some((value) => value.includes("BAJA") || value.includes("INACTIVO"));

  if (hasActive && !hasBaja) return "active";
  if (hasBaja && !hasActive) return "bajas";
  return "general";
}

function ExecutiveKpi({ label, value, helper, tone = "neutral", icon: Icon = Users }) {
  const TrendIcon = tone === "danger" ? ArrowDownRight : ArrowUpRight;

  return (
    <article className={`dashboard-kpi ${tone}`}>
      <div className="dashboard-kpi-top">
        <span className="dashboard-kpi-icon">
          <Icon size={18} />
        </span>
        <TrendIcon size={17} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </article>
  );
}

function DashboardInsight({ title, value, detail, tone = "neutral" }) {
  return (
    <article className={`dashboard-insight ${tone}`}>
      <span>{title}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function ExecutiveRanking({ title, subtitle, data = [] }) {
  const visibleData = data.slice(0, 8);

  return (
    <section className="dashboard-panel">
      <header className="dashboard-panel-header">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <span>{visibleData.length} segmentos</span>
      </header>
      <div className="dashboard-ranking-chart">
        {visibleData.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={visibleData} layout="vertical" margin={{ top: 8, right: 26, left: 18, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(value) => number.format(value)} />
              <YAxis
                type="category"
                dataKey="name"
                width={132}
                tick={{ fontSize: 11, fill: "#334155", fontWeight: 700 }}
              />
              <Tooltip formatter={(value) => number.format(value)} contentStyle={{ borderRadius: 8, borderColor: "#dbe3ef" }} />
              <Bar dataKey="value" fill="#2563eb" radius={[0, 8, 8, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty-chart">Importá una nómina o ajustá los filtros para ver resultados.</div>
        )}
      </div>
    </section>
  );
}

function formatDateInput(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthRange(monthValue) {
  const [year, month] = String(monthValue || "").split("-").map(Number);
  if (!year || !month) return { start: "", end: "" };
  return {
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end: formatDateInput(new Date(year, month, 0)),
  };
}

function monthValueFromRange(dateRange = {}) {
  return String(dateRange.start || dateRange.end || "").slice(0, 7);
}

function BajasPeriodFilter({ dateRange, onDateRangeChange }) {
  const selectedMonth = monthValueFromRange(dateRange);
  const useCurrentMonth = () => {
    const today = new Date();
    onDateRangeChange(monthRange(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`));
  };

  return (
    <section className="dashboard-period-filter">
      <div>
        <strong>Periodo de bajas</strong>
        <span>Usalo para revisar bajas del mes dentro de la vista de activos.</span>
      </div>
      <div className="table-actions">
        <label className="date-field">
          <span>Mes</span>
          <input
            type="month"
            value={selectedMonth}
            onChange={(event) => onDateRangeChange(monthRange(event.target.value))}
          />
        </label>
        <label className="date-field">
          <span>Desde</span>
          <input
            type="date"
            value={dateRange.start || ""}
            onChange={(event) => onDateRangeChange({ ...dateRange, start: event.target.value })}
          />
        </label>
        <label className="date-field">
          <span>Hasta</span>
          <input
            type="date"
            value={dateRange.end || ""}
            onChange={(event) => onDateRangeChange({ ...dateRange, end: event.target.value })}
          />
        </label>
        <button className="primary-button secondary-button" onClick={useCurrentMonth}>
          Mes actual
        </button>
        <button className="primary-button secondary-button" onClick={() => onDateRangeChange({ start: "", end: "" })}>
          Limpiar
        </button>
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const savedState = useMemo(() => readDashboardState(), []);
  const [dashboard, setDashboard] = useState(() => savedState?.dashboard || null);
  const [records, setRecords] = useState(() => savedState?.records || { columns: [], rows: [], total: 0, limit: 500 });
  const [staffingRows, setStaffingRows] = useState(() => savedState?.staffingRows || []);
  const [bajasByMonth, setBajasByMonth] = useState(() => savedState?.bajasByMonth || { months: [], rows: [], totals: {} });
  const [bajasByTenure, setBajasByTenure] = useState(() => savedState?.bajasByTenure || { rows: [], total: 0 });
  const [bajasByReason, setBajasByReason] = useState(() => savedState?.bajasByReason || { rows: [], total: 0 });
  const [bajasReasonByCampaign, setBajasReasonByCampaign] = useState(
    () => savedState?.bajasReasonByCampaign || { reasons: [], rows: [], totals: {} },
  );
  const [bajasDateRange, setBajasDateRange] = useState(() => savedState?.bajasDateRange || { start: "", end: "" });
  const [metadata, setMetadata] = useState(() => savedState?.metadata || []);
  const [filters, setFilters] = useState(() => savedState?.filters || {});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadDashboard = async (nextFilters = filters, nextBajasDateRange = bajasDateRange) => {
    setLoading(true);
    setError("");
    try {
      const filterSpecs = toFilterSpecs(nextFilters);
      const [
        dashboardResponse,
        recordsResponse,
        staffingResponse,
        bajasResponse,
        tenureResponse,
        reasonResponse,
        reasonByCampaignResponse,
      ] = await Promise.all([
        getFilteredDashboard(filterSpecs),
        getFilteredRecords(filterSpecs),
        getStaffingByCampaign(filterSpecs),
        getBajasByMonth(filterSpecs, nextBajasDateRange),
        getBajasByTenure(filterSpecs, nextBajasDateRange),
        getBajasByReason(filterSpecs, nextBajasDateRange),
        getBajasReasonByCampaign(filterSpecs, nextBajasDateRange),
      ]);
      setDashboard(dashboardResponse);
      setRecords(recordsResponse);
      setStaffingRows(staffingResponse.rows || []);
      setBajasByMonth(bajasResponse);
      setBajasByTenure(tenureResponse);
      setBajasByReason(reasonResponse);
      setBajasReasonByCampaign(reasonByCampaignResponse);
      saveDashboardState({
        dashboard: dashboardResponse,
        records: recordsResponse,
        staffingRows: staffingResponse.rows || [],
        bajasByMonth: bajasResponse,
        bajasByTenure: tenureResponse,
        bajasByReason: reasonResponse,
        bajasReasonByCampaign: reasonByCampaignResponse,
        bajasDateRange: nextBajasDateRange,
        metadata,
        filters: nextFilters,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getDatasetMetadata()
      .then((response) => setMetadata(response.columns || []))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!dashboard) return;
    saveDashboardState({
      dashboard,
      records,
      staffingRows,
      bajasByMonth,
      bajasByTenure,
      bajasByReason,
      bajasReasonByCampaign,
      bajasDateRange,
      metadata,
      filters,
    });
  }, [
    dashboard,
    records,
    staffingRows,
    bajasByMonth,
    bajasByTenure,
    bajasByReason,
    bajasReasonByCampaign,
    bajasDateRange,
    metadata,
    filters,
  ]);

  useEffect(() => {
    loadDashboard(filters, bajasDateRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters), JSON.stringify(bajasDateRange)]);

  if (error) return <div className="alert error">{error}</div>;
  if (!dashboard) return <div className="panel">Cargando dashboard...</div>;

  const { metrics, charts } = dashboard;
  const activeRate = metrics.total_empleados
    ? Math.round((metrics.activos / metrics.total_empleados) * 100)
    : 0;
  const topArea = getTopItem(charts.empleados_por_area);
  const topClient = getTopItem(charts.empleados_por_cliente);
  const topCampaign = getTopItem(charts.empleados_por_campana);
  const topReason = getTopItem(bajasByReason.rows);
  const dashboardMode = getDashboardMode(filters);
  const isActiveMode = dashboardMode === "active";
  const isBajasMode = dashboardMode === "bajas";
  const viewCopy = {
    active: {
      label: "Vista activos",
      detail: "Mostrando dotación, distribución y detalle de personas activas. Se ocultan los bloques de bajas.",
    },
    bajas: {
      label: "Vista bajas",
      detail: "Mostrando rotación, motivos, antigüedad y detalle de bajas. Se ocultan los bloques de dotación activa.",
    },
    general: {
      label: "Vista general",
      detail: "Mostrando activos, bajas, dotación y detalle según los filtros aplicados.",
    },
  }[dashboardMode];
  const reportData = {
    activeRate,
    bajasByMonth,
    bajasByReason,
    bajasByTenure,
    bajasDateRange,
    bajasReasonByCampaign,
    charts,
    filters,
    metrics,
    records,
    staffingRows,
  };

  return (
    <div className="page-stack dashboard-page">
      <header className="page-header dashboard-hero">
        <div>
          <p>Dashboard</p>
          <h1>Resumen de nómina</h1>
          <span>
            Lectura ejecutiva de la nómina importada, con filtros vivos y detalle operativo sin perder trazabilidad.
          </span>
        </div>
        <div className="header-actions">
          <button className="icon-button" onClick={() => loadDashboard()} title="Actualizar" disabled={loading}>
            <RefreshCw size={18} />
          </button>
          <button className="icon-button" onClick={() => exportDashboardReport("word", reportData)} title="Informe Word">
            <FileText size={18} />
          </button>
          <button
            className="icon-button"
            onClick={() => exportDashboardReport("excel", reportData)}
            title="Informe Excel"
          >
            <FileSpreadsheet size={18} />
          </button>
          {!usesBrowserData && (
            <a className="icon-button" href={exportUrl()} title="Exportar Excel">
              <Download size={18} />
            </a>
          )}
        </div>
      </header>

      <FilterBar
        metadata={metadata}
        filters={filters}
        loading={loading}
        showAnalysisControls={false}
        onFiltersChange={setFilters}
      />

      <section className={`dashboard-mode-banner ${dashboardMode}`}>
        <strong>{viewCopy.label}</strong>
        <span>{viewCopy.detail}</span>
      </section>

      {isActiveMode && (
        <BajasPeriodFilter dateRange={bajasDateRange} onDateRangeChange={setBajasDateRange} />
      )}

      <section className="dashboard-kpi-grid">
        <ExecutiveKpi label="Total empleados" value={number.format(metrics.total_empleados)} helper="Registros importados filtrados" />
        {!isBajasMode && (
          <ExecutiveKpi label="Activos" value={number.format(metrics.activos)} helper={`${activeRate}% de la base`} tone="success" />
        )}
        {!isActiveMode && (
          <ExecutiveKpi label="Bajas del mes" value={number.format(metrics.bajas_del_mes || 0)} helper="Impacto del periodo" tone="danger" icon={AlertTriangle} />
        )}
        {!isBajasMode && <ExecutiveKpi label="Altas del mes" value={number.format(metrics.altas_del_mes)} helper="Ingresos detectados" />}
        {!isBajasMode && (
          <ExecutiveKpi label="Carga horaria total" value={number.format(metrics.carga_horaria_total)} helper="Suma desde el archivo importado" />
        )}
        {!isBajasMode && (
          <ExecutiveKpi label="Tasa activos" value={`${activeRate}%`} helper="Activos sobre total" tone={activeRate >= 90 ? "success" : "warning"} />
        )}
      </section>

      <section className="dashboard-insight-grid">
        <DashboardInsight
          title="Mayor concentración"
          value={topClient?.name || "Sin datos"}
          detail={topClient ? `${number.format(topClient.value)} empleados en el cliente líder.` : "Importá o filtrá una nómina para calcularlo."}
          tone="success"
        />
        <DashboardInsight
          title="Área principal"
          value={topArea?.name || "Sin datos"}
          detail={topArea ? `${number.format(topArea.value)} personas concentradas en esta área.` : "Sin registros visibles."}
        />
        <DashboardInsight
          title={isBajasMode ? "Campaña con más bajas" : "Campaña crítica"}
          value={topCampaign?.name || "Sin datos"}
          detail={topCampaign ? `${number.format(topCampaign.value)} registros asociados.` : "No hay campañas para mostrar."}
        />
        {!isActiveMode && (
          <DashboardInsight
            title="Motivo de baja frecuente"
            value={topReason?.name || "Sin datos"}
            detail={topReason ? `${number.format(topReason.value)} bajas registradas con este motivo.` : "No hay bajas en el rango."}
            tone={topReason ? "warning" : "neutral"}
          />
        )}
      </section>

      <section className="dashboard-main-grid">
        <ExecutiveRanking title="Ranking por cliente" subtitle="Clientes con mayor dotación visible" data={charts.empleados_por_cliente} />
        <ExecutiveRanking title="Ranking por campaña" subtitle="Campañas con mayor volumen operativo" data={charts.empleados_por_campana} />
        <ExecutiveRanking title="Ranking por área" subtitle="Distribución por área del archivo importado" data={charts.empleados_por_area} />
        <ExecutiveRanking title="Modalidad" subtitle="Composición de contratación/modalidad" data={charts.empleados_por_modalidad} />
      </section>

      {!isActiveMode && (
        <>
          <BajasByMonthTable
            months={bajasByMonth.months}
            rows={bajasByMonth.rows}
            totals={bajasByMonth.totals}
            dateRange={bajasDateRange}
            onDateRangeChange={setBajasDateRange}
          />

          <section className="split-table-grid">
            <BajasTenureTable rows={bajasByTenure.rows} total={bajasByTenure.total} dateRange={bajasDateRange} />
            <BajasReasonTable rows={bajasByReason.rows} total={bajasByReason.total} dateRange={bajasDateRange} />
          </section>

          <BajasReasonByCampaignTable
            reasons={bajasReasonByCampaign.reasons}
            rows={bajasReasonByCampaign.rows}
            totals={bajasReasonByCampaign.totals}
            dateRange={bajasDateRange}
          />
        </>
      )}

      {!isBajasMode && (
        <StaffingRequirements
          staffingRows={staffingRows}
          bajasByMonth={bajasByMonth}
          bajasDateRange={bajasDateRange}
          filters={filters}
        />
      )}

      <DataTable
        columns={records.columns}
        rows={records.rows}
        title={`Detalle de la selección (${number.format(records.total)} registro${
          records.total === 1 ? "" : "s"
        })`}
        subtitle={
          records.total > records.limit
            ? `Mostrando los primeros ${number.format(records.limit)} registros filtrados`
            : "Mostrando todos los registros filtrados"
        }
      />
    </div>
  );
}

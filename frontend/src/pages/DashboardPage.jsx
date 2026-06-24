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
  getBajasTenureByMonth,
  getBajasReasonByCampaign,
  getBajasReasonByTenure,
  getDatasetMetadata,
  getFilterOptions,
  getFilteredDashboard,
  getFilteredRecords,
  getStaffingByCampaign,
  usesBrowserData,
} from "../api/client.js";
import BajasByMonthTable from "../components/BajasByMonthTable.jsx";
import BajasReasonByCampaignTable from "../components/BajasReasonByCampaignTable.jsx";
import BajasReasonTable from "../components/BajasReasonTable.jsx";
import BajasReasonTenureExplorer from "../components/BajasReasonTenureExplorer.jsx";
import BajasTableFilters from "../components/BajasTableFilters.jsx";
import BajasTenureByMonthTable from "../components/BajasTenureByMonthTable.jsx";
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

function rowCampaign(row = {}) {
  const direct = row["CAMPAÑA"] || row.CAMPANA || row["Campaña"] || row.campana;
  if (direct) return direct;
  const entry = Object.entries(row).find(([key, value]) => {
    const normalizedKey = normalizeText(key);
    return value && normalizedKey.includes("CAMPA") && !normalizedKey.includes("SUB");
  });
  return entry?.[1] || "";
}

function campaignMetaFromColumns(columns = []) {
  return columns.find((item) => {
    const normalized = normalizeText(item.name);
    return normalized.includes("CAMPA") && !normalized.includes("SUB");
  });
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
          <div className="empty-chart">ImportÃ¡ una nÃ³mina o ajustÃ¡ los filtros para ver resultados.</div>
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
  const [bajasTenureByMonth, setBajasTenureByMonth] = useState(
    () => savedState?.bajasTenureByMonth || { months: [], rows: [], totals: {} },
  );
  const [bajasByReason, setBajasByReason] = useState(() => savedState?.bajasByReason || { rows: [], total: 0 });
  const [bajasReasonByCampaign, setBajasReasonByCampaign] = useState(
    () => savedState?.bajasReasonByCampaign || { reasons: [], rows: [], totals: {} },
  );
  const [bajasReasonByTenure, setBajasReasonByTenure] = useState(
    () => savedState?.bajasReasonByTenure || { reasons: [], rows: [], totals: {} },
  );
  const [bajasDateRange, setBajasDateRange] = useState(() => savedState?.bajasDateRange || { start: "", end: "" });
  const defaultTableFilter = { dateRange: savedState?.bajasDateRange || { start: "", end: "" }, campaigns: [] };
  const [monthTableFilter, setMonthTableFilter] = useState(() => savedState?.monthTableFilter || defaultTableFilter);
  const [tenureTableFilter, setTenureTableFilter] = useState(() => savedState?.tenureTableFilter || defaultTableFilter);
  const [tenureMonthTableFilter, setTenureMonthTableFilter] = useState(
    () => savedState?.tenureMonthTableFilter || defaultTableFilter,
  );
  const [reasonTableFilter, setReasonTableFilter] = useState(() => savedState?.reasonTableFilter || defaultTableFilter);
  const [reasonTenureTableFilter, setReasonTenureTableFilter] = useState(
    () => savedState?.reasonTenureTableFilter || defaultTableFilter,
  );
  const [reasonCampaignTableFilter, setReasonCampaignTableFilter] = useState(
    () => savedState?.reasonCampaignTableFilter || defaultTableFilter,
  );
  const [metadata, setMetadata] = useState(() => savedState?.metadata || []);
  const [scopedCampaignOptions, setScopedCampaignOptions] = useState(() => savedState?.scopedCampaignOptions || []);
  const [campaignColumnName, setCampaignColumnName] = useState(() => savedState?.campaignColumnName || "CAMPAÑA");
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
        tenureByMonthResponse,
        reasonResponse,
        reasonByCampaignResponse,
        reasonByTenureResponse,
      ] = await Promise.all([
        getFilteredDashboard(filterSpecs),
        getFilteredRecords(filterSpecs),
        getStaffingByCampaign(filterSpecs),
        getBajasByMonth(filterSpecs, nextBajasDateRange),
        getBajasByTenure(filterSpecs, nextBajasDateRange),
        getBajasTenureByMonth(filterSpecs, nextBajasDateRange),
        getBajasByReason(filterSpecs, nextBajasDateRange),
        getBajasReasonByCampaign(filterSpecs, nextBajasDateRange),
        getBajasReasonByTenure(filterSpecs, nextBajasDateRange),
      ]);
      setDashboard(dashboardResponse);
      setRecords(recordsResponse);
      setStaffingRows(staffingResponse.rows || []);
      setBajasByMonth(bajasResponse);
      setBajasByTenure(tenureResponse);
      setBajasTenureByMonth(tenureByMonthResponse);
      setBajasByReason(reasonResponse);
      setBajasReasonByCampaign(reasonByCampaignResponse);
      setBajasReasonByTenure(reasonByTenureResponse);
      saveDashboardState({
        dashboard: dashboardResponse,
        records: recordsResponse,
        staffingRows: staffingResponse.rows || [],
        bajasByMonth: bajasResponse,
        bajasByTenure: tenureResponse,
        bajasTenureByMonth: tenureByMonthResponse,
        bajasByReason: reasonResponse,
        bajasReasonByCampaign: reasonByCampaignResponse,
        bajasReasonByTenure: reasonByTenureResponse,
        bajasDateRange: nextBajasDateRange,
        monthTableFilter,
        tenureTableFilter,
        tenureMonthTableFilter,
        reasonTableFilter,
        reasonTenureTableFilter,
        reasonCampaignTableFilter,
        metadata,
        scopedCampaignOptions,
        campaignColumnName,
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

  const campaignOptions = useMemo(() => scopedCampaignOptions, [scopedCampaignOptions]);
  const baseFilterKey = JSON.stringify(filters);
  const tableFilterSpecs = (tableFilter) => {
    const specs = toFilterSpecs(filters);
    if (tableFilter.campaigns?.length) specs.push({ column: campaignColumnName, values: tableFilter.campaigns });
    return specs;
  };

  const renderTableFilters = (tableFilter, setTableFilter) => (
    <BajasTableFilters
      campaignOptions={campaignOptions}
      selectedCampaigns={tableFilter.campaigns || []}
      dateRange={tableFilter.dateRange || { start: "", end: "" }}
      onCampaignsChange={(campaigns) => setTableFilter((current) => ({ ...current, campaigns }))}
      onDateRangeChange={(dateRange) => setTableFilter((current) => ({ ...current, dateRange }))}
    />
  );

  useEffect(() => {
    getFilterOptions(toFilterSpecs(filters))
      .then((response) => {
        const campaignMeta = campaignMetaFromColumns(response.columns || []);
        setCampaignColumnName(campaignMeta?.name || "CAMPAÑA");
        setScopedCampaignOptions(
          [...(campaignMeta?.values || [])]
            .filter((value) => value && value !== "Sin dato")
            .sort((a, b) => String(a).localeCompare(String(b))),
        );
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseFilterKey]);

  useEffect(() => {
    const allowed = new Set(campaignOptions);
    const prune = (setTableFilter) => {
      setTableFilter((current) => {
        const nextCampaigns = (current.campaigns || []).filter((campaign) => allowed.has(campaign));
        return nextCampaigns.length === (current.campaigns || []).length ? current : { ...current, campaigns: nextCampaigns };
      });
    };
    prune(setMonthTableFilter);
    prune(setTenureTableFilter);
    prune(setTenureMonthTableFilter);
    prune(setReasonTableFilter);
    prune(setReasonTenureTableFilter);
    prune(setReasonCampaignTableFilter);
  }, [campaignOptions]);

  useEffect(() => {
    getBajasByMonth(tableFilterSpecs(monthTableFilter), monthTableFilter.dateRange)
      .then(setBajasByMonth)
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseFilterKey, JSON.stringify(monthTableFilter)]);

  useEffect(() => {
    getBajasByTenure(tableFilterSpecs(tenureTableFilter), tenureTableFilter.dateRange)
      .then(setBajasByTenure)
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseFilterKey, JSON.stringify(tenureTableFilter)]);

  useEffect(() => {
    getBajasTenureByMonth(tableFilterSpecs(tenureMonthTableFilter), tenureMonthTableFilter.dateRange)
      .then(setBajasTenureByMonth)
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseFilterKey, JSON.stringify(tenureMonthTableFilter)]);

  useEffect(() => {
    getBajasByReason(tableFilterSpecs(reasonTableFilter), reasonTableFilter.dateRange)
      .then(setBajasByReason)
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseFilterKey, JSON.stringify(reasonTableFilter)]);

  useEffect(() => {
    getBajasReasonByTenure(tableFilterSpecs(reasonTenureTableFilter), reasonTenureTableFilter.dateRange)
      .then(setBajasReasonByTenure)
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseFilterKey, JSON.stringify(reasonTenureTableFilter)]);

  useEffect(() => {
    getBajasReasonByCampaign(tableFilterSpecs(reasonCampaignTableFilter), reasonCampaignTableFilter.dateRange)
      .then(setBajasReasonByCampaign)
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseFilterKey, JSON.stringify(reasonCampaignTableFilter)]);

  useEffect(() => {
    if (!dashboard) return;
    saveDashboardState({
      dashboard,
      records,
      staffingRows,
      bajasByMonth,
      bajasByTenure,
      bajasTenureByMonth,
      bajasByReason,
      bajasReasonByCampaign,
      bajasReasonByTenure,
      bajasDateRange,
      monthTableFilter,
      tenureTableFilter,
      tenureMonthTableFilter,
      reasonTableFilter,
      reasonTenureTableFilter,
      reasonCampaignTableFilter,
      metadata,
      scopedCampaignOptions,
      campaignColumnName,
      filters,
    });
  }, [
    dashboard,
    records,
    staffingRows,
    bajasByMonth,
    bajasByTenure,
    bajasTenureByMonth,
    bajasByReason,
    bajasReasonByCampaign,
    bajasReasonByTenure,
    bajasDateRange,
    monthTableFilter,
    tenureTableFilter,
    tenureMonthTableFilter,
    reasonTableFilter,
    reasonTenureTableFilter,
    reasonCampaignTableFilter,
    metadata,
    scopedCampaignOptions,
    campaignColumnName,
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
      detail: "Mostrando dotaciÃ³n, distribuciÃ³n y detalle de personas activas. Se ocultan los bloques de bajas.",
    },
    bajas: {
      label: "Vista bajas",
      detail: "Mostrando rotaciÃ³n, motivos, antigÃ¼edad y detalle de bajas. Se ocultan los bloques de dotaciÃ³n activa.",
    },
    general: {
      label: "Vista general",
      detail: "Mostrando activos, bajas, dotaciÃ³n y detalle segÃºn los filtros aplicados.",
    },
  }[dashboardMode];
  const reportData = {
    activeRate,
    bajasByMonth,
    bajasByReason,
    bajasByTenure,
    bajasDateRange,
    bajasReasonByCampaign,
    bajasReasonByTenure,
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
          <h1>Resumen de nÃ³mina</h1>
          <span>
            Lectura ejecutiva de la nÃ³mina importada, con filtros vivos y detalle operativo sin perder trazabilidad.
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
          title="Mayor concentraciÃ³n"
          value={topClient?.name || "Sin datos"}
          detail={topClient ? `${number.format(topClient.value)} empleados en el cliente lÃ­der.` : "ImportÃ¡ o filtrÃ¡ una nÃ³mina para calcularlo."}
          tone="success"
        />
        <DashboardInsight
          title="Ãrea principal"
          value={topArea?.name || "Sin datos"}
          detail={topArea ? `${number.format(topArea.value)} personas concentradas en esta Ã¡rea.` : "Sin registros visibles."}
        />
        <DashboardInsight
          title={isBajasMode ? "CampaÃ±a con mÃ¡s bajas" : "CampaÃ±a crÃ­tica"}
          value={topCampaign?.name || "Sin datos"}
          detail={topCampaign ? `${number.format(topCampaign.value)} registros asociados.` : "No hay campaÃ±as para mostrar."}
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
        <ExecutiveRanking title="Ranking por cliente" subtitle="Clientes con mayor dotaciÃ³n visible" data={charts.empleados_por_cliente} />
        <ExecutiveRanking title="Ranking por campaÃ±a" subtitle="CampaÃ±as con mayor volumen operativo" data={charts.empleados_por_campana} />
        <ExecutiveRanking title="Ranking por Ã¡rea" subtitle="DistribuciÃ³n por Ã¡rea del archivo importado" data={charts.empleados_por_area} />
        <ExecutiveRanking title="Modalidad" subtitle="ComposiciÃ³n de contrataciÃ³n/modalidad" data={charts.empleados_por_modalidad} />
      </section>

      {!isActiveMode && (
        <>
          <BajasByMonthTable
            months={bajasByMonth.months}
            rows={bajasByMonth.rows}
            totals={bajasByMonth.totals}
            hourRows={bajasByMonth.hourRows}
            hourTotals={bajasByMonth.hourTotals}
            hourEvents={bajasByMonth.hourEvents}
            holidayDates={bajasByMonth.holidayDates}
            hoursPerBusinessDay={bajasByMonth.hoursPerBusinessDay}
            dateRange={monthTableFilter.dateRange}
            onDateRangeChange={(dateRange) => setMonthTableFilter((current) => ({ ...current, dateRange }))}
            filterControl={renderTableFilters(monthTableFilter, setMonthTableFilter)}
          />

          <section className="split-table-grid">
            <BajasTenureTable
              rows={bajasByTenure.rows}
              total={bajasByTenure.total}
              dateRange={tenureTableFilter.dateRange}
              filterControl={renderTableFilters(tenureTableFilter, setTenureTableFilter)}
            />
            <BajasReasonTable
              rows={bajasByReason.rows}
              total={bajasByReason.total}
              dateRange={reasonTableFilter.dateRange}
              filterControl={renderTableFilters(reasonTableFilter, setReasonTableFilter)}
            />
          </section>

          <BajasTenureByMonthTable
            months={bajasTenureByMonth.months}
            rows={bajasTenureByMonth.rows}
            totals={bajasTenureByMonth.totals}
            dateRange={tenureMonthTableFilter.dateRange}
            filterControl={renderTableFilters(tenureMonthTableFilter, setTenureMonthTableFilter)}
          />

          <BajasReasonTenureExplorer
            reasons={bajasReasonByTenure.reasons}
            rows={bajasReasonByTenure.rows}
            totals={bajasReasonByTenure.totals}
            campaigns={bajasReasonByTenure.campaigns}
            byCampaign={bajasReasonByTenure.byCampaign}
            dateRange={reasonTenureTableFilter.dateRange}
            filterControl={renderTableFilters(reasonTenureTableFilter, setReasonTenureTableFilter)}
          />

          <BajasReasonByCampaignTable
            reasons={bajasReasonByCampaign.reasons}
            rows={bajasReasonByCampaign.rows}
            totals={bajasReasonByCampaign.totals}
            dateRange={reasonCampaignTableFilter.dateRange}
            filterControl={renderTableFilters(reasonCampaignTableFilter, setReasonCampaignTableFilter)}
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
        title={`Detalle de la selecciÃ³n (${number.format(records.total)} registro${
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

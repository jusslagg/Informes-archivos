import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BookOpenText,
  Download,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  exportUrl,
  getBajasByMonth,
  getBajasByOwnerMonth,
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
import BajasOwnerByMonthTable from "../components/BajasOwnerByMonthTable.jsx";
import BajasReasonByCampaignTable from "../components/BajasReasonByCampaignTable.jsx";
import BajasReasonTable from "../components/BajasReasonTable.jsx";
import BajasReasonTenureExplorer from "../components/BajasReasonTenureExplorer.jsx";
import BajasTableFilters from "../components/BajasTableFilters.jsx";
import BajasTenureByMonthTable from "../components/BajasTenureByMonthTable.jsx";
import BajasTenureTable from "../components/BajasTenureTable.jsx";
import BajasWeeklyTable from "../components/BajasWeeklyTable.jsx";
import DataTable from "../components/DataTable.jsx";
import FilterBar, { toFilterSpecs } from "../components/FilterBar.jsx";
import StaffingRequirements from "../components/StaffingRequirements.jsx";
import { readDashboardState, saveDashboardState } from "../lib/payrollSession.js";
import { exportDashboardReport } from "../utils/reportExport.js";

const number = new Intl.NumberFormat("es-AR");
const dashboardGuideUrl = `${import.meta.env.BASE_URL}guia_usuario_dashboard.pdf`;

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

function campaignOptionsFromColumns(columns = []) {
  const campaignMeta = campaignMetaFromColumns(columns);
  return [...(campaignMeta?.values || [])]
    .filter((value) => value && value !== "Sin dato")
    .sort((a, b) => String(a).localeCompare(String(b)));
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

function currentMonthValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
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
  const [bajasByWeek, setBajasByWeek] = useState(() => savedState?.bajasByWeek || { hourEvents: [] });
  const [weeklyMonth, setWeeklyMonth] = useState(() => savedState?.weeklyMonth || currentMonthValue());
  const [bajasByOwnerMonth, setBajasByOwnerMonth] = useState(
    () => savedState?.bajasByOwnerMonth || { months: [], leader: { rows: [], totals: {} }, supervisor: { rows: [], totals: {} } },
  );
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
  const [ownerMonthTableFilter, setOwnerMonthTableFilter] = useState(
    () => savedState?.ownerMonthTableFilter || defaultTableFilter,
  );
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
      ] = await Promise.all([
        getFilteredDashboard(filterSpecs),
        getFilteredRecords(filterSpecs),
        getStaffingByCampaign(filterSpecs),
      ]);
      setDashboard(dashboardResponse);
      setRecords(recordsResponse);
      setStaffingRows(staffingResponse.rows || []);
      saveDashboardState({
        dashboard: dashboardResponse,
        records: recordsResponse,
        staffingRows: staffingResponse.rows || [],
        bajasByMonth,
        bajasByWeek,
        weeklyMonth,
        bajasByOwnerMonth,
        bajasByTenure,
        bajasTenureByMonth,
        bajasByReason,
        bajasReasonByCampaign,
        bajasReasonByTenure,
        bajasDateRange: nextBajasDateRange,
        monthTableFilter,
        ownerMonthTableFilter,
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

  const campaignOptions = useMemo(
    () => (scopedCampaignOptions.length ? scopedCampaignOptions : campaignOptionsFromColumns(metadata)),
    [metadata, scopedCampaignOptions],
  );
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
        setScopedCampaignOptions(campaignOptionsFromColumns(response.columns || []));
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
    prune(setOwnerMonthTableFilter);
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
    getBajasByMonth(toFilterSpecs(filters), monthRange(weeklyMonth))
      .then(setBajasByWeek)
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseFilterKey, weeklyMonth]);

  useEffect(() => {
    getBajasByOwnerMonth(tableFilterSpecs(ownerMonthTableFilter), ownerMonthTableFilter.dateRange)
      .then(setBajasByOwnerMonth)
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseFilterKey, JSON.stringify(ownerMonthTableFilter)]);

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
      bajasByWeek,
      weeklyMonth,
      bajasByOwnerMonth,
      bajasByTenure,
      bajasTenureByMonth,
      bajasByReason,
      bajasReasonByCampaign,
      bajasReasonByTenure,
      bajasDateRange,
      monthTableFilter,
      ownerMonthTableFilter,
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
    bajasByWeek,
    weeklyMonth,
    bajasByOwnerMonth,
    bajasByTenure,
    bajasTenureByMonth,
    bajasByReason,
    bajasReasonByCampaign,
    bajasReasonByTenure,
    bajasDateRange,
    monthTableFilter,
    ownerMonthTableFilter,
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
          <h1>Resumen de nómina</h1>
          <span>
            Lectura ejecutiva de la nómina importada, con filtros vivos y detalle operativo sin perder trazabilidad.
          </span>
        </div>
        <div className="header-actions">
          <a className="primary-button secondary-button dashboard-guide-button" href={dashboardGuideUrl} download>
            <BookOpenText size={18} />
            Guía PDF
          </a>
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

          <BajasWeeklyTable
            month={weeklyMonth}
            events={bajasByWeek.hourEvents || []}
            onMonthChange={setWeeklyMonth}
          />

          <BajasOwnerByMonthTable
            months={bajasByOwnerMonth.months}
            leader={bajasByOwnerMonth.leader}
            supervisor={bajasByOwnerMonth.supervisor}
            dateRange={ownerMonthTableFilter.dateRange}
            filterControl={renderTableFilters(ownerMonthTableFilter, setOwnerMonthTableFilter)}
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

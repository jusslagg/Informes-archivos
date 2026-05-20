import { Download, FileSpreadsheet, FileText, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
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
import ChartBox from "../components/ChartBox.jsx";
import DataTable from "../components/DataTable.jsx";
import FilterBar, { toFilterSpecs } from "../components/FilterBar.jsx";
import MetricCard from "../components/MetricCard.jsx";
import StaffingRequirements from "../components/StaffingRequirements.jsx";
import { exportDashboardReport } from "../utils/reportExport.js";

const number = new Intl.NumberFormat("es-AR");

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState(null);
  const [records, setRecords] = useState({ columns: [], rows: [], total: 0, limit: 500 });
  const [staffingRows, setStaffingRows] = useState([]);
  const [bajasByMonth, setBajasByMonth] = useState({ months: [], rows: [], totals: {} });
  const [bajasByTenure, setBajasByTenure] = useState({ rows: [], total: 0 });
  const [bajasByReason, setBajasByReason] = useState({ rows: [], total: 0 });
  const [bajasReasonByCampaign, setBajasReasonByCampaign] = useState({ reasons: [], rows: [], totals: {} });
  const [bajasDateRange, setBajasDateRange] = useState({ start: "", end: "" });
  const [metadata, setMetadata] = useState([]);
  const [filters, setFilters] = useState({});
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
    loadDashboard(filters, bajasDateRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters), JSON.stringify(bajasDateRange)]);

  if (error) return <div className="alert error">{error}</div>;
  if (!dashboard) return <div className="panel">Cargando dashboard...</div>;

  const { metrics, charts } = dashboard;
  const activeRate = metrics.total_empleados
    ? Math.round((metrics.activos / metrics.total_empleados) * 100)
    : 0;
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
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p>Dashboard</p>
          <h1>Resumen de nómina</h1>
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

      <section className="metric-grid">
        <MetricCard label="Total empleados" value={number.format(metrics.total_empleados)} />
        <MetricCard label="Activos" value={number.format(metrics.activos)} tone="success" />
        <MetricCard label="Bajas del mes" value={number.format(metrics.bajas_del_mes || 0)} tone="danger" />
        <MetricCard label="Altas del mes" value={number.format(metrics.altas_del_mes)} />
        <MetricCard label="Tasa activos" value={`${activeRate}%`} />
        <MetricCard label="Carga horaria total" value={number.format(metrics.carga_horaria_total)} />
      </section>

      <section className="chart-grid">
        <ChartBox title="Empleados por área" data={charts.empleados_por_area} />
        <ChartBox title="Empleados por cliente" data={charts.empleados_por_cliente} />
        <ChartBox title="Empleados por campaña" data={charts.empleados_por_campana} />
        <ChartBox title="Empleados por modalidad" data={charts.empleados_por_modalidad} />
      </section>

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

      <StaffingRequirements staffingRows={staffingRows} bajasByMonth={bajasByMonth} />

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

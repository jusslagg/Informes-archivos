import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getDatasetMetadata, runDynamicAnalysis } from "../api/client.js";
import ChartBox from "../components/ChartBox.jsx";
import DataTable from "../components/DataTable.jsx";
import FilterBar, { toFilterSpecs } from "../components/FilterBar.jsx";
import MetricCard from "../components/MetricCard.jsx";

const number = new Intl.NumberFormat("es-AR");
const currency = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

const METRIC_FORMATTERS = {
  count: number.format,
  hours_sum: number.format,
  salary_sum: currency.format,
  salary_avg: currency.format,
};

function formatMetric(metric, value) {
  return (METRIC_FORMATTERS[metric] || number.format)(Number(value || 0));
}

export default function AnalysisPage() {
  const [metadata, setMetadata] = useState([]);
  const [dimensions, setDimensions] = useState(["ÁREA"]);
  const [metric, setMetric] = useState("count");
  const [filters, setFilters] = useState({});
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [topN, setTopN] = useState(15);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getDatasetMetadata()
      .then((response) => setMetadata(response.columns || []))
      .catch((err) => setError(err.message));
  }, []);

  const run = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await runDynamicAnalysis({
        dimensions,
        metric,
        filters: toFilterSpecs(filters),
      });
      setRows(response.rows || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensions.join("|"), metric, JSON.stringify(filters)]);

  const visibleRows = useMemo(() => {
    const text = search.toLowerCase();
    return rows
      .filter((row) => dimensions.some((dimension) => String(row[dimension] || "").toLowerCase().includes(text)))
      .slice(0, topN);
  }, [dimensions, rows, search, topN]);

  const total = visibleRows.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const maxRow = visibleRows[0];
  const tableRows = visibleRows.map((row) => ({
    ...row,
    value: formatMetric(metric, row.value),
    participacion: total ? `${((Number(row.value) / total) * 100).toFixed(1)}%` : "0%",
  }));

  const chartData = visibleRows.map((row) => ({
    name: dimensions.map((dimension) => row[dimension]).filter(Boolean).join(" / "),
    value: Number(row.value || 0),
  }));

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p>Análisis dinámico</p>
          <h1>Cruces de nómina</h1>
        </div>
        <label className="search-field page-search">
          <Search size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar en resultados"
          />
        </label>
      </header>

      <FilterBar
        dimensions={dimensions}
        metric={metric}
        metadata={metadata}
        filters={filters}
        loading={loading}
        onDimensionsChange={setDimensions}
        onMetricChange={setMetric}
        onFiltersChange={setFilters}
        onRun={run}
      />

      {error && <div className="alert error">{error}</div>}

      <section className="metric-grid">
        <MetricCard label="Segmentos" value={number.format(visibleRows.length)} />
        <MetricCard label="Total visible" value={formatMetric(metric, total)} />
        <MetricCard label="Mayor segmento" value={maxRow ? formatMetric(metric, maxRow.value) : "0"} />
        <div className="range-control">
          <span>Top resultados</span>
          <strong>{topN}</strong>
          <input
            type="range"
            min="5"
            max="50"
            step="5"
            value={topN}
            onChange={(event) => setTopN(Number(event.target.value))}
          />
        </div>
      </section>

      <ChartBox title="Resultado del cruce" data={chartData} formatter={(value) => formatMetric(metric, value)} />
      <DataTable columns={[...dimensions, "value", "participacion"]} rows={tableRows} title="Detalle" />
    </div>
  );
}

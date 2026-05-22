import { Play, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";

const DEFAULT_DIMENSIONS = ["\u00c1REA", "CLIENTE", "CAMPA\u00d1A", "MODALIDAD DE CONTRATACI\u00d3N"];
const FILTER_COLUMNS = [
  "ESTADO",
  "MOTIVO BAJA",
  "\u00c1REA",
  "CLIENTE",
  "CAMPA\u00d1A",
  "MODALIDAD DE CONTRATACI\u00d3N",
  "PUESTO",
  "LOCALIDAD",
  "SITIO",
  "PRESENCIALIDAD",
  "EMPLEADOR",
];

const METRICS = [
  { value: "count", label: "Cantidad" },
  { value: "salary_sum", label: "Salario total" },
  { value: "salary_avg", label: "Salario promedio" },
  { value: "hours_sum", label: "Carga horaria total" },
];

function normalizeColumnName(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function availableColumns(metadata = [], wantedColumns = FILTER_COLUMNS) {
  return wantedColumns
    .map((column) => metadata.find((item) => normalizeColumnName(item.name) === normalizeColumnName(column)))
    .filter(Boolean)
    .map((column) => ({ ...column, values: column.values?.filter(Boolean) || [] }));
}

export function toFilterSpecs(filters) {
  return Object.entries(filters)
    .filter(([, values]) => values.length)
    .map(([column, values]) => ({ column, values }));
}

export default function FilterBar({
  dimensions = [],
  metric = "count",
  metadata = [],
  filters = {},
  loading = false,
  showAnalysisControls = true,
  onDimensionsChange,
  onMetricChange,
  onFiltersChange,
  onRun,
}) {
  const filterColumns = useMemo(() => availableColumns(metadata), [metadata]);
  const [activeColumn, setActiveColumn] = useState(FILTER_COLUMNS[0]);
  const [query, setQuery] = useState("");
  const activeMeta = filterColumns.find((item) => item.name === activeColumn) || filterColumns[0];
  const selectedValues = filters[activeMeta?.name] || [];
  const totalSelections = Object.values(filters).reduce((total, values) => total + values.length, 0);
  const activeValues = activeMeta?.values || [];
  const allSelected = activeValues.length > 0 && selectedValues.length === activeValues.length;
  const partiallySelected = selectedValues.length > 0 && selectedValues.length < activeValues.length;

  const toggleDimension = (dimension) => {
    const next = dimensions.includes(dimension)
      ? dimensions.filter((item) => item !== dimension)
      : [...dimensions, dimension];
    onDimensionsChange(next.length ? next : [dimension]);
  };

  const toggleFilter = (column, selectedValue) => {
    const current = filters[column] || [];
    const nextValues = current.includes(selectedValue)
      ? current.filter((item) => item !== selectedValue)
      : [...current, selectedValue];
    onFiltersChange({ ...filters, [column]: nextValues });
  };

  const toggleAllFilters = () => {
    if (!activeMeta) return;
    const nextFilters = { ...filters };
    if (allSelected) {
      delete nextFilters[activeMeta.name];
    } else {
      nextFilters[activeMeta.name] = activeValues;
    }
    onFiltersChange(nextFilters);
  };

  const clearFilters = () => {
    setQuery("");
    onFiltersChange({});
  };

  const options = activeValues
    .filter((option) => option.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 80);

  return (
    <section className="filter-bar">
      <div className="filter-header">
        <div>
          <span className="eyebrow">Filtros y cruces</span>
          <strong>{totalSelections ? `${totalSelections} selecciones` : "Dataset completo"}</strong>
        </div>
        <button className="icon-button" onClick={clearFilters} title="Limpiar filtros" disabled={!totalSelections}>
          <RotateCcw size={17} />
        </button>
      </div>

      {showAnalysisControls && (
        <div className="control-grid">
          <label>
            <span>Metrica</span>
            <select value={metric} onChange={(event) => onMetricChange(event.target.value)}>
              {METRICS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <div className="dimension-picker">
            <span>Dimensiones</span>
            <div className="segmented-group">
              {DEFAULT_DIMENSIONS.map((dimension) => (
                <button
                  key={dimension}
                  className={dimensions.includes(dimension) ? "chip active" : "chip"}
                  onClick={() => toggleDimension(dimension)}
                >
                  {dimension}
                </button>
              ))}
            </div>
          </div>
          <button className="primary-button run-button" onClick={onRun} disabled={loading}>
            <Play size={16} />
            {loading ? "Analizando" : "Analizar"}
          </button>
        </div>
      )}

      <div className="filter-layout">
        <div className="filter-column-list">
          {filterColumns.map((column) => {
            const count = filters[column.name]?.length || 0;
            return (
              <button
                key={column.name}
                className={activeMeta?.name === column.name ? "filter-column active" : "filter-column"}
                onClick={() => {
                  setActiveColumn(column.name);
                  setQuery("");
                }}
              >
                <SlidersHorizontal size={15} />
                <span>{column.name}</span>
                {count > 0 && <b>{count}</b>}
              </button>
            );
          })}
        </div>
        <div className="filter-options">
          <label className="search-field">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Buscar en ${activeMeta?.name || "filtros"}`}
            />
            {query && (
              <button onClick={() => setQuery("")} title="Limpiar busqueda">
                <X size={14} />
              </button>
            )}
          </label>
          {activeMeta && (
            <div className="filter-option-actions">
              <label className="check-row select-all-row">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = partiallySelected;
                  }}
                  onChange={toggleAllFilters}
                />
                <span>Seleccionar todos</span>
                <b>{selectedValues.length}/{activeValues.length}</b>
              </label>
            </div>
          )}
          <div className="option-list">
            {options.map((option) => (
              <label key={option} className="check-row">
                <input
                  type="checkbox"
                  checked={selectedValues.includes(option)}
                  onChange={() => toggleFilter(activeMeta.name, option)}
                />
                <span>{option}</span>
              </label>
            ))}
            {!options.length && <p className="muted">Sin opciones disponibles.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

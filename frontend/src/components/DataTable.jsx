import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { useMemo, useState } from "react";

function cellValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined || value === "") return "Sin dato";
  return String(value);
}

function compareValues(a, b) {
  const left = Number(String(a).replace(/[^\d,-.]/g, "").replace(",", "."));
  const right = Number(String(b).replace(/[^\d,-.]/g, "").replace(",", "."));
  if (!Number.isNaN(left) && !Number.isNaN(right)) return left - right;
  return String(a).localeCompare(String(b), "es");
}

export default function DataTable({ columns = [], rows = [], title = "", subtitle = "" }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ column: columns[0], direction: "asc" });
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const filteredRows = useMemo(() => {
    const text = query.toLowerCase();
    return rows
      .filter((row) => columns.some((column) => cellValue(row[column]).toLowerCase().includes(text)))
      .sort((a, b) => {
        const direction = sort.direction === "asc" ? 1 : -1;
        return compareValues(cellValue(a[sort.column]), cellValue(b[sort.column])) * direction;
      });
  }, [columns, query, rows, sort]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleSort = (column) => {
    setSort((current) => ({
      column,
      direction: current.column === column && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  return (
    <section className="table-wrap">
      <div className="table-toolbar">
        <div>
          {title && <h2>{title}</h2>}
          <span>{subtitle || `${filteredRows.length} fila(s)`}</span>
        </div>
        <label className="search-field compact">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Buscar"
          />
        </label>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>
                  <button onClick={() => toggleSort(column)}>
                    <span>{column}</span>
                    {sort.column === column &&
                      (sort.direction === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length || 1} className="empty-cell">
                  Sin datos para mostrar.
                </td>
              </tr>
            ) : (
              visibleRows.map((row, index) => (
                <tr key={`${index}-${JSON.stringify(row)}`}>
                  {columns.map((column) => (
                    <td key={column}>{cellValue(row[column])}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <button disabled={safePage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
          Anterior
        </button>
        <span>
          Página {safePage} de {pageCount}
        </span>
        <button disabled={safePage === pageCount} onClick={() => setPage((current) => current + 1)}>
          Siguiente
        </button>
      </div>
    </section>
  );
}

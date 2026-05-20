import { Clipboard } from "lucide-react";

const number = new Intl.NumberFormat("es-AR");

export default function BajasByMonthTable({
  months = [],
  rows = [],
  totals = {},
  dateRange = { start: "", end: "" },
  onDateRangeChange,
}) {
  const columns = ["Campaña", ...months, "Total"];
  const copyText = [
    columns,
    ...rows.map((row) => columns.map((column) => row[column] || "")),
    ["Total", ...months.map((month) => totals[month] || ""), totals.Total || ""],
  ]
    .map((line) => line.join("\t"))
    .join("\n");

  const copyTable = async () => {
    await navigator.clipboard.writeText(copyText);
  };

  const handleCopy = (event) => {
    event.preventDefault();
    event.clipboardData.setData("text/plain", copyText);
  };

  return (
    <section className="table-wrap compact-a4 monthly-table" onCopy={handleCopy}>
      <div className="table-toolbar">
        <div>
          <h2>Bajas mes por mes</h2>
          <span>Calculado por FECHA BAJA y campaña, respetando filtros</span>
        </div>
        <div className="table-actions">
          <label className="date-field">
            <span>Desde</span>
            <input
              type="date"
              value={dateRange.start || ""}
              onChange={(event) => onDateRangeChange?.({ ...dateRange, start: event.target.value })}
            />
          </label>
          <label className="date-field">
            <span>Hasta</span>
            <input
              type="date"
              value={dateRange.end || ""}
              onChange={(event) => onDateRangeChange?.({ ...dateRange, end: event.target.value })}
            />
          </label>
          <button className="primary-button secondary-button" onClick={() => onDateRangeChange?.({ start: "", end: "" })}>
            Limpiar fechas
          </button>
          <button className="primary-button secondary-button" onClick={copyTable}>
            <Clipboard size={16} />
            Copiar tabla
          </button>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.Campaña}>
                  <td>{row.Campaña}</td>
                  {months.map((month) => (
                    <td key={month}>{row[month] ? number.format(row[month]) : ""}</td>
                  ))}
                  <td>{number.format(row.Total || 0)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="empty-cell">
                  Sin bajas para mostrar.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td>Total</td>
                {months.map((month) => (
                  <td key={month}>{totals[month] ? number.format(totals[month]) : ""}</td>
                ))}
                <td>{number.format(totals.Total || 0)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

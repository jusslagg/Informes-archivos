import { Clipboard } from "lucide-react";
import { copyTableToClipboard, setClipboardTableData } from "../lib/clipboardTable.js";

const number = new Intl.NumberFormat("es-AR");

function tenureLabel(row = {}) {
  return row.Antigüedad || row["AntigÃ¼edad"] || row["AntigÃƒÂ¼edad"] || "";
}

export default function BajasTenureByMonthTable({
  months = [],
  rows = [],
  totals = {},
  filterControl = null,
  dateRange = { start: "", end: "" },
}) {
  const columns = ["Antigüedad", ...months, "Total"];
  const copyLines = [
    columns,
    ...rows.map((row) => columns.map((column) => (column === "Antigüedad" ? tenureLabel(row) : row[column] || ""))),
    ["Total", ...months.map((month) => totals[month] || ""), totals.Total || ""],
  ];

  const copyTable = async () => {
    await copyTableToClipboard(copyLines);
  };

  const handleCopy = (event) => {
    setClipboardTableData(event, copyLines);
  };

  return (
    <section className="table-wrap compact-a4 tenure-month-table" onCopy={handleCopy}>
      <div className="table-toolbar">
        <div>
          <h2>Permanencia por mes de baja</h2>
          <span>
            Cruza antigüedad con el mes de FECHA BAJA
            {dateRange.start || dateRange.end ? ` (${dateRange.start || "inicio"} a ${dateRange.end || "hoy"})` : ""}
          </span>
        </div>
        <button className="primary-button secondary-button" onClick={copyTable}>
          <Clipboard size={16} />
          Copiar tabla
        </button>
      </div>
      {filterControl}
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
                <tr key={tenureLabel(row)}>
                  <td>{tenureLabel(row)}</td>
                  {months.map((month) => (
                    <td key={month}>{row[month] ? number.format(row[month]) : ""}</td>
                  ))}
                  <td>{number.format(row.Total || 0)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="empty-cell">
                  Sin bajas con permanencia para mostrar.
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

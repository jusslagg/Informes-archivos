import { Clipboard } from "lucide-react";
import { copyTableToClipboard, setClipboardTableData } from "../lib/clipboardTable.js";

const number = new Intl.NumberFormat("es-AR");

function ownerName(row = {}) {
  return row.Responsable || row.responsable || "Sin dato";
}

function OwnerTable({ title, label, months = [], rows = [], totals = {} }) {
  const columns = [label || "Responsable", ...months, "Total"];
  const copyLines = [
    [title],
    columns,
    ...rows.map((row) => [ownerName(row), ...months.map((month) => row[month] || ""), row.Total || ""]),
    ["Total", ...months.map((month) => totals[month] || ""), totals.Total || ""],
  ];

  const copyTable = async () => {
    await copyTableToClipboard(copyLines);
  };

  const handleCopy = (event) => {
    setClipboardTableData(event, copyLines);
  };

  return (
    <section className="owner-month-card" onCopy={handleCopy}>
      <div className="table-toolbar compact-toolbar">
        <div>
          <h3>{title}</h3>
          <span>{label || "Responsable"} por mes de baja</span>
        </div>
        <button className="primary-button secondary-button" onClick={copyTable}>
          <Clipboard size={16} />
          Copiar
        </button>
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
                <tr key={ownerName(row)}>
                  <td>{ownerName(row)}</td>
                  {months.map((month) => (
                    <td key={month}>{row[month] ? number.format(row[month]) : ""}</td>
                  ))}
                  <td>{number.format(row.Total || 0)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="empty-cell" colSpan={columns.length}>
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

export default function BajasOwnerByMonthTable({
  months = [],
  leader = { label: "Líder", rows: [], totals: {} },
  supervisor = { label: "Supervisor", rows: [], totals: {} },
  filterControl = null,
  dateRange = { start: "", end: "" },
}) {
  return (
    <section className="table-wrap compact-a4 owner-month-table">
      <div className="table-toolbar">
        <div>
          <h2>Bajas por responsable y mes</h2>
          <span>
            Revisa bajas mensuales por líder/equipo y por supervisor
            {dateRange.start || dateRange.end ? ` (${dateRange.start || "inicio"} a ${dateRange.end || "hoy"})` : ""}
          </span>
        </div>
      </div>
      {filterControl}
      <div className="owner-month-grid">
        <OwnerTable title="Por líder / equipo" label={leader.label} months={months} rows={leader.rows} totals={leader.totals} />
        <OwnerTable title="Por supervisor" label={supervisor.label} months={months} rows={supervisor.rows} totals={supervisor.totals} />
      </div>
    </section>
  );
}

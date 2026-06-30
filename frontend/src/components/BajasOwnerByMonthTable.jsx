import { Clipboard } from "lucide-react";
import { copyTableToClipboard, setClipboardTableData } from "../lib/clipboardTable.js";

const number = new Intl.NumberFormat("es-AR");
const percent = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function ownerName(row = {}) {
  return row.Responsable || row.responsable || "Sin dato";
}

function staffingValue(row = {}, month) {
  return row._staffing?.[month] ?? row.staffing?.[month] ?? 0;
}

function rotationValue(row = {}, month) {
  return row._rotation?.[month] ?? row.rotation?.[month] ?? 0;
}

function copyCell(row = {}, month) {
  const bajas = row[month] || 0;
  const assigned = staffingValue(row, month);
  const rotation = rotationValue(row, month);
  return bajas || assigned ? `${bajas} bajas / ${assigned} activos / ${percent.format(rotation)}%` : "";
}

function RotationCell({ row, month }) {
  const bajas = month === "Total" ? row.Total || 0 : row[month] || 0;
  const assigned = staffingValue(row, month === "Total" ? "Promedio" : month);
  const rotation = rotationValue(row, month);
  if (!bajas && !assigned) return null;

  return (
    <div className="rotation-cell">
      <strong>{number.format(bajas)} bajas</strong>
      <span>{number.format(assigned)} activos</span>
      <em>{percent.format(rotation)}%</em>
    </div>
  );
}

function OwnerTable({ title, label, months = [], rows = [], totals = {} }) {
  const columns = [label || "Responsable", ...months, "Total"];
  const copyLines = [
    [title],
    columns,
    ...rows.map((row) => [
      ownerName(row),
      ...months.map((month) => copyCell(row, month)),
      `${row.Total || 0} bajas / ${staffingValue(row, "Promedio")} activos prom. / ${percent.format(rotationValue(row, "Total"))}%`,
    ]),
    [
      "Total",
      ...months.map((month) => copyCell(totals, month)),
      `${totals.Total || 0} bajas / ${staffingValue(totals, "Promedio")} activos prom. / ${percent.format(rotationValue(totals, "Total"))}%`,
    ],
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
          <span>Bajas / dotación activa / % rotación mensual</span>
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
                    <td key={month}>
                      <RotationCell row={row} month={month} />
                    </td>
                  ))}
                  <td>
                    <RotationCell row={row} month="Total" />
                  </td>
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
                  <td key={month}>
                    <RotationCell row={totals} month={month} />
                  </td>
                ))}
                <td>
                  <RotationCell row={totals} month="Total" />
                </td>
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
          <h2>Rotación por responsable y mes</h2>
          <span>
            Rotación = bajas del mes / dotación activa de ese líder o supervisor
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

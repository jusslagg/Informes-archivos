import { Clipboard } from "lucide-react";

const number = new Intl.NumberFormat("es-AR");

export default function BajasReasonByCampaignTable({
  reasons = [],
  rows = [],
  totals = {},
  dateRange = { start: "", end: "" },
}) {
  const columns = ["Campaña", ...reasons, "Total"];
  const copyText = [
    columns,
    ...rows.map((row) => columns.map((column) => row[column] || "")),
    ["Total", ...reasons.map((reason) => totals[reason] || ""), totals.Total || ""],
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
    <section className="table-wrap compact-a4 reason-campaign-table" onCopy={handleCopy}>
      <div className="table-toolbar">
        <div>
          <h2>Motivos de baja por campaña</h2>
          <span>
            Calculado por CAMPAÑA y MOTIVO BAJA, respetando filtros
            {dateRange.start || dateRange.end
              ? ` (${dateRange.start || "inicio"} a ${dateRange.end || "hoy"})`
              : ""}
          </span>
        </div>
        <button className="primary-button secondary-button" onClick={copyTable}>
          <Clipboard size={16} />
          Copiar tabla
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
                <tr key={row.Campaña}>
                  <td>{row.Campaña}</td>
                  {reasons.map((reason) => (
                    <td key={reason}>{row[reason] ? number.format(row[reason]) : ""}</td>
                  ))}
                  <td>{number.format(row.Total || 0)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="empty-cell">
                  Sin bajas por motivo para mostrar.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td>Total</td>
                {reasons.map((reason) => (
                  <td key={reason}>{totals[reason] ? number.format(totals[reason]) : ""}</td>
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

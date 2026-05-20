import { Clipboard } from "lucide-react";

const number = new Intl.NumberFormat("es-AR");

export default function BajasTenureTable({ rows = [], total = 0, dateRange = { start: "", end: "" } }) {
  const copyText = [
    ["Antigüedad", "Bajas", "Participación"],
    ...rows.map((row) => [
      row.Antigüedad,
      row.Bajas,
      total ? `${((row.Bajas / total) * 100).toFixed(1)}%` : "0%",
    ]),
    ["Total", total, "100%"],
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
    <section className="table-wrap compact-a4 tenure-table" onCopy={handleCopy}>
      <div className="table-toolbar">
        <div>
          <h2>Bajas por meses en empresa</h2>
          <span>
            Calculado con FECHA BAJA menos FECHA ALTA, respetando filtros
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
              <th>Antigüedad</th>
              <th>Bajas</th>
              <th>Participación</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.Antigüedad}>
                  <td>{row.Antigüedad}</td>
                  <td>{number.format(row.Bajas)}</td>
                  <td>{total ? `${((row.Bajas / total) * 100).toFixed(1)}%` : "0%"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="3" className="empty-cell">
                  Sin bajas con fechas válidas.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td>Total</td>
                <td>{number.format(total)}</td>
                <td>100%</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

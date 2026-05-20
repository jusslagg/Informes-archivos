import { Clipboard, Search, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import ChartBox from "./ChartBox.jsx";
import MetricCard from "./MetricCard.jsx";

const number = new Intl.NumberFormat("es-AR");
const columns = ["Campaña", "Activo", "Requeridos", "Diferencia", "Licencia", "Observación"];

function normalize(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getCampaign(item) {
  return item.campana || item["CAMPAÑA"] || item["CAMPANA"] || item["CAMPAÃ‘A"] || item["CAMPAÃA"];
}

function splitCsvLine(line, separator) {
  const cells = [];
  let current = "";
  let quoted = false;

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === separator && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells.map((cell) => cell.replace(/^"|"$/g, ""));
}

function parseRequirements(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return {};

  const firstLine = lines[0];
  const separator = firstLine.includes(";") ? ";" : firstLine.includes("\t") ? "\t" : ",";
  const headers = splitCsvLine(firstLine, separator).map(normalize);
  const indexOf = (...names) => headers.findIndex((header) => names.includes(header));
  const campaignIndex = indexOf("CAMPANA", "CAMPAÑA", "CAMPAIGN");
  const requiredIndex = indexOf("REQUERIDOS", "REQUERIDO", "DOTACION REQUERIDA");

  if (campaignIndex < 0 || requiredIndex < 0) return {};

  return lines.slice(1).reduce((acc, line) => {
    const cells = splitCsvLine(line, separator);
    const campaign = cells[campaignIndex] || "Sin dato";
    acc[normalize(campaign)] = String(Number(String(cells[requiredIndex] || "0").replace(",", ".")) || 0);
    return acc;
  }, {});
}

export default function StaffingRequirements({ staffingRows = [] }) {
  const inputRef = useRef(null);
  const [requirements, setRequirements] = useState({});
  const [fileName, setFileName] = useState("");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const campaignMap = new Map(staffingRows.map((item) => [normalize(getCampaign(item)), item]));
    const keys = new Set([...Object.keys(requirements), ...campaignMap.keys()]);

    return Array.from(keys)
      .map((key) => {
        const activeRow = campaignMap.get(key) || {};
        const campana = getCampaign(activeRow) || key || "Sin dato";
        const activo = Number(activeRow.activo || activeRow.value || 0);
        const requeridos = Number(requirements[key] || 0);

        return {
          key,
          campana,
          activo,
          requeridos,
          diferencia: activo - requeridos,
          licencia: Number(activeRow.licencia || 0),
          observacion: activeRow.observacion || "",
        };
      })
      .filter((row) => row.activo > 0 || row.licencia > 0 || row.requeridos > 0)
      .filter((row) => row.campana.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia));
  }, [query, requirements, staffingRows]);

  const totals = rows.reduce(
    (acc, row) => ({
      activo: acc.activo + row.activo,
      requeridos: acc.requeridos + row.requeridos,
      diferencia: acc.diferencia + row.diferencia,
      licencia: acc.licencia + row.licencia,
    }),
    { activo: 0, requeridos: 0, diferencia: 0, licencia: 0 },
  );
  const requiredWithBuffer = Math.ceil(totals.requeridos * 1.05);
  const bufferDifference = totals.activo - requiredWithBuffer;

  const chartData = rows
    .filter((row) => row.activo || row.requeridos)
    .slice(0, 16)
    .map((row) => ({ name: row.campana, value: row.activo }));

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const parsed = parseRequirements(await file.text());
    setRequirements((current) => ({ ...current, ...parsed }));
  };

  const updateRequired = (key, value) => {
    setRequirements((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const tableLines = useMemo(() => {
    const body = rows.map((row) => [
      row.campana,
      row.activo,
      row.requeridos,
      row.diferencia,
      row.licencia,
      row.observacion || "",
    ]);
    const total = ["Total", totals.activo, totals.requeridos, totals.diferencia, totals.licencia, ""];
    return [columns, ...body, total];
  }, [rows, totals]);

  const copyText = tableLines.map((line) => line.join("\t")).join("\n");

  const copyTable = async () => {
    await navigator.clipboard.writeText(copyText);
  };

  const handleCopy = (event) => {
    event.preventDefault();
    event.clipboardData.setData("text/plain", copyText);
  };

  return (
    <section className="page-stack">
      <div className="section-header">
        <div>
          <span className="eyebrow">Dotación</span>
          <h2>Activo vs requerido por campaña</h2>
        </div>
        <div className="header-actions">
          <button className="primary-button secondary-button" onClick={copyTable}>
            <Clipboard size={16} />
            Copiar tabla
          </button>
          <button className="primary-button" onClick={() => inputRef.current?.click()}>
            <Upload size={16} />
            Subir requeridos
          </button>
        </div>
        <input ref={inputRef} type="file" accept=".csv,.txt" onChange={handleFile} hidden />
      </div>

      {fileName && <div className="muted">Archivo: {fileName}</div>}

      <section className="metric-grid">
        <MetricCard label="Campañas" value={number.format(rows.length)} />
        <MetricCard label="Activo" value={number.format(totals.activo)} tone="success" />
        <MetricCard label="Requeridos" value={number.format(totals.requeridos)} />
        <MetricCard label="Requeridos +5%" value={number.format(requiredWithBuffer)} />
        <MetricCard
          label="Diferencia"
          value={number.format(totals.diferencia)}
          tone={totals.diferencia < 0 ? "danger" : "success"}
        />
        <MetricCard
          label="Diferencia +5%"
          value={number.format(bufferDifference)}
          tone={bufferDifference < 0 ? "danger" : "success"}
        />
        <MetricCard label="Licencia" value={number.format(totals.licencia)} />
      </section>

      <ChartBox title="Empleados por campaña" data={chartData} />

      <section className="table-wrap staffing-table compact-a4" onCopy={handleCopy}>
        <div className="table-toolbar">
          <div>
            <h2>Requeridos por campaña</h2>
            <span>Licencia se calcula desde ESTADO: distinto de activo y baja</span>
          </div>
          <label className="search-field compact">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar" />
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Campaña</th>
                <th>Activo</th>
                <th>Requeridos</th>
                <th>Diferencia</th>
                <th>Licencia</th>
                <th>Observación</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>{row.campana}</td>
                  <td>{number.format(row.activo)}</td>
                  <td>
                    <input
                      className="required-input"
                      type="text"
                      inputMode="numeric"
                      value={requirements[row.key] ?? ""}
                      placeholder="0"
                      onChange={(event) => updateRequired(row.key, event.target.value.replace(/[^\d]/g, ""))}
                    />
                  </td>
                  <td className={row.diferencia < 0 ? "negative-cell" : "positive-cell"}>
                    {number.format(row.diferencia)}
                  </td>
                  <td>{number.format(row.licencia)}</td>
                  <td>{row.observacion || "Sin dato"}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan="6" className="empty-cell">
                    Sin datos para mostrar.
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td>{number.format(totals.activo)}</td>
                  <td>{number.format(totals.requeridos)}</td>
                  <td className={totals.diferencia < 0 ? "negative-cell" : "positive-cell"}>
                    {number.format(totals.diferencia)}
                  </td>
                  <td>{number.format(totals.licencia)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </section>
  );
}

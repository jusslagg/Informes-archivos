import { ChevronDown, ChevronRight, Clipboard, Download, Search, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { getSavedRequirements } from "../api/client.js";
import MetricCard from "./MetricCard.jsx";

const number = new Intl.NumberFormat("es-AR");
const percent = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const columns = ["Cliente", "Campaña", "Activo", "Requeridos", "Diferencia", "Bajas mes", "Rotación mes", "Licencia", "Observación"];

function normalize(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function cleanLabel(value, fallback = "Sin dato") {
  const text = String(value ?? "").trim();
  if (!text || ["NAN", "NONE", "NULL"].includes(normalize(text))) return fallback;
  return text;
}

function getCampaign(item) {
  return cleanLabel(item.campana || item["CAMPAÑA"] || item["CAMPAÃ‘A"] || item.CAMPANA || item["Campaña"] || item["CampaÃ±a"]);
}

function getClient(item) {
  return cleanLabel(item.cliente || item.CLIENTE || item.Cliente || item.client);
}

function getBajasCampaign(item) {
  return cleanLabel(item["Campaña"] || item["CampaÃ±a"] || item.CAMPANA || item.campana);
}

function formatRotation(value) {
  return Number.isFinite(value) ? `${percent.format(value)}%` : "Sin dato";
}

function parseRequiredNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value ?? "").replace(/\$/g, "").replace(/\s/g, "").trim();
  if (!text) return 0;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function requirementKey(cliente, campana) {
  return normalize(`${cleanLabel(cliente)}||${cleanLabel(campana)}`);
}

function currentMonthValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

function parseStoredRequirement(values) {
  if (!values || typeof values !== "object") return 0;
  if (values.total !== undefined) return parseRequiredNumber(values.total);
  return parseRequiredNumber(values.week || values.sat || values.sun || values.holiday || 0);
}

function normalizeSavedRequirements(saved) {
  const next = {};
  Object.entries(saved.masterRequirements || {}).forEach(([key, values]) => {
    const parts = key.split("||");
    const cliente = parts[0] || "Sin dato";
    const campana = parts[1] || "Sin dato";
    const required = parseStoredRequirement(values);
    if (!required) return;
    const campaignKey = requirementKey(cliente, campana);
    next[campaignKey] = parseRequiredNumber(next[campaignKey]) + required;
  });
  return next;
}

function splitCsvLine(line, separator) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === separator && !quoted) {
      cells.push(current.trim());
      current = "";
    } else current += char;
  }
  cells.push(current.trim());
  return cells.map((cell) => cell.replace(/^"|"$/g, ""));
}

function rowsToRequirements(rawRows) {
  if (!rawRows.length) return {};
  const headers = rawRows[0].map(normalize);
  const indexOf = (...names) => headers.findIndex((header) => names.includes(header));
  const clientIndex = indexOf("CLIENTE", "CLIENTES", "CLIENT");
  const campaignIndex = indexOf("CAMPANA", "CAMPAÑA", "CAMPAÃ‘A", "CAMPAIGN");
  const requiredIndex = indexOf("REQUERIDO", "REQUERIDOS", "DOTACION REQUERIDA");
  if (campaignIndex < 0 || requiredIndex < 0) return {};

  return rawRows.slice(1).reduce((acc, cells) => {
    const cliente = clientIndex >= 0 ? cleanLabel(cells[clientIndex], "") : "";
    const campana = cleanLabel(cells[campaignIndex], "");
    const requerido = parseRequiredNumber(cells[requiredIndex]);
    if (!campana || !requerido) return acc;
    if (cliente) acc[requirementKey(cliente, campana)] = requerido;
    else acc[normalize(campana)] = requerido;
    return acc;
  }, {});
}

function parseRequirementsText(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return {};
  const firstLine = lines[0];
  const separator = firstLine.includes(";") ? ";" : firstLine.includes("\t") ? "\t" : ",";
  return rowsToRequirements(lines.map((line) => splitCsvLine(line, separator)));
}

async function parseRequirementsFile(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "xlsx" || extension === "xls") {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: false, raw: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return rowsToRequirements(XLSX.utils.sheet_to_json(sheet, { defval: "", header: 1, raw: true }));
  }
  return parseRequirementsText(await file.text());
}

function rotationMonthLabels(months = [], dateRange = {}) {
  if (dateRange.start || dateRange.end) return months;
  const current = new Date();
  const monthName = new Intl.DateTimeFormat("es-AR", { month: "long" }).format(current).toLowerCase();
  const year = String(current.getFullYear());
  return months.filter((month) => normalize(month).includes(normalize(monthName)) && String(month).includes(year));
}

function summarizeRows(rows) {
  const totals = rows.reduce(
    (acc, row) => ({
      activo: acc.activo + row.activo,
      requeridos: acc.requeridos + row.requeridos,
      diferencia: acc.diferencia + row.diferencia,
      bajasMes: acc.bajasMes + row.bajasMes,
      licencia: acc.licencia + row.licencia,
    }),
    { activo: 0, requeridos: 0, diferencia: 0, bajasMes: 0, licencia: 0 },
  );
  return { ...totals, rotacionMes: totals.requeridos > 0 ? (totals.bajasMes / totals.requeridos) * 100 : null };
}

export default function StaffingRequirements({
  staffingRows = [],
  bajasByMonth = { months: [], rows: [] },
  bajasDateRange = { start: "", end: "" },
}) {
  const inputRef = useRef(null);
  const [requirements, setRequirements] = useState({});
  const [fileName, setFileName] = useState("");
  const [query, setQuery] = useState("");
  const [collapsedClients, setCollapsedClients] = useState({});

  useEffect(() => {
    const syncStoredRequirements = () => {
      getSavedRequirements(currentMonthValue())
        .then((saved) => setRequirements((current) => ({ ...current, ...normalizeSavedRequirements(saved) })))
        .catch(() => {});
    };
    syncStoredRequirements();
    window.addEventListener("storage", syncStoredRequirements);
    window.addEventListener("requeridos-updated", syncStoredRequirements);
    return () => {
      window.removeEventListener("storage", syncStoredRequirements);
      window.removeEventListener("requeridos-updated", syncStoredRequirements);
    };
  }, []);

  const { campaignRows, clientGroups } = useMemo(() => {
    const campaignMap = new Map(staffingRows.map((item) => [requirementKey(getClient(item), getCampaign(item)), item]));
    const monthLabels = rotationMonthLabels(bajasByMonth.months || [], bajasDateRange);
    const bajasMap = new Map(
      (bajasByMonth.rows || []).map((item) => [
        normalize(getBajasCampaign(item)),
        monthLabels.reduce((sum, month) => sum + Number(item[month] || 0), 0),
      ]),
    );
    const keys = new Set([...campaignMap.keys(), ...Object.keys(requirements)]);

    const rows = Array.from(keys)
      .map((key) => {
        const activeRow = campaignMap.get(key) || {};
        const keyParts = key.split("||");
        const campana = getCampaign(activeRow) || keyParts.at(-1) || "Sin dato";
        const cliente = getClient(activeRow) || keyParts.at(0) || "Sin dato";
        const rowKey = requirementKey(cliente, campana);
        const activo = Number(activeRow.activo || activeRow.value || 0);
        const requeridos = parseRequiredNumber(requirements[rowKey] ?? requirements[normalize(campana)] ?? requirements[key]);
        const bajasMes = Number(activeRow.bajasMes ?? activeRow.bajas_mes ?? bajasMap.get(normalize(campana)) ?? 0);
        return {
          key,
          requirementKey: rowKey,
          cliente,
          campana,
          activo,
          requeridos,
          diferencia: activo - requeridos,
          bajasMes,
          rotacionMes: requeridos > 0 ? (bajasMes / requeridos) * 100 : null,
          licencia: Number(activeRow.licencia || 0),
          observacion: cleanLabel(activeRow.observacion, ""),
        };
      })
      .filter((row) => row.activo > 0 || row.licencia > 0 || row.requeridos > 0)
      .filter((row) => `${row.cliente} ${row.campana}`.toLowerCase().includes(query.toLowerCase()));

    const grouped = new Map();
    rows.forEach((row) => {
      const clientKey = normalize(row.cliente);
      const group = grouped.get(clientKey) || { key: clientKey, cliente: row.cliente, rows: [] };
      group.rows.push(row);
      grouped.set(clientKey, group);
    });

    const groups = [...grouped.values()]
      .map((group) => ({
        ...group,
        rows: group.rows.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia)),
        totals: summarizeRows(group.rows),
      }))
      .sort((a, b) => b.totals.activo - a.totals.activo);

    return { campaignRows: rows.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia)), clientGroups: groups };
  }, [bajasByMonth, bajasDateRange, query, requirements, staffingRows]);

  const totals = summarizeRows(campaignRows);
  const requiredWithBuffer = Math.ceil(totals.requeridos * 1.05);
  const bufferDifference = totals.activo - requiredWithBuffer;
  const loadedRequirements = Object.values(requirements).filter((value) => parseRequiredNumber(value) > 0).length;
  const pendingRequirements = campaignRows.filter((row) => row.requeridos <= 0).length;

  const visibleRows = clientGroups.flatMap((group) => {
    const clientLine = { type: "client", key: group.key, cliente: group.cliente, ...group.totals, count: group.rows.length };
    if (collapsedClients[group.key] !== false) return [clientLine];
    return [clientLine, ...group.rows.map((row) => ({ ...row, type: "campaign" }))];
  });

  const toggleClient = (key) => {
    setCollapsedClients((current) => ({ ...current, [key]: current[key] !== false ? false : true }));
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const parsed = await parseRequirementsFile(file);
    setRequirements((current) => ({ ...current, ...parsed }));
    event.target.value = "";
  };

  const updateRequired = (key, value) => {
    setRequirements((current) => ({ ...current, [key]: value }));
  };

  const downloadTemplate = () => {
    const rows = staffingRows.map((item) => ({
      Cliente: getClient(item),
      Campaña: getCampaign(item),
      Requerido: "",
      "Suma de Horas objetivo mes": "",
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Cliente: "", Campaña: "", Requerido: "", "Suma de Horas objetivo mes": "" }]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Requeridos");
    XLSX.writeFile(workbook, "template_requeridos.xlsx");
  };

  const tableLines = useMemo(() => {
    const body = visibleRows.map((row) => [
      row.type === "client" ? row.cliente : "",
      row.type === "client" ? "Total cliente" : row.campana,
      row.activo,
      row.requeridos,
      row.diferencia,
      row.bajasMes,
      formatRotation(row.rotacionMes),
      row.licencia,
      row.type === "client" ? `${row.count} servicio${row.count === 1 ? "" : "s"}` : row.observacion || "",
    ]);
    return [
      columns,
      ...body,
      ["Total", "", totals.activo, totals.requeridos, totals.diferencia, totals.bajasMes, formatRotation(totals.rotacionMes), totals.licencia, ""],
    ];
  }, [totals, visibleRows]);

  const copyText = tableLines.map((line) => line.join("\t")).join("\n");
  const copyTable = async () => navigator.clipboard.writeText(copyText);
  const handleCopy = (event) => {
    event.preventDefault();
    event.clipboardData.setData("text/plain", copyText);
  };

  return (
    <section className="page-stack staffing-section">
      <div className="section-header staffing-header">
        <div>
          <span className="eyebrow">Dotación</span>
          <h2>Dotación requerida</h2>
          <p className="section-subtitle">Importá requeridos por cliente y campaña para calcular diferencia y rotación.</p>
        </div>
        <div className="header-actions">
          <button className="primary-button" onClick={() => inputRef.current?.click()}>
            <Upload size={16} />
            Importar
          </button>
          <button className="primary-button secondary-button" onClick={downloadTemplate}>
            <Download size={16} />
            Template
          </button>
          <button className="icon-button" onClick={copyTable} title="Copiar tabla">
            <Clipboard size={16} />
          </button>
        </div>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,.txt" onChange={handleFile} hidden />
      </div>

      <div className="requirements-status">
        <span className={loadedRequirements ? "status-pill success" : "status-pill"}>
          {loadedRequirements ? `${number.format(loadedRequirements)} requeridos cargados` : "Sin requeridos"}
        </span>
        <span className={pendingRequirements ? "status-pill warning" : "status-pill success"}>
          {pendingRequirements ? `${number.format(pendingRequirements)} pendientes` : "Completo"}
        </span>
        {fileName && <span className="status-file">{fileName}</span>}
      </div>

      <section className="metric-grid staffing-metrics">
        <MetricCard label="Clientes" value={number.format(clientGroups.length)} />
        <MetricCard label="Campañas" value={number.format(campaignRows.length)} />
        <MetricCard label="Activo" value={number.format(totals.activo)} tone="success" />
        <MetricCard label="Requeridos" value={number.format(totals.requeridos)} />
        <MetricCard label="Requeridos +5%" value={number.format(requiredWithBuffer)} />
        <MetricCard label="Diferencia" value={number.format(totals.diferencia)} tone={totals.diferencia < 0 ? "danger" : "success"} />
        <MetricCard label="Diferencia +5%" value={number.format(bufferDifference)} tone={bufferDifference < 0 ? "danger" : "success"} />
        <MetricCard label="Bajas mes" value={number.format(totals.bajasMes)} />
        <MetricCard label="Rotación mes" value={formatRotation(totals.rotacionMes)} />
        <MetricCard label="Licencia" value={number.format(totals.licencia)} />
      </section>

      <section className="table-wrap staffing-table compact-a4" onCopy={handleCopy}>
        <div className="table-toolbar">
          <div>
            <h2>Requeridos</h2>
            <span>Expandí un cliente para editar sus campañas.</span>
          </div>
          <label className="search-field compact">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar" />
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
            </thead>
            <tbody>
              {visibleRows.map((row) =>
                row.type === "client" ? (
                  <tr key={row.key} className="client-row">
                    <td>
                      <button className="expand-button" onClick={() => toggleClient(row.key)}>
                        {collapsedClients[row.key] !== false ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                        <strong>{row.cliente}</strong>
                      </button>
                    </td>
                    <td>Total cliente</td>
                    <td>{number.format(row.activo)}</td>
                    <td>{number.format(row.requeridos)}</td>
                    <td className={row.diferencia < 0 ? "negative-cell" : "positive-cell"}>{number.format(row.diferencia)}</td>
                    <td>{number.format(row.bajasMes)}</td>
                    <td>{formatRotation(row.rotacionMes)}</td>
                    <td>{number.format(row.licencia)}</td>
                    <td>{row.count} servicio{row.count === 1 ? "" : "s"}</td>
                  </tr>
                ) : (
                  <tr key={row.key} className="campaign-row">
                    <td />
                    <td><span className="campaign-indent">{row.campana}</span></td>
                    <td>{number.format(row.activo)}</td>
                    <td>
                      <input
                        className="required-input"
                        type="text"
                        inputMode="decimal"
                        value={requirements[row.requirementKey] ?? ""}
                        placeholder="0"
                        onChange={(event) => updateRequired(row.requirementKey, event.target.value.replace(/[^\d,.]/g, ""))}
                      />
                    </td>
                    <td className={row.diferencia < 0 ? "negative-cell" : "positive-cell"}>{number.format(row.diferencia)}</td>
                    <td>{number.format(row.bajasMes)}</td>
                    <td>{formatRotation(row.rotacionMes)}</td>
                    <td>{number.format(row.licencia)}</td>
                    <td>{row.observacion || "Sin dato"}</td>
                  </tr>
                ),
              )}
              {!visibleRows.length && (
                <tr>
                  <td colSpan="9" className="empty-cell">Sin datos para mostrar.</td>
                </tr>
              )}
            </tbody>
            {visibleRows.length > 0 && (
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td />
                  <td>{number.format(totals.activo)}</td>
                  <td>{number.format(totals.requeridos)}</td>
                  <td className={totals.diferencia < 0 ? "negative-cell" : "positive-cell"}>{number.format(totals.diferencia)}</td>
                  <td>{number.format(totals.bajasMes)}</td>
                  <td>{formatRotation(totals.rotacionMes)}</td>
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

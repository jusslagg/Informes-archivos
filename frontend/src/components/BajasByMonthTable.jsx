import { ChevronDown, Clipboard } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { copyTableToClipboard, setClipboardTableData } from "../lib/clipboardTable.js";

const number = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });
const hourColumns = [
  "Campaña",
  "Mes",
  "Bajas",
  "Días laborables mes",
  "Días trabajados",
  "Días diferencia",
  "Horas trabajadas",
  "Diferencia horas",
];
const MONTH_ORDER = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

function campaignName(row = {}) {
  return row.Campaña || row["CampaÃ±a"] || row.Campana || row.CAMPANA || row.campana || "Sin dato";
}

function monthSortValue(label = "") {
  const [monthName, year] = String(label).toLowerCase().split(/\s+/);
  return (Number(year) || 0) * 100 + (MONTH_ORDER[monthName] || 0);
}

function dateValue(input) {
  const text = String(input || "").trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!iso) return null;
  const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthEnd(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isWorkingDay(date, settings, holidaySet) {
  const day = date.getDay();
  const mondayBased = day === 0 ? 7 : day;
  const maxDays = settings.includeWeekends ? settings.daysPerWeek : Math.min(settings.daysPerWeek, 5);
  if (mondayBased > maxDays) return false;
  if (settings.excludeHolidays && holidaySet.has(formatDate(date))) return false;
  return true;
}

function countWorkingDays(start, end, settings, holidaySet) {
  if (!start || !end || end < start) return 0;
  let total = 0;
  const current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (current <= end) {
    if (isWorkingDay(current, settings, holidaySet)) total += 1;
    current.setDate(current.getDate() + 1);
  }
  return total;
}

function buildDynamicHourRows(events = [], settings, holidayDates = []) {
  const holidaySet = new Set(holidayDates);
  const grouped = new Map();

  events.forEach((event) => {
    const fecha = dateValue(event["Fecha baja"] || event.fechaBaja || event.fecha_baja);
    if (!fecha) return;
    const campana = campaignName(event);
    const mes = event.Mes || `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
    const key = `${campana}||${mes}`;
    const start = new Date(fecha.getFullYear(), fecha.getMonth(), 1);
    const end = monthEnd(fecha);
    const workingDaysMonth = countWorkingDays(start, end, settings, holidaySet);
    const workedDays = countWorkingDays(start, fecha, settings, holidaySet);
    const missingDays = Math.max(workingDaysMonth - workedDays, 0);
    const current = grouped.get(key) || {
      Campaña: campana,
      Mes: mes,
      Bajas: 0,
      "Días laborables mes": workingDaysMonth,
      "Días trabajados": 0,
      "Días diferencia": 0,
      "Horas trabajadas": 0,
      "Diferencia horas": 0,
    };
    current.Bajas += 1;
    current["Días trabajados"] += workedDays;
    current["Días diferencia"] += missingDays;
    current["Horas trabajadas"] += workedDays * settings.hoursPerDay;
    current["Diferencia horas"] += missingDays * settings.hoursPerDay;
    grouped.set(key, current);
  });

  const rows = [...grouped.values()].sort((a, b) => `${a.Mes} ${a.Campaña}`.localeCompare(`${b.Mes} ${b.Campaña}`));
  const totals = {
    Bajas: rows.reduce((sum, row) => sum + row.Bajas, 0),
    "Días trabajados": rows.reduce((sum, row) => sum + row["Días trabajados"], 0),
    "Días diferencia": rows.reduce((sum, row) => sum + row["Días diferencia"], 0),
    "Horas trabajadas": rows.reduce((sum, row) => sum + row["Horas trabajadas"], 0),
    "Diferencia horas": rows.reduce((sum, row) => sum + row["Diferencia horas"], 0),
  };
  return { rows, totals };
}

export default function BajasByMonthTable({
  months = [],
  rows = [],
  totals = {},
  hourRows = [],
  hourTotals = {},
  hourEvents = [],
  holidayDates = [],
  hoursPerBusinessDay = 6,
  dateRange = { start: "", end: "" },
  onDateRangeChange,
  filterControl = null,
}) {
  const [expandedMonths, setExpandedMonths] = useState(new Set());
  const [hourSettings, setHourSettings] = useState({
    hoursPerDay: hoursPerBusinessDay || 6,
    daysPerWeek: 5,
    includeWeekends: false,
    excludeHolidays: true,
  });
  const columns = ["Campaña", ...months, "Total"];
  const dynamicHours = useMemo(() => {
    if (!hourEvents.length) return { rows: hourRows, totals: hourTotals };
    return buildDynamicHourRows(hourEvents, hourSettings, holidayDates);
  }, [holidayDates, hourEvents, hourRows, hourSettings, hourTotals]);
  const visibleHourRows = dynamicHours.rows || [];
  const visibleHourTotals = useMemo(
    () => ({
      Bajas: visibleHourRows.reduce((sum, row) => sum + (row.Bajas || 0), 0),
      "Días trabajados": visibleHourRows.reduce((sum, row) => sum + (row["Días trabajados"] || row["Días hábiles trabajados"] || 0), 0),
      "Días diferencia": visibleHourRows.reduce((sum, row) => sum + (row["Días diferencia"] || 0), 0),
      "Horas trabajadas": visibleHourRows.reduce((sum, row) => sum + (row["Horas trabajadas"] || 0), 0),
      "Diferencia horas": visibleHourRows.reduce((sum, row) => sum + (row["Diferencia horas"] || 0), 0),
    }),
    [visibleHourRows],
  );
  const monthSummaries = useMemo(() => {
    const grouped = new Map();
    visibleHourRows.forEach((row) => {
      const current = grouped.get(row.Mes) || {
        Mes: row.Mes,
        Bajas: 0,
        Servicios: 0,
        "Días trabajados": 0,
        "Días diferencia": 0,
        "Horas trabajadas": 0,
        "Diferencia horas": 0,
      };
      current.Bajas += row.Bajas || 0;
      current.Servicios += 1;
      current["Días trabajados"] += row["Días trabajados"] || row["Días hábiles trabajados"] || 0;
      current["Días diferencia"] += row["Días diferencia"] || 0;
      current["Horas trabajadas"] += row["Horas trabajadas"] || 0;
      current["Diferencia horas"] += row["Diferencia horas"] || 0;
      grouped.set(row.Mes, current);
    });
    return [...grouped.values()].sort((a, b) => monthSortValue(a.Mes) - monthSortValue(b.Mes));
  }, [visibleHourRows]);
  const toggleMonth = (month) => {
    setExpandedMonths((current) => {
      const next = new Set(current);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });
  };

  const copyLines = [
    columns,
    ...rows.map((row) => columns.map((column) => (column === "Campaña" ? campaignName(row) : row[column] || ""))),
    ["Total", ...months.map((month) => totals[month] || ""), totals.Total || ""],
  ];
  const hourCopyLines = [
    ["Impacto horas por baja"],
    ["Horas por día", hourSettings.hoursPerDay, "Días por semana", hourSettings.daysPerWeek, "Fines de semana", hourSettings.includeWeekends ? "Sí" : "No", "Feriados excluidos", hourSettings.excludeHolidays ? "Sí" : "No"],
    hourColumns,
    ...visibleHourRows.map((row) => hourColumns.map((column) => (column === "Campaña" ? campaignName(row) : row[column] || ""))),
    [
      "Total",
      "",
      visibleHourTotals.Bajas || "",
      "",
      visibleHourTotals["Días trabajados"] || "",
      visibleHourTotals["Días diferencia"] || "",
      visibleHourTotals["Horas trabajadas"] || "",
      visibleHourTotals["Diferencia horas"] || "",
    ],
  ];

  const copyTable = async () => {
    await copyTableToClipboard(copyLines);
  };

  const copyHourTable = async () => {
    await copyTableToClipboard(hourCopyLines);
  };

  const handleCopy = (event) => {
    setClipboardTableData(event, copyLines);
  };

  return (
    <section className="table-wrap compact-a4 monthly-table" onCopy={handleCopy}>
      <div className="table-toolbar">
        <div>
          <h2>Bajas mes por mes</h2>
          <span>Calculado por FECHA BAJA y campaña, respetando filtros</span>
        </div>
        <div className="table-actions">
          {!filterControl && (
            <>
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
            </>
          )}
          <button className="primary-button secondary-button" onClick={copyTable}>
            <Clipboard size={16} />
            Copiar tabla
          </button>
        </div>
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
                <tr key={campaignName(row)}>
                  <td>{campaignName(row)}</td>
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

      <div className="hours-impact-block">
        <div className="table-toolbar compact-toolbar hours-toolbar">
          <div>
            <h2>Impacto horario por bajas</h2>
            <span>Recalcula horas según jornada, días semanales, fines de semana y feriados.</span>
          </div>
          <div className="hours-controls">
            <label>
              <span>Horas/día</span>
              <input
                type="number"
                min="1"
                max="24"
                step="0.5"
                value={hourSettings.hoursPerDay}
                onChange={(event) => setHourSettings((current) => ({ ...current, hoursPerDay: Number(event.target.value) || 0 }))}
              />
            </label>
            <label>
              <span>Días/semana</span>
              <input
                type="number"
                min="1"
                max="7"
                step="1"
                value={hourSettings.daysPerWeek}
                onChange={(event) => setHourSettings((current) => ({ ...current, daysPerWeek: Math.max(1, Math.min(7, Number(event.target.value) || 1)) }))}
              />
            </label>
            <label className="toggle-field">
              <input
                type="checkbox"
                checked={hourSettings.includeWeekends}
                onChange={(event) => setHourSettings((current) => ({ ...current, includeWeekends: event.target.checked }))}
              />
              <span>Contar fines de semana</span>
            </label>
            <label className="toggle-field">
              <input
                type="checkbox"
                checked={hourSettings.excludeHolidays}
                onChange={(event) => setHourSettings((current) => ({ ...current, excludeHolidays: event.target.checked }))}
              />
              <span>Excluir feriados</span>
            </label>
            <button className="primary-button secondary-button" onClick={copyHourTable}>
              <Clipboard size={16} />
              Copiar horas
            </button>
          </div>
        </div>
        <div className="table-scroll compact-hours-table">
          <table>
            <thead>
              <tr>
                <th>Mes</th>
                <th>Servicios</th>
                <th>Bajas</th>
                <th>Días trabajados</th>
                <th>Días diferencia</th>
                <th>Horas trabajadas</th>
                <th>Diferencia horas</th>
              </tr>
            </thead>
            <tbody>
              {monthSummaries.length ? (
                monthSummaries.map((summary) => {
                  const isExpanded = expandedMonths.has(summary.Mes);
                  const detailRows = visibleHourRows
                    .filter((row) => row.Mes === summary.Mes)
                    .sort((a, b) => campaignName(a).localeCompare(campaignName(b)));
                  return (
                    <Fragment key={summary.Mes}>
                      <tr className="hour-summary-row">
                        <td>
                          <button className="row-expander" type="button" onClick={() => toggleMonth(summary.Mes)} title="Ver detalle por servicio">
                            <ChevronDown size={14} className={isExpanded ? "open" : ""} />
                            {summary.Mes}
                          </button>
                        </td>
                        <td>{number.format(summary.Servicios || 0)}</td>
                        <td>{number.format(summary.Bajas || 0)}</td>
                        <td>{number.format(summary["Días trabajados"] || 0)}</td>
                        <td>{number.format(summary["Días diferencia"] || 0)}</td>
                        <td>{number.format(summary["Horas trabajadas"] || 0)}</td>
                        <td>{number.format(summary["Diferencia horas"] || 0)}</td>
                      </tr>
                      {isExpanded &&
                        detailRows.map((row) => (
                          <tr className="hour-detail-row" key={`${campaignName(row)}-${row.Mes}`}>
                            <td>{campaignName(row)}</td>
                            <td>{number.format(row["Días laborables mes"] || row["Días hábiles mes"] || 0)} días mes</td>
                            <td>{number.format(row.Bajas || 0)}</td>
                            <td>{number.format(row["Días trabajados"] || row["Días hábiles trabajados"] || 0)}</td>
                            <td>{number.format(row["Días diferencia"] || 0)}</td>
                            <td>{number.format(row["Horas trabajadas"] || 0)}</td>
                            <td>{number.format(row["Diferencia horas"] || 0)}</td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    Sin bajas con fecha válida para calcular horas.
                  </td>
                </tr>
              )}
            </tbody>
            {monthSummaries.length > 0 && (
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td>{number.format(monthSummaries.reduce((sum, row) => sum + (row.Servicios || 0), 0))}</td>
                  <td>{number.format(visibleHourTotals.Bajas || 0)}</td>
                  <td>{number.format(visibleHourTotals["Días trabajados"] || visibleHourTotals["Días hábiles trabajados"] || 0)}</td>
                  <td>{number.format(visibleHourTotals["Días diferencia"] || 0)}</td>
                  <td>{number.format(visibleHourTotals["Horas trabajadas"] || 0)}</td>
                  <td>{number.format(visibleHourTotals["Diferencia horas"] || 0)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </section>
  );
}


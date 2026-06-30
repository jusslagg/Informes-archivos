import { CalendarDays, Clipboard } from "lucide-react";
import { useMemo } from "react";
import { copyTableToClipboard, setClipboardTableData } from "../lib/clipboardTable.js";

const number = new Intl.NumberFormat("es-AR");
const dayLabels = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const monthFormatter = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" });
const shortDateFormatter = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit" });

function parseIsoDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function buildWeeks(month, events) {
  const [year, monthNumber] = String(month || "").split("-").map(Number);
  if (!year || !monthNumber) return [];

  const monthStart = new Date(year, monthNumber - 1, 1);
  const monthEnd = new Date(year, monthNumber, 0);
  const firstMonday = addDays(monthStart, -((monthStart.getDay() + 6) % 7));
  const counts = new Map();

  events.forEach((event) => {
    const date = parseIsoDate(event["Fecha baja"] || event.fechaBaja || event.fecha_baja);
    if (!date || date < monthStart || date > monthEnd) return;
    const key = formatIsoDate(date);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const weeks = [];
  for (let weekStart = firstMonday; weekStart <= monthEnd; weekStart = addDays(weekStart, 7)) {
    const days = dayLabels.map((label, index) => {
      const date = addDays(weekStart, index);
      return {
        label,
        date,
        dateKey: formatIsoDate(date),
        inMonth: date.getMonth() === monthNumber - 1,
        count: counts.get(formatIsoDate(date)) || 0,
      };
    });
    weeks.push({
      key: formatIsoDate(weekStart),
      start: weekStart,
      end: addDays(weekStart, 6),
      displayStart: weekStart < monthStart ? monthStart : weekStart,
      displayEnd: addDays(weekStart, 6) > monthEnd ? monthEnd : addDays(weekStart, 6),
      days,
      total: days.reduce((sum, day) => sum + day.count, 0),
    });
  }
  return weeks;
}

export default function BajasWeeklyTable({ month, events = [], onMonthChange }) {
  const weeks = useMemo(() => buildWeeks(month, events), [month, events]);
  const total = weeks.reduce((sum, week) => sum + week.total, 0);
  const selectedDate = parseIsoDate(`${month}-01`);
  const monthLabel = selectedDate ? monthFormatter.format(selectedDate) : "mes seleccionado";
  const columns = ["Semana", "Bajas"];
  const copyLines = [
    columns,
    ...weeks.map((week) => [
      `${shortDateFormatter.format(week.displayStart)} al ${shortDateFormatter.format(week.displayEnd)}`,
      week.total,
    ]),
    ["Total del mes", total],
  ];

  const copyTable = async () => copyTableToClipboard(copyLines);
  const handleCopy = (event) => setClipboardTableData(event, copyLines);

  return (
    <section className="table-wrap compact-a4 weekly-bajas-table" onCopy={handleCopy}>
      <div className="table-toolbar">
        <div>
          <h2>Bajas por semana</h2>
          <span>Semanas de lunes a domingo · sólo fechas de {monthLabel}</span>
        </div>
        <div className="weekly-bajas-actions">
          <label className="date-field">
            <span>Mes</span>
            <input
              type="month"
              value={month || ""}
              onChange={(event) => event.target.value && onMonthChange(event.target.value)}
            />
          </label>
          <button className="primary-button secondary-button" onClick={copyTable}>
            <Clipboard size={16} />
            Copiar tabla
          </button>
        </div>
      </div>

      <div className="weekly-bajas-summary">
        <CalendarDays size={17} />
        <strong>{number.format(total)} bajas</strong>
        <span>en {weeks.length} semanas calendario</span>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((column) => <th key={column}>{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, index) => (
              <tr key={week.key}>
                <td>
                  <strong>Semana {index + 1}</strong>
                  <small>{shortDateFormatter.format(week.displayStart)} al {shortDateFormatter.format(week.displayEnd)}</small>
                </td>
                <td>{number.format(week.total)}</td>
              </tr>
            ))}
          </tbody>
          {weeks.length > 0 && (
            <tfoot>
              <tr>
                <td>Total del mes</td>
                <td>{number.format(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Download,
  Edit3,
  ListChecks,
  Plus,
  Power,
  PowerOff,
  Save,
  Search,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  getRequirementCatalog,
  getSavedHolidays,
  getSavedRequirements,
  saveRequirementCatalog,
  saveSavedHolidays,
  saveSavedRequirements,
} from "../api/client.js";
import MetricCard from "../components/MetricCard.jsx";

const number = new Intl.NumberFormat("es-AR");
const monthNames = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const dayNames = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

const emptyForm = {
  gerente: "",
  jefeSite: "",
  cliente: "",
  campana: "",
  subcampana: "",
};

const emptyFilters = {
  gerente: "",
  jefeSite: "",
  cliente: "",
  campana: "",
  subcampana: "",
  start: "",
  end: "",
};

const dayColumnWidth = 52;
const structureColumnWidth = 180;
const totalColumnWidth = 74;

function currentMonthValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonthValue(monthValue, amount) {
  const safeMonth = /^\d{4}-\d{2}$/.test(monthValue) ? monthValue : currentMonthValue();
  const [year, month] = safeMonth.split("-").map(Number);
  const date = new Date(year, month - 1 + amount, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function clean(value) {
  return String(value || "").trim();
}

function parseNumber(value) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function daysForMonth(monthValue) {
  const safeMonth = /^\d{4}-\d{2}$/.test(monthValue) ? monthValue : currentMonthValue();
  const [year, month] = safeMonth.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return Array.from({ length: lastDay }, (_, index) => {
    const day = index + 1;
    const date = new Date(year, month - 1, day);
    return {
      key: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      label: String(day).padStart(2, "0"),
      weekday: date.getDay(),
      weekdayLabel: dayNames[date.getDay()],
    };
  });
}

function dateFromKey(key) {
  const match = String(key || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function dayFromDate(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return {
    key: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    label: String(day).padStart(2, "0"),
    weekday: date.getDay(),
    weekdayLabel: dayNames[date.getDay()],
  };
}

function daysForRange(startKey, endKey) {
  const start = dateFromKey(startKey);
  const end = dateFromKey(endKey || startKey);
  if (!start || !end) return [];
  const first = start <= end ? start : end;
  const last = start <= end ? end : start;
  const days = [];
  const cursor = new Date(first);
  while (cursor <= last) {
    days.push(dayFromDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function makeId(row) {
  return [row.gerente, row.jefeSite, row.cliente, row.campana, row.subcampana].map(normalize).join("||");
}

function structureOnly(row) {
  return {
    id: row.id,
    gerente: row.gerente,
    jefeSite: row.jefeSite,
    cliente: row.cliente,
    campana: row.campana,
    subcampana: row.subcampana,
    active: row.active !== false,
    daily: {},
  };
}

function normalizeRow(row) {
  return {
    id: row.id || makeId(row) || `${Date.now()}`,
    gerente: clean(row.gerente),
    jefeSite: clean(row.jefeSite),
    cliente: clean(row.cliente),
    campana: clean(row.campana),
    subcampana: clean(row.subcampana),
    active: row.active !== false,
    daily: row.daily || {},
  };
}

function mapDailyToMonth(daily = {}, monthValue) {
  const monthDays = daysForMonth(monthValue);
  const byDayNumber = Object.entries(daily).reduce((acc, [key, value]) => {
    const dayNumber = String(key).match(/(\d{2})$/)?.[1];
    if (dayNumber) acc[dayNumber] = value;
    return acc;
  }, {});
  return Object.fromEntries(
    monthDays
      .map((day) => [day.key, byDayNumber[day.label] || ""])
      .filter(([, value]) => value !== ""),
  );
}

function cloneRowsToMonth(rows = [], monthValue) {
  return rows.map((row) => ({
    id: row.id,
    gerente: row.gerente,
    jefeSite: row.jefeSite,
    cliente: row.cliente,
    campana: row.campana,
    subcampana: row.subcampana,
    active: row.active !== false,
    daily: mapDailyToMonth(row.daily || {}, monthValue),
  }));
}

function mergeCatalogWithMonth(monthRows = [], catalogRows = []) {
  const savedById = new Map(monthRows.map((row) => [row.id, row]));
  return catalogRows.map((catalogRow) => {
    const savedRow = savedById.get(catalogRow.id);
    return {
      ...catalogRow,
      daily: savedRow?.daily || {},
    };
  });
}

function buildMasterRequirements(rows = []) {
  return rows.filter((row) => row.active !== false).reduce((acc, row) => {
    const key = [row.cliente, row.campana, row.subcampana].map(normalize).join("||");
    const current = acc[key] || { total: 0, daily: {} };
    Object.entries(row.daily || {}).forEach(([day, value]) => {
      current.daily[day] = parseNumber(current.daily[day]) + parseNumber(value);
    });
    current.total += Object.values(row.daily || {}).reduce((sum, value) => sum + parseNumber(value), 0);
    acc[key] = current;
    return acc;
  }, {});
}

export default function RequeridosPage() {
  const fileInputRef = useRef(null);
  const [month, setMonth] = useState(currentMonthValue);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(emptyFilters);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [catalogRows, setCatalogRows] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [holidayForm, setHolidayForm] = useState({ date: "", label: "" });
  const [editingId, setEditingId] = useState("");
  const [activeTab, setActiveTab] = useState("calendar");

  const selectedMonth = /^\d{4}-\d{2}$/.test(month) ? month : currentMonthValue();
  const selectedYear = selectedMonth.split("-")[0];
  const selectedMonthIndex = Number(selectedMonth.split("-")[1]) - 1;
  const days = useMemo(() => daysForMonth(selectedMonth), [selectedMonth]);
  const visibleDays = useMemo(
    () => {
      if (filters.start || filters.end) return daysForRange(filters.start || filters.end, filters.end || filters.start);
      return days;
    },
    [days, filters.end, filters.start],
  );
  const calendarTableWidth = (structureColumnWidth * 5) + (visibleDays.length * dayColumnWidth) + totalColumnWidth;
  const calendarTitle =
    filters.start || filters.end
      ? `Proyección ${visibleDays[0]?.label || ""} a ${visibleDays.at(-1)?.label || ""}`
      : `Calendario ${monthNames[selectedMonthIndex]} ${selectedYear}`;

  const holidayDates = useMemo(() => new Set(holidays.map((holiday) => holiday.date)), [holidays]);
  const sortedHolidays = useMemo(
    () => [...holidays].sort((a, b) => String(a.date).localeCompare(String(b.date))),
    [holidays],
  );

  useEffect(() => {
    getSavedHolidays(selectedYear)
      .then((saved) => setHolidays(saved.holidays || []))
      .catch(() => setHolidays([]));
  }, [selectedYear]);

  useEffect(() => {
    setLoading(true);
    Promise.all([getSavedRequirements(selectedMonth), getRequirementCatalog()])
      .then(([saved, catalog]) => {
        const savedRows = (saved.rows || []).map(normalizeRow);
        const storedCatalogRows = (catalog.rows || []).map(normalizeRow);
        const baseCatalogRows = storedCatalogRows.length ? storedCatalogRows : savedRows.map(structureOnly);
        const nextRows = baseCatalogRows.length ? mergeCatalogWithMonth(savedRows, baseCatalogRows) : [];
        setRows(nextRows);
        setCatalogRows(baseCatalogRows);
        if (!storedCatalogRows.length && savedRows.length) {
          saveRequirementCatalog({ rows: savedRows.map(structureOnly) }).catch(() => {});
        }
        if (nextRows.length || savedRows.length) {
          saveSavedRequirements(selectedMonth, {
            rows: nextRows,
            draft: saved.draft || emptyForm,
            masterRequirements: buildMasterRequirements(nextRows),
          }).catch(() => {});
        }
        setForm({ ...emptyForm, ...(saved.draft || {}) });
        setEditingId("");
      })
      .catch(() => setRows([]))
      .finally(() => {
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth]);

  const filterOptions = useMemo(() => {
    const options = {};
    ["gerente", "jefeSite", "cliente", "campana", "subcampana"].forEach((field) => {
      options[field] = [...new Set(rows.map((row) => clean(row[field])).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    });
    return options;
  }, [rows]);

  const filteredRows = useMemo(
    () =>
      rows
        .filter((row) =>
          `${row.gerente} ${row.jefeSite} ${row.cliente} ${row.campana} ${row.subcampana}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .filter((row) =>
          ["gerente", "jefeSite", "cliente", "campana", "subcampana"].every(
            (field) => !filters[field] || row[field] === filters[field],
          ),
        ),
    [filters, query, rows],
  );

  const totals = useMemo(() => {
    const activeRows = rows.filter((row) => row.active !== false);
    const monthTotal = activeRows.reduce(
      (sum, row) => sum + Object.values(row.daily || {}).reduce((inner, value) => inner + parseNumber(value), 0),
      0,
    );
    const projectionTotal = filteredRows.filter((row) => row.active !== false).reduce(
      (sum, row) => sum + visibleDays.reduce((inner, day) => inner + parseNumber(row.daily?.[day.key]), 0),
      0,
    );
    return {
      rows: rows.length,
      activeRows: activeRows.length,
      inactiveRows: rows.length - activeRows.length,
      clients: new Set(activeRows.map((row) => normalize(row.cliente))).size,
      campaigns: new Set(activeRows.map((row) => `${normalize(row.cliente)}||${normalize(row.campana)}`)).size,
      monthTotal,
      projectionTotal,
    };
  }, [filteredRows, rows, visibleDays]);

  const persistState = async (nextRows = rows, nextForm = form) => {
    setStatus("Guardando...");
    try {
      await saveSavedRequirements(selectedMonth, {
        rows: nextRows,
        draft: nextForm,
        masterRequirements: buildMasterRequirements(nextRows),
      });
      window.dispatchEvent(new Event("requeridos-updated"));
      setStatus("Guardado");
    } catch (err) {
      setStatus(err.message || "No se pudo guardar");
    }
  };

  const persistCatalog = async (nextRows) => {
    const nextCatalogRows = nextRows.map(structureOnly);
    setCatalogRows(nextCatalogRows);
    await saveRequirementCatalog({ rows: nextCatalogRows });
  };

  const persistHolidays = async (nextHolidays) => {
    setHolidays(nextHolidays);
    try {
      await saveSavedHolidays(selectedYear, { holidays: nextHolidays });
      setStatus("Feriados guardados");
    } catch (err) {
      setStatus(err.message || "No se pudieron guardar feriados");
    }
  };

  const changeMonth = async (nextMonth) => {
    setMonth(nextMonth);
  };

  const updateRows = (nextRows) => {
    setRows(nextRows);
    persistState(nextRows, form);
  };

  const updateFormField = (field, value) => {
    const nextForm = { ...form, [field]: value };
    setForm(nextForm);
    persistState(rows, nextForm);
  };

  const cancelEdit = () => {
    setEditingId("");
    setForm(emptyForm);
    persistState(rows, emptyForm);
  };

  const addRow = () => {
    const baseRow = {
      gerente: clean(form.gerente),
      jefeSite: clean(form.jefeSite),
      cliente: clean(form.cliente),
      campana: clean(form.campana),
      subcampana: clean(form.subcampana),
    };
    const nextRow = {
      ...baseRow,
      id: editingId || makeId(baseRow) || `${Date.now()}`,
      active: true,
      daily: {},
    };
    if (!nextRow.gerente || !nextRow.jefeSite || !nextRow.cliente || !nextRow.campana || !nextRow.subcampana) return;
    const nextRows = editingId
      ? rows.map((row) =>
          row.id === editingId
            ? {
                ...row,
                ...nextRow,
                active: row.active !== false,
                daily: row.daily || {},
              }
            : row,
        )
      : [...rows.filter((row) => row.id !== nextRow.id), nextRow];
    setRows(nextRows);
    setForm(emptyForm);
    setEditingId("");
    persistState(nextRows, emptyForm);
    persistCatalog(nextRows).catch((err) => setStatus(err.message || "No se pudo guardar la cuenta"));
  };

  const removeRow = (id) => {
    const row = rows.find((item) => item.id === id);
    const label = row ? `${row.cliente} / ${row.campana} / ${row.subcampana}` : "esta cuenta";
    if (window.confirm(`¿Eliminar ${label}? Esta acción quita también los requeridos cargados para el mes.`)) {
      const nextRows = rows.filter((item) => item.id !== id);
      updateRows(nextRows);
      persistCatalog(nextRows).catch((err) => setStatus(err.message || "No se pudo eliminar la cuenta"));
    }
  };

  const editRow = (row) => {
    if (row.active === false) return;
    setEditingId(row.id);
    setForm({
      gerente: row.gerente,
      jefeSite: row.jefeSite,
      cliente: row.cliente,
      campana: row.campana,
      subcampana: row.subcampana,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleRowActive = (id) => {
    const nextRows = rows.map((row) =>
      row.id === id
        ? {
            ...row,
            active: row.active === false,
          }
        : row,
    );
    if (editingId === id) {
      setEditingId("");
      setForm(emptyForm);
    }
    updateRows(nextRows);
    persistCatalog(nextRows).catch((err) => setStatus(err.message || "No se pudo actualizar la cuenta"));
  };

  const updateDaily = (id, dayKey, value) => {
    const cleanValue = value.replace(/[^\d,.]/g, "");
    updateRows(
      rows.map((row) =>
        row.id === id && row.active !== false
          ? {
              ...row,
              daily: {
                ...(row.daily || {}),
                [dayKey]: cleanValue,
              },
            }
          : row,
      ),
    );
  };

  const addHoliday = () => {
    if (!holidayForm.date) return;
    const nextHoliday = {
      date: holidayForm.date,
      label: clean(holidayForm.label) || "Feriado",
    };
    const nextHolidays = [...holidays.filter((holiday) => holiday.date !== nextHoliday.date), nextHoliday].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    persistHolidays(nextHolidays);
    setHolidayForm({ date: "", label: "" });
  };

  const removeHoliday = (date) => {
    persistHolidays(holidays.filter((holiday) => holiday.date !== date));
  };

  const dayTone = (day) => {
    if (holidayDates.has(day.key)) return "holiday";
    if (day.weekday === 0) return "sun";
    if (day.weekday === 6) return "sat";
    return "week";
  };

  const downloadTemplate = () => {
    const templateDays = daysForMonth(selectedMonth);
    const headers = ["Gerente", "Jefe de site", "Cliente", "Campaña", "Subcampaña", ...templateDays.map((day) => day.label)];
    const templateRows = rows.length
      ? rows.map((row) => ({
          Gerente: row.gerente,
          "Jefe de site": row.jefeSite,
          Cliente: row.cliente,
          Campaña: row.campana,
          Subcampaña: row.subcampana,
          ...Object.fromEntries(templateDays.map((day) => [day.label, row.daily?.[day.key] || ""])),
        }))
      : [
          Object.fromEntries(headers.map((header) => [header, ""])),
        ];
    const worksheet = XLSX.utils.json_to_sheet(templateRows, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Requeridos");
    XLSX.writeFile(workbook, `template_requeridos_${selectedMonth}.xlsx`);
  };

  const importTemplate = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", raw: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const imported = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
      const monthDays = daysForMonth(selectedMonth);
      const dayByLabel = new Map(monthDays.map((day) => [day.label, day]));
      const nextRows = imported
        .map((item) => {
          const row = {
            gerente: clean(item.Gerente),
            jefeSite: clean(item["Jefe de site"] || item["Jefe Site"]),
            cliente: clean(item.Cliente),
            campana: clean(item.Campaña || item.Campana),
            subcampana: clean(item.Subcampaña || item.Subcampana || item["Sub campaña"] || item["Sub campana"]),
          };
          if (!row.gerente || !row.jefeSite || !row.cliente || !row.campana || !row.subcampana) return null;
          const daily = {};
          Object.entries(item).forEach(([column, value]) => {
            const dayNumber = String(column).match(/(\d{1,2})$/)?.[1]?.padStart(2, "0");
            const day = dayByLabel.get(dayNumber);
            if (day && String(value ?? "").trim() !== "") daily[day.key] = String(value).replace(/[^\d,.]/g, "");
          });
          return { ...row, id: makeId(row), active: true, daily };
        })
        .filter(Boolean);
      const mergedRows = [...rows.filter((row) => !nextRows.some((nextRow) => nextRow.id === row.id)), ...nextRows];
      setRows(mergedRows);
      await persistState(mergedRows, form);
      await persistCatalog(mergedRows);
      setStatus(`Importado: ${nextRows.length} fila${nextRows.length === 1 ? "" : "s"}`);
    } catch (err) {
      setStatus(err.message || "No se pudo importar el template");
    } finally {
      event.target.value = "";
    }
  };

  const copyTable = async () => {
    const header = [
      "Gerente",
      "Jefe de site",
      "Cliente",
      "Campaña",
      "Subcampaña",
      ...visibleDays.map((day) => `${day.weekdayLabel} ${day.label}`),
      "Total proyección",
    ];
    const body = filteredRows.map((row) => [
      row.gerente,
      row.jefeSite,
      row.cliente,
      row.campana,
      row.subcampana,
      ...visibleDays.map((day) => row.daily?.[day.key] || ""),
      visibleDays.reduce((sum, day) => sum + parseNumber(row.daily?.[day.key]), 0),
    ]);
    await navigator.clipboard.writeText([header, ...body].map((line) => line.join("\t")).join("\n"));
  };

  return (
    <div className="page-stack requeridos-page">
      <header className="page-header">
        <div>
          <p>Planificación</p>
          <h1>Requeridos</h1>
        </div>
        <div className="header-actions">
          <label className="month-control">
            <CalendarDays size={16} />
            <button type="button" onClick={() => changeMonth(shiftMonthValue(selectedMonth, -1))} title="Mes anterior">
              <ChevronLeft size={16} />
            </button>
            <input type="month" value={month} onChange={(event) => changeMonth(event.target.value || currentMonthValue())} />
            <button type="button" onClick={() => changeMonth(shiftMonthValue(selectedMonth, 1))} title="Mes siguiente">
              <ChevronRight size={16} />
            </button>
          </label>
          <button className="icon-button" onClick={copyTable} title="Copiar tabla">
            <Clipboard size={18} />
          </button>
          <button className="icon-button" onClick={downloadTemplate} title="Descargar template">
            <Download size={18} />
          </button>
          <button className="icon-button" onClick={() => fileInputRef.current?.click()} title="Importar template">
            <Upload size={18} />
          </button>
          <button className="icon-button" onClick={() => persistState(rows, form)} title="Guardar">
            <Save size={18} />
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={importTemplate} hidden />
        </div>
      </header>

      <nav className="required-tabs" aria-label="Secciones de requeridos">
        <button className={activeTab === "calendar" ? "active" : ""} onClick={() => setActiveTab("calendar")}>
          <CalendarDays size={16} />
          Calendario
        </button>
        <button className={activeTab === "accounts" ? "active" : ""} onClick={() => setActiveTab("accounts")}>
          <Users size={16} />
          Cuentas
        </button>
        <button className={activeTab === "holidays" ? "active" : ""} onClick={() => setActiveTab("holidays")}>
          <ListChecks size={16} />
          Feriados
        </button>
      </nav>

      {activeTab === "accounts" && (
        <>
      <section className="table-wrap required-form-panel">
        <div className="table-toolbar">
          <div>
            <h2>{editingId ? "Editar cuenta" : "Formulario"}</h2>
            <span>Estos datos generan la fila calendario para cargar la dotación requerida por día.</span>
          </div>
          <span className="status-file">{loading ? "Cargando..." : status}</span>
        </div>
        <div className="required-form-grid">
          {[
            ["gerente", "Gerente"],
            ["jefeSite", "Jefe de site"],
            ["cliente", "Cliente"],
            ["campana", "Campaña"],
            ["subcampana", "Subcampaña"],
          ].map(([field, label]) => (
            <label key={field}>
              <span>{label}</span>
              <input value={form[field]} onChange={(event) => updateFormField(field, event.target.value)} />
            </label>
          ))}
          <div className="required-form-actions">
            <button
              className="primary-button"
              onClick={addRow}
              disabled={!form.gerente.trim() || !form.jefeSite.trim() || !form.cliente.trim() || !form.campana.trim() || !form.subcampana.trim()}
            >
              {editingId ? <Save size={16} /> : <Plus size={16} />}
              {editingId ? "Actualizar" : "Agregar"}
            </button>
            {editingId && (
              <button className="icon-button" onClick={cancelEdit} title="Cancelar edición">
                <X size={18} />
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="metric-grid requeridos-metrics">
        <MetricCard label="Cuentas activas" value={number.format(totals.activeRows)} tone="success" />
        <MetricCard label="Inactivas" value={number.format(totals.inactiveRows)} />
        <MetricCard label="Clientes" value={number.format(totals.clients)} />
        <MetricCard label="Campañas" value={number.format(totals.campaigns)} />
        <MetricCard label="Requeridos mes" value={number.format(totals.monthTotal)} tone="success" />
        <MetricCard label="Proyección filtrada" value={number.format(totals.projectionTotal)} tone="success" />
      </section>

        </>
      )}

      {activeTab === "holidays" && (
      <section className="table-wrap required-form-panel">
        <div className="table-toolbar">
          <div>
            <h2>Feriados {selectedYear}</h2>
            <span>Declaralos una vez por año para que el calendario los reconozca.</span>
          </div>
        </div>
        <div className="required-form-grid holiday-form-grid">
          <label>
            <span>Fecha</span>
            <input
              type="date"
              value={holidayForm.date}
              onChange={(event) => setHolidayForm((current) => ({ ...current, date: event.target.value }))}
            />
          </label>
          <label>
            <span>Nombre</span>
            <input
              value={holidayForm.label}
              onChange={(event) => setHolidayForm((current) => ({ ...current, label: event.target.value }))}
            />
          </label>
          <button className="primary-button" onClick={addHoliday} disabled={!holidayForm.date}>
            <Plus size={16} />
            Agregar feriado
          </button>
        </div>
        <div className="holiday-list">
          {sortedHolidays.map((holiday) => (
            <div key={holiday.date} className="holiday-list-row">
              <span className="holiday-date">{holiday.date.split("-").reverse().join("/")}</span>
              <span className="holiday-name">{holiday.label}</span>
              {holiday.date} · {holiday.label}
              <button className="icon-button mini-icon-button danger-action" onClick={() => removeHoliday(holiday.date)} title="Eliminar feriado">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {!holidays.length && <span className="muted">Sin feriados cargados para este año.</span>}
        </div>
      </section>
      )}

      {activeTab === "calendar" && (
      <section className="table-wrap required-filter-panel">
        <div className="table-toolbar">
          <div>
            <h2>Filtros y proyección</h2>
            <span>Filtrá por estructura y por rango de fechas calendario.</span>
          </div>
          <button className="primary-button secondary-button" onClick={() => setFilters(emptyFilters)}>
            Limpiar
          </button>
        </div>
        <div className="required-filter-grid">
          {[
            ["gerente", "Gerente"],
            ["jefeSite", "Jefe de site"],
            ["cliente", "Cliente"],
            ["campana", "Campaña"],
            ["subcampana", "Subcampaña"],
          ].map(([field, label]) => (
            <label key={field}>
              <span>{label}</span>
              <select value={filters[field]} onChange={(event) => setFilters((current) => ({ ...current, [field]: event.target.value }))}>
                <option value="">Todos</option>
                {filterOptions[field].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label>
            <span>Desde</span>
            <input type="date" value={filters.start} onChange={(event) => setFilters((current) => ({ ...current, start: event.target.value }))} />
          </label>
          <label>
            <span>Hasta</span>
            <input type="date" value={filters.end} onChange={(event) => setFilters((current) => ({ ...current, end: event.target.value }))} />
          </label>
        </div>
      </section>
      )}

      {activeTab === "accounts" && (
      <section className="table-wrap account-list-table">
        <div className="table-toolbar">
          <div>
            <h2>Cuentas</h2>
            <span>Administrá el estado de cada cuenta sin tocar el calendario de carga diaria.</span>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Estado</th>
                <th>Gerente</th>
                <th>Jefe de site</th>
                <th>Cliente</th>
                <th>Campaña</th>
                <th>Subcampaña</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const isInactive = row.active === false;
                return (
                  <tr key={`account-${row.id}`} className={isInactive ? "inactive-account-row" : ""}>
                    <td>
                      <span className={`account-status ${isInactive ? "inactive" : "active"}`}>
                        {isInactive ? "Inactiva" : "Activa"}
                      </span>
                    </td>
                    <td>{row.gerente}</td>
                    <td>{row.jefeSite}</td>
                    <td>{row.cliente}</td>
                    <td>{row.campana}</td>
                    <td>{row.subcampana}</td>
                    <td>
                      <div className="account-actions">
                        <button className="icon-button mini-icon-button" onClick={() => editRow(row)} title="Editar cuenta" disabled={isInactive}>
                          <Edit3 size={14} />
                        </button>
                        <button
                          className="icon-button mini-icon-button"
                          onClick={() => toggleRowActive(row.id)}
                          title={isInactive ? "Activar cuenta" : "Desactivar cuenta"}
                        >
                          {isInactive ? <Power size={14} /> : <PowerOff size={14} />}
                        </button>
                        <button className="icon-button mini-icon-button danger-action" onClick={() => removeRow(row.id)} title="Eliminar cuenta">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filteredRows.length && (
                <tr>
                  <td className="empty-cell" colSpan="7">Sin cuentas cargadas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {activeTab === "calendar" && (
      <section className="table-wrap requeridos-table">
        <div className="table-toolbar">
          <div>
            <h2>{calendarTitle}</h2>
            <span>Cargá el requerido diario en cada celda.</span>
          </div>
          <label className="search-field compact">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar" />
          </label>
        </div>
        <div className="table-scroll">
          <table style={{ width: `${calendarTableWidth}px`, minWidth: `${calendarTableWidth}px` }}>
            <colgroup>
              {["gerente", "jefeSite", "cliente", "campana", "subcampana"].map((column) => (
                <col key={column} style={{ width: `${structureColumnWidth}px` }} />
              ))}
              {visibleDays.map((day) => (
                <col key={`col-${day.key}`} style={{ width: `${dayColumnWidth}px` }} />
              ))}
              <col style={{ width: `${totalColumnWidth}px` }} />
            </colgroup>
            <thead>
              <tr className="calendar-weekdays">
                <th colSpan="5" />
                {visibleDays.map((day) => (
                  <th key={`weekday-${day.key}`} className="calendar-weekday">{day.weekdayLabel}</th>
                ))}
                <th />
              </tr>
              <tr>
                <th>Gerente</th>
                <th>Jefe de site</th>
                <th>Cliente</th>
                <th>Campaña</th>
                <th>Subcampaña</th>
                {visibleDays.map((day) => (
                  <th key={day.key} className={`calendar-day ${dayTone(day)}`}>
                    {day.label}
                  </th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const isInactive = row.active === false;
                const total = isInactive ? 0 : visibleDays.reduce((sum, day) => sum + parseNumber(row.daily?.[day.key]), 0);
                return (
                  <tr key={row.id} className={isInactive ? "inactive-account-row" : ""}>
                    <td>{row.gerente}</td>
                    <td>{row.jefeSite}</td>
                    <td>{row.cliente}</td>
                    <td>{row.campana}</td>
                    <td>{row.subcampana}</td>
                    {visibleDays.map((day) => (
                      <td key={day.key} className={`calendar-value ${dayTone(day)}`}>
                        <input
                          className="required-input"
                          type="text"
                          inputMode="decimal"
                          value={row.daily?.[day.key] || ""}
                          disabled={isInactive}
                          onChange={(event) => updateDaily(row.id, day.key, event.target.value)}
                        />
                      </td>
                    ))}
                    <td className="total-cell">{number.format(total)}</td>
                  </tr>
                );
              })}
              {!filteredRows.length && (
                <tr>
                  <td className="empty-cell" colSpan={6 + visibleDays.length}>Sin filas cargadas.</td>
                </tr>
              )}
            </tbody>
            {filteredRows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan="5">Total</td>
                  {visibleDays.map((day) => {
                    const total = filteredRows
                      .filter((row) => row.active !== false)
                      .reduce((sum, row) => sum + parseNumber(row.daily?.[day.key]), 0);
                    return <td key={day.key}>{total ? number.format(total) : ""}</td>;
                  })}
                  <td>{number.format(totals.projectionTotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
      )}
    </div>
  );
}


import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  CheckCircle2,
  Download,
  Edit3,
  Eraser,
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
import { Button } from "../components/ui/button.jsx";
import { Card } from "../components/ui/card.jsx";

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
const totalColumnWidth = 86;

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

function parseMonthValue(value, fallback = currentMonthValue()) {
  const rawValue = String(value || "").trim().toLowerCase();
  const isoMatch = rawValue.match(/^(\d{4})-(\d{1,2})$/);
  if (isoMatch) return `${isoMatch[1]}-${String(Number(isoMatch[2])).padStart(2, "0")}`;
  const slashMatch = rawValue.match(/^(\d{1,2})[/-](\d{4})$/);
  if (slashMatch) return `${slashMatch[2]}-${String(Number(slashMatch[1])).padStart(2, "0")}`;
  const namedMonth = monthNames.findIndex((monthName) => normalize(rawValue).includes(normalize(monthName)));
  const yearMatch = rawValue.match(/\b(20\d{2})\b/);
  if (namedMonth >= 0 && yearMatch) return `${yearMatch[1]}-${String(namedMonth + 1).padStart(2, "0")}`;
  return fallback;
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

function getImportValue(item, ...aliases) {
  const wanted = new Set(aliases.map(normalize));
  const entry = Object.entries(item || {}).find(([key]) => wanted.has(normalize(key)));
  return entry ? entry[1] : "";
}

function parseNumber(value) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function cellKey(rowId, dayKey) {
  return `${rowId}__${dayKey}`;
}

function splitCellKey(key) {
  const [rowId, dayKey] = String(key || "").split("__");
  return { rowId, dayKey };
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

function campaignMatchKey(row) {
  return [row.campana, row.subcampana].map(normalize).join("||");
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

function mergeRowsByCampaign(rows = []) {
  const merged = new Map();
  rows.map(normalizeRow).forEach((row) => {
    const key = campaignMatchKey(row);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, row);
      return;
    }
    merged.set(key, {
      ...current,
      active: current.active !== false && row.active !== false,
      daily: {
        ...(current.daily || {}),
        ...Object.fromEntries(
          Object.entries(row.daily || {}).filter(([, value]) => String(value ?? "").trim() !== ""),
        ),
      },
    });
  });
  return [...merged.values()];
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
  const savedByCampaign = new Map(mergeRowsByCampaign(monthRows).map((row) => [campaignMatchKey(row), row]));
  return mergeRowsByCampaign(catalogRows.map(structureOnly)).map((catalogRow) => {
    const savedRow = savedByCampaign.get(campaignMatchKey(catalogRow));
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
  const [selectedCells, setSelectedCells] = useState(new Set());
  const [anchorCell, setAnchorCell] = useState(null);
  const [bulkValue, setBulkValue] = useState("");
  const [lockNonBusinessDays, setLockNonBusinessDays] = useState(false);
  const [confirmedMonth, setConfirmedMonth] = useState("");
  const cellRefs = useRef(new Map());

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
  const calendarTableWidth = (structureColumnWidth * 5) + (visibleDays.length * dayColumnWidth) + (totalColumnWidth * 4) + 88;
  const calendarTitle =
    filters.start || filters.end
      ? `Proyección ${visibleDays[0]?.label || ""} a ${visibleDays.at(-1)?.label || ""}`
      : `Calendario ${monthNames[selectedMonthIndex]} ${selectedYear}`;

  const holidayDates = useMemo(() => new Set(holidays.map((holiday) => holiday.date)), [holidays]);
  const sortedHolidays = useMemo(
    () => [...holidays].sort((a, b) => String(a.date).localeCompare(String(b.date))),
    [holidays],
  );
  const isBlockedDay = (day) => lockNonBusinessDays && (holidayDates.has(day.key) || day.weekday === 0 || day.weekday === 6);

  useEffect(() => {
    getSavedHolidays(selectedYear)
      .then((saved) => setHolidays(saved.holidays || []))
      .catch(() => setHolidays([]));
  }, [selectedYear]);

  useEffect(() => {
    setLoading(true);
    Promise.all([getSavedRequirements(selectedMonth), getRequirementCatalog()])
      .then(([saved, catalog]) => {
        const savedRows = mergeRowsByCampaign(saved.rows || []);
        const storedCatalogRows = mergeRowsByCampaign(catalog.rows || []);
        const baseCatalogRows = storedCatalogRows.length ? storedCatalogRows : savedRows.map(structureOnly);
        const nextRows = baseCatalogRows.length ? mergeCatalogWithMonth(savedRows, baseCatalogRows) : [];
        setRows(nextRows);
        setCatalogRows(baseCatalogRows);
        if (!storedCatalogRows.length && savedRows.length) {
          saveRequirementCatalog({ rows: savedRows.map(structureOnly) }).catch(() => {});
        } else if (storedCatalogRows.length !== (catalog.rows || []).length) {
          saveRequirementCatalog({ rows: baseCatalogRows.map(structureOnly) }).catch(() => {});
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
    const activeFilteredRows = filteredRows.filter((row) => row.active !== false);
    const editableDays = visibleDays.filter((day) => !(holidayDates.has(day.key) || day.weekday === 0 || day.weekday === 6));
    const requiredCellCount = activeFilteredRows.length * editableDays.length;
    const loadedCellCount = activeFilteredRows.reduce(
      (sum, row) =>
        sum +
        editableDays.filter((day) => String(row.daily?.[day.key] ?? "").trim() !== "").length,
      0,
    );
    const errorCellCount = activeFilteredRows.reduce(
      (sum, row) =>
        sum +
        visibleDays.filter((day) => {
          const value = String(row.daily?.[day.key] ?? "").trim();
          return value !== "" && Number.isNaN(Number(value.replace(",", ".")));
        }).length,
      0,
    );
    const atypicalCellCount = activeFilteredRows.reduce(
      (sum, row) => {
        const values = editableDays.map((day) => parseNumber(row.daily?.[day.key])).filter((value) => value > 0);
        if (!values.length) return sum;
        const average = values.reduce((inner, value) => inner + value, 0) / values.length;
        return (
          sum +
          editableDays.filter((day) => {
            const value = parseNumber(row.daily?.[day.key]);
            return average > 0 && value > average * 1.8;
          }).length
        );
      },
      0,
    );
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
      businessDays: editableDays.length,
      requiredCellCount,
      loadedCellCount,
      pendingCellCount: Math.max(0, requiredCellCount - loadedCellCount),
      errorCellCount,
      atypicalCellCount,
      progress: requiredCellCount ? Math.round((loadedCellCount / requiredCellCount) * 100) : 0,
    };
  }, [filteredRows, holidayDates, rows, visibleDays]);

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
    const nextCatalogRows = mergeRowsByCampaign(nextRows).map(structureOnly);
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
    const cleanRows = mergeRowsByCampaign(nextRows);
    setRows(cleanRows);
    persistState(cleanRows, form);
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
    const nextRows = mergeRowsByCampaign(editingId
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
      : [...rows.filter((row) => campaignMatchKey(row) !== campaignMatchKey(nextRow)), nextRow]);
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

  const updateManyDaily = (updates) => {
    if (!updates.length) return;
    const updateMap = updates.reduce((acc, item) => {
      const rowUpdates = acc.get(item.rowId) || {};
      rowUpdates[item.dayKey] = item.value;
      acc.set(item.rowId, rowUpdates);
      return acc;
    }, new Map());
    updateRows(
      rows.map((row) =>
        updateMap.has(row.id) && row.active !== false
          ? {
              ...row,
              daily: {
                ...(row.daily || {}),
                ...updateMap.get(row.id),
              },
            }
          : row,
      ),
    );
  };

  const selectedCellList = useMemo(() => [...selectedCells], [selectedCells]);

  const getCellPosition = (rowId, dayKey) => ({
    rowIndex: filteredRows.findIndex((row) => row.id === rowId),
    dayIndex: visibleDays.findIndex((day) => day.key === dayKey),
  });

  const selectCellRange = (fromCell, toCell) => {
    if (!fromCell || !toCell) return new Set([cellKey(toCell.rowId, toCell.dayKey)]);
    const from = getCellPosition(fromCell.rowId, fromCell.dayKey);
    const to = getCellPosition(toCell.rowId, toCell.dayKey);
    if (from.rowIndex < 0 || from.dayIndex < 0 || to.rowIndex < 0 || to.dayIndex < 0) {
      return new Set([cellKey(toCell.rowId, toCell.dayKey)]);
    }
    const next = new Set();
    const startRow = Math.min(from.rowIndex, to.rowIndex);
    const endRow = Math.max(from.rowIndex, to.rowIndex);
    const startDay = Math.min(from.dayIndex, to.dayIndex);
    const endDay = Math.max(from.dayIndex, to.dayIndex);
    for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
      for (let dayIndex = startDay; dayIndex <= endDay; dayIndex += 1) {
        next.add(cellKey(filteredRows[rowIndex].id, visibleDays[dayIndex].key));
      }
    }
    return next;
  };

  const selectCell = (rowId, dayKey, event) => {
    const nextCell = { rowId, dayKey };
    if (event?.shiftKey && anchorCell) {
      setSelectedCells(selectCellRange(anchorCell, nextCell));
      return;
    }
    if (event?.ctrlKey || event?.metaKey) {
      setSelectedCells((current) => {
        const next = new Set(current);
        const key = cellKey(rowId, dayKey);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      setAnchorCell(nextCell);
      return;
    }
    setSelectedCells(new Set([cellKey(rowId, dayKey)]));
    setAnchorCell(nextCell);
  };

  const focusCell = (rowId, dayKey) => {
    cellRefs.current.get(cellKey(rowId, dayKey))?.focus();
  };

  const moveFocus = (rowId, dayKey, rowDelta, dayDelta) => {
    const current = getCellPosition(rowId, dayKey);
    const row = filteredRows[Math.max(0, Math.min(filteredRows.length - 1, current.rowIndex + rowDelta))];
    const day = visibleDays[Math.max(0, Math.min(visibleDays.length - 1, current.dayIndex + dayDelta))];
    if (row && day) {
      setSelectedCells(new Set([cellKey(row.id, day.key)]));
      setAnchorCell({ rowId: row.id, dayKey: day.key });
      requestAnimationFrame(() => focusCell(row.id, day.key));
    }
  };

  const handleCellKeyDown = (event, rowId, dayKey) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveFocus(rowId, dayKey, 0, 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveFocus(rowId, dayKey, 0, -1);
    } else if (event.key === "ArrowDown" || event.key === "Enter") {
      event.preventDefault();
      moveFocus(rowId, dayKey, 1, 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(rowId, dayKey, -1, 0);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      if (selectedCells.size > 1) {
        event.preventDefault();
        clearSelectedCells();
      }
    }
  };

  const pasteMatrixAt = (rowId, dayKey, text) => {
    const matrix = String(text || "")
      .replace(/\r/g, "")
      .split("\n")
      .filter((line) => line.length)
      .map((line) => line.split("\t"));
    if (!matrix.length) return;
    const start = getCellPosition(rowId, dayKey);
    const updates = [];
    matrix.forEach((line, rowOffset) => {
      line.forEach((value, dayOffset) => {
        const targetRow = filteredRows[start.rowIndex + rowOffset];
        const targetDay = visibleDays[start.dayIndex + dayOffset];
        if (!targetRow || !targetDay || targetRow.active === false || isBlockedDay(targetDay)) return;
        updates.push({ rowId: targetRow.id, dayKey: targetDay.key, value: String(value).replace(/[^\d,.]/g, "") });
      });
    });
    updateManyDaily(updates);
    setSelectedCells(new Set(updates.map((item) => cellKey(item.rowId, item.dayKey))));
  };

  const handleCellPaste = (event, rowId, dayKey) => {
    const text = event.clipboardData.getData("text/plain");
    if (text.includes("\t") || text.includes("\n")) {
      event.preventDefault();
      pasteMatrixAt(rowId, dayKey, text);
    }
  };

  const applyValueToSelection = () => {
    updateManyDaily(
      selectedCellList.map((key) => {
        const { rowId, dayKey } = splitCellKey(key);
        return { rowId, dayKey, value: bulkValue.replace(/[^\d,.]/g, "") };
      }),
    );
  };

  const clearSelectedCells = () => {
    updateManyDaily(selectedCellList.map((key) => ({ ...splitCellKey(key), value: "" })));
  };

  const validateLoad = () => {
    if (totals.errorCellCount) setStatus(`Validación: ${totals.errorCellCount} error${totals.errorCellCount === 1 ? "" : "es"}`);
    else if (totals.pendingCellCount) setStatus(`Validación: ${totals.pendingCellCount} celda${totals.pendingCellCount === 1 ? "" : "s"} pendiente${totals.pendingCellCount === 1 ? "" : "s"}`);
    else setStatus("Validación correcta");
  };

  const confirmLoad = () => {
    persistState(rows, form);
    setConfirmedMonth(selectedMonth);
    setStatus(`Carga confirmada ${monthNames[selectedMonthIndex]} ${selectedYear}`);
  };

  const fillWeekdaysForRow = (row) => {
    const sourceValue =
      visibleDays.map((day) => row.daily?.[day.key]).find((value) => String(value ?? "").trim() !== "") || "";
    if (!sourceValue) return;
    updateManyDaily(
      visibleDays
        .filter((day) => day.weekday >= 1 && day.weekday <= 5 && !holidayDates.has(day.key))
        .map((day) => ({ rowId: row.id, dayKey: day.key, value: sourceValue })),
    );
  };

  const clearRow = (row) => {
    updateManyDaily(visibleDays.map((day) => ({ rowId: row.id, dayKey: day.key, value: "" })));
  };

  const copyPreviousWeekForRow = (row) => {
    const updates = visibleDays
      .map((day) => {
        const date = dateFromKey(day.key);
        if (!date) return null;
        date.setDate(date.getDate() - 7);
        const previousDay = dayFromDate(date);
        const value = row.daily?.[previousDay.key];
        if (String(value ?? "").trim() === "") return null;
        return { rowId: row.id, dayKey: day.key, value };
      })
      .filter(Boolean);
    updateManyDaily(updates);
  };

  const distributeMonthlyTotalForRow = (row) => {
    const total = window.prompt(`Total mensual a distribuir para ${row.cliente} / ${row.subcampana}`);
    const parsed = parseNumber(total);
    if (!parsed) return;
    const targetDays = visibleDays.filter((day) => day.weekday >= 1 && day.weekday <= 5 && !holidayDates.has(day.key));
    const value = String((parsed / Math.max(1, targetDays.length)).toFixed(2)).replace(".", ",");
    updateManyDaily(targetDays.map((day) => ({ rowId: row.id, dayKey: day.key, value })));
  };

  const copyFromPreviousMonth = async () => {
    const previousMonth = shiftMonthValue(selectedMonth, -1);
    try {
      const saved = await getSavedRequirements(previousMonth);
      const previousRows = mergeRowsByCampaign(saved.rows || []);
      const updates = [];
      rows.forEach((row) => {
        const previousRow = previousRows.find((item) => campaignMatchKey(item) === campaignMatchKey(row));
        if (!previousRow) return;
        visibleDays.forEach((day) => {
          const previousDaily = mapDailyToMonth(previousRow.daily || {}, selectedMonth);
          const value = previousDaily[day.key];
          if (String(value ?? "").trim() !== "") updates.push({ rowId: row.id, dayKey: day.key, value });
        });
      });
      updateManyDaily(updates);
      setStatus(`Copiado desde ${previousMonth}`);
    } catch (err) {
      setStatus(err.message || "No se pudo copiar el mes anterior");
    }
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

  const cellStatus = (row, day) => {
    if (row.active === false || isBlockedDay(day)) return "blocked";
    const rawValue = String(row.daily?.[day.key] ?? "").trim();
    if (!rawValue) return "pending";
    const value = Number(rawValue.replace(",", "."));
    if (!Number.isFinite(value) || value < 0) return "error";
    const businessValues = visibleDays
      .filter((item) => item.weekday >= 1 && item.weekday <= 5 && !holidayDates.has(item.key))
      .map((item) => parseNumber(row.daily?.[item.key]))
      .filter((item) => item > 0);
    const average = businessValues.length ? businessValues.reduce((sum, item) => sum + item, 0) / businessValues.length : 0;
    if (average > 0 && value > average * 1.8) return "atypical";
    return "loaded";
  };

  const rowStats = (row) => {
    const values = visibleDays.map((day) => parseNumber(row.daily?.[day.key]));
    const loadedDays = visibleDays.filter((day) => String(row.daily?.[day.key] ?? "").trim() !== "").length;
    const total = row.active === false ? 0 : values.reduce((sum, value) => sum + value, 0);
    return {
      total,
      average: loadedDays ? total / loadedDays : 0,
      loadedDays,
      status: row.active === false ? "Inactiva" : loadedDays ? "Cargado" : "Pendiente",
    };
  };

  const downloadTemplate = () => {
    const templateDays = daysForMonth(selectedMonth);
    const headers = ["Mes", "Gerente", "Jefe de site", "Cliente", "Campaña", "Subcampaña", ...templateDays.map((day) => day.label)];
    const templateRows = rows.length
      ? rows.map((row) => ({
          Mes: selectedMonth,
          Gerente: row.gerente,
          "Jefe de site": row.jefeSite,
          Cliente: row.cliente,
          Campaña: row.campana,
          Subcampaña: row.subcampana,
          ...Object.fromEntries(templateDays.map((day) => [day.label, row.daily?.[day.key] || ""])),
        }))
      : [
          Object.fromEntries(headers.map((header) => [header, header === "Mes" ? selectedMonth : ""])),
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
      const importedRows = imported
        .map((item) => {
          const rowMonth = parseMonthValue(item.Mes || item.MES || item.mes || item.Month, selectedMonth);
          const monthDays = daysForMonth(rowMonth);
          const dayByLabel = new Map(monthDays.map((day) => [day.label, day]));
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
          return { ...row, id: makeId(row), active: true, month: rowMonth, daily };
        })
        .filter(Boolean);
      if (!importedRows.length) {
        setStatus("No se encontraron filas válidas para importar");
        return;
      }
      const existingCatalogKeys = new Set(catalogRows.map(campaignMatchKey));
      const newCatalogRows = importedRows
        .filter((row) => !existingCatalogKeys.has(campaignMatchKey(row)))
        .map(structureOnly);
      const nextCatalogRows = mergeRowsByCampaign([...catalogRows, ...newCatalogRows]).map(structureOnly);
      const rowsByMonth = importedRows.reduce((acc, row) => {
        const monthRows = acc[row.month] || [];
        const existingRow = monthRows.find((item) => campaignMatchKey(item) === campaignMatchKey(row));
        if (existingRow) {
          existingRow.daily = {
            ...(existingRow.daily || {}),
            ...(row.daily || {}),
          };
        } else {
          monthRows.push(row);
        }
        acc[row.month] = monthRows;
        return acc;
      }, {});
      const savedByMonth = {};
      const conflicts = [];
      await Promise.all(
        Object.entries(rowsByMonth).map(async ([monthKey, monthImportedRows]) => {
          const saved = await getSavedRequirements(monthKey);
          const savedRows = mergeRowsByCampaign(saved.rows || []);
          const baseRows = mergeCatalogWithMonth(savedRows, nextCatalogRows);
          savedByMonth[monthKey] = { saved, baseRows };
          monthImportedRows.forEach((importedRow) => {
            const existingRow = baseRows.find((row) => campaignMatchKey(row) === campaignMatchKey(importedRow));
            Object.entries(importedRow.daily || {}).forEach(([dayKey, value]) => {
              const currentValue = existingRow?.daily?.[dayKey];
              if (String(currentValue ?? "").trim() && String(value ?? "").trim() && String(currentValue) !== String(value)) {
                conflicts.push({
                  month: monthKey,
                  day: dayKey.split("-").reverse().join("/"),
                  account: `${importedRow.campana} / ${importedRow.subcampana}`,
                  currentValue,
                  nextValue: value,
                });
              }
            });
          });
        }),
      );
      if (conflicts.length) {
        const preview = conflicts
          .slice(0, 8)
          .map((conflict) => `${conflict.month} ${conflict.day} - ${conflict.account}: ${conflict.currentValue} -> ${conflict.nextValue}`)
          .join("\n");
        const extra = conflicts.length > 8 ? `\n...y ${conflicts.length - 8} coincidencia${conflicts.length - 8 === 1 ? "" : "s"} más.` : "";
        const confirmed = window.confirm(`Se encontraron datos existentes que serán reemplazados:\n\n${preview}${extra}\n\n¿Querés pisar esos datos?`);
        if (!confirmed) {
          setStatus("Importación cancelada: no se pisaron datos existentes");
          return;
        }
      }
      if (newCatalogRows.length) {
        await saveRequirementCatalog({ rows: nextCatalogRows });
        setCatalogRows(nextCatalogRows);
      }
      let selectedRows = mergeCatalogWithMonth(rows, nextCatalogRows);
      await Promise.all(
        Object.entries(rowsByMonth).map(async ([monthKey, monthImportedRows]) => {
          const { saved, baseRows } = savedByMonth[monthKey];
          const mergedRows = mergeRowsByCampaign(baseRows.map((baseRow) => {
            const importedRow = monthImportedRows.find((row) => campaignMatchKey(row) === campaignMatchKey(baseRow));
            if (!importedRow) return baseRow;
            return {
              ...baseRow,
              daily: {
                ...(baseRow.daily || {}),
                ...importedRow.daily,
              },
            };
          }));
          await saveSavedRequirements(monthKey, {
            rows: mergedRows,
            draft: monthKey === selectedMonth ? form : saved.draft || emptyForm,
            masterRequirements: buildMasterRequirements(mergedRows),
          });
          if (monthKey === selectedMonth) selectedRows = mergedRows;
        }),
      );
      setRows(selectedRows);
      window.dispatchEvent(new Event("requeridos-updated"));
      setStatus(`Importado: ${importedRows.length} fila${importedRows.length === 1 ? "" : "s"} en ${Object.keys(rowsByMonth).length} mes${Object.keys(rowsByMonth).length === 1 ? "" : "es"}`);
    } catch (err) {
      setStatus(err.message || "No se pudo importar el template");
    } finally {
      event.target.value = "";
    }
  };

  const downloadTemplateAccents = () => {
    const templateDays = daysForMonth(selectedMonth);
    const headers = ["Mes", "Gerente", "Jefe de site", "Cliente", "Campaña", "Subcampaña", ...templateDays.map((day) => day.label)];
    const templateRows = rows.length
      ? rows.map((row) => {
          const item = {
            Mes: selectedMonth,
            Gerente: row.gerente,
            "Jefe de site": row.jefeSite,
            Cliente: row.cliente,
            Campaña: row.campana,
            Subcampaña: row.subcampana,
          };
          templateDays.forEach((day) => {
            item[day.label] = row.daily?.[day.key] || "";
          });
          return item;
        })
      : [
          Object.fromEntries(headers.map((header) => [header, header === "Mes" ? selectedMonth : ""])),
        ];
    const worksheet = XLSX.utils.json_to_sheet(templateRows, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Requeridos");
    XLSX.writeFile(workbook, `template_requeridos_${selectedMonth}.xlsx`);
  };

  const importTemplateAccents = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", raw: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const imported = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
      const importedRows = imported
        .map((item) => {
          const rowMonth = parseMonthValue(getImportValue(item, "Mes", "Month") || selectedMonth, selectedMonth);
          const monthDays = daysForMonth(rowMonth);
          const dayByLabel = new Map(monthDays.map((day) => [day.label, day]));
          const row = {
            gerente: clean(getImportValue(item, "Gerente")),
            jefeSite: clean(getImportValue(item, "Jefe de site", "Jefe Site")),
            cliente: clean(getImportValue(item, "Cliente")),
            campana: clean(getImportValue(item, "Campaña", "Campana")),
            subcampana: clean(getImportValue(item, "Subcampaña", "Subcampana", "Sub campaña", "Sub campana")),
          };
          if (!row.gerente || !row.jefeSite || !row.cliente || !row.campana || !row.subcampana) return null;
          const daily = {};
          Object.entries(item).forEach(([column, value]) => {
            const dayNumber = String(column).match(/(\d{1,2})$/)?.[1]?.padStart(2, "0");
            const day = dayByLabel.get(dayNumber);
            if (day && String(value ?? "").trim() !== "") daily[day.key] = String(value).replace(/[^\d,.]/g, "");
          });
          return { ...row, id: makeId(row), active: true, month: rowMonth, daily };
        })
        .filter(Boolean);
      if (!importedRows.length) {
        setStatus("No se encontraron filas válidas para importar");
        return;
      }
      const existingCatalogKeys = new Set(catalogRows.map(campaignMatchKey));
      const newCatalogRows = importedRows
        .filter((row) => !existingCatalogKeys.has(campaignMatchKey(row)))
        .map(structureOnly);
      const nextCatalogRows = mergeRowsByCampaign([...catalogRows, ...newCatalogRows]).map(structureOnly);
      const rowsByMonth = importedRows.reduce((acc, row) => {
        const monthRows = acc[row.month] || [];
        const existingRow = monthRows.find((item) => campaignMatchKey(item) === campaignMatchKey(row));
        if (existingRow) {
          existingRow.daily = { ...(existingRow.daily || {}), ...(row.daily || {}) };
        } else {
          monthRows.push(row);
        }
        acc[row.month] = monthRows;
        return acc;
      }, {});
      const savedByMonth = {};
      const conflicts = [];
      await Promise.all(
        Object.entries(rowsByMonth).map(async ([monthKey, monthImportedRows]) => {
          const saved = await getSavedRequirements(monthKey);
          const savedRows = mergeRowsByCampaign(saved.rows || []);
          const baseRows = mergeCatalogWithMonth(savedRows, nextCatalogRows);
          savedByMonth[monthKey] = { saved, baseRows };
          monthImportedRows.forEach((importedRow) => {
            const existingRow = baseRows.find((row) => campaignMatchKey(row) === campaignMatchKey(importedRow));
            Object.entries(importedRow.daily || {}).forEach(([dayKey, value]) => {
              const currentValue = existingRow?.daily?.[dayKey];
              if (String(currentValue ?? "").trim() && String(value ?? "").trim() && String(currentValue) !== String(value)) {
                conflicts.push({
                  month: monthKey,
                  day: dayKey.split("-").reverse().join("/"),
                  account: `${importedRow.campana} / ${importedRow.subcampana}`,
                  currentValue,
                  nextValue: value,
                });
              }
            });
          });
        }),
      );
      if (conflicts.length) {
        const preview = conflicts
          .slice(0, 8)
          .map((conflict) => `${conflict.month} ${conflict.day} - ${conflict.account}: ${conflict.currentValue} -> ${conflict.nextValue}`)
          .join("\n");
        const extra = conflicts.length > 8 ? `\n...y ${conflicts.length - 8} coincidencia${conflicts.length - 8 === 1 ? "" : "s"} más.` : "";
        const confirmed = window.confirm(`Se encontraron datos existentes que serán reemplazados:\n\n${preview}${extra}\n\n¿Querés pisar esos datos?`);
        if (!confirmed) {
          setStatus("Importación cancelada: no se pisaron datos existentes");
          return;
        }
      }
      if (newCatalogRows.length) {
        await saveRequirementCatalog({ rows: nextCatalogRows });
        setCatalogRows(nextCatalogRows);
      }
      let selectedRows = mergeCatalogWithMonth(rows, nextCatalogRows);
      await Promise.all(
        Object.entries(rowsByMonth).map(async ([monthKey, monthImportedRows]) => {
          const { saved, baseRows } = savedByMonth[monthKey];
          const mergedRows = mergeRowsByCampaign(baseRows.map((baseRow) => {
            const importedRow = monthImportedRows.find((row) => campaignMatchKey(row) === campaignMatchKey(baseRow));
            if (!importedRow) return baseRow;
            return { ...baseRow, daily: { ...(baseRow.daily || {}), ...importedRow.daily } };
          }));
          await saveSavedRequirements(monthKey, {
            rows: mergedRows,
            draft: monthKey === selectedMonth ? form : saved.draft || emptyForm,
            masterRequirements: buildMasterRequirements(mergedRows),
          });
          if (monthKey === selectedMonth) selectedRows = mergedRows;
        }),
      );
      setRows(selectedRows);
      window.dispatchEvent(new Event("requeridos-updated"));
      setStatus(`Importado: ${importedRows.length} fila${importedRows.length === 1 ? "" : "s"} en ${Object.keys(rowsByMonth).length} mes${Object.keys(rowsByMonth).length === 1 ? "" : "es"}`);
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
          <span className="autosave-status">
            {loading ? "Cargando..." : status || "Listo para cargar"}
            {confirmedMonth === selectedMonth ? " · Confirmado" : ""}
          </span>
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
          <button className="icon-button" onClick={downloadTemplateAccents} title="Descargar template">
            <Download size={18} />
          </button>
          <button className="icon-button" onClick={() => fileInputRef.current?.click()} title="Importar template">
            <Upload size={18} />
          </button>
          <button className="icon-button" onClick={() => persistState(rows, form)} title="Guardar">
            <Save size={18} />
          </button>
          <Button className="confirm-load-button" onClick={confirmLoad}>
            <CheckCircle2 size={16} />
            Confirmar carga
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={importTemplateAccents} hidden />
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
      <section className="ops-kpi-grid monthly-load-kpis">
        <Card className="ops-kpi-card primary">
          <div className="ops-kpi-icon"><Users size={20} /></div>
          <span>Servicios visibles</span>
          <strong>{number.format(filteredRows.filter((row) => row.active !== false).length)}</strong>
          <small>Filas activas en la grilla</small>
        </Card>
        <Card className="ops-kpi-card">
          <div className="ops-kpi-icon"><CalendarDays size={20} /></div>
          <span>DÃ­as hÃ¡biles</span>
          <strong>{number.format(totals.businessDays)}</strong>
          <small>Sin sÃ¡bados, domingos ni feriados</small>
        </Card>
        <Card className="ops-kpi-card success">
          <div className="ops-kpi-icon"><CheckCircle2 size={20} /></div>
          <span>Total requerido</span>
          <strong>{number.format(totals.projectionTotal)}</strong>
          <small>SegÃºn filtros y rango visible</small>
        </Card>
        <Card className="ops-kpi-card">
          <div className="ops-kpi-icon"><Clipboard size={20} /></div>
          <span>Celdas pendientes</span>
          <strong>{number.format(totals.pendingCellCount)}</strong>
          <small>{number.format(totals.loadedCellCount)} cargadas</small>
        </Card>
        <Card className={totals.errorCellCount ? "ops-kpi-card danger" : "ops-kpi-card"}>
          <div className="ops-kpi-icon"><X size={20} /></div>
          <span>Errores</span>
          <strong>{number.format(totals.errorCellCount)}</strong>
          <small>{number.format(totals.atypicalCellCount)} valores atÃ­picos</small>
        </Card>
        <Card className="ops-kpi-card success">
          <div className="ops-kpi-icon"><Save size={20} /></div>
          <span>Avance</span>
          <strong>{number.format(totals.progress)}%</strong>
          <small>Autosave: {status || "en espera"}</small>
        </Card>
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

      {activeTab === "calendar" && (
      <section className="table-wrap bulk-actions-panel">
        <div className="table-toolbar">
          <div>
            <h2>Acciones masivas</h2>
            <span>{number.format(selectedCells.size)} celda{selectedCells.size === 1 ? "" : "s"} seleccionada{selectedCells.size === 1 ? "" : "s"}.</span>
          </div>
          <label className="lock-toggle">
            <input type="checkbox" checked={lockNonBusinessDays} onChange={(event) => setLockNonBusinessDays(event.target.checked)} />
            Bloquear fines de semana y feriados
          </label>
        </div>
        <div className="bulk-actions-grid">
          <label>
            <span>Valor para selecciÃ³n</span>
            <input value={bulkValue} onChange={(event) => setBulkValue(event.target.value.replace(/[^\d,.]/g, ""))} placeholder="Ej. 42" />
          </label>
          <Button onClick={applyValueToSelection} disabled={!selectedCells.size}>
            Aplicar valor
          </Button>
          <Button variant="outline" onClick={copyFromPreviousMonth}>
            Copiar mes anterior
          </Button>
          <Button variant="outline" onClick={validateLoad}>
            Validar carga
          </Button>
          <Button variant="outline" onClick={clearSelectedCells} disabled={!selectedCells.size}>
            <Eraser size={16} />
            Limpiar seleccionados
          </Button>
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
      <section className="table-wrap requeridos-table spreadsheet-panel">
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
        <div className="table-scroll spreadsheet-scroll">
          <table style={{ width: `${calendarTableWidth}px`, minWidth: `${calendarTableWidth}px` }}>
            <colgroup>
              {["gerente", "jefeSite", "cliente", "campana", "subcampana"].map((column) => (
                <col key={column} style={{ width: `${structureColumnWidth}px` }} />
              ))}
              {visibleDays.map((day) => (
                <col key={`col-${day.key}`} style={{ width: `${dayColumnWidth}px` }} />
              ))}
              <col style={{ width: `${totalColumnWidth}px` }} />
              <col style={{ width: `${totalColumnWidth}px` }} />
              <col style={{ width: `${totalColumnWidth}px` }} />
              <col style={{ width: `${totalColumnWidth}px` }} />
              <col style={{ width: "88px" }} />
            </colgroup>
            <thead>
              <tr className="calendar-weekdays">
                <th colSpan="5" />
                {visibleDays.map((day) => (
                  <th key={`weekday-${day.key}`} className="calendar-weekday">{day.weekdayLabel}</th>
                ))}
                <th colSpan="5" />
              </tr>
              <tr>
                <th className="sticky-col sticky-col-1">Gerente</th>
                <th className="sticky-col sticky-col-2">Jefe de site</th>
                <th className="sticky-col sticky-col-3">Cliente</th>
                <th>Campaña</th>
                <th>Subcampaña</th>
                {visibleDays.map((day) => (
                  <th key={day.key} className={`calendar-day ${dayTone(day)}`}>
                    {day.label}
                  </th>
                ))}
                <th>Total mes</th>
                <th>Prom.</th>
                <th>DÃ­as</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const isInactive = row.active === false;
                const stats = rowStats(row);
                return (
                  <tr key={row.id} className={isInactive ? "inactive-account-row" : ""}>
                    <td className="sticky-col sticky-col-1">{row.gerente}</td>
                    <td className="sticky-col sticky-col-2">{row.jefeSite}</td>
                    <td className="sticky-col sticky-col-3">{row.cliente}</td>
                    <td className="sticky-col sticky-col-4">{row.campana}</td>
                    <td className="sticky-col sticky-col-5">{row.subcampana}</td>
                    {visibleDays.map((day) => {
                      const key = cellKey(row.id, day.key);
                      const statusName = cellStatus(row, day);
                      const selected = selectedCells.has(key);
                      return (
                        <td key={day.key} className={`calendar-value ${dayTone(day)} cell-${statusName} ${selected ? "selected-cell" : ""}`}>
                          <input
                            ref={(element) => {
                              if (element) cellRefs.current.set(key, element);
                              else cellRefs.current.delete(key);
                            }}
                            className="required-input compact-cell-input"
                            type="text"
                            inputMode="decimal"
                            value={row.daily?.[day.key] || ""}
                            disabled={isInactive || isBlockedDay(day)}
                            onMouseDown={(event) => selectCell(row.id, day.key, event)}
                            onFocus={(event) => selectCell(row.id, day.key, event)}
                            onPaste={(event) => handleCellPaste(event, row.id, day.key)}
                            onKeyDown={(event) => handleCellKeyDown(event, row.id, day.key)}
                            onChange={(event) => updateDaily(row.id, day.key, event.target.value)}
                          />
                        </td>
                      );
                    })}
                    <td className="total-cell">{number.format(stats.total)}</td>
                    <td className="total-cell">{stats.average ? number.format(Math.round(stats.average * 100) / 100) : ""}</td>
                    <td className="total-cell">{number.format(stats.loadedDays)}</td>
                    <td><span className={`load-status ${stats.status.toLowerCase()}`}>{stats.status}</span></td>
                    <td>
                      <div className="row-action-buttons">
                        <button type="button" title="Completar lunes a viernes" onClick={() => fillWeekdaysForRow(row)}>LV</button>
                        <button type="button" title="Copiar semana anterior" onClick={() => copyPreviousWeekForRow(row)}>S-1</button>
                        <button type="button" title="Distribuir total mensual" onClick={() => distributeMonthlyTotalForRow(row)}>Dist.</button>
                        <button type="button" title="Limpiar fila" onClick={() => clearRow(row)}><Eraser size={13} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filteredRows.length && (
                <tr>
                  <td className="empty-cell" colSpan={10 + visibleDays.length}>Sin filas cargadas.</td>
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
                  <td />
                  <td />
                  <td />
                  <td />
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


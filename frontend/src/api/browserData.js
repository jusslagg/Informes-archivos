import * as XLSX from "xlsx";

import { getBrowserHierarchyExceptions } from "../config/hierarchyExceptions.js";

const C = {
  area: "\u00c1REA",
  subArea: "SUB \u00c1REA",
  campaign: "CAMPA\u00d1A",
  subCampaign: "SUB CAMPA\u00d1A",
  multiCampaign: "MULTICAMPA\u00d1A",
  modality: "MODALIDAD DE CONTRATACI\u00d3N",
  tenure: "Antig\u00fcedad",
  campaignLabel: "Campa\u00f1a",
};

const CORE_COLUMNS = [
  "LEGAJO",
  "APELLIDOS",
  "NOMBRES",
  "DOCUMENTO",
  "FECHA ALTA",
  "FECHA BAJA",
  "ESTADO",
  C.area,
  C.subArea,
  "PUESTO",
  "CLIENTE",
  C.campaign,
  C.subCampaign,
  "CENTRO COSTO",
  "CARGA HORARIA SEMANAL",
  "SALARIO",
  C.modality,
  "HORARIO CONTRACTUAL",
  "EMPLEADOR",
  "LOCALIDAD",
  C.multiCampaign,
];

const OPTIONAL_COLUMNS = [
  "SEXO",
  "FECHA NACIMIENTO",
  "SITIO",
  "PRESENCIALIDAD",
  "EQUIPO",
  "LÍDER",
  "SUPERVISOR",
  "FORMADOR ASIGNADO",
  "MOTIVO BAJA",
];

const USER_COLUMNS = [
  "USUARIO TECO",
  "USUARIO CACHAMAI",
  "USUARIO ORION/NATURGY",
  "USUARIO SANTANDER",
  "USUARIO GETNET",
  "USUARIO GENESYS",
  "USUARIO YOIZEN",
];

const ACTIVE_COLUMNS = [...CORE_COLUMNS, ...OPTIONAL_COLUMNS];
const DATE_COLUMNS = ["FECHA ALTA", "FECHA BAJA", "FECHA NACIMIENTO"];
const NUMERIC_COLUMNS = ["SALARIO", "CARGA HORARIA SEMANAL"];
const REQUIRED_NOT_EMPTY = [
  "LEGAJO",
  "APELLIDOS",
  "NOMBRES",
  "DOCUMENTO",
  "FECHA ALTA",
  "ESTADO",
  C.area,
  "CLIENTE",
  C.campaign,
  "SALARIO",
];

const MONTH_LABELS = {
  1: "enero",
  2: "febrero",
  3: "marzo",
  4: "abril",
  5: "mayo",
  6: "junio",
  7: "julio",
  8: "agosto",
  9: "septiembre",
  10: "octubre",
  11: "noviembre",
  12: "diciembre",
};

const DEFAULT_HOLIDAY_DATES = {
  2026: new Set([
    "2026-01-01",
    "2026-02-16",
    "2026-02-17",
    "2026-03-24",
    "2026-04-02",
    "2026-04-03",
    "2026-05-01",
    "2026-05-25",
    "2026-06-15",
    "2026-06-20",
    "2026-07-09",
    "2026-08-17",
    "2026-10-12",
    "2026-11-23",
    "2026-12-08",
    "2026-12-25",
  ]),
};

const state = {
  rows: [],
  missingCore: [],
  validations: [],
  dateSummary: null,
};

function normalizeColumnName(value) {
  return repairText(value)
    .trim()
    .toUpperCase()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function repairText(value) {
  let text = String(value || "");
  for (let index = 0; index < 2 && /[\u00c2\u00c3]/.test(text); index += 1) {
    try {
      const bytes = Uint8Array.from([...text].map((char) => char.charCodeAt(0) & 0xff));
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (!decoded || decoded === text) break;
      text = decoded;
    } catch {
      break;
    }
  }
  return text;
}

const ALIASES = new Map();

function addAlias(source, target) {
  ALIASES.set(normalizeColumnName(source), target);
}

[...CORE_COLUMNS, ...OPTIONAL_COLUMNS, ...USER_COLUMNS].forEach((column) => addAlias(column, column));

[
  ["AREA", C.area],
  ["\u00c1REA", C.area],
  ["ÃƒÂREA", C.area],
  ["ÃƒÆ’Ã‚ÂREA", C.area],
  ["SUB AREA", C.subArea],
  ["SUB \u00c1REA", C.subArea],
  ["SUB ÃƒÂREA", C.subArea],
  ["SUB ÃƒÆ’Ã‚ÂREA", C.subArea],
  ["CAMPANA", C.campaign],
  ["CAMPA\u00d1A", C.campaign],
  ["CAMPAÃƒâ€˜A", C.campaign],
  ["CAMPAÃƒÆ’Ã¢â‚¬ËœA", C.campaign],
  ["SUB CAMPANA", C.subCampaign],
  ["SUB CAMPA\u00d1A", C.subCampaign],
  ["SUB CAMPAÃƒâ€˜A", C.subCampaign],
  ["SUB CAMPAÃƒÆ’Ã¢â‚¬ËœA", C.subCampaign],
  ["MULTICAMPANA", C.multiCampaign],
  ["MULTICAMPA\u00d1A", C.multiCampaign],
  ["MULTICAMPAÃƒâ€˜A", C.multiCampaign],
  ["MULTICAMPAÃƒÆ’Ã¢â‚¬ËœA", C.multiCampaign],
  ["MODALIDAD DE CONTRATACION", C.modality],
  ["MODALIDAD DE CONTRATACI\u00d3N", C.modality],
  ["MODALIDAD DE CONTRATACIÃƒâ€œN", C.modality],
  ["MODALIDAD DE CONTRATACIÃƒÆ’Ã¢â‚¬Å“N", C.modality],
  ["CLIENTES", "CLIENTE"],
].forEach(([source, target]) => addAlias(source, target));

function columnKey(column) {
  return ALIASES.get(normalizeColumnName(column)) || column;
}

function value(row, column) {
  const key = columnKey(column);
  return String(row[key] ?? row[column] ?? "").trim();
}

function looseValue(row, ...columns) {
  for (const column of columns) {
    const direct = value(row, column);
    if (direct) return direct;

    const wanted = normalizeColumnName(column);
    const entry = Object.entries(row).find(([key, rawValue]) => {
      if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") return false;
      const normalizedKey = normalizeColumnName(key);
      return normalizedKey === wanted || normalizedKey.includes(wanted);
    });
    if (entry) return String(entry[1] ?? "").trim();
  }
  return "";
}

function campaignValue(row) {
  return looseValue(row, C.campaign, "CAMPANA", "CAMPAÃ‘A") || "Sin dato";
}

function clientValue(row) {
  return looseValue(row, "CLIENTE", "CLIENTES") || "Sin dato";
}

function isBajaRow(row) {
  const estado = normalizeColumnName(value(row, "ESTADO"));
  return estado === "BAJA";
}

function isActiveRow(row) {
  const estado = normalizeColumnName(value(row, "ESTADO"));
  return estado === "ACTIVO";
}

function currentMonthToDateBounds() {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return { start, end };
}

function numberValue(input) {
  if (typeof input === "number") return Number.isFinite(input) ? input : 0;
  const normalized = String(input ?? "")
    .replace(/\$/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(input) {
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return new Date(input.getFullYear(), input.getMonth(), input.getDate());
  }
  if (typeof input === "number") {
    const parsed = XLSX.SSF.parse_date_code(input);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d);
  }

  const text = String(input ?? "").trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return makeDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dayFirst = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s.*)?$/);
  if (dayFirst) {
    const day = Number(dayFirst[1]);
    const month = Number(dayFirst[2]);
    const year = Number(dayFirst[3].length === 2 ? `20${dayFirst[3]}` : dayFirst[3]);
    return makeDate(year, month, day);
  }

  return null;
}

function makeDate(year, month, day) {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function formatDate(input) {
  const date = dateValue(input);
  if (!date) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function monthEnd(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function businessDaysBetween(start, end) {
  if (!start || !end || end < start) return 0;
  const holidays = DEFAULT_HOLIDAY_DATES[start.getFullYear()] || new Set();
  let total = 0;
  const current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (current <= end) {
    const iso = formatDate(current);
    if (current.getDay() !== 0 && current.getDay() !== 6 && !holidays.has(iso)) total += 1;
    current.setDate(current.getDate() + 1);
  }
  return total;
}

function cleanPayroll(rawRows) {
  const renamedRows = rawRows.map((row) => {
    const next = {};
    Object.entries(row).forEach(([column, rawValue]) => {
      const canonical = columnKey(column);
      if (ACTIVE_COLUMNS.includes(canonical)) {
        next[canonical] = rawValue;
      }
    });
    if (!next.CLIENTE) next.CLIENTE = looseValue(row, "CLIENTE", "CLIENTES");
    if (!next[C.campaign]) next[C.campaign] = looseValue(row, C.campaign, "CAMPANA", "CAMPAÃ‘A");
    if (!next[C.subCampaign]) next[C.subCampaign] = looseValue(row, C.subCampaign, "SUB CAMPANA", "SUB CAMPAÃ‘A");
    return next;
  });

  const sourceColumns = new Set(renamedRows.flatMap((row) => Object.keys(row)));
  const missingCore = CORE_COLUMNS.filter((column) => !sourceColumns.has(column));

  const rows = renamedRows.map((row) => {
    const next = {};
    ACTIVE_COLUMNS.forEach((column) => {
      let current = row[column] ?? "";
      if (DATE_COLUMNS.includes(column)) current = formatDate(current);
      else if (NUMERIC_COLUMNS.includes(column)) current = numberValue(current);
      else current = String(current ?? "").trim();
      next[column] = current;
    });
    return next;
  });

  return { rows, missingCore };
}

function buildIssue(type, severity, message, rows = []) {
  return { type, severity, message, rows, count: rows.length };
}

function validatePayroll(rows, missingCore = []) {
  const issues = [];
  if (missingCore.length) {
    issues.push(buildIssue("missing_columns", "error", `Faltan columnas core: ${missingCore.join(", ")}`));
  }

  REQUIRED_NOT_EMPTY.forEach((column) => {
    const emptyRows = rows.map((row, index) => (value(row, column) === "" ? index + 2 : null)).filter(Boolean);
    if (emptyRows.length) {
      issues.push(buildIssue("empty_fields", "warning", `Hay campos vacios en ${column}.`, emptyRows));
    }
  });

  ["LEGAJO", "DOCUMENTO"].forEach((column) => {
    const seen = new Map();
    rows.forEach((row, index) => {
      const current = value(row, column);
      if (!current) return;
      seen.set(current, [...(seen.get(current) || []), index + 2]);
    });
    const duplicates = [...seen.values()].filter((items) => items.length > 1).flat();
    if (duplicates.length) {
      issues.push(buildIssue("duplicated_values", "error", `Se detectaron ${column.toLowerCase()} duplicados.`, duplicates));
    }
  });

  const invalidDates = rows
    .map((row, index) => {
      if (!isBajaRow(row)) return null;
      const alta = dateValue(row["FECHA ALTA"]);
      const baja = dateValue(row["FECHA BAJA"]);
      return alta && baja && baja < alta ? index + 2 : null;
    })
    .filter(Boolean);
  if (invalidDates.length) {
    issues.push(buildIssue("invalid_dates", "error", "Hay fechas de baja anteriores a la fecha de alta.", invalidDates));
  }

  const invalidSalary = rows
    .map((row, index) => (numberValue(row["SALARIO"]) <= 0 ? index + 2 : null))
    .filter(Boolean);
  if (invalidSalary.length) {
    issues.push(buildIssue("invalid_salary", "warning", "Hay salarios en cero o negativos.", invalidSalary));
  }

  return issues;
}

async function readWorkbook(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false, raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const hiddenRows = new Set(
    (sheet["!rows"] || [])
      .map((row, index) => (row?.hidden ? index : null))
      .filter((index) => index !== null),
  );
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", header: 1, raw: true });
  const [headers = [], ...body] = rows;
  return body
    .map((cells, bodyIndex) => ({ cells, rowIndex: bodyIndex + 1 }))
    .filter(({ cells, rowIndex }) => !hiddenRows.has(rowIndex) && cells.some((cell) => String(cell ?? "").trim() !== ""))
    .map(({ cells }) =>
      Object.fromEntries(headers.map((header, index) => [String(header || "").trim(), cells[index] ?? ""])),
    );
}

function ensureRows() {
  if (!state.rows.length) {
    throw new Error("Primero carga un archivo de nomina.");
  }
}

function applyFilters(rows, filters = []) {
  return filters.reduce((currentRows, filter) => {
    if (!filter.values?.length) return currentRows;
    const wanted = new Set(filter.values.map((item) => (item === "" ? "Sin dato" : String(item))));
    return currentRows.filter((row) => wanted.has(value(row, filter.column) || "Sin dato"));
  }, rows);
}

function withoutEstadoFilter(filters = []) {
  return filters.filter((filter) => normalizeColumnName(filter.column) !== normalizeColumnName("ESTADO"));
}

function applyFechaBajaRange(rows, dateRange = {}) {
  return rows.filter((row) => {
    if (!isBajaRow(row)) return false;
    const fechaBaja = dateValue(row["FECHA BAJA"]);
    if (!fechaBaja) return false;
    const start = dateRange.start ? dateValue(dateRange.start) : null;
    const end = dateRange.end ? dateValue(dateRange.end) : null;
    if (start && fechaBaja < start) return false;
    if (end && fechaBaja > end) return false;
    return true;
  });
}

function seriesCounts(rows, column, limit = 12) {
  const counts = new Map();
  rows.forEach((row) => {
    const key = value(row, column) || "Sin dato";
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, value: count }));
}

function campaignRow(campana, extra = {}) {
  return {
    [C.campaignLabel]: campana,
    "CampaÃƒÂ±a": campana,
    "CampaÃƒÆ’Ã‚Â±a": campana,
    CAMPANA: campana,
    ...extra,
  };
}

function tenureRow(label, bajas = 0) {
  return {
    [C.tenure]: label,
    "AntigÃƒÂ¼edad": label,
    "AntigÃƒÆ’Ã‚Â¼edad": label,
    Bajas: bajas,
  };
}

function buildDashboard(rows) {
  const today = new Date();
  const altasMes = rows.filter((row) => {
    const date = dateValue(row["FECHA ALTA"]);
    return date && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
  });
  const bajasMes = rows.filter((row) => {
    const date = dateValue(row["FECHA BAJA"]);
    return isBajaRow(row) && date && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
  });
  const salario = rows.map((row) => numberValue(row["SALARIO"]));
  const carga = rows.map((row) => numberValue(row["CARGA HORARIA SEMANAL"]));
  const estado = rows.map((row) => normalizeColumnName(value(row, "ESTADO")));

  return {
    metrics: {
      total_empleados: rows.length,
      activos: estado.filter((item) => item === "ACTIVO").length,
      bajas: rows.filter(isBajaRow).length,
      bajas_del_mes: bajasMes.length,
      altas_del_mes: altasMes.length,
      salario_total: salario.reduce((sum, item) => sum + item, 0),
      salario_promedio: salario.length ? salario.reduce((sum, item) => sum + item, 0) / salario.length : 0,
      carga_horaria_total: carga.reduce((sum, item) => sum + item, 0),
    },
    charts: {
      empleados_por_area: seriesCounts(rows, C.area),
      empleados_por_cliente: seriesCounts(rows, "CLIENTE"),
      empleados_por_campana: seriesCounts(rows, C.campaign),
      empleados_por_modalidad: seriesCounts(rows, C.modality),
    },
  };
}

function buildDateSummary(rows) {
  const bajas = rows
    .filter(isBajaRow)
    .map((row) => dateValue(row["FECHA BAJA"]))
    .filter(Boolean)
    .sort((a, b) => a - b);
  const periods = new Map();
  bajas.forEach((date) => {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    periods.set(key, (periods.get(key) || 0) + 1);
  });
  return {
    min: bajas[0] ? formatDate(bajas[0]) : "",
    max: bajas[bajas.length - 1] ? formatDate(bajas[bajas.length - 1]) : "",
    total: bajas.length,
    periods: [...periods.entries()].map(([period, count]) => `${period}: ${count}`).join(", "),
  };
}

export async function uploadPayrollBrowser(file) {
  const rawRows = await readWorkbook(file);
  const { rows, missingCore } = cleanPayroll(rawRows);
  const validations = validatePayroll(rows, missingCore);
  state.rows = rows;
  state.missingCore = missingCore;
  state.validations = validations;
  state.dateSummary = buildDateSummary(rows);
  return {
    batch_id: "browser",
    rows: rows.length,
    columns: ACTIVE_COLUMNS,
    missing_core_columns: missingCore,
    validations,
    date_summary: state.dateSummary,
    dashboard: buildDashboard(rows),
  };
}

export function getDashboardBrowser(filters = []) {
  ensureRows();
  return buildDashboard(applyFilters(state.rows, filters));
}

export function getValidationsBrowser() {
  ensureRows();
  return { issues: state.validations };
}

export function getDatasetMetadataBrowser() {
  ensureRows();
  return {
    columns: ACTIVE_COLUMNS.map((column) => {
      const values = [...new Set(state.rows.map((row) => value(row, column) || "Sin dato"))]
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 5000);
      return { name: column, values, unique_count: values.length };
    }),
  };
}

export function getFilterOptionsBrowser(filters = []) {
  ensureRows();
  const rows = applyFilters(state.rows, filters);
  return {
    columns: ACTIVE_COLUMNS.map((column) => {
      const values = [...new Set(rows.map((row) => value(row, column) || "Sin dato"))]
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 5000);
      return { name: column, values, available_count: values.length, unique_count: values.length };
    }),
    rows: rows.length,
  };
}

export function getFilteredRecordsBrowser(filters = []) {
  ensureRows();
  const rows = applyFilters(state.rows, filters);
  const preferredColumns = [
    "LEGAJO",
    "APELLIDOS",
    "NOMBRES",
    "DOCUMENTO",
    "ESTADO",
    C.area,
    "CLIENTE",
    C.campaign,
    "PUESTO",
    C.modality,
    "LOCALIDAD",
    "SITIO",
    "CARGA HORARIA SEMANAL",
    "SALARIO",
    "FECHA ALTA",
    "FECHA BAJA",
    "MOTIVO BAJA",
  ];
  return {
    columns: preferredColumns,
    rows: rows.slice(0, 500).map((row) =>
      Object.fromEntries(preferredColumns.map((column) => [column, value(row, column) || "Sin dato"])),
    ),
    total: rows.length,
    limit: 500,
  };
}

export function getStaffingByCampaignBrowser(filters = []) {
  ensureRows();
  const filtered = filters.filter((filter) => normalizeColumnName(filter.column) !== normalizeColumnName("ESTADO"));
  const hasPuestoFilter = filters.some((filter) => normalizeColumnName(filter.column) === normalizeColumnName("PUESTO"));
  const rows = applyFilters(state.rows, filtered).filter((row) => {
    if (hasPuestoFilter) return true;
    return normalizeColumnName(value(row, "PUESTO")) === "OPERADOR";
  });
  const grouped = new Map();
  const { start: monthStart, end: today } = currentMonthToDateBounds();
  rows.forEach((row) => {
    const campana = campaignValue(row);
    const cliente = clientValue(row);
    const groupKey = `${normalizeColumnName(cliente)}||${normalizeColumnName(campana)}`;
    const estado = value(row, "ESTADO") || "Sin dato";
    const estadoUpper = normalizeColumnName(estado);
    const isBaja = estadoUpper.includes("BAJA");
    const isActivo = estadoUpper === "ACTIVO";
    const isPreActivo = estadoUpper.replace(/-/g, " ").trim() === "PRE ACTIVO";
    const isLicencia = !isActivo && !isBaja && !isPreActivo;
    const current = grouped.get(groupKey) || { campana, cliente, activo: 0, bajasMes: 0, licencia: 0, licenses: new Map() };
    if (isActivo) current.activo += 1;
    if (isBaja) {
      const fechaBaja = dateValue(row["FECHA BAJA"]);
      if (fechaBaja && fechaBaja >= monthStart && fechaBaja <= today) current.bajasMes += 1;
    }
    if (isLicencia) {
      current.licencia += 1;
      current.licenses.set(estado, (current.licenses.get(estado) || 0) + 1);
    }
    grouped.set(groupKey, current);
  });
  return {
    rows: [...grouped.values()]
      .map((row) =>
        campaignRow(row.campana, {
          campana: row.campana,
          cliente: row.cliente,
          CLIENTE: row.cliente,
          [C.campaign]: row.campana,
          activo: row.activo,
          bajasMes: row.bajasMes,
          licencia: row.licencia,
          observacion: [...row.licenses.entries()].map(([label, count]) => `${label}: ${count}`).join(", "),
        }),
      )
      .sort((a, b) => b.activo - a.activo),
  };
}

export function getRequiredStructureBrowser(filters = []) {
  ensureRows();
  const filtered = filters.filter((filter) => normalizeColumnName(filter.column) !== normalizeColumnName("ESTADO"));
  const rows = applyFilters(state.rows, filtered);
  const grouped = new Map();
  rows.forEach((row) => {
    const pcia = looseValue(row, "PCIA", "PROVINCIA") || "Sin dato";
    const site = looseValue(row, "SITE", "SITIO") || "Sin dato";
    const responsable = looseValue(row, "RESPONSABLE", "FORMADOR ASIGNADO", "SUPERVISOR") || "Sin dato";
    const cliente = clientValue(row);
    const campana = campaignValue(row);
    const subcampana = looseValue(row, C.subCampaign, "SUB CAMPANA", "SUB CAMPAÃ‘A") || "Sin dato";
    const key = [pcia, site, responsable, cliente, campana, subcampana].map(normalizeColumnName).join("||");
    const estado = normalizeColumnName(value(row, "ESTADO"));
    const isActivo = estado === "ACTIVO";
    const current = grouped.get(key) || {
      pcia,
      site,
      responsable,
      cliente,
      campana,
      subcampana,
      activo: 0,
      weekly_hours: 0,
    };
    if (isActivo || !estado) {
      current.activo += 1;
      current.weekly_hours += numberValue(row["CARGA HORARIA SEMANAL"]);
    }
    grouped.set(key, current);
  });
  return {
    rows: [...grouped.values()].sort((a, b) =>
      `${a.cliente} ${a.campana} ${a.subcampana}`.localeCompare(`${b.cliente} ${b.campana} ${b.subcampana}`),
    ),
  };
}

export function getHierarchySummaryBrowser(filters = []) {
  ensureRows();
  const savedExceptions = getBrowserHierarchyExceptions().rows;
  const exceptionsByClient = new Map();
  savedExceptions.forEach((row) => {
    const key = normalizeColumnName(row.client);
    if (!exceptionsByClient.has(key)) exceptionsByClient.set(key, []);
    exceptionsByClient.get(key).push(row);
  });
  exceptionsByClient.forEach((items) => items.sort((a, b) => {
    const aScoped = Boolean(a.scopeManager || a.scopeSiteHead || a.scopeSupervisor);
    const bScoped = Boolean(b.scopeManager || b.scopeSiteHead || b.scopeSupervisor);
    return Number(bScoped) - Number(aScoped);
  }));
  const personKey = (input) => normalizeColumnName(input).replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
  const personName = (row) => {
    const surname = looseValue(row, "APELLIDOS", "APELLIDO");
    const names = looseValue(row, "NOMBRES", "NOMBRE");
    return surname && names ? `${surname}, ${names}` : surname || names || "Sin identificar";
  };
  const roleFromPosition = (position) => {
    const value = normalizeColumnName(position);
    if (value.includes("TEAM LEADER")) return "leader";
    if (value.includes("SUPERVISOR")) return "supervisor";
    if (value.includes("JEFE DE SITE")) return "siteHead";
    if (value.includes("GERENTE")) return "manager";
    return "";
  };

  const directory = new Map();
  state.rows.forEach((row) => {
    const key = personKey(personName(row));
    if (!key) return;
    const item = {
      name: personName(row),
      manager: looseValue(row, "EQUIPO"),
      role: roleFromPosition(looseValue(row, "PUESTO")),
      active: isActiveRow(row),
    };
    const current = directory.get(key);
    if (!current || item.active) directory.set(key, item);
  });

  const hierarchyCache = new Map();
  const resolveHierarchy = (row) => {
    const firstManager = looseValue(row, "EQUIPO");
    const firstKey = personKey(firstManager);
    const client = clientValue(row);
    const cacheKey = `${firstKey}||${normalizeColumnName(client)}`;
    if (hierarchyCache.has(cacheKey)) return hierarchyCache.get(cacheKey);
    const result = { leader: "", supervisor: "", siteHead: "", manager: "" };
    const visited = new Set();
    let manager = firstManager;
    while (manager) {
      const key = personKey(manager);
      if (!key || visited.has(key)) break;
      visited.add(key);
      const person = directory.get(key);
      if (!person) break;
      if (person.role && !result[person.role]) result[person.role] = person.name;
      manager = person.manager;
    }
    const sourceManager = result.manager || "Multicuentas";
    const sourceSiteHead = result.siteHead || "Sin jefe de site identificado";
    const sourceSupervisor = result.supervisor || "Sin supervisor";
    result.scopeManager = sourceManager;
    result.scopeSiteHead = sourceSiteHead;
    result.scopeSupervisor = sourceSupervisor;
    const exception = (exceptionsByClient.get(normalizeColumnName(client)) || []).find((item) => (
      (!item.scopeManager || normalizeColumnName(item.scopeManager) === normalizeColumnName(sourceManager))
      && (!item.scopeSiteHead || normalizeColumnName(item.scopeSiteHead) === normalizeColumnName(sourceSiteHead))
      && (!item.scopeSupervisor || normalizeColumnName(item.scopeSupervisor) === normalizeColumnName(sourceSupervisor))
    ));
    if (exception) {
      if (exception.manager) {
        result.manager = normalizeColumnName(exception.manager) === "SIN GERENTE IDENTIFICADO"
          ? "Multicuentas"
          : exception.manager;
      }
      if (exception.siteHead) result.siteHead = exception.siteHead;
      if (exception.supervisor) {
        result.supervisor = normalizeColumnName(exception.supervisor) === "SIN SUPERVISOR"
          ? ""
          : exception.supervisor;
      }
    }
    if (cacheKey) hierarchyCache.set(cacheKey, result);
    return result;
  };

  const activeRows = applyFilters(state.rows, withoutEstadoFilter(filters)).filter(isActiveRow);
  const ratioFilters = filters.filter((filter) => {
    const column = normalizeColumnName(filter.column);
    return ![normalizeColumnName("ESTADO"), normalizeColumnName("CLIENTE"), normalizeColumnName(C.campaign)].includes(column);
  });
  const ratioRows = applyFilters(state.rows, ratioFilters).filter(isActiveRow);
  const accountTotals = new Map();
  activeRows.forEach((row) => {
    const client = clientValue(row);
    accountTotals.set(client, (accountTotals.get(client) || 0) + 1);
  });

  const groups = {
    leaders: new Map(),
    supervisors: new Map(),
    siteHeads: new Map(),
    managers: new Map(),
  };
  const currentStructure = new Map();
  const add = (map, key, initial) => {
    const current = map.get(key) || { ...initial, active: 0 };
    current.active += 1;
    map.set(key, current);
  };

  activeRows.forEach((row) => {
    const client = clientValue(row);
    const campaign = campaignValue(row);
    const hierarchy = resolveHierarchy(row);
    const leader = hierarchy.leader || "Sin líder identificado";
    const supervisor = hierarchy.supervisor || "Sin supervisor identificado";
    const siteHead = hierarchy.siteHead || "Sin jefe de site identificado";
    const manager = hierarchy.manager || "Multicuentas";

    const structureKey = [client, hierarchy.scopeManager, hierarchy.scopeSiteHead, hierarchy.scopeSupervisor]
      .map(normalizeColumnName)
      .join("||");
    const structureRow = currentStructure.get(structureKey) || {
      client,
      scopeManager: hierarchy.scopeManager,
      scopeSiteHead: hierarchy.scopeSiteHead,
      scopeSupervisor: hierarchy.scopeSupervisor,
      manager,
      siteHead,
      supervisor,
      active: 0,
    };
    structureRow.active += 1;
    currentStructure.set(structureKey, structureRow);

    add(groups.leaders, [client, campaign, leader].map(normalizeColumnName).join("||"), {
      client,
      campaign,
      leader,
      supervisor,
      siteHead,
      manager,
    });
    add(groups.supervisors, [client, supervisor].map(normalizeColumnName).join("||"), {
      client,
      supervisor,
      siteHead,
      manager,
    });
    add(groups.siteHeads, [client, siteHead].map(normalizeColumnName).join("||"), {
      client,
      siteHead,
      manager,
    });
    add(groups.managers, [client, manager].map(normalizeColumnName).join("||"), {
      client,
      manager,
    });
  });

  const ratioMaps = {
    leaders: { account: new Map(), total: new Map() },
    supervisors: { account: new Map(), total: new Map() },
    siteHeads: { account: new Map(), total: new Map() },
    managers: { account: new Map(), total: new Map() },
  };
  const addRatio = (level, client, responsible) => {
    const responsibleKey = personKey(responsible);
    const accountKey = `${normalizeColumnName(client)}||${responsibleKey}`;
    ratioMaps[level].account.set(accountKey, (ratioMaps[level].account.get(accountKey) || 0) + 1);
    ratioMaps[level].total.set(responsibleKey, (ratioMaps[level].total.get(responsibleKey) || 0) + 1);
  };
  ratioRows.forEach((row) => {
    const client = clientValue(row);
    const hierarchy = resolveHierarchy(row);
    addRatio("leaders", client, hierarchy.leader || "Sin líder identificado");
    addRatio("supervisors", client, hierarchy.supervisor || "Sin supervisor identificado");
    addRatio("siteHeads", client, hierarchy.siteHead || "Sin jefe de site identificado");
    addRatio("managers", client, hierarchy.manager || "Multicuentas");
  });

  const finalize = (level, map, responsibleField) => [...map.values()]
    .map((row) => {
      const responsibleKey = personKey(row[responsibleField]);
      const accountKey = `${normalizeColumnName(row.client)}||${responsibleKey}`;
      const accountAssigned = ratioMaps[level].account.get(accountKey) || 0;
      const responsibleTotal = ratioMaps[level].total.get(responsibleKey) || 0;
      return {
        ...row,
        accountTotal: accountTotals.get(row.client) || 0,
        accountAssigned,
        responsibleTotal,
        share: responsibleTotal ? Number(((accountAssigned / responsibleTotal) * 100).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => a.client.localeCompare(b.client) || b.active - a.active);

  const rows = {
    leaders: finalize("leaders", groups.leaders, "leader"),
    supervisors: finalize("supervisors", groups.supervisors, "supervisor"),
    siteHeads: finalize("siteHeads", groups.siteHeads, "siteHead"),
    managers: finalize("managers", groups.managers, "manager"),
  };
  const activeRoleSets = {
    leader: new Set(),
    supervisor: new Set(),
    siteHead: new Set(),
    manager: new Set(),
  };
  const rosterMaps = {
    supervisors: new Map(),
    siteHeads: new Map(),
    managers: new Map(),
  };
  activeRows.forEach((row) => {
    const role = roleFromPosition(looseValue(row, "PUESTO"));
    if (!role) return;
    const name = personName(row);
    const key = personKey(name);
    const client = clientValue(row);
    const hierarchy = resolveHierarchy(row);
    activeRoleSets[role].add(key);
    if (role === "manager") rosterMaps.managers.set(key, { name, client });
    if (role === "siteHead") {
      rosterMaps.siteHeads.set(key, {
        name,
        client,
        manager: hierarchy.manager || "Multicuentas",
      });
    }
    if (role === "supervisor") {
      rosterMaps.supervisors.set(key, {
        name,
        client,
        siteHead: hierarchy.siteHead || "Sin jefe de site identificado",
        manager: hierarchy.manager || "Multicuentas",
      });
    }
  });
  return {
    rows,
    currentStructure: [...currentStructure.values()].sort((a, b) => a.client.localeCompare(b.client) || b.active - a.active),
    roster: {
      supervisors: [...rosterMaps.supervisors.values()],
      siteHeads: [...rosterMaps.siteHeads.values()],
      managers: [...rosterMaps.managers.values()],
    },
    totals: {
      active: activeRows.length,
      clients: accountTotals.size,
      leaders: activeRoleSets.leader.size,
      supervisors: activeRoleSets.supervisor.size,
      siteHeads: activeRoleSets.siteHead.size,
      managers: activeRoleSets.manager.size,
    },
  };
}

export function getBajasByMonthBrowser(filters = [], dateRange = {}) {
  ensureRows();
  const rows = applyFechaBajaRange(applyFilters(state.rows, withoutEstadoFilter(filters)), dateRange);
  const grouped = new Map();
  const hourGrouped = new Map();
  const hourEvents = [];
  const months = new Map();
  rows.forEach((row) => {
    const fecha = dateValue(row["FECHA BAJA"]);
    if (!fecha) return;
    const monthKey = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
    const label = `${MONTH_LABELS[fecha.getMonth() + 1]} ${fecha.getFullYear()}`;
    months.set(monthKey, label);
    const campana = campaignValue(row);
    const current = grouped.get(campana) || campaignRow(campana, { Total: 0 });
    current[label] = (current[label] || 0) + 1;
    current.Total += 1;
    grouped.set(campana, current);

    const start = new Date(fecha.getFullYear(), fecha.getMonth(), 1);
    const end = monthEnd(fecha);
    const businessDaysMonth = businessDaysBetween(start, end);
    const workedDays = businessDaysBetween(start, fecha);
    const missingDays = Math.max(businessDaysMonth - workedDays, 0);
    const hourKey = `${campana}||${monthKey}`;
    const hourRow = hourGrouped.get(hourKey) || {
      [C.campaignLabel]: campana,
      Mes: label,
      Bajas: 0,
      "Días hábiles mes": businessDaysMonth,
      "Días hábiles trabajados": 0,
      "Días diferencia": 0,
      "Horas trabajadas": 0,
      "Diferencia horas": 0,
    };
    hourRow.Bajas += 1;
    hourRow["Días hábiles trabajados"] += workedDays;
    hourRow["Días diferencia"] += missingDays;
    hourRow["Horas trabajadas"] += workedDays * 6;
    hourRow["Diferencia horas"] += missingDays * 6;
    hourGrouped.set(hourKey, hourRow);
    hourEvents.push({ [C.campaignLabel]: campana, Mes: label, "Fecha baja": formatDate(fecha) });
  });
  const labels = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, label]) => label);
  const totals = { Total: 0 };
  labels.forEach((label) => {
    totals[label] = [...grouped.values()].reduce((sum, row) => sum + (row[label] || 0), 0);
    totals.Total += totals[label];
  });
  const hourRows = [...hourGrouped.values()].sort((a, b) => `${a.Mes} ${a[C.campaignLabel]}`.localeCompare(`${b.Mes} ${b[C.campaignLabel]}`));
  const hourTotals = {
    Bajas: hourRows.reduce((sum, row) => sum + row.Bajas, 0),
    "Días hábiles trabajados": hourRows.reduce((sum, row) => sum + row["Días hábiles trabajados"], 0),
    "Días diferencia": hourRows.reduce((sum, row) => sum + row["Días diferencia"], 0),
    "Horas trabajadas": hourRows.reduce((sum, row) => sum + row["Horas trabajadas"], 0),
    "Diferencia horas": hourRows.reduce((sum, row) => sum + row["Diferencia horas"], 0),
  };
  return {
    months: labels,
    rows: [...grouped.values()].sort((a, b) => b.Total - a.Total),
    totals,
    hourRows,
    hourTotals,
    hourEvents,
    holidayDates: Object.values(DEFAULT_HOLIDAY_DATES).flatMap((dates) => [...dates]),
    hoursPerBusinessDay: 6,
  };
}

export function getBajasByTenureBrowser(filters = [], dateRange = {}) {
  ensureRows();
  const rows = applyFechaBajaRange(applyFilters(state.rows, withoutEstadoFilter(filters)), dateRange);
  const buckets = [
    "Menos de 1 mes",
    "1 mes",
    "2 meses",
    "3 meses",
    "4 meses",
    "5 meses",
    "6 meses",
    "Mayor a 6 meses",
  ].map((label) => tenureRow(label, 0));

  rows.forEach((row) => {
    const alta = dateValue(row["FECHA ALTA"]);
    const baja = dateValue(row["FECHA BAJA"]);
    if (!alta || !baja || baja < alta) return;
    let months = (baja.getFullYear() - alta.getFullYear()) * 12 + (baja.getMonth() - alta.getMonth());
    if (baja.getDate() < alta.getDate()) months -= 1;
    const index = Math.max(0, Math.min(months, 7));
    buckets[index === 7 ? 7 : index].Bajas += 1;
  });
  return { rows: buckets, total: buckets.reduce((sum, row) => sum + row.Bajas, 0) };
}

export function getBajasTenureByMonthBrowser(filters = [], dateRange = {}) {
  ensureRows();
  const rows = applyFechaBajaRange(applyFilters(state.rows, withoutEstadoFilter(filters)), dateRange);
  const bucketLabels = [
    "Menos de 1 mes",
    "1 mes",
    "2 meses",
    "3 meses",
    "4 meses",
    "5 meses",
    "6 meses",
    "Mayor a 6 meses",
  ];
  const grouped = new Map(bucketLabels.map((label) => [label, { [C.tenure]: label, Total: 0 }]));
  const months = new Map();

  rows.forEach((row) => {
    const alta = dateValue(row["FECHA ALTA"]);
    const baja = dateValue(row["FECHA BAJA"]);
    if (!alta || !baja || baja < alta) return;
    let tenureMonths = (baja.getFullYear() - alta.getFullYear()) * 12 + (baja.getMonth() - alta.getMonth());
    if (baja.getDate() < alta.getDate()) tenureMonths -= 1;
    const bucketIndex = Math.max(0, Math.min(tenureMonths, 7));
    const bucket = grouped.get(bucketLabels[bucketIndex === 7 ? 7 : bucketIndex]);
    const monthKey = `${baja.getFullYear()}-${String(baja.getMonth() + 1).padStart(2, "0")}`;
    const label = `${MONTH_LABELS[baja.getMonth() + 1]} ${baja.getFullYear()}`;
    months.set(monthKey, label);
    bucket[label] = (bucket[label] || 0) + 1;
    bucket.Total += 1;
  });

  const labels = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, label]) => label);
  const totals = { Total: 0 };
  labels.forEach((label) => {
    totals[label] = [...grouped.values()].reduce((sum, row) => sum + (row[label] || 0), 0);
    totals.Total += totals[label];
  });
  return { months: labels, rows: [...grouped.values()], totals };
}

export function getBajasByOwnerMonthBrowser(filters = [], dateRange = {}) {
  ensureRows();
  const baseRows = applyFilters(state.rows, withoutEstadoFilter(filters));
  const rows = applyFechaBajaRange(baseRows, dateRange);
  const months = new Map();
  rows.forEach((row) => {
    const baja = dateValue(row["FECHA BAJA"]);
    if (!baja) return;
    const monthKey = `${baja.getFullYear()}-${String(baja.getMonth() + 1).padStart(2, "0")}`;
    months.set(monthKey, `${MONTH_LABELS[baja.getMonth() + 1]} ${baja.getFullYear()}`);
  });
  const labels = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, label]) => label);
  const monthMeta = [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, label]) => {
      const [year, month] = key.split("-").map(Number);
      const start = new Date(year, month - 1, 1);
      return { key, label, start, end: monthEnd(start) };
    });

  const personNameKey = (input) => normalizeColumnName(input).replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
  const supervisorNames = new Map();
  const managerByPerson = new Map();
  state.rows.forEach((row) => {
    const surname = looseValue(row, "APELLIDOS", "APELLIDO");
    const names = looseValue(row, "NOMBRES", "NOMBRE");
    const fullName = surname && names ? `${surname}, ${names}` : surname || names;
    const personKey = personNameKey(fullName);
    const manager = looseValue(row, "EQUIPO");
    if (personKey && manager) managerByPerson.set(personKey, manager);
    if (!normalizeColumnName(looseValue(row, "PUESTO")).includes("SUPERVISOR")) return;
    const key = personNameKey(fullName);
    if (key) supervisorNames.set(key, fullName);
  });

  const supervisorResolutionCache = new Map();
  const resolveSupervisor = (row) => {
    let manager = looseValue(row, "EQUIPO");
    const initialKey = personNameKey(manager);
    if (supervisorResolutionCache.has(initialKey)) return supervisorResolutionCache.get(initialKey);
    const visited = new Set();
    const path = [];
    let resolved = "Sin supervisor identificado";
    while (manager) {
      const managerKey = personNameKey(manager);
      if (!managerKey || visited.has(managerKey)) break;
      if (supervisorResolutionCache.has(managerKey)) {
        resolved = supervisorResolutionCache.get(managerKey);
        break;
      }
      if (supervisorNames.has(managerKey)) {
        resolved = supervisorNames.get(managerKey);
        break;
      }
      visited.add(managerKey);
      path.push(managerKey);
      manager = managerByPerson.get(managerKey) || "";
    }
    if (initialKey) supervisorResolutionCache.set(initialKey, resolved);
    path.forEach((managerKey) => supervisorResolutionCache.set(managerKey, resolved));
    return resolved;
  };
  const supervisorScopeNames = new Map(supervisorNames);
  supervisorScopeNames.set(personNameKey("Sin supervisor identificado"), "Sin supervisor identificado");

  const buildScope = (label, getters, allowedOwnerNames = null) => {
    const grouped = new Map();
    allowedOwnerNames?.forEach((owner, ownerKey) => {
      grouped.set(ownerKey, { Responsable: owner, Total: 0 });
    });
    rows.forEach((row) => {
      const baja = dateValue(row["FECHA BAJA"]);
      if (!baja) return;
      const month = `${MONTH_LABELS[baja.getMonth() + 1]} ${baja.getFullYear()}`;
      const owner = getters.map((getter) => getter(row)).find(Boolean) || "Sin dato";
      const ownerKey = personNameKey(owner);
      if (allowedOwnerNames && !allowedOwnerNames.has(ownerKey)) return;
      const current = grouped.get(ownerKey) || {
        Responsable: allowedOwnerNames?.get(ownerKey) || owner,
        Total: 0,
      };
      current[month] = (current[month] || 0) + 1;
      current.Total += 1;
      grouped.set(ownerKey, current);
    });
    const staffingByOwner = new Map();
    baseRows.filter(isActiveRow).forEach((row) => {
      const owner = getters.map((getter) => getter(row)).find(Boolean) || "Sin dato";
      const ownerKey = personNameKey(owner);
      if (allowedOwnerNames && !allowedOwnerNames.has(ownerKey)) return;
      if (!staffingByOwner.has(ownerKey)) staffingByOwner.set(ownerKey, []);
      staffingByOwner.get(ownerKey).push(row);
    });

    const scopeRows = [...grouped.entries()].map(([ownerKey, ownerRow]) => {
      const assignedRows = staffingByOwner.get(ownerKey) || [];
      const next = { ...ownerRow, _staffing: {}, _rotation: {} };
      let staffingSum = 0;
      monthMeta.forEach((month) => {
        const bajas = next[month.label] || 0;
        const assigned = assignedRows.length;
        next._staffing[month.label] = assigned;
        next._rotation[month.label] = assigned ? Number(((bajas / assigned) * 100).toFixed(1)) : 0;
        staffingSum += assigned;
      });
      next._staffing.Promedio = monthMeta.length ? Number((staffingSum / monthMeta.length).toFixed(1)) : 0;
      next._rotation.Total = next._staffing.Promedio
        ? Number(((next.Total / next._staffing.Promedio) * 100).toFixed(1))
        : 0;
      return next;
    }).filter((row) => row.Total > 0 || row._staffing.Promedio > 0)
      .sort((a, b) => b.Total - a.Total);

    const totals = { Total: 0, _staffing: {}, _rotation: {} };
    monthMeta.forEach((month) => {
      totals[month.label] = scopeRows.reduce((sum, row) => sum + (row[month.label] || 0), 0);
      totals._staffing[month.label] = [...staffingByOwner.values()].reduce(
        (sum, ownerRows) => sum + ownerRows.length,
        0,
      );
      totals._rotation[month.label] = totals._staffing[month.label]
        ? Number(((totals[month.label] / totals._staffing[month.label]) * 100).toFixed(1))
        : 0;
      totals.Total += totals[month.label];
    });
    const staffingAverage = monthMeta.length
      ? Number((Object.values(totals._staffing).reduce((sum, item) => sum + item, 0) / monthMeta.length).toFixed(1))
      : 0;
    totals._staffing.Promedio = staffingAverage;
    totals._rotation.Total = staffingAverage
      ? Number(((totals.Total / staffingAverage) * 100).toFixed(1))
      : 0;
    return { label, rows: scopeRows, totals };
  };

  return {
    months: labels,
    leader: buildScope("Líder / Equipo", [
      (row) => looseValue(row, "LÍDER", "LIDER", "JEFE", "JEFE DE EQUIPO"),
      (row) => looseValue(row, "EQUIPO"),
    ]),
    supervisor: buildScope("Supervisor", [
      resolveSupervisor,
    ], supervisorScopeNames),
  };
}

export function getBajasReasonByTenureBrowser(filters = [], dateRange = {}) {
  ensureRows();
  const rows = applyFechaBajaRange(applyFilters(state.rows, withoutEstadoFilter(filters)), dateRange);
  const bucketLabels = [
    "Menos de 1 mes",
    "1 mes",
    "2 meses",
    "3 meses",
    "4 meses",
    "5 meses",
    "6 meses",
    "Mayor a 6 meses",
  ];
  const groupedRows = bucketLabels.map((label) => ({ [C.tenure]: label, Total: 0 }));
  const reasonTotals = new Map();
  const campaignBuckets = new Map();

  rows.forEach((row) => {
    const alta = dateValue(row["FECHA ALTA"]);
    const baja = dateValue(row["FECHA BAJA"]);
    if (!alta || !baja || baja < alta) return;
    let months = (baja.getFullYear() - alta.getFullYear()) * 12 + (baja.getMonth() - alta.getMonth());
    if (baja.getDate() < alta.getDate()) months -= 1;
    const index = Math.max(0, Math.min(months, 7));
    const motivo = value(row, "MOTIVO BAJA") || "Sin dato";
    const campana = campaignValue(row);
    const bucketIndex = index === 7 ? 7 : index;
    const bucket = groupedRows[bucketIndex];
    bucket[motivo] = (bucket[motivo] || 0) + 1;
    bucket.Total += 1;
    reasonTotals.set(motivo, (reasonTotals.get(motivo) || 0) + 1);

    if (!campaignBuckets.has(campana)) {
      campaignBuckets.set(campana, bucketLabels.map((label) => ({ [C.tenure]: label, Total: 0 })));
    }
    const campaignBucket = campaignBuckets.get(campana)[bucketIndex];
    campaignBucket[motivo] = (campaignBucket[motivo] || 0) + 1;
    campaignBucket.Total += 1;
  });

  const reasons = [...reasonTotals.entries()].sort((a, b) => b[1] - a[1]).map(([reason]) => reason);
  const totals = Object.fromEntries(reasonTotals);
  totals.Total = [...reasonTotals.values()].reduce((sum, count) => sum + count, 0);

  const buildScopeTotals = (scopeRows) => {
    const scopeTotals = Object.fromEntries(reasons.map((reason) => [reason, 0]));
    scopeRows.forEach((row) => {
      reasons.forEach((reason) => {
        scopeTotals[reason] += row[reason] || 0;
      });
    });
    scopeTotals.Total = scopeRows.reduce((sum, row) => sum + row.Total, 0);
    return scopeTotals;
  };

  const byCampaign = {};
  const campaigns = [...campaignBuckets.entries()].map(([name, scopeRows]) => {
    byCampaign[name] = {
      rows: scopeRows,
      totals: buildScopeTotals(scopeRows),
    };
    return { name, total: byCampaign[name].totals.Total };
  });

  return {
    reasons,
    rows: groupedRows,
    totals,
    campaigns: campaigns.sort((a, b) => b.total - a.total),
    byCampaign,
  };
}
export function getBajasByReasonBrowser(filters = [], dateRange = {}) {
  ensureRows();
  const rows = applyFechaBajaRange(applyFilters(state.rows, withoutEstadoFilter(filters)), dateRange);
  const counts = seriesCounts(rows, "MOTIVO BAJA", 1000);
  return {
    rows: counts.map((row) => ({ Motivo: row.name, Bajas: row.value })),
    total: counts.reduce((sum, row) => sum + row.value, 0),
  };
}

export function getBajasReasonByCampaignBrowser(filters = [], dateRange = {}) {
  ensureRows();
  const rows = applyFechaBajaRange(applyFilters(state.rows, withoutEstadoFilter(filters)), dateRange);
  const grouped = new Map();
  const reasonTotals = new Map();
  rows.forEach((row) => {
    const campana = campaignValue(row);
    const motivo = value(row, "MOTIVO BAJA") || "Sin dato";
    const current = grouped.get(campana) || campaignRow(campana, { Total: 0 });
    current[motivo] = (current[motivo] || 0) + 1;
    current.Total += 1;
    grouped.set(campana, current);
    reasonTotals.set(motivo, (reasonTotals.get(motivo) || 0) + 1);
  });
  const reasons = [...reasonTotals.entries()].sort((a, b) => b[1] - a[1]).map(([reason]) => reason);
  const totals = Object.fromEntries(reasonTotals);
  totals.Total = [...reasonTotals.values()].reduce((sum, count) => sum + count, 0);
  return {
    reasons,
    rows: [...grouped.values()].sort((a, b) => b.Total - a.Total),
    totals,
  };
}

export function runDynamicAnalysisBrowser(payload) {
  ensureRows();
  const rows = applyFilters(state.rows, payload.filters || []);
  const dimensions = payload.dimensions?.length ? payload.dimensions.map(columnKey) : [C.area];
  const grouped = new Map();
  rows.forEach((row) => {
    const key = dimensions.map((dimension) => value(row, dimension) || "Sin dato").join("||");
    const current = grouped.get(key) || {
      values: dimensions.map((dimension) => value(row, dimension) || "Sin dato"),
      count: 0,
      salary: 0,
      hours: 0,
    };
    current.count += 1;
    current.salary += numberValue(row["SALARIO"]);
    current.hours += numberValue(row["CARGA HORARIA SEMANAL"]);
    grouped.set(key, current);
  });
  const metric = payload.metric || "count";
  const resultRows = [...grouped.values()].map((item) => {
    const output = Object.fromEntries(dimensions.map((dimension, index) => [dimension, item.values[index]]));
    const valueByMetric = {
      count: item.count,
      salary_sum: item.salary,
      salary_avg: item.count ? item.salary / item.count : 0,
      hours_sum: item.hours,
    };
    output.value = valueByMetric[metric] ?? item.count;
    return output;
  });
  return { rows: resultRows.sort((a, b) => Number(b.value || 0) - Number(a.value || 0)).slice(0, 500) };
}


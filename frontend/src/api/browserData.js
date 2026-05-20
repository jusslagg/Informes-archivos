import * as XLSX from "xlsx";

const CORE_COLUMNS = [
  "LEGAJO",
  "APELLIDOS",
  "NOMBRES",
  "DOCUMENTO",
  "FECHA ALTA",
  "FECHA BAJA",
  "ESTADO",
  "ÃREA",
  "SUB ÃREA",
  "PUESTO",
  "CLIENTE",
  "CAMPAÃ‘A",
  "SUB CAMPAÃ‘A",
  "CENTRO COSTO",
  "CARGA HORARIA SEMANAL",
  "SALARIO",
  "MODALIDAD DE CONTRATACIÃ“N",
  "HORARIO CONTRACTUAL",
  "EMPLEADOR",
  "LOCALIDAD",
  "MULTICAMPAÃ‘A",
];

const OPTIONAL_COLUMNS = [
  "SEXO",
  "FECHA NACIMIENTO",
  "SITIO",
  "PRESENCIALIDAD",
  "EQUIPO",
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
  "ÃREA",
  "CLIENTE",
  "CAMPAÃ‘A",
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

const state = {
  rows: [],
  missingCore: [],
  validations: [],
};

function normalizeColumnName(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const CANONICAL_COLUMN_MAP = [...CORE_COLUMNS, ...OPTIONAL_COLUMNS, ...USER_COLUMNS].reduce((map, column) => {
  map[normalizeColumnName(column)] = column;
  return map;
}, {});

[
  ["AREA", "ÃREA"],
  ["\u00c1REA", "ÃREA"],
  ["SUB AREA", "SUB ÃREA"],
  ["SUB \u00c1REA", "SUB ÃREA"],
  ["CAMPANA", "CAMPAÃ‘A"],
  ["CAMPA\u00d1A", "CAMPAÃ‘A"],
  ["SUB CAMPANA", "SUB CAMPAÃ‘A"],
  ["SUB CAMPA\u00d1A", "SUB CAMPAÃ‘A"],
  ["MULTICAMPANA", "MULTICAMPAÃ‘A"],
  ["MULTICAMPA\u00d1A", "MULTICAMPAÃ‘A"],
  ["MODALIDAD DE CONTRATACION", "MODALIDAD DE CONTRATACIÃ“N"],
  ["MODALIDAD DE CONTRATACI\u00d3N", "MODALIDAD DE CONTRATACIÃ“N"],
].forEach(([source, target]) => {
  CANONICAL_COLUMN_MAP[normalizeColumnName(source)] = target;
});

function findColumn(rows, ...names) {
  const wanted = new Set(names.map(normalizeColumnName));
  return Object.keys(rows[0] || {}).find((column) => wanted.has(normalizeColumnName(column)));
}

function value(row, column) {
  return String(row[column] ?? "").trim();
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
  if (input instanceof Date && !Number.isNaN(input.getTime())) return input;
  if (typeof input === "number") {
    const parsed = XLSX.SSF.parse_date_code(input);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d);
  }
  const text = String(input ?? "").trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const slash = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s.*)?$/);
  if (slash) {
    const year = Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]);
    return new Date(year, Number(slash[2]) - 1, Number(slash[1]));
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(input) {
  const date = dateValue(input);
  if (!date) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function cleanPayroll(rawRows) {
  const renamedRows = rawRows.map((row) => {
    const next = {};
    Object.entries(row).forEach(([column, rawValue]) => {
      const canonical = CANONICAL_COLUMN_MAP[normalizeColumnName(column)];
      if (canonical && !USER_COLUMNS.includes(canonical)) {
        next[canonical] = rawValue == null ? "" : String(rawValue).trim();
      }
    });
    return next;
  });

  const sourceColumns = new Set(renamedRows.flatMap((row) => Object.keys(row)));
  const missingCore = CORE_COLUMNS.filter((column) => !sourceColumns.has(column));

  const rows = renamedRows.map((row) => {
    const next = {};
    ACTIVE_COLUMNS.forEach((column) => {
      let current = row[column] ?? "";
      if (DATE_COLUMNS.includes(column)) current = formatDate(current);
      if (NUMERIC_COLUMNS.includes(column)) current = numberValue(current);
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
      issues.push(buildIssue("empty_fields", "warning", `Hay campos vacÃ­os en ${column}.`, emptyRows));
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
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

function ensureRows() {
  if (!state.rows.length) {
    throw new Error("Primero cargÃ¡ un archivo de nÃ³mina.");
  }
}

function applyFilters(rows, filters = []) {
  return filters.reduce((currentRows, filter) => {
    if (!filter.values?.length) return currentRows;
    const wanted = new Set(filter.values.map((item) => (item === "" ? "Sin dato" : String(item))));
    return currentRows.filter((row) => wanted.has(value(row, filter.column) || "Sin dato"));
  }, rows);
}

function applyFechaBajaRange(rows, dateRange = {}) {
  return rows.filter((row) => {
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

function buildDashboard(rows) {
  const today = new Date();
  const altasMes = rows.filter((row) => {
    const date = dateValue(row["FECHA ALTA"]);
    return date && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
  });
  const bajasMes = rows.filter((row) => {
    const date = dateValue(row["FECHA BAJA"]);
    return date && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
  });
  const salario = rows.map((row) => numberValue(row["SALARIO"]));
  const carga = rows.map((row) => numberValue(row["CARGA HORARIA SEMANAL"]));
  const estado = rows.map((row) => value(row, "ESTADO").toUpperCase());

  return {
    metrics: {
      total_empleados: rows.length,
      activos: estado.filter((item) => item.includes("ACTIVO")).length,
      bajas: estado.filter((item) => item.includes("BAJA") || item.includes("INACTIVO")).length,
      bajas_del_mes: bajasMes.length,
      altas_del_mes: altasMes.length,
      salario_total: salario.reduce((sum, item) => sum + item, 0),
      salario_promedio: salario.length ? salario.reduce((sum, item) => sum + item, 0) / salario.length : 0,
      carga_horaria_total: carga.reduce((sum, item) => sum + item, 0),
    },
    charts: {
      empleados_por_area: seriesCounts(rows, "ÃREA"),
      empleados_por_cliente: seriesCounts(rows, "CLIENTE"),
      empleados_por_campana: seriesCounts(rows, "CAMPAÃ‘A"),
      empleados_por_modalidad: seriesCounts(rows, "MODALIDAD DE CONTRATACIÃ“N"),
    },
  };
}

export async function uploadPayrollBrowser(file) {
  const rawRows = await readWorkbook(file);
  const { rows, missingCore } = cleanPayroll(rawRows);
  const validations = validatePayroll(rows, missingCore);
  state.rows = rows;
  state.missingCore = missingCore;
  state.validations = validations;
  return {
    batch_id: "browser",
    rows: rows.length,
    columns: ACTIVE_COLUMNS,
    missing_core_columns: missingCore,
    validations,
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

export function getFilteredRecordsBrowser(filters = []) {
  ensureRows();
  const rows = applyFilters(state.rows, filters);
  const preferredColumns = [
    "LEGAJO",
    "APELLIDOS",
    "NOMBRES",
    "DOCUMENTO",
    "ESTADO",
    "ÃREA",
    "CLIENTE",
    "CAMPAÃ‘A",
    "PUESTO",
    "MODALIDAD DE CONTRATACIÃ“N",
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
  const rows = applyFilters(state.rows, filtered);
  const campaignColumn = findColumn(rows, "CAMPAÃ‘A", "CAMPANA") || "CAMPAÃ‘A";
  const grouped = new Map();
  rows.forEach((row) => {
    const campana = value(row, campaignColumn) || "Sin dato";
    const estado = value(row, "ESTADO") || "Sin dato";
    const estadoUpper = estado.toUpperCase();
    const isBaja = estadoUpper.includes("BAJA");
    const isActivo = estadoUpper === "ACTIVO" || (estadoUpper.includes("ACTIVO") && !estadoUpper.includes("INACTIVO"));
    const isLicencia = !isActivo && !isBaja;
    const current = grouped.get(campana) || { campana, "CAMPAÃ‘A": campana, activo: 0, licencia: 0, licenses: new Map() };
    if (isActivo) current.activo += 1;
    if (isLicencia) {
      current.licencia += 1;
      current.licenses.set(estado, (current.licenses.get(estado) || 0) + 1);
    }
    grouped.set(campana, current);
  });
  return {
    rows: [...grouped.values()]
      .map((row) => ({
        campana: row.campana,
        "CAMPAÃ‘A": row["CAMPAÃ‘A"],
        activo: row.activo,
        licencia: row.licencia,
        observacion: [...row.licenses.entries()].map(([label, count]) => `${label}: ${count}`).join(", "),
      }))
      .sort((a, b) => b.activo - a.activo),
  };
}

export function getBajasByMonthBrowser(filters = [], dateRange = {}) {
  ensureRows();
  const rows = applyFechaBajaRange(applyFilters(state.rows, filters), dateRange);
  const grouped = new Map();
  const months = new Map();
  rows.forEach((row) => {
    const fecha = dateValue(row["FECHA BAJA"]);
    if (!fecha) return;
    const monthKey = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
    const label = `${MONTH_LABELS[fecha.getMonth() + 1]} ${fecha.getFullYear()}`;
    months.set(monthKey, label);
    const campana = value(row, "CAMPAÃ‘A") || "Sin dato";
    const current = grouped.get(campana) || { "CampaÃ±a": campana, Total: 0 };
    current[label] = (current[label] || 0) + 1;
    current.Total += 1;
    grouped.set(campana, current);
  });
  const labels = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, label]) => label);
  const totals = { Total: 0 };
  labels.forEach((label) => {
    totals[label] = [...grouped.values()].reduce((sum, row) => sum + (row[label] || 0), 0);
    totals.Total += totals[label];
  });
  return {
    months: labels,
    rows: [...grouped.values()].sort((a, b) => b.Total - a.Total),
    totals,
  };
}

export function getBajasByTenureBrowser(filters = [], dateRange = {}) {
  ensureRows();
  const rows = applyFechaBajaRange(applyFilters(state.rows, filters), dateRange);
  const buckets = [
    ["Menos de 1 mes", 0],
    ["1 mes", 1],
    ["2 meses", 2],
    ["3 meses", 3],
    ["4 meses", 4],
    ["5 meses", 5],
    ["6 meses", 6],
    ["Mayor a 6 meses", 7],
  ].map(([label]) => ({ "AntigÃ¼edad": label, Bajas: 0 }));
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

export function getBajasByReasonBrowser(filters = [], dateRange = {}) {
  ensureRows();
  const rows = applyFechaBajaRange(applyFilters(state.rows, filters), dateRange);
  const counts = seriesCounts(rows, "MOTIVO BAJA", 1000);
  return {
    rows: counts.map((row) => ({ Motivo: row.name, Bajas: row.value })),
    total: counts.reduce((sum, row) => sum + row.value, 0),
  };
}

export function getBajasReasonByCampaignBrowser(filters = [], dateRange = {}) {
  ensureRows();
  const rows = applyFechaBajaRange(applyFilters(state.rows, filters), dateRange);
  const grouped = new Map();
  const reasonTotals = new Map();
  rows.forEach((row) => {
    const campana = value(row, "CAMPAÃ‘A") || "Sin dato";
    const motivo = value(row, "MOTIVO BAJA") || "Sin dato";
    const current = grouped.get(campana) || { "CampaÃ±a": campana, Total: 0 };
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
  const dimensions = payload.dimensions?.length ? payload.dimensions : ["ÃREA"];
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

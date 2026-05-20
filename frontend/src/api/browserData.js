import * as XLSX from "xlsx";

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

const ALIASES = new Map();

function addAlias(source, target) {
  ALIASES.set(normalizeColumnName(source), target);
}

[...CORE_COLUMNS, ...OPTIONAL_COLUMNS, ...USER_COLUMNS].forEach((column) => addAlias(column, column));

[
  ["AREA", C.area],
  ["\u00c1REA", C.area],
  ["ÃREA", C.area],
  ["ÃƒÂREA", C.area],
  ["SUB AREA", C.subArea],
  ["SUB \u00c1REA", C.subArea],
  ["SUB ÃREA", C.subArea],
  ["SUB ÃƒÂREA", C.subArea],
  ["CAMPANA", C.campaign],
  ["CAMPA\u00d1A", C.campaign],
  ["CAMPAÃ‘A", C.campaign],
  ["CAMPAÃƒâ€˜A", C.campaign],
  ["SUB CAMPANA", C.subCampaign],
  ["SUB CAMPA\u00d1A", C.subCampaign],
  ["SUB CAMPAÃ‘A", C.subCampaign],
  ["SUB CAMPAÃƒâ€˜A", C.subCampaign],
  ["MULTICAMPANA", C.multiCampaign],
  ["MULTICAMPA\u00d1A", C.multiCampaign],
  ["MULTICAMPAÃ‘A", C.multiCampaign],
  ["MULTICAMPAÃƒâ€˜A", C.multiCampaign],
  ["MODALIDAD DE CONTRATACION", C.modality],
  ["MODALIDAD DE CONTRATACI\u00d3N", C.modality],
  ["MODALIDAD DE CONTRATACIÃ“N", C.modality],
  ["MODALIDAD DE CONTRATACIÃƒâ€œN", C.modality],
].forEach(([source, target]) => addAlias(source, target));

function columnKey(column) {
  return ALIASES.get(normalizeColumnName(column)) || column;
}

function value(row, column) {
  const key = columnKey(column);
  return String(row[key] ?? row[column] ?? "").trim();
}

function campaignValue(row) {
  return value(row, C.campaign) || "Sin dato";
}

function isBajaRow(row) {
  const estado = normalizeColumnName(value(row, "ESTADO"));
  return estado.includes("BAJA") || estado.includes("INACTIVO");
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
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const dayFirst = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s.*)?$/);
  if (dayFirst) {
    const year = Number(dayFirst[3].length === 2 ? `20${dayFirst[3]}` : dayFirst[3]);
    return new Date(year, Number(dayFirst[2]) - 1, Number(dayFirst[1]));
  }

  return null;
}

function formatDate(input) {
  const date = dateValue(input);
  if (!date) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function todayDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
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

function applyFechaBajaRange(rows, dateRange = {}) {
  return rows.filter((row) => {
    if (!isBajaRow(row)) return false;
    const fechaBaja = dateValue(row["FECHA BAJA"]);
    if (!fechaBaja) return false;
    const start = dateRange.start ? dateValue(dateRange.start) : null;
    const end = dateRange.end ? dateValue(dateRange.end) : null;
    if (!end && fechaBaja > todayDate()) return false;
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
    "CampaÃ±a": campana,
    "CampaÃƒÂ±a": campana,
    CAMPANA: campana,
    ...extra,
  };
}

function tenureRow(label, bajas = 0) {
  return {
    [C.tenure]: label,
    "AntigÃ¼edad": label,
    "AntigÃƒÂ¼edad": label,
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
      activos: estado.filter((item) => item.includes("ACTIVO")).length,
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
  const rows = applyFilters(state.rows, filtered);
  const grouped = new Map();
  rows.forEach((row) => {
    const campana = campaignValue(row);
    const estado = value(row, "ESTADO") || "Sin dato";
    const estadoUpper = normalizeColumnName(estado);
    const isBaja = estadoUpper.includes("BAJA");
    const isActivo = estadoUpper === "ACTIVO" || (estadoUpper.includes("ACTIVO") && !estadoUpper.includes("INACTIVO"));
    const isLicencia = !isActivo && !isBaja;
    const current = grouped.get(campana) || { campana, activo: 0, licencia: 0, licenses: new Map() };
    if (isActivo) current.activo += 1;
    if (isLicencia) {
      current.licencia += 1;
      current.licenses.set(estado, (current.licenses.get(estado) || 0) + 1);
    }
    grouped.set(campana, current);
  });
  return {
    rows: [...grouped.values()]
      .map((row) =>
        campaignRow(row.campana, {
          campana: row.campana,
          [C.campaign]: row.campana,
          activo: row.activo,
          licencia: row.licencia,
          observacion: [...row.licenses.entries()].map(([label, count]) => `${label}: ${count}`).join(", "),
        }),
      )
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
    const campana = campaignValue(row);
    const current = grouped.get(campana) || campaignRow(campana, { Total: 0 });
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

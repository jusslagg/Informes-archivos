const number = new Intl.NumberFormat("es-AR");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fileStamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(
    date.getMinutes(),
  )}`;
}

function tableHtml(title, columns, rows, { subtitle = "" } = {}) {
  if (!columns.length) return "";
  const body = rows.length
    ? rows
        .map(
          (row) =>
            `<tr>${columns
              .map((column) => `<td>${escapeHtml(Array.isArray(row) ? row[columns.indexOf(column)] : row[column])}</td>`)
              .join("")}</tr>`,
        )
        .join("")
    : `<tr><td colspan="${columns.length}">Sin datos para mostrar.</td></tr>`;

  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      ${subtitle ? `<p class="muted">${escapeHtml(subtitle)}</p>` : ""}
      <table>
        <thead>
          <tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </section>
  `;
}

function metricRows(metrics, activeRate) {
  return [
    { Indicador: "Total empleados", Valor: number.format(metrics.total_empleados || 0) },
    { Indicador: "Activos", Valor: number.format(metrics.activos || 0) },
    { Indicador: "Bajas del mes", Valor: number.format(metrics.bajas_del_mes || 0) },
    { Indicador: "Altas del mes", Valor: number.format(metrics.altas_del_mes || 0) },
    { Indicador: "Tasa activos", Valor: `${activeRate}%` },
    { Indicador: "Carga horaria total", Valor: number.format(metrics.carga_horaria_total || 0) },
  ];
}

function filterRows(filters = {}) {
  const rows = Object.entries(filters)
    .filter(([, values]) => values?.length)
    .map(([column, values]) => ({
      Filtro: column,
      Valores: values.join(", "),
    }));
  return rows.length ? rows : [{ Filtro: "Sin filtros", Valores: "Dataset completo" }];
}

function chartRows(data = []) {
  return data.map((row) => ({
    Segmento: row.name,
    Cantidad: number.format(row.value || 0),
  }));
}

function tenureRows(rows = [], total = 0) {
  return rows.map((row) => ({
    Antiguedad: row.Antigüedad || row["Antigüedad"] || row["AntigÃ¼edad"],
    Bajas: number.format(row.Bajas || 0),
    Participacion: total ? `${(((row.Bajas || 0) / total) * 100).toFixed(1)}%` : "0%",
  }));
}

function reasonRows(rows = [], total = 0) {
  return rows.map((row) => ({
    "Motivo de baja": row.Motivo,
    Bajas: number.format(row.Bajas || 0),
    Participacion: total ? `${(((row.Bajas || 0) / total) * 100).toFixed(1)}%` : "0%",
  }));
}

function monthRows(months = [], rows = []) {
  return rows.map((row) => {
    const output = { Campaña: row.Campaña || row["CampaÃ±a"] };
    months.forEach((month) => {
      output[month] = row[month] ? number.format(row[month]) : "";
    });
    output.Total = number.format(row.Total || 0);
    return output;
  });
}

function reasonCampaignRows(reasons = [], rows = []) {
  return rows.map((row) => {
    const output = { Campaña: row.Campaña || row["CampaÃ±a"] };
    reasons.forEach((reason) => {
      output[reason] = row[reason] ? number.format(row[reason]) : "";
    });
    output.Total = number.format(row.Total || 0);
    return output;
  });
}

function campaignName(row = {}) {
  return row.campana || row.CAMPAÑA || row.CAMPANA || row["CAMPAÃ‘A"] || row["CAMPAÃA"] || "Sin dato";
}

function staffingRows(rows = []) {
  return rows.map((row) => ({
    Campaña: campaignName(row),
    Activo: number.format(row.activo || row.value || 0),
    Licencia: number.format(row.licencia || 0),
    Observación: row.observacion || "Sin dato",
  }));
}

function recordRows(columns = [], rows = []) {
  return rows.map((row) =>
    columns.reduce((acc, column) => {
      acc[column] = row[column] || "Sin dato";
      return acc;
    }, {}),
  );
}

function buildReportHtml(data) {
  const {
    activeRate,
    bajasByMonth,
    bajasByReason,
    bajasByTenure,
    bajasDateRange,
    bajasReasonByCampaign,
    charts,
    filters,
    metrics,
    records,
    staffingRows: staffing = [],
  } = data;
  const dateRange = bajasDateRange.start || bajasDateRange.end
    ? `${bajasDateRange.start || "inicio"} a ${bajasDateRange.end || "hoy"}`
    : "Sin filtro de fecha";

  const sections = [
    tableHtml("Resumen ejecutivo", ["Indicador", "Valor"], metricRows(metrics, activeRate)),
    tableHtml("Filtros aplicados", ["Filtro", "Valores"], filterRows(filters), {
      subtitle: `Rango de bajas: ${dateRange}`,
    }),
    tableHtml("Empleados por area", ["Segmento", "Cantidad"], chartRows(charts.empleados_por_area)),
    tableHtml("Empleados por cliente", ["Segmento", "Cantidad"], chartRows(charts.empleados_por_cliente)),
    tableHtml("Empleados por campana", ["Segmento", "Cantidad"], chartRows(charts.empleados_por_campana)),
    tableHtml("Empleados por modalidad", ["Segmento", "Cantidad"], chartRows(charts.empleados_por_modalidad)),
    tableHtml(
      "Bajas mes por mes",
      ["Campaña", ...(bajasByMonth.months || []), "Total"],
      monthRows(bajasByMonth.months || [], bajasByMonth.rows || []),
      { subtitle: "Calculado por FECHA BAJA y campaña" },
    ),
    tableHtml("Bajas por meses en empresa", ["Antiguedad", "Bajas", "Participacion"], tenureRows(
      bajasByTenure.rows || [],
      bajasByTenure.total || 0,
    )),
    tableHtml("Bajas por motivo", ["Motivo de baja", "Bajas", "Participacion"], reasonRows(
      bajasByReason.rows || [],
      bajasByReason.total || 0,
    )),
    tableHtml(
      "Motivos de baja por campana",
      ["Campaña", ...(bajasReasonByCampaign.reasons || []), "Total"],
      reasonCampaignRows(bajasReasonByCampaign.reasons || [], bajasReasonByCampaign.rows || []),
    ),
    tableHtml(
      "Dotacion por campana",
      ["Campaña", "Activo", "Licencia", "Observación"],
      staffingRows(staffing),
    ),
    tableHtml(
      "Detalle de la seleccion",
      records.columns || [],
      recordRows(records.columns || [], records.rows || []),
      { subtitle: `Mostrando ${number.format(records.rows?.length || 0)} de ${number.format(records.total || 0)} registros` },
    ),
  ].join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, sans-serif; color: #0f172a; }
          h1 { font-size: 22px; margin: 0 0 4px; }
          h2 { font-size: 15px; margin: 22px 0 6px; }
          p { margin: 0 0 12px; color: #475569; }
          .muted { color: #64748b; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; margin: 6px 0 14px; }
          th { background: #eef6ff; color: #17304f; font-weight: 700; text-transform: uppercase; }
          th, td { border: 1px solid #dbe3ef; padding: 6px 8px; font-size: 12px; vertical-align: top; }
          tr:nth-child(even) td { background: #fbfdff; }
        </style>
      </head>
      <body>
        <h1>Informe de nomina</h1>
        <p class="muted">Generado el ${escapeHtml(new Date().toLocaleString("es-AR"))}</p>
        ${sections}
      </body>
    </html>
  `;
}

function downloadHtml(html, filename, type) {
  const blob = new Blob(["\ufeff", html], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportDashboardReport(format, data) {
  const html = buildReportHtml(data);
  const stamp = fileStamp();
  if (format === "word") {
    downloadHtml(html, `informe_nomina_${stamp}.doc`, "application/msword;charset=utf-8");
    return;
  }
  downloadHtml(html, `informe_nomina_${stamp}.xls`, "application/vnd.ms-excel;charset=utf-8");
}

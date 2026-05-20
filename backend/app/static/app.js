const formatNumber = new Intl.NumberFormat("es-AR");
const formatCurrency = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

const metricLabels = {
  total_empleados: "Total empleados",
  activos: "Activos",
  bajas: "Bajas",
  altas_del_mes: "Altas del mes",
  salario_total: "Salario total",
  salario_promedio: "Salario promedio",
  carga_horaria_total: "Carga horaria total",
};

const chartLabels = {
  empleados_por_area: "Empleados por área",
  empleados_por_cliente: "Empleados por cliente",
  empleados_por_campana: "Empleados por campaña",
  empleados_por_modalidad: "Empleados por modalidad",
};

let datasetMetadata = [];
let optionMetadata = [];
let filterOptionsByColumn = {};
let rowsState = [];
let columnsState = [];
let filtersState = [];
let dashboardFilters = [];
let savedDashboard = [];
let lastAnalysisRows = [];
let activeFilterColumn = "";
let activeDashboardFilterColumn = "";
let analysisTimer = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setMessage(id, text, type = "error") {
  document.getElementById(id).innerHTML = text ? `<div class="alert ${type}">${escapeHtml(text)}</div>` : "";
}

async function request(path, options = {}) {
  const response = await fetch(path, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || "Ocurrió un error inesperado.");
  }
  return response.json();
}

function activeFilters() {
  return filtersState.filter((filter) => filter.column && filter.values.length);
}

function metadataFor(columnName, source = optionMetadata) {
  return source.find((column) => column.name === columnName);
}

function valuesForFilter(columnName) {
  return filterOptionsByColumn[columnName] || metadataFor(columnName)?.values || [];
}

async function loadMetadata() {
  const data = await request("/dataset-metadata");
  datasetMetadata = data.columns;
  optionMetadata = data.columns;
  filterOptionsByColumn = Object.fromEntries(data.columns.map((column) => [column.name, column.values]));

  if (!rowsState.length && datasetMetadata.some((column) => column.name === "ÁREA")) rowsState = ["ÁREA"];
  if (!rowsState.length && datasetMetadata.length) rowsState = [datasetMetadata[0].name];

  await refreshFilterOptions();
  renderPivotBuilder();
  renderDashboardFilterControls();
  scheduleAnalysis();
}

function columnSelectOptions(selected = "") {
  return datasetMetadata
    .map(
      (column) =>
        `<option value="${escapeHtml(column.name)}" ${column.name === selected ? "selected" : ""}>${escapeHtml(
          column.name,
        )}</option>`,
    )
    .join("");
}

async function refreshFilterOptions() {
  if (!datasetMetadata.length) return;

  const current = await request("/filter-options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dimensions: [...rowsState, ...columnsState], metric: "count", filters: activeFilters() }),
  });
  optionMetadata = current.columns;
  document.getElementById("filter-summary").textContent = `${formatNumber.format(
    current.rows,
  )} registros visibles con los filtros activos.`;

  const pairs = await Promise.all(
    filtersState.map((filter) =>
      request("/filter-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dimensions: [...rowsState, ...columnsState],
          metric: "count",
          filters: filtersState.filter(
            (candidate) => candidate.column !== filter.column && candidate.column && candidate.values.length,
          ),
        }),
      }).then((response) => [filter.column, metadataFor(filter.column, response.columns)?.values || []]),
    ),
  );
  filterOptionsByColumn = {
    ...Object.fromEntries(current.columns.map((column) => [column.name, column.values])),
    ...Object.fromEntries(pairs),
  };

  filtersState = filtersState.map((filter) => {
    const available = new Set(valuesForFilter(filter.column));
    return { ...filter, values: filter.values.filter((value) => available.has(value)) };
  });
}

function renderFieldList() {
  const query = document.getElementById("field-search").value.trim().toUpperCase();
  const fields = datasetMetadata.filter((column) => column.name.toUpperCase().includes(query));
  document.getElementById("field-list").innerHTML = fields
    .map(
      (column) => `
        <div class="field-item">
          <div class="field-copy">
            <span class="field-name" title="${escapeHtml(column.name)}">${escapeHtml(column.name)}</span>
            <small>${formatNumber.format(column.unique_count)} valores</small>
          </div>
          <div class="field-actions">
            <button class="field-action primary" data-add-row="${escapeHtml(column.name)}">Fila</button>
            <button class="field-action column" data-add-column="${escapeHtml(column.name)}">Columna</button>
            <button class="field-action" data-add-filter="${escapeHtml(column.name)}">Filtro</button>
          </div>
        </div>
      `,
    )
    .join("");

  document.querySelectorAll("[data-add-row]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!rowsState.includes(button.dataset.addRow)) rowsState.push(button.dataset.addRow);
      renderPivotBuilder();
      scheduleAnalysis();
    });
  });

  document.querySelectorAll("[data-add-column]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!columnsState.includes(button.dataset.addColumn)) columnsState.push(button.dataset.addColumn);
      renderPivotBuilder();
      scheduleAnalysis();
    });
  });

  document.querySelectorAll("[data-add-filter]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!filtersState.some((filter) => filter.column === button.dataset.addFilter)) {
        filtersState.push({ column: button.dataset.addFilter, values: [] });
      }
      activeFilterColumn = button.dataset.addFilter;
      await refreshFilterOptions();
      renderPivotBuilder();
      renderFilterEditor();
    });
  });
}

function renderShelf() {
  document.getElementById("rows-shelf").innerHTML = rowsState.length
    ? rowsState
        .map(
          (column) => `
            <span class="pivot-chip">
              ${escapeHtml(column)}
              <button title="Quitar" data-remove-row="${escapeHtml(column)}">×</button>
            </span>
          `,
        )
        .join("")
    : '<span class="empty-note">Agrega un campo como fila para ver el detalle principal.</span>';

  document.getElementById("filters-shelf").innerHTML = filtersState.length
    ? filtersState
        .map((filter) => {
          const detail = filter.values.length ? `${filter.values.length} seleccionados` : "sin selección";
          return `
            <span class="pivot-chip filter" title="${escapeHtml(detail)}">
              <button title="Editar" data-edit-filter="${escapeHtml(filter.column)}">✎</button>
              ${escapeHtml(filter.column)}: ${escapeHtml(detail)}
              <button title="Quitar" data-remove-filter="${escapeHtml(filter.column)}">×</button>
            </span>
          `;
        })
        .join("")
    : '<span class="empty-note">Agrega filtros para acotar la nomina sin cambiar la tabla.</span>';

  document.getElementById("columns-shelf").innerHTML = columnsState.length
    ? columnsState
        .map(
          (column) => `
            <span class="pivot-chip column">
              ${escapeHtml(column)}
              <button title="Quitar" data-remove-column="${escapeHtml(column)}">×</button>
            </span>
          `,
        )
        .join("")
    : '<span class="empty-note">Opcional: agrega un campo para abrir la tabla en columnas.</span>';

  document.querySelectorAll("[data-remove-row]").forEach((button) => {
    button.addEventListener("click", () => {
      rowsState = rowsState.filter((column) => column !== button.dataset.removeRow);
      renderPivotBuilder();
      scheduleAnalysis();
    });
  });

  document.querySelectorAll("[data-remove-column]").forEach((button) => {
    button.addEventListener("click", () => {
      columnsState = columnsState.filter((column) => column !== button.dataset.removeColumn);
      renderPivotBuilder();
      scheduleAnalysis();
    });
  });

  document.querySelectorAll("[data-edit-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeFilterColumn = button.dataset.editFilter;
      renderFilterEditor();
    });
  });

  document.querySelectorAll("[data-remove-filter]").forEach((button) => {
    button.addEventListener("click", async () => {
      filtersState = filtersState.filter((filter) => filter.column !== button.dataset.removeFilter);
      if (activeFilterColumn === button.dataset.removeFilter) closeFilterEditor();
      await refreshFilterOptions();
      renderPivotBuilder();
      scheduleAnalysis();
    });
  });
}

function renderPivotBuilder() {
  renderFieldList();
  renderShelf();
}

function renderDashboardFilterControls() {
  const select = document.getElementById("dashboard-filter-field");
  if (select) select.innerHTML = columnSelectOptions(select.value);
  renderDashboardFiltersShelf();
}

function renderDashboardFiltersShelf() {
  const shelf = document.getElementById("dashboard-filters-shelf");
  if (!shelf) return;
  shelf.innerHTML = dashboardFilters.length
    ? dashboardFilters
        .map((filter) => {
          const detail = filter.values.length ? `${filter.values.length} seleccionados` : "sin seleccion";
          return `
            <span class="pivot-chip filter" title="${escapeHtml(detail)}">
              <button title="Editar" data-edit-dashboard-filter="${escapeHtml(filter.column)}">✎</button>
              ${escapeHtml(filter.column)}: ${escapeHtml(detail)}
              <button title="Quitar" data-remove-dashboard-filter="${escapeHtml(filter.column)}">×</button>
            </span>
          `;
        })
        .join("")
    : '<span class="empty-note">Sin filtros globales. Agrega uno para acotar todo el dashboard.</span>';

  document.querySelectorAll("[data-edit-dashboard-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeDashboardFilterColumn = button.dataset.editDashboardFilter;
      renderDashboardFilterEditor();
    });
  });

  document.querySelectorAll("[data-remove-dashboard-filter]").forEach((button) => {
    button.addEventListener("click", async () => {
      dashboardFilters = dashboardFilters.filter((filter) => filter.column !== button.dataset.removeDashboardFilter);
      closeDashboardFilterEditor();
      renderDashboardFiltersShelf();
      await loadDashboard();
    });
  });
}

function renderDashboardFilterEditor() {
  const filter = dashboardFilters.find((item) => item.column === activeDashboardFilterColumn);
  const editor = document.getElementById("dashboard-filter-editor");
  if (!filter) {
    closeDashboardFilterEditor();
    return;
  }
  editor.classList.remove("hidden");
  document.getElementById("dashboard-filter-title").textContent = `Filtro: ${filter.column}`;
  document.getElementById("dashboard-filter-search").value = "";
  renderDashboardFilterValues(filter);
}

function renderDashboardFilterValues(filter) {
  const query = document.getElementById("dashboard-filter-search").value.trim().toUpperCase();
  const values = (metadataFor(filter.column, datasetMetadata)?.values || []).filter((value) =>
    value.toUpperCase().includes(query),
  );
  document.getElementById("dashboard-filter-values").innerHTML = values.length
    ? values
        .map(
          (value) => `
            <label class="check-option">
              <input type="checkbox" value="${escapeHtml(value)}" ${
                filter.values.includes(value) ? "checked" : ""
              } data-dashboard-filter-value="${escapeHtml(filter.column)}" />
              <span>${escapeHtml(value)}</span>
            </label>
          `,
        )
        .join("")
    : '<span class="empty-note">No hay valores disponibles.</span>';

  document.querySelectorAll("[data-dashboard-filter-value]").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      const target = dashboardFilters.find((item) => item.column === checkbox.dataset.dashboardFilterValue);
      if (checkbox.checked && !target.values.includes(checkbox.value)) target.values.push(checkbox.value);
      if (!checkbox.checked) target.values = target.values.filter((value) => value !== checkbox.value);
      renderDashboardFiltersShelf();
      renderDashboardFilterValues(target);
      await loadDashboard();
    });
  });
}

function closeDashboardFilterEditor() {
  activeDashboardFilterColumn = "";
  document.getElementById("dashboard-filter-editor").classList.add("hidden");
}

function renderFilterEditor() {
  const filter = filtersState.find((item) => item.column === activeFilterColumn);
  const editor = document.getElementById("filter-editor");
  if (!filter) {
    closeFilterEditor();
    return;
  }

  editor.classList.remove("hidden");
  document.getElementById("filter-editor-title").textContent = `Filtro: ${filter.column}`;
  document.getElementById("filter-value-search").value = "";
  renderFilterValues(filter);
}

function renderFilterValues(filter) {
  const query = document.getElementById("filter-value-search").value.trim().toUpperCase();
  const values = valuesForFilter(filter.column).filter((value) => value.toUpperCase().includes(query));
  document.getElementById("filter-values-editor").innerHTML = values.length
    ? values
        .map(
          (value) => `
            <label class="check-option">
              <input type="checkbox" value="${escapeHtml(value)}" ${
                filter.values.includes(value) ? "checked" : ""
              } data-filter-value="${escapeHtml(filter.column)}" />
              <span>${escapeHtml(value)}</span>
            </label>
          `,
        )
        .join("")
    : '<span class="empty-note">No hay valores disponibles con los filtros actuales.</span>';

  document.querySelectorAll("[data-filter-value]").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      const target = filtersState.find((item) => item.column === checkbox.dataset.filterValue);
      if (checkbox.checked && !target.values.includes(checkbox.value)) {
        target.values.push(checkbox.value);
      }
      if (!checkbox.checked) {
        target.values = target.values.filter((value) => value !== checkbox.value);
      }
      await refreshFilterOptions();
      renderPivotBuilder();
      renderFilterValues(target);
      scheduleAnalysis();
    });
  });
}

function closeFilterEditor() {
  activeFilterColumn = "";
  document.getElementById("filter-editor").classList.add("hidden");
}

function renderTable(tableId, columns, rows) {
  const table = document.getElementById(tableId);
  const bodyRows = rows.length
    ? rows
        .map(
          (row) =>
            `<tr>${columns
              .map((column) => `<td>${escapeHtml(Array.isArray(row[column]) ? row[column].join(", ") : row[column] ?? "")}</td>`)
              .join("")}</tr>`,
        )
        .join("")
    : `<tr><td colspan="${columns.length}">Sin datos para mostrar.</td></tr>`;

  table.innerHTML = `
    <thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>
    <tbody>${bodyRows}</tbody>
  `;
}

function keyFor(row, dimensions, fallback) {
  if (!dimensions.length) return fallback;
  return dimensions.map((dimension) => row[dimension] || "Sin dato").join(" / ");
}

function renderPivotTable(rows) {
  const table = document.getElementById("analysis-table");
  table.innerHTML = buildPivotTableHtml(rows, rowsState, columnsState);
  table.className = "pivot-table";
  const rowKeys = [...new Set(rows.map((row) => keyFor(row, rowsState, "Total")))];
  const columnKeys = columnsState.length ? [...new Set(rows.map((row) => keyFor(row, columnsState, "Total")))] : ["Cantidad"];
  document.getElementById("pivot-shape").textContent = `${formatNumber.format(rowKeys.length)} filas · ${formatNumber.format(
    columnKeys.length,
  )} columnas`;
}

function buildPivotTableHtml(rows, rowState, columnState) {
  const rowDimensions = rowState.length ? rowState : ["Total"];
  const hasColumns = columnState.length > 0;
  const rowKeys = [...new Set(rows.map((row) => keyFor(row, rowState, "Total")))];
  const columnKeys = hasColumns ? [...new Set(rows.map((row) => keyFor(row, columnState, "Total")))] : ["Cantidad"];
  const matrix = new Map();
  let grandTotal = 0;

  rows.forEach((row) => {
    const rowKey = keyFor(row, rowState, "Total");
    const columnKey = hasColumns ? keyFor(row, columnState, "Total") : "Cantidad";
    const value = Number(row.value) || 0;
    grandTotal += value;
    matrix.set(`${rowKey}|||${columnKey}`, (matrix.get(`${rowKey}|||${columnKey}`) || 0) + value);
  });

  const body = rowKeys
    .map((rowKey) => {
      const values = columnKeys.map((columnKey) => matrix.get(`${rowKey}|||${columnKey}`) || 0);
      const total = values.reduce((sum, value) => sum + value, 0);
      return `
        <tr>
          <td>${escapeHtml(rowKey)}</td>
          ${values.map((value) => `<td>${formatNumber.format(value)}</td>`).join("")}
          <td class="pivot-total">${formatNumber.format(total)}</td>
        </tr>
      `;
    })
    .join("");

  const totals = columnKeys.map((columnKey) =>
    rowKeys.reduce((sum, rowKey) => sum + (matrix.get(`${rowKey}|||${columnKey}`) || 0), 0),
  );

  return `
    <thead>
      <tr>
        <th>${escapeHtml(rowDimensions.join(" / "))}</th>
        ${columnKeys.map((columnKey) => `<th>${escapeHtml(columnKey)}</th>`).join("")}
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${body || `<tr><td colspan="${columnKeys.length + 2}">Sin datos para mostrar.</td></tr>`}
      <tr class="pivot-total">
        <td>Total</td>
        ${totals.map((value) => `<td>${formatNumber.format(value)}</td>`).join("")}
        <td>${formatNumber.format(grandTotal)}</td>
      </tr>
    </tbody>
  `;
}

function renderBars(containerId, rows) {
  const container = document.getElementById(containerId);
  const max = Math.max(...rows.map((row) => Number(row.value) || 0), 1);
  container.innerHTML = rows
    .map((row) => {
      const width = Math.max(2, ((Number(row.value) || 0) / max) * 100);
      return `
        <div class="bar-row">
          <span class="bar-label" title="${escapeHtml(row.name)}">${escapeHtml(row.name || "Sin dato")}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${width}%"></span></span>
          <strong>${formatNumber.format(row.value || 0)}</strong>
        </div>
      `;
    })
    .join("");
}

function renderDashboard(data) {
  document.getElementById("metrics").innerHTML = Object.entries(data.metrics)
    .map(([key, value]) => {
      const formatted = key.includes("salario") ? formatCurrency.format(value) : formatNumber.format(value);
      return `<article class="metric-card"><span>${metricLabels[key] || key}</span><strong>${formatted}</strong></article>`;
    })
    .join("");

  document.getElementById("charts").innerHTML = Object.entries(data.charts)
    .map(([key, rows]) => {
      setTimeout(() => renderBars(`chart-${key}`, rows.map((row) => ({ ...row, name: row.name || "Sin dato" }))), 0);
      return `<section class="chart-box"><h2>${chartLabels[key] || key}</h2><div class="bar-list" id="chart-${key}"></div></section>`;
    })
    .join("");
}

async function runAnalysis() {
  const dimensions = [...new Set([...rowsState, ...columnsState])].filter(Boolean);
  setMessage("analysis-message", "");

  if (!rowsState.length && !columnsState.length) {
    setMessage("analysis-message", "Elegí al menos un campo en Filas o Columnas.");
    return;
  }

  try {
    const data = await request("/dynamic-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dimensions, metric: "count", filters: activeFilters() }),
    });
    lastAnalysisRows = data.rows;
    const chartRows = data.rows.map((row) => ({
      name: (rowsState.length ? rowsState : columnsState).map((dimension) => row[dimension]).filter(Boolean).join(" / "),
      value: row.value,
    }));
    renderBars("analysis-bars", chartRows);
    renderPivotTable(data.rows);
  } catch (error) {
    setMessage("analysis-message", error.message);
  }
}

async function runSavedCard(card) {
  const dimensions = [...new Set([...card.rows, ...card.columns])].filter(Boolean);
  if (!dimensions.length) return [];
  const data = await request("/dynamic-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dimensions,
      metric: "count",
      filters: [...dashboardFilters.filter((filter) => filter.values.length), ...card.filters],
    }),
  });
  return data.rows;
}

function describeConfig(config) {
  const rows = config.rows.length ? `Filas: ${config.rows.join(" / ")}` : "Filas: Total";
  const columns = config.columns.length ? `Columnas: ${config.columns.join(" / ")}` : "Columnas: sin apertura";
  const filters = config.filters.length
    ? `Filtros: ${config.filters.map((filter) => `${filter.column} (${filter.values.length})`).join(", ")}`
    : "Filtros: sin filtros";
  return `${rows} · ${columns} · ${filters}`;
}

function saveCurrentPivot() {
  if (!lastAnalysisRows.length) {
    setMessage("analysis-message", "Armá una tabla dinámica antes de pasarla al dashboard.");
    return;
  }
  const titleInput = document.getElementById("pivot-title");
  const title = titleInput.value.trim() || `Vista ${savedDashboard.length + 1}`;
  savedDashboard.push({
    id: Date.now(),
    title,
    rows: [...rowsState],
    columns: [...columnsState],
    filters: filtersState.map((filter) => ({ column: filter.column, values: [...filter.values] })),
    data: JSON.parse(JSON.stringify(lastAnalysisRows)),
  });
  titleInput.value = "";
  renderSavedDashboard();
  setMessage("analysis-message", `Guardé "${title}" en el dashboard armado.`, "success");
}

function renderSavedDashboard() {
  const html = savedDashboard.length
    ? savedDashboard
        .map(
          (card) => `
            <article class="saved-card">
              <div class="saved-card-header">
                <div>
                  <h3>${escapeHtml(card.title)}</h3>
                  <div class="saved-meta">${escapeHtml(describeConfig(card))}</div>
                </div>
                <button class="remove-button" data-remove-saved="${card.id}">Quitar</button>
              </div>
              <div class="table-wrap">
                <table class="pivot-table">${buildPivotTableHtml(card.data, card.rows, card.columns)}</table>
              </div>
            </article>
          `,
        )
        .join("")
    : '<span class="empty-note">Todavía no pasaste ninguna tabla al dashboard.</span>';

  document.querySelectorAll("#saved-dashboard, #saved-dashboard-main").forEach((container) => {
    container.innerHTML = html;
  });

  document.querySelectorAll("[data-remove-saved]").forEach((button) => {
    button.addEventListener("click", () => {
      savedDashboard = savedDashboard.filter((card) => card.id !== Number(button.dataset.removeSaved));
      renderSavedDashboard();
    });
  });
}

function scheduleAnalysis() {
  clearTimeout(analysisTimer);
  analysisTimer = setTimeout(() => {
  if (datasetMetadata.length && (rowsState.length || columnsState.length)) runAnalysis();
  }, 200);
}

async function loadDashboard() {
  setMessage("dashboard-message", "");
  try {
    renderDashboard(
      await request("/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dimensions: [], metric: "count", filters: dashboardFilters }),
      }),
    );
    await refreshSavedDashboardData();
  } catch (error) {
    setMessage("dashboard-message", error.message);
  }
}

async function refreshSavedDashboardData() {
  if (!savedDashboard.length) {
    renderSavedDashboard();
    return;
  }
  const refreshed = await Promise.all(savedDashboard.map(async (card) => ({ ...card, data: await runSavedCard(card) })));
  savedDashboard = refreshed;
  renderSavedDashboard();
}

async function loadQuality() {
  setMessage("quality-message", "");
  try {
    const data = await request("/validations");
    renderTable("quality-table", ["severity", "type", "message", "count", "rows"], data.issues);
  } catch (error) {
    setMessage("quality-message", error.message);
  }
}

async function uploadFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  setMessage("upload-message", "Procesando archivo...", "success");

  try {
    const data = await request("/upload", { method: "POST", body: formData });
    document.getElementById("upload-result").classList.remove("hidden");
    document.getElementById("upload-summary").innerHTML = `
      <div><span>Filas procesadas</span><strong>${formatNumber.format(data.rows)}</strong></div>
      <div><span>Columnas faltantes</span><strong>${formatNumber.format(data.missing_core_columns.length)}</strong></div>
      <div><span>Alertas de calidad</span><strong>${formatNumber.format(data.validations.length)}</strong></div>
    `;
    renderTable("upload-validations", ["severity", "type", "message", "count"], data.validations);
    setMessage("upload-message", "Archivo procesado correctamente.", "success");
    renderDashboard(data.dashboard);
    await loadMetadata();
  } catch (error) {
    setMessage("upload-message", error.message);
  }
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
    button.classList.add("active");
    document.getElementById(button.dataset.page).classList.add("active");
    if (button.dataset.page === "dashboard") loadDashboard();
    if (button.dataset.page === "quality") loadQuality();
    if (button.dataset.page === "analysis") {
      loadMetadata().catch((error) => setMessage("analysis-message", error.message));
    }
  });
});

document.getElementById("file-input").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) uploadFile(file);
});

document.getElementById("field-search").addEventListener("input", renderFieldList);
document.getElementById("filter-value-search").addEventListener("input", () => {
  const filter = filtersState.find((item) => item.column === activeFilterColumn);
  if (filter) renderFilterValues(filter);
});
document.getElementById("close-filter-editor").addEventListener("click", closeFilterEditor);
document.getElementById("add-dashboard-filter").addEventListener("click", () => {
  const column = document.getElementById("dashboard-filter-field").value;
  if (!column) return;
  if (!dashboardFilters.some((filter) => filter.column === column)) dashboardFilters.push({ column, values: [] });
  activeDashboardFilterColumn = column;
  renderDashboardFiltersShelf();
  renderDashboardFilterEditor();
});
document.getElementById("clear-dashboard-filters").addEventListener("click", async () => {
  dashboardFilters = [];
  closeDashboardFilterEditor();
  renderDashboardFiltersShelf();
  await loadDashboard();
});
document.getElementById("close-dashboard-filter-editor").addEventListener("click", closeDashboardFilterEditor);
document.getElementById("dashboard-filter-search").addEventListener("input", () => {
  const filter = dashboardFilters.find((item) => item.column === activeDashboardFilterColumn);
  if (filter) renderDashboardFilterValues(filter);
});
document.getElementById("clear-pivot").addEventListener("click", async () => {
  rowsState = [];
  columnsState = [];
  filtersState = [];
  activeFilterColumn = "";
  closeFilterEditor();
  await refreshFilterOptions();
  renderPivotBuilder();
  document.getElementById("analysis-bars").innerHTML = "";
  document.getElementById("analysis-table").innerHTML = "";
  document.getElementById("pivot-shape").textContent = "";
  lastAnalysisRows = [];
});

document.getElementById("save-to-dashboard").addEventListener("click", saveCurrentPivot);
document.getElementById("clear-saved-dashboard").addEventListener("click", () => {
  savedDashboard = [];
  renderSavedDashboard();
});
document.getElementById("clear-saved-dashboard-main").addEventListener("click", () => {
  savedDashboard = [];
  renderSavedDashboard();
});
renderSavedDashboard();

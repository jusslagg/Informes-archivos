const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || "Ocurrió un error inesperado.");
  }
  return response.json();
}

export async function uploadPayroll(file) {
  const formData = new FormData();
  formData.append("file", file);
  return request("/upload", { method: "POST", body: formData });
}

export function getDashboard() {
  return request("/dashboard");
}

export function getFilteredDashboard(filters = []) {
  if (!filters.length) return getDashboard();
  return request("/dashboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters }),
  });
}

export function getValidations() {
  return request("/validations");
}

export function getDatasetMetadata() {
  return request("/dataset-metadata");
}

export function getFilterOptions(filters = []) {
  return request("/filter-options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters }),
  });
}

export function getFilteredRecords(filters = []) {
  return request("/records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters }),
  });
}

export function getStaffingByCampaign(filters = []) {
  return request("/staffing-by-campaign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters }),
  });
}

export function getBajasByMonth(filters = [], dateRange = {}) {
  return request("/bajas-by-month", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters, date_range: dateRange }),
  });
}

export function getBajasByTenure(filters = [], dateRange = {}) {
  return request("/bajas-by-tenure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters, date_range: dateRange }),
  });
}

export function getBajasByReason(filters = [], dateRange = {}) {
  return request("/bajas-by-reason", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters, date_range: dateRange }),
  });
}

export function getBajasReasonByCampaign(filters = [], dateRange = {}) {
  return request("/bajas-reason-by-campaign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters, date_range: dateRange }),
  });
}

export function runDynamicAnalysis(payload) {
  return request("/dynamic-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function exportUrl() {
  return `${API_URL}/export`;
}

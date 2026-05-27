import {
  getBajasByMonthBrowser,
  getBajasByReasonBrowser,
  getBajasByTenureBrowser,
  getBajasReasonByCampaignBrowser,
  getDashboardBrowser,
  getDatasetMetadataBrowser,
  getFilteredRecordsBrowser,
  getRequiredStructureBrowser,
  getStaffingByCampaignBrowser,
  getValidationsBrowser,
  runDynamicAnalysisBrowser,
  uploadPayrollBrowser,
} from "./browserData.js";

const localApiUrl =
  typeof window !== "undefined" && ["127.0.0.1:5173", "localhost:5173"].includes(window.location.host)
    ? "http://127.0.0.1:8000"
    : "";
const API_URL = import.meta.env.VITE_API_URL || localApiUrl;
export const usesBrowserData = !API_URL;

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || "Ocurrió un error inesperado.");
  }
  return response.json();
}

export async function uploadPayroll(file) {
  if (usesBrowserData) return uploadPayrollBrowser(file);
  const formData = new FormData();
  formData.append("file", file);
  return request("/upload", { method: "POST", body: formData });
}

export function getDashboard() {
  if (usesBrowserData) return Promise.resolve(getDashboardBrowser());
  return request("/dashboard");
}

export function getFilteredDashboard(filters = []) {
  if (usesBrowserData) return Promise.resolve(getDashboardBrowser(filters));
  if (!filters.length) return getDashboard();
  return request("/dashboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters }),
  });
}

export function getValidations() {
  if (usesBrowserData) return Promise.resolve(getValidationsBrowser());
  return request("/validations");
}

export function getDatasetMetadata() {
  if (usesBrowserData) return Promise.resolve(getDatasetMetadataBrowser());
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
  if (usesBrowserData) return Promise.resolve(getFilteredRecordsBrowser(filters));
  return request("/records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters }),
  });
}

export function getStaffingByCampaign(filters = []) {
  if (usesBrowserData) return Promise.resolve(getStaffingByCampaignBrowser(filters));
  return request("/staffing-by-campaign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters }),
  });
}

export function getRequiredStructure(filters = []) {
  if (usesBrowserData) return Promise.resolve(getRequiredStructureBrowser(filters));
  return request("/required-structure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters }),
  });
}

export function getSavedRequirements(month) {
  if (usesBrowserData) return Promise.resolve({ month, requirements: {}, holidays: {}, manualRows: [], rows: [], draft: {} });
  return request(`/requirements/${month}`);
}

export function saveSavedRequirements(month, payload) {
  if (usesBrowserData) return Promise.resolve({ month, ...payload });
  return request(`/requirements/${month}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getRequirementCatalog() {
  if (usesBrowserData) return Promise.resolve({ rows: [] });
  return request("/requirements-catalog");
}

export function saveRequirementCatalog(payload) {
  if (usesBrowserData) return Promise.resolve(payload);
  return request("/requirements-catalog", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getRequirementsSummary(month = "") {
  if (usesBrowserData) {
    return Promise.resolve({
      months: [],
      month,
      rows: [],
      totals: { required: 0, hours: 0 },
      source: { activeAccounts: 0, usesCatalog: false },
    });
  }
  const query = month ? `?month=${encodeURIComponent(month)}` : "";
  return request(`/requirements-summary${query}`);
}

export function getSavedHolidays(year) {
  if (usesBrowserData) return Promise.resolve({ year, holidays: [] });
  return request(`/holidays/${year}`);
}

export function saveSavedHolidays(year, payload) {
  if (usesBrowserData) return Promise.resolve({ year, ...payload });
  return request(`/holidays/${year}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getBajasByMonth(filters = [], dateRange = {}) {
  if (usesBrowserData) return Promise.resolve(getBajasByMonthBrowser(filters, dateRange));
  return request("/bajas-by-month", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters, date_range: dateRange }),
  });
}

export function getBajasByTenure(filters = [], dateRange = {}) {
  if (usesBrowserData) return Promise.resolve(getBajasByTenureBrowser(filters, dateRange));
  return request("/bajas-by-tenure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters, date_range: dateRange }),
  });
}

export function getBajasByReason(filters = [], dateRange = {}) {
  if (usesBrowserData) return Promise.resolve(getBajasByReasonBrowser(filters, dateRange));
  return request("/bajas-by-reason", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters, date_range: dateRange }),
  });
}

export function getBajasReasonByCampaign(filters = [], dateRange = {}) {
  if (usesBrowserData) return Promise.resolve(getBajasReasonByCampaignBrowser(filters, dateRange));
  return request("/bajas-reason-by-campaign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters, date_range: dateRange }),
  });
}

export function runDynamicAnalysis(payload) {
  if (usesBrowserData) return Promise.resolve(runDynamicAnalysisBrowser(payload));
  return request("/dynamic-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function exportUrl() {
  if (usesBrowserData) return null;
  return `${API_URL}/export`;
}

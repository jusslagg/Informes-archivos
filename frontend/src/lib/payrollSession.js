const DASHBOARD_STATE_KEY = "payroll-dashboard-state";
const UPLOAD_RESULT_KEY = "payroll-upload-result";

function canUseStorage() {
  return typeof window !== "undefined" && window.localStorage;
}

export function readDashboardState() {
  if (!canUseStorage()) return null;
  try {
    return JSON.parse(localStorage.getItem(DASHBOARD_STATE_KEY) || "null");
  } catch {
    return null;
  }
}

export function saveDashboardState(state) {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(DASHBOARD_STATE_KEY, JSON.stringify({ ...state, savedAt: new Date().toISOString() }));
  } catch {
    const { records, ...lighterState } = state;
    try {
      localStorage.setItem(DASHBOARD_STATE_KEY, JSON.stringify({ ...lighterState, savedAt: new Date().toISOString() }));
    } catch {
      localStorage.removeItem(DASHBOARD_STATE_KEY);
    }
  }
}

export function clearDashboardState() {
  if (!canUseStorage()) return;
  localStorage.removeItem(DASHBOARD_STATE_KEY);
}

export function readUploadResult() {
  if (!canUseStorage()) return null;
  try {
    return JSON.parse(localStorage.getItem(UPLOAD_RESULT_KEY) || "null");
  } catch {
    return null;
  }
}

export function saveUploadResult(result) {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(UPLOAD_RESULT_KEY, JSON.stringify({ ...result, savedAt: new Date().toISOString() }));
  } catch {
    localStorage.removeItem(UPLOAD_RESULT_KEY);
  }
}

export function clearPayrollSession() {
  clearDashboardState();
  if (!canUseStorage()) return;
  localStorage.removeItem(UPLOAD_RESULT_KEY);
}

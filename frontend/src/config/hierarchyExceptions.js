import defaults from "../../../shared/hierarchy_exceptions.json";

export const hierarchyExceptionsStorageKey = "hierarchy-exceptions";

export function getDefaultHierarchyExceptions() {
  return { rows: (defaults.rows || []).map((row) => ({ ...row })) };
}

export function getBrowserHierarchyExceptions() {
  if (typeof localStorage === "undefined") return getDefaultHierarchyExceptions();
  const saved = localStorage.getItem(hierarchyExceptionsStorageKey);
  if (saved === null) return getDefaultHierarchyExceptions();
  try {
    const data = JSON.parse(saved);
    return { rows: Array.isArray(data.rows) ? data.rows : [] };
  } catch {
    return getDefaultHierarchyExceptions();
  }
}

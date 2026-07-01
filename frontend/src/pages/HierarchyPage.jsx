import {
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Clipboard,
  CircleOff,
  GitBranch,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  getDatasetMetadata,
  getFilterOptions,
  getHierarchyExceptions,
  getHierarchySummary,
  saveHierarchyExceptions,
} from "../api/client.js";
import FilterBar, { toFilterSpecs } from "../components/FilterBar.jsx";
import { copyTableToClipboard, setClipboardTableData } from "../lib/clipboardTable.js";

const number = new Intl.NumberFormat("es-AR");
const percent = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const views = {
  leaders: {
    label: "Por líder",
    icon: Users,
    columns: [
      ["client", "Cliente"],
      ["campaign", "Campaña"],
      ["leader", "Líder"],
      ["supervisor", "Supervisor"],
      ["siteHead", "Jefe de site"],
      ["manager", "Gerente"],
      ["active", "Activos campaña"],
      ["accountAssigned", "Activos líder en cuenta"],
      ["responsibleTotal", "Total del líder"],
      ["share", "Proporcional líder"],
    ],
  },
  supervisors: {
    label: "Por supervisor",
    icon: Network,
    columns: [
      ["client", "Cliente"],
      ["supervisor", "Supervisor"],
      ["siteHead", "Jefe de site"],
      ["manager", "Gerente"],
      ["active", "Activos selección"],
      ["accountAssigned", "Activos supervisor en cuenta"],
      ["responsibleTotal", "Total supervisor"],
      ["share", "Proporcional supervisor"],
    ],
  },
  siteHeads: {
    label: "Por jefe de site",
    icon: Building2,
    columns: [
      ["client", "Cliente"],
      ["siteHead", "Jefe de site"],
      ["manager", "Gerente"],
      ["active", "Activos selección"],
      ["accountAssigned", "Activos jefe en cuenta"],
      ["responsibleTotal", "Total jefe de site"],
      ["share", "Proporcional jefe"],
    ],
  },
  managers: {
    label: "Por gerente",
    icon: BriefcaseBusiness,
    columns: [
      ["client", "Cliente"],
      ["manager", "Gerente"],
      ["active", "Activos selección"],
      ["accountAssigned", "Activos gerente en cuenta"],
      ["responsibleTotal", "Total gerente"],
      ["share", "Proporcional gerente"],
    ],
  },
};

const tabs = {
  ...views,
  tree: { label: "Árbol jerárquico", icon: GitBranch },
  exceptions: { label: "Excepciones", icon: CircleOff },
};

const emptyException = {
  client: "",
  scopeManager: "",
  scopeSiteHead: "",
  scopeSupervisor: "",
  manager: "",
  siteHead: "",
  supervisor: "",
};

function uniqueNames(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

function displayValue(row, key) {
  if (["active", "accountTotal", "accountAssigned", "responsibleTotal"].includes(key)) return number.format(row[key] || 0);
  if (key === "share") return `${percent.format(row[key] || 0)}%`;
  return row[key] || "Sin identificar";
}

function HierarchyKpi({ label, value, icon: Icon }) {
  return (
    <article className="hierarchy-kpi">
      <Icon size={18} />
      <span>{label}</span>
      <strong>{number.format(value || 0)}</strong>
    </article>
  );
}

function treeKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[,.]/g, " ")
    .replace(/\s+/g, " ");
}

function exceptionScopeKey(row) {
  return [row.client, row.scopeManager, row.scopeSiteHead, row.scopeSupervisor].map(treeKey).join("||");
}

function buildResponsibilityTree(data) {
  const managers = new Map();
  const ensureManager = (name) => {
    const managerName = !name || treeKey(name) === treeKey("Sin gerente identificado") ? "Multicuentas" : name;
    const id = treeKey(managerName);
    if (!managers.has(id)) {
      managers.set(id, { id, name: managerName, active: 0, clients: new Set(), allocations: new Map(), sites: new Map() });
    }
    return managers.get(id);
  };
  const ensureSite = (managerName, siteName) => {
    const manager = ensureManager(managerName);
    const resolvedSite = siteName || "Sin jefe de site identificado";
    const siteId = `${manager.id}||${treeKey(resolvedSite)}`;
    if (!manager.sites.has(siteId)) {
      manager.sites.set(siteId, {
        id: siteId,
        name: resolvedSite,
        active: 0,
        clients: new Set(),
        allocations: new Map(),
        supervisors: new Map(),
      });
    }
    return { manager, site: manager.sites.get(siteId) };
  };
  const ensureSupervisor = (managerName, siteName, supervisorName) => {
    const { manager, site } = ensureSite(managerName, siteName);
    const resolvedSupervisor = supervisorName || "Sin supervisor identificado";
    const supervisorId = `${site.id}||${treeKey(resolvedSupervisor)}`;
    if (!site.supervisors.has(supervisorId)) {
      site.supervisors.set(supervisorId, {
        id: supervisorId,
        name: resolvedSupervisor,
        active: 0,
        clients: new Set(),
        allocations: new Map(),
      });
    }
    return { manager, site, supervisor: site.supervisors.get(supervisorId) };
  };

  (data.roster?.managers || []).forEach((item) => ensureManager(item.name).clients.add(item.client));
  (data.roster?.siteHeads || []).forEach((item) => {
    const { manager, site } = ensureSite(item.manager, item.name);
    manager.clients.add(item.client);
    site.clients.add(item.client);
  });
  (data.roster?.supervisors || []).forEach((item) => {
    const { manager, site, supervisor } = ensureSupervisor(item.manager, item.siteHead, item.name);
    manager.clients.add(item.client);
    site.clients.add(item.client);
    supervisor.clients.add(item.client);
  });
  (data.rows?.supervisors || []).forEach((row) => {
    const { manager, site, supervisor } = ensureSupervisor(row.manager, row.siteHead, row.supervisor);
    const active = Number(row.active || 0);
    manager.active += active;
    site.active += active;
    supervisor.active += active;
    manager.clients.add(row.client);
    site.clients.add(row.client);
    supervisor.clients.add(row.client);
  });
  (data.rows?.managers || []).forEach((row) => {
    ensureManager(row.manager).allocations.set(row.client, { client: row.client, share: row.share || 0 });
  });
  (data.rows?.siteHeads || []).forEach((row) => {
    ensureSite(row.manager, row.siteHead).site.allocations.set(row.client, { client: row.client, share: row.share || 0 });
  });
  (data.rows?.supervisors || []).forEach((row) => {
    ensureSupervisor(row.manager, row.siteHead, row.supervisor).supervisor.allocations.set(row.client, {
      client: row.client,
      share: row.share || 0,
    });
  });

  const allocationRows = (allocations) => [...allocations.values()].sort((a, b) => b.share - a.share || a.client.localeCompare(b.client));

  return [...managers.values()]
    .map((manager) => ({
      ...manager,
      clients: [...manager.clients].filter(Boolean).sort(),
      allocations: allocationRows(manager.allocations),
      sites: [...manager.sites.values()]
        .map((site) => ({
          ...site,
          clients: [...site.clients].filter(Boolean).sort(),
          allocations: allocationRows(site.allocations),
          supervisors: [...site.supervisors.values()]
            .map((supervisor) => ({
              ...supervisor,
              clients: [...supervisor.clients].filter(Boolean).sort(),
              allocations: allocationRows(supervisor.allocations),
            }))
            .sort((a, b) => b.active - a.active || a.name.localeCompare(b.name)),
        }))
        .sort((a, b) => b.active - a.active || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.active - a.active || a.name.localeCompare(b.name));
}

function ratioLabel(allocations = []) {
  if (!allocations.length) return "Sin ratio";
  return allocations.map((item) => `${item.client}: ${percent.format(item.share)}%`).join(" · ");
}

function AllocationSummary({ allocations = [] }) {
  const visible = allocations.slice(0, 3);
  const remaining = allocations.length - visible.length;
  return (
    <span className="tree-allocation" title={ratioLabel(allocations)}>
      {visible.length ? visible.map((item) => (
        <span className="tree-ratio-chip" key={item.client}>
          <strong>{item.client}</strong>
          <em>{percent.format(item.share)}%</em>
        </span>
      )) : <span className="tree-ratio-empty">Sin asignación</span>}
      {remaining > 0 && <span className="tree-ratio-more">+{remaining}</span>}
    </span>
  );
}

export default function HierarchyPage() {
  const [metadata, setMetadata] = useState([]);
  const [filters, setFilters] = useState({});
  const [data, setData] = useState({
    rows: { leaders: [], supervisors: [], siteHeads: [], managers: [] },
    roster: { supervisors: [], siteHeads: [], managers: [] },
    totals: {},
  });
  const [structureData, setStructureData] = useState({
    rows: { leaders: [], supervisors: [], siteHeads: [], managers: [] },
    roster: { supervisors: [], siteHeads: [], managers: [] },
    totals: {},
  });
  const [activeView, setActiveView] = useState("leaders");
  const [expandedManagers, setExpandedManagers] = useState(() => new Set());
  const [expandedSites, setExpandedSites] = useState(() => new Set());
  const [exceptions, setExceptions] = useState([]);
  const [exceptionForm, setExceptionForm] = useState(emptyException);
  const [editingExceptionKey, setEditingExceptionKey] = useState("");
  const [savingExceptions, setSavingExceptions] = useState(false);
  const [exceptionMessage, setExceptionMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    getDatasetMetadata()
      .then((response) => setMetadata(response.columns || []))
      .catch((err) => setError(err.message));
    getHierarchyExceptions()
      .then((response) => setExceptions(response.rows || []))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    getFilterOptions(toFilterSpecs(filters))
      .then((response) => setMetadata(response.columns || []))
      .catch((err) => setError(err.message));
  }, [filterKey]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const specs = toFilterSpecs(filters);
      const [summary, fullStructure] = specs.length
        ? await Promise.all([getHierarchySummary(specs), getHierarchySummary([])])
        : await getHierarchySummary([]).then((response) => [response, response]);
      setData(summary);
      setStructureData(fullStructure);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const view = views[activeView] || null;
  const rows = view ? data.rows?.[activeView] || [] : [];
  const copyLines = useMemo(() => [
    ...(view ? [view.columns.map(([, label]) => label)] : []),
    ...rows.map((row) => view.columns.map(([key]) => displayValue(row, key))),
  ], [rows, view]);
  const copyTable = async () => copyTableToClipboard(copyLines);
  const handleCopy = (event) => setClipboardTableData(event, copyLines);
  const responsibilityTree = useMemo(() => buildResponsibilityTree(data), [data]);
  const exceptionOptions = useMemo(() => {
    const clients = uniqueNames([
      ...Object.values(structureData.rows || {}).flatMap((items) => items.map((item) => item.client)),
      ...exceptions.map((item) => item.client),
    ]);
    const managers = uniqueNames([
      "Multicuentas",
      ...(structureData.roster?.managers || []).map((item) => item.name),
      ...(structureData.rows?.managers || []).map((item) => item.manager),
      exceptionForm.manager,
    ]).filter((item) => treeKey(item) !== treeKey("Sin gerente identificado"));
    const siteHeads = uniqueNames([
      ...(structureData.roster?.siteHeads || []).map((item) => item.name),
      ...(structureData.rows?.siteHeads || []).map((item) => item.siteHead),
      exceptionForm.siteHead,
    ]);
    const supervisors = uniqueNames([
      ...(structureData.roster?.supervisors || []).map((item) => item.name),
      ...(structureData.rows?.supervisors || []).map((item) => item.supervisor),
      exceptionForm.supervisor === "Sin supervisor" ? "" : exceptionForm.supervisor,
    ]).filter((item) => treeKey(item) !== treeKey("Sin supervisor identificado"));
    return { clients, managers, siteHeads, supervisors };
  }, [structureData, exceptions, exceptionForm.manager, exceptionForm.siteHead, exceptionForm.supervisor]);
  const selectedClientHasException = useMemo(
    () => exceptions.some((item) => treeKey(item.client) === treeKey(exceptionForm.client)),
    [exceptions, exceptionForm.client],
  );
  const selectedClientStructure = useMemo(
    () => (structureData.currentStructure || structureData.rows?.supervisors || [])
      .filter((item) => treeKey(item.client) === treeKey(exceptionForm.client))
      .sort((a, b) => b.active - a.active || a.supervisor.localeCompare(b.supervisor, "es")),
    [structureData, exceptionForm.client],
  );

  const persistExceptions = async (nextRows, message) => {
    setSavingExceptions(true);
    setExceptionMessage("");
    try {
      const response = await saveHierarchyExceptions({ rows: nextRows });
      setExceptions(response.rows || []);
      setExceptionForm(emptyException);
      setEditingExceptionKey("");
      setExceptionMessage(message);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingExceptions(false);
    }
  };

  const submitException = (event) => {
    event.preventDefault();
    const row = Object.fromEntries(Object.entries(exceptionForm).map(([key, value]) => [key, value.trim()]));
    const hasScope = Boolean(row.scopeManager || row.scopeSiteHead || row.scopeSupervisor);
    const isLegacyEdit = Boolean(editingExceptionKey) && !hasScope;
    if (!row.client || (!hasScope && !isLegacyEdit) || (!row.manager && !row.siteHead && !row.supervisor)) {
      setExceptionMessage("Seleccioná un cliente, elegí una fila de su estructura y completá el responsable a modificar.");
      return;
    }
    const targetKey = exceptionScopeKey(row);
    const original = exceptions.find((item) => exceptionScopeKey(item) === editingExceptionKey) || {};
    const existingTarget = exceptions.find((item) => exceptionScopeKey(item) === targetKey) || {};
    const changedFields = Object.fromEntries(
      Object.entries(row).filter(([key, value]) => key === "client" || Boolean(value)),
    );
    const mergedRow = { ...original, ...existingTarget, ...changedFields, client: row.client };
    const nextRows = exceptions.filter((item) => ![editingExceptionKey, targetKey].filter(Boolean).includes(exceptionScopeKey(item)));
    persistExceptions([...nextRows, mergedRow], "Excepción guardada y estructura recalculada.");
  };

  const editException = (row) => {
    setExceptionForm({ ...emptyException, ...row });
    setEditingExceptionKey(exceptionScopeKey(row));
    setExceptionMessage("");
  };

  const deleteException = (row) => persistExceptions(
    exceptions.filter((item) => exceptionScopeKey(item) !== exceptionScopeKey(row)),
    "Excepción eliminada y estructura recalculada.",
  );

  const selectStructureScope = (row) => {
    setExceptionForm((current) => ({
      ...emptyException,
      client: current.client,
      scopeManager: row.scopeManager || row.manager,
      scopeSiteHead: row.scopeSiteHead || row.siteHead,
      scopeSupervisor: row.scopeSupervisor || (row.supervisor === "Sin supervisor identificado" ? "Sin supervisor" : row.supervisor),
    }));
    setEditingExceptionKey("");
    setExceptionMessage("");
  };
  const toggleManager = (id) => setExpandedManagers((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const toggleSite = (id) => setExpandedSites((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const expandAll = () => {
    setExpandedManagers(new Set(responsibilityTree.map((manager) => manager.id)));
    setExpandedSites(new Set(responsibilityTree.flatMap((manager) => manager.sites.map((site) => site.id))));
  };
  const collapseAll = () => {
    setExpandedManagers(new Set());
    setExpandedSites(new Set());
  };

  return (
    <div className="page-stack hierarchy-page">
      <header className="page-header hierarchy-header">
        <div>
          <p>Estructura</p>
          <h1>Responsables por cuenta</h1>
          <span>Dotación activa y cadena jerárquica separadas por cliente y campaña.</span>
        </div>
        <button className="icon-button" onClick={load} title="Actualizar" disabled={loading}>
          <RefreshCw size={18} />
        </button>
      </header>

      <FilterBar
        metadata={metadata}
        filters={filters}
        loading={loading}
        showAnalysisControls={false}
        onFiltersChange={setFilters}
      />

      {error && <div className="alert error">{error}</div>}

      <section className="hierarchy-kpi-grid">
        <HierarchyKpi label="Activos" value={data.totals?.active} icon={Users} />
        <HierarchyKpi label="Clientes" value={data.totals?.clients} icon={BriefcaseBusiness} />
        <HierarchyKpi label="Líderes activos" value={data.totals?.leaders} icon={Users} />
        <HierarchyKpi label="Supervisores activos" value={data.totals?.supervisors} icon={Network} />
        <HierarchyKpi label="Jefes de site activos" value={data.totals?.siteHeads} icon={Building2} />
        <HierarchyKpi label="Gerentes activos" value={data.totals?.managers} icon={BriefcaseBusiness} />
      </section>

      <nav className="hierarchy-tabs" aria-label="Nivel de estructura">
        {Object.entries(tabs).map(([key, item]) => {
          const Icon = item.icon;
          return (
            <button key={key} className={activeView === key ? "active" : ""} onClick={() => setActiveView(key)}>
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {view && (
        <section className={`table-wrap hierarchy-table ${activeView}`} onCopy={handleCopy}>
          <div className="table-toolbar">
            <div>
              <h2>{view.label}</h2>
              <span>Proporcional actual = activos del responsable en la cuenta / total asignado al responsable</span>
            </div>
            <button className="primary-button secondary-button" onClick={copyTable}>
              <Clipboard size={16} />
              Copiar tabla
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>{view.columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr>
              </thead>
              <tbody>
                {rows.length ? rows.map((row, index) => (
                  <tr key={`${activeView}-${row.client}-${row.campaign || ""}-${row.leader || row.supervisor || row.siteHead || row.manager}-${index}`}>
                    {view.columns.map(([key]) => <td key={key}>{displayValue(row, key)}</td>)}
                  </tr>
                )) : (
                  <tr><td className="empty-cell" colSpan={view.columns.length}>Sin estructura para los filtros seleccionados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeView === "tree" && (
        <section className="table-wrap responsibility-tree">
          <div className="table-toolbar">
            <div>
              <h2>Árbol de responsables</h2>
              <span>Gerente · jefe de site · supervisor</span>
            </div>
            <div className="tree-actions">
              <button className="icon-button" onClick={expandAll} title="Expandir todo">
                <ChevronsDown size={17} />
              </button>
              <button className="icon-button" onClick={collapseAll} title="Contraer todo">
                <ChevronsUp size={17} />
              </button>
            </div>
          </div>
          <div className="tree-column-head" aria-hidden="true">
            <span />
            <span />
            <strong>Responsable</strong>
            <strong>Dotación activa</strong>
            <strong>Distribución por cuenta</strong>
          </div>
          <div className="responsibility-tree-list">
            {responsibilityTree.map((manager) => {
              const managerExpanded = expandedManagers.has(manager.id);
              return (
                <div className="tree-manager" key={manager.id}>
                  <button
                    className="tree-row tree-manager-row"
                    onClick={() => toggleManager(manager.id)}
                    aria-expanded={managerExpanded}
                  >
                    {managerExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                    <BriefcaseBusiness size={17} />
                    <span className="tree-label"><strong>{manager.name}</strong><small>{manager.sites.length} jefes de site · {manager.allocations.length} cuentas</small></span>
                    <strong className="tree-count">{number.format(manager.active)}</strong>
                    <AllocationSummary allocations={manager.allocations} />
                  </button>
                  {managerExpanded && (
                    <div className="tree-sites">
                      {manager.sites.map((site) => {
                        const siteExpanded = expandedSites.has(site.id);
                        return (
                          <div className="tree-site" key={site.id}>
                            <button
                              className="tree-row tree-site-row"
                              onClick={() => toggleSite(site.id)}
                              aria-expanded={siteExpanded}
                            >
                              {siteExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              <Building2 size={16} />
                              <span className="tree-label"><strong>{site.name}</strong><small>{site.supervisors.length} supervisores · {site.allocations.length} cuentas</small></span>
                              <strong className="tree-count">{number.format(site.active)}</strong>
                              <AllocationSummary allocations={site.allocations} />
                            </button>
                            {siteExpanded && (
                              <div className="tree-supervisors">
                                {site.supervisors.map((supervisor) => (
                                  <div className="tree-row tree-supervisor-row" key={supervisor.id}>
                                    <span className="tree-branch" />
                                    <Network size={15} />
                                    <span className="tree-label"><strong>{supervisor.name}</strong><small>{supervisor.allocations.length} cuentas</small></span>
                                    <strong className="tree-count">{number.format(supervisor.active)}</strong>
                                    <AllocationSummary allocations={supervisor.allocations} />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {activeView === "exceptions" && (
        <section className="table-wrap hierarchy-exceptions">
          <div className="table-toolbar">
            <div>
              <h2>Excepciones por cliente</h2>
              <span>{number.format(exceptions.length)} reglas activas · se aplican al cargar la nómina y pueden ajustarse en esta pestaña.</span>
            </div>
          </div>

          <form className="exception-form" onSubmit={submitException}>
            <label>
              <span>Cliente</span>
              <select value={exceptionForm.client} onChange={(event) => { setExceptionForm({ ...emptyException, client: event.target.value }); setEditingExceptionKey(""); setExceptionMessage(""); }}>
                <option value="">Seleccionar cliente</option>
                {exceptionOptions.clients.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>
              <span>Gerente</span>
              <select value={exceptionForm.manager} onChange={(event) => setExceptionForm((current) => ({ ...current, manager: event.target.value }))}>
                <option value="">Sin cambios</option>
                {exceptionOptions.managers.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>
              <span>Jefe de site</span>
              <select value={exceptionForm.siteHead} onChange={(event) => setExceptionForm((current) => ({ ...current, siteHead: event.target.value }))}>
                <option value="">Sin cambios</option>
                {exceptionOptions.siteHeads.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>
              <span>Supervisor</span>
              <select value={exceptionForm.supervisor} onChange={(event) => setExceptionForm((current) => ({ ...current, supervisor: event.target.value }))}>
                <option value="">Sin cambios</option>
                <option value="Sin supervisor">Sin supervisor</option>
                {exceptionOptions.supervisors.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <div className="exception-form-actions">
              {editingExceptionKey && (
                <button type="button" className="secondary-button" onClick={() => { setExceptionForm(emptyException); setEditingExceptionKey(""); }}>
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                className="primary-button"
                disabled={savingExceptions || (!editingExceptionKey && !exceptionForm.scopeManager && !exceptionForm.scopeSiteHead && !exceptionForm.scopeSupervisor)}
                title={!editingExceptionKey && !exceptionForm.scopeManager ? "Seleccioná una fila de la estructura vigente" : "Guardar excepción"}
              >
                {editingExceptionKey ? <Save size={16} /> : <Plus size={16} />}
                {editingExceptionKey ? "Guardar cambios" : "Agregar excepción"}
              </button>
            </div>
          </form>

          {exceptionForm.client && (
            <section className="current-client-structure">
              <div className="current-client-heading">
                <div>
                  <span>Estructura vigente</span>
                  <strong>{exceptionForm.client}</strong>
                </div>
                <span className={selectedClientHasException ? "structure-source manual" : "structure-source"}>
                  {selectedClientHasException ? "Tiene excepciones" : "Calculada desde nómina"}
                </span>
              </div>
              <div className="current-structure-grid" role="table" aria-label={`Estructura vigente de ${exceptionForm.client}`}>
                <div className="current-structure-head" role="row">
                  <span>Elegir</span><span>Gerente</span><span>Jefe de site</span><span>Supervisor</span><span>Activos</span>
                </div>
                {selectedClientStructure.length ? selectedClientStructure.map((row, index) => (
                  <div className="current-structure-row" role="row" key={`${row.manager}-${row.siteHead}-${row.supervisor}-${index}`}>
                    <input
                      type="radio"
                      name="exception-scope"
                      aria-label={`Seleccionar cadena de ${row.siteHead}`}
                      checked={exceptionScopeKey(exceptionForm) === exceptionScopeKey({
                        client: row.client,
                        scopeManager: row.scopeManager || row.manager,
                        scopeSiteHead: row.scopeSiteHead || row.siteHead,
                        scopeSupervisor: row.scopeSupervisor || (row.supervisor === "Sin supervisor identificado" ? "Sin supervisor" : row.supervisor),
                      })}
                      onChange={() => selectStructureScope(row)}
                    />
                    <span>{row.manager}</span>
                    <span>{row.siteHead}</span>
                    <span>{row.supervisor === "Sin supervisor identificado" ? "Sin supervisor" : row.supervisor}</span>
                    <strong>{number.format(row.active || 0)}</strong>
                  </div>
                )) : (
                  <div className="current-structure-empty">No se encontró dotación activa para este cliente.</div>
                )}
              </div>
            </section>
          )}

          {exceptionMessage && <div className="exception-message">{exceptionMessage}</div>}

          <div className="table-scroll">
            <table>
              <thead><tr><th>Cliente</th><th>Alcance</th><th>Gerente</th><th>Jefe de site</th><th>Supervisor</th><th aria-label="Acciones" /></tr></thead>
              <tbody>
                {exceptions.length ? exceptions.map((row) => (
                  <tr key={exceptionScopeKey(row)}>
                    <td><strong>{row.client}</strong></td>
                    <td>{row.scopeManager || row.scopeSiteHead || row.scopeSupervisor
                      ? <span className="exception-scope-label">{row.scopeSiteHead || row.scopeManager} · {row.scopeSupervisor || "Cualquier supervisor"}</span>
                      : <span className="unchanged-value">Todo el cliente</span>}</td>
                    <td>{row.manager || <span className="unchanged-value">Sin cambios</span>}</td>
                    <td>{row.siteHead || <span className="unchanged-value">Sin cambios</span>}</td>
                    <td>{row.supervisor === "Sin supervisor" ? <span className="no-supervisor"><CircleOff size={14} /> Sin supervisor</span> : row.supervisor || <span className="unchanged-value">Sin cambios</span>}</td>
                    <td className="exception-row-actions">
                      <button className="icon-button" type="button" title="Editar" onClick={() => editException(row)}><Pencil size={15} /></button>
                      <button className="icon-button danger-icon" type="button" title="Eliminar" disabled={savingExceptions} onClick={() => deleteException(row)}><Trash2 size={15} /></button>
                    </td>
                  </tr>
                )) : <tr><td className="empty-cell" colSpan={6}>No hay excepciones configuradas.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

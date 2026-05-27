import { BriefcaseBusiness, CalendarDays, Clock3, Filter, RefreshCw, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from "recharts";
import { getRequirementsSummary } from "../api/client.js";
import { Button } from "../components/ui/button.jsx";
import { Card } from "../components/ui/card.jsx";
import { Select } from "../components/ui/select.jsx";

const monthFormatter = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });
const numberFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const integerFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const percentFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });
const palette = ["#2563eb", "#0f766e", "#7c3aed", "#db2777", "#ea580c", "#0891b2", "#65a30d", "#475569"];

function formatMonth(month) {
  if (!month) return "Sin mes";
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return month;
  return monthFormatter.format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function formatRequired(value) {
  return numberFormatter.format(Number(value) || 0);
}

function formatInteger(value) {
  return integerFormatter.format(Number(value) || 0);
}

function formatPercent(value) {
  return `${percentFormatter.format(Number(value) || 0)}%`;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function aggregateItems(items, mode, totalRequired) {
  const grouped = new Map();
  items.forEach((item) => {
    const key = item.name;
    const current =
      grouped.get(key) || {
        ...item,
        id: `agg::${mode}::${key}`,
        kind: mode,
        required: 0,
        hours: 0,
        services: [],
        sourceItems: [],
      };
    current.required += Number(item.required) || 0;
    current.hours += Number(item.hours) || 0;
    current.services = [...(current.services || []), ...(item.services || [])];
    current.sourceItems = [...(current.sourceItems || []), item];
    current.share = totalRequired ? (current.required / totalRequired) * 100 : 0;
    grouped.set(key, current);
  });
  return [...grouped.values()].sort((a, b) => b.required - a.required);
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="ops-tooltip">
      <strong>{item.name || item.label}</strong>
      <span>Dotacion: {formatRequired(item.required || item.size)}</span>
      <span>Horas: {formatInteger(item.hours)}</span>
      {item.share !== undefined && <span>Participacion total: {formatPercent(item.share)}</span>}
    </div>
  );
}

function TreemapTile(props) {
  const { x, y, width, height, name, required, share, fill } = props;
  if (width <= 0 || height <= 0) return null;
  const showLabel = width > 90 && height > 46;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={8} ry={8} fill={fill} stroke="#ffffff" strokeWidth={3} />
      {showLabel && (
        <>
          <text x={x + 10} y={y + 20} fill="#ffffff" fontSize={12} fontWeight={800}>
            {name}
          </text>
          <text x={x + 10} y={y + 38} fill="#e0f2fe" fontSize={11} fontWeight={700}>
            {formatRequired(required)} / {formatPercent(share)}
          </text>
        </>
      )}
    </g>
  );
}

function KpiCard({ label, value, helper, icon: Icon, tone = "default" }) {
  return (
    <Card className={`ops-kpi-card ${tone}`}>
      <div className="ops-kpi-icon">{Icon ? <Icon size={20} /> : null}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </Card>
  );
}

export default function RequeridosSummaryPage() {
  const [summary, setSummary] = useState({
    months: [],
    month: "",
    rows: [],
    totals: { required: 0, hours: 0 },
    source: { activeAccounts: 0, usesCatalog: false },
  });
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedManager, setSelectedManager] = useState("");
  const [selectedSiteLead, setSelectedSiteLead] = useState("");
  const [selectedClient, setSelectedClient] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadSummary = async (month = selectedMonth) => {
    setLoading(true);
    setError("");
    try {
      const response = await getRequirementsSummary(month);
      setSummary(response);
      setSelectedMonth(response.month || month || "");
    } catch (err) {
      setError(err.message || "No se pudo cargar el resumen.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary("");
  }, []);

  const model = useMemo(() => {
    const rows = summary.rows || [];
    const byId = new Map(rows.map((row) => [row.id, row]));
    const totalRequired = Number(summary.totals?.required) || 0;
    const accounts = rows
      .filter((row) => row.level === 2)
      .map((row, index) => {
        const site = byId.get(row.parentId);
        const manager = site ? byId.get(site.parentId) : null;
        const services = rows.filter((service) => service.parentId === row.id);
        const required = Number(row.required) || 0;
        return {
          ...row,
          kind: "Cuenta",
          name: row.label,
          manager: manager?.label || "Sin gerente",
          siteLead: site?.label || "Sin jefe de site",
          client: row.label,
          services,
          serviceCount: services.length,
          required,
          hours: Number(row.hours) || 0,
          share: totalRequired ? (required / totalRequired) * 100 : 0,
          fill: palette[index % palette.length],
        };
      })
      .sort((a, b) => b.required - a.required);

    const services = accounts
      .flatMap((account) =>
        account.services.map((service, index) => {
          const required = Number(service.required) || 0;
          return {
            ...service,
            id: service.id,
            kind: "Subcampaña",
            name: service.label,
            manager: account.manager,
            siteLead: account.siteLead,
            client: account.client,
            accountName: account.name,
            required,
            hours: Number(service.hours) || 0,
            share: totalRequired ? (required / totalRequired) * 100 : 0,
            fill: palette[index % palette.length],
          };
        }),
      )
      .sort((a, b) => b.required - a.required);

    return {
      accounts,
      services,
      managers: rows.filter((row) => row.level === 0),
      siteLeads: rows.filter((row) => row.level === 1),
    };
  }, [summary.rows, summary.totals?.required]);

  const filterOptions = useMemo(() => {
    const managerOptions = uniqueSorted(model.accounts.map((account) => account.manager));
    const byManager = selectedManager
      ? model.accounts.filter((account) => account.manager === selectedManager)
      : model.accounts;
    const siteLeadOptions = uniqueSorted(byManager.map((account) => account.siteLead));
    const bySiteLead = selectedSiteLead
      ? byManager.filter((account) => account.siteLead === selectedSiteLead)
      : byManager;
    const clientOptions = uniqueSorted(bySiteLead.map((account) => account.client));
    return { managerOptions, siteLeadOptions, clientOptions };
  }, [model.accounts, selectedManager, selectedSiteLead]);

  useEffect(() => {
    if (selectedManager && !filterOptions.managerOptions.includes(selectedManager)) setSelectedManager("");
    if (selectedSiteLead && !filterOptions.siteLeadOptions.includes(selectedSiteLead)) setSelectedSiteLead("");
    if (selectedClient && !filterOptions.clientOptions.includes(selectedClient)) setSelectedClient("");
  }, [filterOptions, selectedClient, selectedManager, selectedSiteLead]);

  const scoped = useMemo(() => {
    const accountScope = model.accounts.filter(
      (account) =>
        (!selectedManager || account.manager === selectedManager) &&
        (!selectedSiteLead || account.siteLead === selectedSiteLead) &&
        (!selectedClient || account.client === selectedClient),
    );
    const serviceScope = model.services.filter(
      (service) =>
        (!selectedManager || service.manager === selectedManager) &&
        (!selectedSiteLead || service.siteLead === selectedSiteLead) &&
        (!selectedClient || service.client === selectedClient),
    );
    const totalRequired = Number(summary.totals?.required) || 0;
    const aggregatedAccounts = aggregateItems(accountScope, "Cuenta", totalRequired);
    const aggregatedServices = aggregateItems(serviceScope, "Subcampaña", totalRequired);
    const displayItems = selectedClient
      ? (aggregatedServices.length ? aggregatedServices : aggregatedAccounts)
      : aggregatedAccounts;
    const required = displayItems.reduce((sum, item) => sum + item.required, 0);
    const hours = displayItems.reduce((sum, item) => sum + item.hours, 0);
    return {
      accounts: accountScope,
      services: serviceScope,
      displayItems: displayItems.map((item, index) => ({ ...item, fill: palette[index % palette.length] })),
      required,
      hours,
      share: totalRequired ? (required / totalRequired) * 100 : 0,
      label: selectedClient || selectedSiteLead || selectedManager || "Total general",
      level: selectedClient && aggregatedServices.length ? "Subcampañas" : "Cuentas",
    };
  }, [model.accounts, model.services, selectedClient, selectedManager, selectedSiteLead, summary.totals?.required]);

  useEffect(() => {
    if (!scoped.displayItems.length) {
      setSelectedItemId("");
      return;
    }
    if (!scoped.displayItems.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(scoped.displayItems[0].id);
    }
  }, [scoped.displayItems, selectedItemId]);

  const selectedItem = scoped.displayItems.find((item) => item.id === selectedItemId) || scoped.displayItems[0];
  const rankingData = scoped.displayItems.slice(0, 12).map((item) => ({
    name: item.name,
    required: item.required,
    hours: item.hours,
    share: item.share,
  }));
  const treemapData = scoped.displayItems.map((item) => ({
    name: item.name,
    size: item.required,
    required: item.required,
    hours: item.hours,
    share: item.share,
    fill: item.fill,
  }));

  const resetFilters = () => {
    setSelectedManager("");
    setSelectedSiteLead("");
    setSelectedClient("");
  };

  return (
    <div className="page-stack ops-dashboard">
      <header className="ops-hero">
        <div>
          <p className="eyebrow">Planificacion operativa</p>
          <h1>Control de requeridos</h1>
          <span>Vista ejecutiva por mes, cuenta y subcampaña con participacion sobre el total general.</span>
        </div>
        <div className="ops-header-controls">
          <label>
            <CalendarDays size={16} />
            <Select
              value={selectedMonth}
              onChange={(event) => loadSummary(event.target.value)}
              disabled={loading || !summary.months.length}
            >
              {summary.months.length ? (
                summary.months.map((month) => (
                  <option key={month} value={month}>
                    {formatMonth(month)}
                  </option>
                ))
              ) : (
                <option value="">Sin meses cargados</option>
              )}
            </Select>
          </label>
          <Button variant="outline" size="icon" onClick={() => loadSummary()} title="Actualizar" disabled={loading}>
            <RefreshCw size={18} />
          </Button>
        </div>
      </header>

      {error && <div className="alert error">{error}</div>}

      <section className="ops-filter-panel">
        <div className="ops-filter-title">
          <Filter size={18} />
          <div>
            <h2>Filtro dinámico</h2>
            <p>Al elegir cliente, la vista baja automáticamente a subcampañas.</p>
          </div>
        </div>
        <label>
          <span>Gerente</span>
          <Select
            value={selectedManager}
            onChange={(event) => {
              setSelectedManager(event.target.value);
              setSelectedSiteLead("");
              setSelectedClient("");
            }}
          >
            <option value="">Todos</option>
            {filterOptions.managerOptions.map((manager) => (
              <option key={manager} value={manager}>
                {manager}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span>Jefe de site</span>
          <Select
            value={selectedSiteLead}
            onChange={(event) => {
              setSelectedSiteLead(event.target.value);
              setSelectedClient("");
            }}
          >
            <option value="">Todos</option>
            {filterOptions.siteLeadOptions.map((siteLead) => (
              <option key={siteLead} value={siteLead}>
                {siteLead}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span>Cliente</span>
          <Select value={selectedClient} onChange={(event) => setSelectedClient(event.target.value)}>
            <option value="">Todos</option>
            {filterOptions.clientOptions.map((client) => (
              <option key={client} value={client}>
                {client}
              </option>
            ))}
          </Select>
        </label>
        <Button variant="outline" onClick={resetFilters} disabled={!selectedManager && !selectedSiteLead && !selectedClient}>
          Limpiar
        </Button>
      </section>

      <section className="ops-kpi-grid">
        <KpiCard
          label="Dotacion dia habil"
          value={formatRequired(summary.totals.required)}
          helper="Total general del mes como dia normal"
          icon={UsersRound}
          tone="primary"
        />
        <KpiCard
          label={scoped.label}
          value={formatRequired(scoped.required)}
          helper={`Dotacion dia habil: ${scoped.level}`}
          icon={BriefcaseBusiness}
          tone="success"
        />
        <KpiCard
          label="Participacion"
          value={formatPercent(scoped.share)}
          helper="Sobre total general del mes"
          icon={UsersRound}
        />
        <KpiCard
          label="Horas objetivo"
          value={formatInteger(scoped.hours)}
          helper={`${formatInteger(scoped.displayItems.length)} ${scoped.level.toLowerCase()}`}
          icon={Clock3}
        />
      </section>

      <section className="ops-layout">
        <div className="ops-main-grid">
          <article className="ops-panel ops-ranking-panel">
            <div className="ops-panel-header">
              <div>
                <h2>Ranking de {scoped.level.toLowerCase()}</h2>
                <p>Participación siempre calculada contra el total general.</p>
              </div>
            </div>
            <div className="ops-chart ranking-chart">
              {rankingData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rankingData} layout="vertical" margin={{ top: 8, right: 18, left: 18, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={132} tickLine={false} axisLine={false} tick={{ fill: "#334155", fontSize: 12, fontWeight: 700 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="required" radius={[0, 8, 8, 0]} fill="#2563eb" barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="ops-empty">Sin datos para graficar.</div>
              )}
            </div>
          </article>

          <article className="ops-panel">
            <div className="ops-panel-header">
              <div>
                <h2>Participacion por dotacion</h2>
                <p>{scoped.level} ponderadas por requeridos del mes.</p>
              </div>
            </div>
            <div className="ops-chart treemap-chart">
              {treemapData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <Treemap
                    data={treemapData}
                    dataKey="size"
                    nameKey="name"
                    aspectRatio={4 / 3}
                    content={<TreemapTile />}
                    isAnimationActive={false}
                  >
                    <Tooltip content={<CustomTooltip />} />
                  </Treemap>
                </ResponsiveContainer>
              ) : (
                <div className="ops-empty">Sin participacion disponible.</div>
              )}
            </div>
          </article>

          <article className="ops-panel ops-heatmap-panel">
            <div className="ops-panel-header">
              <div>
                <h2>Mapa de {scoped.level.toLowerCase()}</h2>
                <p>Dotacion de dia habil, horas objetivo y porcentaje sobre total general.</p>
              </div>
            </div>
            <div className="ops-heatmap">
              {scoped.displayItems.length ? (
                scoped.displayItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={selectedItem?.id === item.id ? "ops-heatmap-row active" : "ops-heatmap-row"}
                    onClick={() => setSelectedItemId(item.id)}
                    style={{ "--heat": Math.min(0.95, Math.max(0.08, item.share / 100)) }}
                  >
                    <span className="account-name">{item.name}</span>
                    <span>{formatRequired(item.required)}</span>
                    <span>{formatInteger(item.hours)}</span>
                    <strong>{formatPercent(item.share)}</strong>
                  </button>
                ))
              ) : (
                <div className="ops-empty">Sin datos activos con requeridos para el mes.</div>
              )}
            </div>
          </article>
        </div>

        <aside className="ops-detail-panel">
          {selectedItem ? (
            <>
              <div className="ops-detail-heading">
                <span>{selectedItem.kind} seleccionada</span>
                <h2>{selectedItem.name}</h2>
                <p>{selectedItem.manager} / {selectedItem.siteLead} / {selectedItem.client}</p>
              </div>
              <div className="ops-detail-metrics">
                <div>
                  <span>Dotacion</span>
                  <strong>{formatRequired(selectedItem.required)}</strong>
                </div>
                <div>
                  <span>Horas</span>
                  <strong>{formatInteger(selectedItem.hours)}</strong>
                </div>
                <div>
                  <span>Participacion</span>
                  <strong>{formatPercent(selectedItem.share)}</strong>
                </div>
              </div>
              <div className="ops-progress">
                <span style={{ width: `${Math.min(100, selectedItem.share)}%` }} />
              </div>
              <div className="ops-service-list">
                <h3>{selectedItem.kind === "Subcampaña" ? "Contexto" : "Subcampañas"}</h3>
                {selectedItem.kind === "Subcampaña" ? (
                  <div className="ops-service-item">
                    <span>Cliente</span>
                    <strong>{selectedItem.client}</strong>
                  </div>
                ) : selectedItem.services?.length ? (
                  selectedItem.services.map((service) => (
                    <div key={service.id} className="ops-service-item">
                      <span>{service.label}</span>
                      <strong>{formatRequired(service.required)}</strong>
                    </div>
                  ))
                ) : (
                  <p>Sin subcampañas detalladas.</p>
                )}
              </div>
            </>
          ) : (
            <div className="ops-empty">Selecciona una fila para ver el detalle.</div>
          )}
        </aside>
      </section>
    </div>
  );
}

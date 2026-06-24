import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

export default function BajasTableFilters({
  campaignOptions = [],
  selectedCampaigns = [],
  dateRange = { start: "", end: "" },
  onCampaignsChange,
  onDateRangeChange,
}) {
  const [query, setQuery] = useState("");
  const options = useMemo(
    () => campaignOptions.filter((campaign) => campaign.toLowerCase().includes(query.toLowerCase())),
    [campaignOptions, query],
  );
  const selected = new Set(selectedCampaigns);
  const allSelected = campaignOptions.length > 0 && selectedCampaigns.length === campaignOptions.length;

  const toggleCampaign = (campaign) => {
    const next = selected.has(campaign)
      ? selectedCampaigns.filter((item) => item !== campaign)
      : [...selectedCampaigns, campaign];
    onCampaignsChange(next);
  };

  const toggleAll = () => {
    onCampaignsChange(allSelected ? [] : campaignOptions);
  };

  return (
    <div className="bajas-table-filters">
      <div className="bajas-date-controls">
        <label className="date-field">
          <span>Desde</span>
          <input
            type="date"
            value={dateRange.start || ""}
            onChange={(event) => onDateRangeChange({ ...dateRange, start: event.target.value })}
          />
        </label>
        <label className="date-field">
          <span>Hasta</span>
          <input
            type="date"
            value={dateRange.end || ""}
            onChange={(event) => onDateRangeChange({ ...dateRange, end: event.target.value })}
          />
        </label>
        <button className="primary-button secondary-button" onClick={() => onDateRangeChange({ start: "", end: "" })}>
          Limpiar fechas
        </button>
      </div>

      <div className="bajas-campaign-filter">
        <label className="search-field compact">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar servicio/campaña" />
          {query && (
            <button type="button" onClick={() => setQuery("")} title="Limpiar búsqueda">
              <X size={13} />
            </button>
          )}
        </label>
        <label className="check-row select-all-row">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          <span>{selectedCampaigns.length ? `${selectedCampaigns.length} seleccionadas` : "Todo el filtro actual"}</span>
        </label>
        <div className="bajas-campaign-list">
          {options.map((campaign) => (
            <label key={campaign} className="check-row">
              <input type="checkbox" checked={selected.has(campaign)} onChange={() => toggleCampaign(campaign)} />
              <span>{campaign}</span>
            </label>
          ))}
          {!options.length && <p className="muted">Sin servicios para el filtro actual.</p>}
        </div>
      </div>
    </div>
  );
}

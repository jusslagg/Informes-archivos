import { Activity, Clipboard, Filter } from "lucide-react";
import { useMemo, useState } from "react";
import { copyTableToClipboard } from "../lib/clipboardTable.js";

const number = new Intl.NumberFormat("es-AR");
const percent = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

function preferDefaultReason(reasons = []) {
  return reasons.find((reason) => reason.toUpperCase().includes("RENUNCIA")) || reasons[0] || "";
}

export default function BajasReasonTenureExplorer({
  reasons = [],
  rows = [],
  totals = {},
  campaigns = [],
  byCampaign = {},
  dateRange = { start: "", end: "" },
  filterControl = null,
}) {
  const [selectedReason, setSelectedReason] = useState(() => preferDefaultReason(reasons));
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const activeReason = reasons.includes(selectedReason) ? selectedReason : preferDefaultReason(reasons);
  const campaignOptions = campaigns.filter((campaign) => campaign?.name && campaign.total > 0);
  const activeCampaign = campaignOptions.some((campaign) => campaign.name === selectedCampaign) ? selectedCampaign : "";
  const scope = activeCampaign ? byCampaign[activeCampaign] || { rows: [], totals: {} } : { rows, totals };
  const scopedRows = scope.rows || [];
  const scopedTotals = scope.totals || {};
  const reasonTotal = scopedTotals[activeReason] || 0;
  const totalBajas = scopedTotals.Total || 0;

  const model = useMemo(() => {
    const maxReason = Math.max(1, ...scopedRows.map((row) => row[activeReason] || 0));
    return scopedRows.map((row) => {
      const reasonCount = row[activeReason] || 0;
      const bucketTotal = row.Total || 0;
      return {
        label: row["Antigüedad"] || row["AntigÃ¼edad"] || row["AntigÃƒÂ¼edad"],
        reasonCount,
        bucketTotal,
        bucketShare: bucketTotal ? (reasonCount / bucketTotal) * 100 : 0,
        reasonShare: reasonTotal ? (reasonCount / reasonTotal) * 100 : 0,
        intensity: reasonCount / maxReason,
      };
    });
  }, [activeReason, reasonTotal, scopedRows]);

  const strongest = model.reduce((winner, row) => (row.reasonCount > (winner?.reasonCount || 0) ? row : winner), null);
  const earlyTotal = model.slice(0, 3).reduce((sum, row) => sum + row.reasonCount, 0);
  const earlyShare = reasonTotal ? (earlyTotal / reasonTotal) * 100 : 0;
  const overallShare = totalBajas ? (reasonTotal / totalBajas) * 100 : 0;

  const copyLines = [
    ["Motivo", activeReason],
    ["Campaña", activeCampaign || "Todas las campañas"],
    ["Rango", dateRange.start || "inicio", dateRange.end || "hoy"],
    [],
    ["Período de antigüedad", "Bajas del motivo", "Total de bajas del período", "% de bajas del período por el motivo", "% de casos del motivo en el período"],
    ...model.map((row) => [
      row.label,
      row.reasonCount,
      row.bucketTotal,
      `${percent.format(row.bucketShare)}%`,
      `${percent.format(row.reasonShare)}%`,
    ]),
    ["Total", reasonTotal, totalBajas, `${percent.format(overallShare)}%`, "100%"],
  ];

  if (!reasons.length) {
    return (
      <section className="reason-tenure-explorer">
        <div className="empty-chart">Sin motivos de baja para cruzar con antigüedad.</div>
      </section>
    );
  }

  return (
    <section className="reason-tenure-explorer">
      <header className="reason-tenure-header">
        <div>
          <span className="eyebrow">Lectura de permanencia</span>
          <h2>Participación del motivo por antigüedad</h2>
          <p>Compará qué porcentaje de las bajas de cada período de antigüedad corresponde al motivo seleccionado y en qué períodos se concentra.</p>
        </div>
        <div className="reason-tenure-actions">
          <label>
            <Filter size={15} />
            <select value={activeReason} onChange={(event) => setSelectedReason(event.target.value)}>
              {reasons.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </label>
          <label>
            <Filter size={15} />
            <select value={activeCampaign} onChange={(event) => setSelectedCampaign(event.target.value)}>
              <option value="">Todas las campañas</option>
              {campaignOptions.map((campaign) => (
                <option key={campaign.name} value={campaign.name}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </label>
          <button className="icon-button" onClick={() => copyTableToClipboard(copyLines)} title="Copiar tabla">
            <Clipboard size={16} />
          </button>
        </div>
      </header>
      {filterControl}

      <div className="reason-tenure-kpis">
        <article>
          <span>Campaña analizada</span>
          <strong>{activeCampaign || "Todas"}</strong>
          <small>{number.format(totalBajas)} bajas en el universo seleccionado</small>
        </article>
        <article>
          <span>Motivo seleccionado</span>
          <strong>{activeReason}</strong>
          <small>{number.format(reasonTotal)} bajas · {percent.format(overallShare)}% de la campaña</small>
        </article>
        <article>
          <span>Mayor concentración</span>
          <strong>{strongest?.label || "Sin datos"}</strong>
          <small>{number.format(strongest?.reasonCount || 0)} casos · {percent.format(strongest?.reasonShare || 0)}% del motivo</small>
        </article>
        <article>
          <span>Primeros 3 meses</span>
          <strong>{percent.format(earlyShare)}%</strong>
          <small>{number.format(earlyTotal)} casos del motivo</small>
        </article>
      </div>

      <div className="reason-tenure-map">
        {model.map((row) => (
          <article key={row.label} style={{ "--weight": row.intensity }}>
            <div className="reason-tenure-row-head">
              <span>{row.label}</span>
              <strong>{number.format(row.reasonCount)}</strong>
            </div>
            <div className="reason-tenure-bars">
              <div
                title={`${activeReason}: ${number.format(row.reasonCount)} de ${number.format(row.bucketTotal)} bajas en el período ${row.label} (${percent.format(row.bucketShare)}%)`}
              >
                <small>Bajas por este motivo</small>
                <span style={{ width: `${Math.min(100, row.bucketShare)}%` }} />
                <b>{percent.format(row.bucketShare)}%</b>
              </div>
              <div
                title={`${row.label}: ${number.format(row.reasonCount)} de ${number.format(reasonTotal)} bajas por ${activeReason} (${percent.format(row.reasonShare)}% del motivo)`}
              >
                <small>Casos del motivo aquí</small>
                <span style={{ width: `${Math.min(100, row.reasonShare)}%` }} />
                <b>{percent.format(row.reasonShare)}%</b>
              </div>
            </div>
            <div className="reason-tenure-row-foot">
              <span>{number.format(row.bucketTotal)} bajas en este período</span>
              <span>{number.format(row.reasonCount)} por {activeReason}</span>
            </div>
          </article>
        ))}
      </div>

      <footer className="reason-tenure-note">
        <Activity size={16} />
        <span>
          Primera barra: de todas las bajas del período, qué porcentaje corresponde a {activeReason}. Segunda barra: de todos los casos de {activeReason}, qué porcentaje ocurrió en ese período.
        </span>
      </footer>
    </section>
  );
}

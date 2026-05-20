import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const number = new Intl.NumberFormat("es-AR");

export default function ChartBox({ title, data = [], dataKey = "value", formatter = number.format }) {
  const visibleData = data.slice(0, 16);

  return (
    <section className="chart-box">
      <header className="chart-header">
        <h2>{title}</h2>
        <span>{visibleData.length} segmento(s)</span>
      </header>
      <div className="chart-canvas">
        {visibleData.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={visibleData} margin={{ top: 8, right: 12, left: 0, bottom: 52 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "#64748b" }}
                interval={0}
                angle={-28}
                textAnchor="end"
                height={72}
              />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(value) => formatter(value)} />
              <Tooltip
                formatter={(value) => formatter(value)}
                contentStyle={{ borderRadius: 8, borderColor: "#dbe3ef" }}
              />
              <Bar dataKey={dataKey} fill="#2563eb" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty-chart">Sin datos para graficar.</div>
        )}
      </div>
    </section>
  );
}

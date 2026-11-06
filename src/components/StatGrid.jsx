import "./StatGrid.css";

export function StatCard({ label, value, sub, accent = false }) {
  return (
    <div className={`ui-stat-card${accent ? " ui-stat-card--accent" : ""}`}>
      <span className="ui-stat-card__label">{label}</span>
      <div className="ui-stat-card__value">{value}</div>
      {sub && <div className="ui-stat-card__sub">{sub}</div>}
    </div>
  );
}

export default function StatGrid({ children, hero = false }) {
  return (
    <div className={`ui-stat-grid${hero ? " ui-stat-grid--hero" : ""}`}>
      {children}
    </div>
  );
}

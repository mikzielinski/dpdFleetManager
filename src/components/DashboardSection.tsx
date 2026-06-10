import { FleetStatsPanel } from './FleetStatsPanel';
import type { FleetCostStats } from '../services/fleetStats';
import type { HealthScoreResult } from '../utils/healthScore';

interface Props {
  stats: FleetCostStats;
  health: HealthScoreResult;
  vehicleCount: number;
  companyCount: number;
  loading: boolean;
  error: string | null;
  onExportPdf: () => void;
  onRefresh: () => void;
}

export function DashboardSection({
  stats,
  health,
  vehicleCount,
  companyCount,
  loading,
  error,
  onExportPdf,
  onRefresh,
}: Props) {
  if (loading) {
    return (
      <section className="panel overview-panel">
        <p className="center">Ładowanie podsumowania floty…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel overview-panel">
        <p className="error-text">{error}</p>
        <button type="button" className="btn btn-ghost" onClick={onRefresh}>
          Spróbuj ponownie
        </button>
      </section>
    );
  }

  return (
    <section className="panel overview-panel">
      <div className="panel-head">
        <h2>Dashboard floty</h2>
        <button type="button" className="btn btn-ghost" onClick={onRefresh}>
          Odśwież
        </button>
      </div>

      <div className="overview-kpi-grid">
        <div className="overview-kpi-card">
          <span className="overview-kpi-label">Rozliczenia</span>
          <span className="overview-kpi-value">{stats.claimCount}</span>
        </div>
        <div className="overview-kpi-card">
          <span className="overview-kpi-label">Pojazdy B2B</span>
          <span className="overview-kpi-value">{vehicleCount}</span>
        </div>
        <div className="overview-kpi-card">
          <span className="overview-kpi-label">Firmy kurierskie</span>
          <span className="overview-kpi-value">{companyCount}</span>
        </div>
        <div className="overview-kpi-card overview-kpi-warn">
          <span className="overview-kpi-label">Oznaczenia / anomalie</span>
          <span className="overview-kpi-value">{stats.flaggedCount}</span>
        </div>
      </div>

      <FleetStatsPanel
        stats={stats}
        health={health}
        title="Kondycja i koszty floty"
        onExportPdf={onExportPdf}
      />

      {stats.byDecision.length > 0 ? (
        <div className="overview-block">
          <h3 className="section-title">Decyzje (statusy)</h3>
          <ul className="overview-decision-list">
            {stats.byDecision.map((d) => (
              <li key={d.label}>
                <span className="overview-decision-label">{d.label}</span>
                <span className="overview-decision-count">{d.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

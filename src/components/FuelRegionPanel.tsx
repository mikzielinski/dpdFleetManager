import type { RegionFuelRow } from '../services/regionFuelAnalytics';
import type { VehicleFuelPeriodStats } from '../services/regionFuelAnalytics';
import { formatPeriodRangeLabel, type PeriodFilterState } from '../utils/periodFilter';

interface Props {
  period: PeriodFilterState;
  regionRows: RegionFuelRow[];
  vehicleStats?: VehicleFuelPeriodStats | null;
  title?: string;
}

export function FuelRegionPanel({
  period,
  regionRows,
  vehicleStats,
  title = 'Paliwo wg regionu',
}: Props) {
  const maxFuel = Math.max(...regionRows.map((r) => r.fuelCost), 1);

  return (
    <div className="fuel-region-panel">
      <h3 className="section-title">{title}</h3>
      <p className="fuel-region-subtitle">{formatPeriodRangeLabel(period)}</p>

      {vehicleStats && (
        <dl className="detail-grid detail-grid-compact fuel-vehicle-kpis">
          <div className="detail-item">
            <dt>Przebieg w okresie</dt>
            <dd>
              {vehicleStats.drivenKm != null
                ? `${vehicleStats.drivenKm.toLocaleString('pl-PL')} km`
                : '—'}
              <span className="hint-inline"> (raporty miesięczne kierowcy)</span>
            </dd>
          </div>
          <div className="detail-item">
            <dt>Koszt paliwa</dt>
            <dd>
              {vehicleStats.fuelCost.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN
              {vehicleStats.fuelCount > 0 && (
                <span className="hint-inline">
                  {' '}
                  · {vehicleStats.fuelCount} tankowań
                  {vehicleStats.fuelLiters > 0
                    ? ` · ~${vehicleStats.fuelLiters.toFixed(0)} L`
                    : ''}
                </span>
              )}
            </dd>
          </div>
          <div className="detail-item">
            <dt>Koszt paliwa / km</dt>
            <dd>
              {vehicleStats.fuelCostPerKm != null
                ? `${vehicleStats.fuelCostPerKm.toFixed(2)} PLN/km`
                : '—'}
            </dd>
          </div>
          <div className="detail-item">
            <dt>Średnia regionu ({vehicleStats.region})</dt>
            <dd>
              {vehicleStats.regionAvgFuelCostPerKm != null
                ? `${vehicleStats.regionAvgFuelCostPerKm.toFixed(2)} PLN/km`
                : '—'}
              {vehicleStats.vsRegionPct != null && (
                <span
                  className={
                    vehicleStats.vsRegionPct > 5
                      ? 'hint-inline hint-warn'
                      : vehicleStats.vsRegionPct < -5
                        ? 'hint-inline hint-ok'
                        : 'hint-inline'
                  }
                >
                  {' '}
                  ({vehicleStats.vsRegionPct > 0 ? '+' : ''}
                  {vehicleStats.vsRegionPct}% vs region)
                </span>
              )}
            </dd>
          </div>
        </dl>
      )}

      {regionRows.length === 0 ? (
        <p className="empty-hint">Brak kosztów paliwa w wybranym okresie.</p>
      ) : (
        <>
          <ul className="category-bars fuel-region-bars">
            {regionRows.slice(0, 8).map((r) => {
              const pct = Math.round((r.fuelCost / maxFuel) * 100);
              return (
                <li key={r.region} className="category-bar-row">
                  <span className="category-bar-label" title={r.region}>
                    {r.region}
                  </span>
                  <div className="category-bar-track">
                    <div
                      className="category-bar-fill"
                      style={{ width: `${pct}%`, backgroundColor: '#e85d04' }}
                    />
                  </div>
                  <span className="category-bar-meta">
                    {r.fuelCount} · {r.fuelCost.toFixed(0)} PLN
                    {r.fuelCostPerKm != null ? ` · ${r.fuelCostPerKm.toFixed(2)} PLN/km` : ''}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="table-wrap table-wrap-nested">
            <table>
              <thead>
                <tr>
                  <th>Region / miasto</th>
                  <th className="col-numeric">Pojazdy</th>
                  <th className="col-numeric">Tankowania</th>
                  <th className="col-numeric">Suma paliwa</th>
                  <th className="col-numeric">Przebieg</th>
                  <th className="col-numeric">PLN/km</th>
                </tr>
              </thead>
              <tbody>
                {regionRows.map((r) => (
                  <tr key={r.region}>
                    <td>{r.region}</td>
                    <td className="col-numeric">{r.vehicleCount}</td>
                    <td className="col-numeric">{r.fuelCount}</td>
                    <td className="col-numeric">{r.fuelCost.toFixed(2)}</td>
                    <td className="col-numeric">
                      {r.drivenKm > 0 ? r.drivenKm.toLocaleString('pl-PL') : '—'}
                    </td>
                    <td className="col-numeric">
                      {r.fuelCostPerKm != null ? r.fuelCostPerKm.toFixed(2) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

import type { RegionFuelRow } from '../services/regionFuelAnalytics';
import type { VehicleFuelPeriodStats } from '../services/regionFuelAnalytics';
import {
  formatKmPerLiter,
  formatLitersPer100Km,
} from '../utils/fuelConsumption';
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

  const fleetLiters = regionRows.reduce((s, r) => s + r.fuelLiters, 0);
  const fleetKm = regionRows.reduce((s, r) => s + r.drivenKm, 0);
  const fleetL100 =
    fleetKm > 0 && fleetLiters > 0 ? Math.round((fleetLiters / fleetKm) * 1000) / 10 : null;

  return (
    <div className="fuel-region-panel">
      <h3 className="section-title">{title}</h3>
      <p className="fuel-region-subtitle">{formatPeriodRangeLabel(period)}</p>
      <p className="filter-hint fuel-consumption-hint">
        Spalanie: litry z pola Amount (tankowanie) lub szacunek z kwoty netto ÷ średnia cena ON z
        kosztów POC w okresie.
      </p>

      {vehicleStats && (
        <dl className="detail-grid detail-grid-compact fuel-vehicle-kpis">
          <div className="detail-item">
            <dt>Przebieg w okresie</dt>
            <dd>
              {vehicleStats.drivenKm != null
                ? `${vehicleStats.drivenKm.toLocaleString('pl-PL')} km`
                : '—'}
              <span className="hint-inline"> (odczyty POC / licznik B2B)</span>
            </dd>
          </div>
          <div className="detail-item">
            <dt>Zużyte paliwo</dt>
            <dd>
              {vehicleStats.fuelLiters > 0
                ? `${vehicleStats.fuelLiters.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} L`
                : '—'}
              <span className="hint-inline">
                {' '}
                · {vehicleStats.fuelCount} tankowań ·{' '}
                {vehicleStats.fuelCost.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN
              </span>
            </dd>
          </div>
          <div className="detail-item fuel-kpi-highlight">
            <dt>Spalanie</dt>
            <dd>
              <strong>{formatLitersPer100Km(vehicleStats.fuelLitersPer100Km)}</strong>
              {vehicleStats.kmPerLiter != null && (
                <span className="hint-inline"> · {formatKmPerLiter(vehicleStats.kmPerLiter)}</span>
              )}
              {vehicleStats.plnPerLiter != null && (
                <span className="hint-inline">
                  {' '}
                  · {vehicleStats.plnPerLiter.toFixed(2)} PLN/L
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
              {formatLitersPer100Km(vehicleStats.regionAvgLitersPer100Km)}
              {vehicleStats.regionAvgFuelCostPerKm != null && (
                <span className="hint-inline">
                  {' '}
                  · {vehicleStats.regionAvgFuelCostPerKm.toFixed(2)} PLN/km
                </span>
              )}
              {vehicleStats.vsRegionConsumptionPct != null && (
                <span
                  className={
                    vehicleStats.vsRegionConsumptionPct > 5
                      ? 'hint-inline hint-warn'
                      : vehicleStats.vsRegionConsumptionPct < -5
                        ? 'hint-inline hint-ok'
                        : 'hint-inline'
                  }
                >
                  {' '}
                  (spalanie {vehicleStats.vsRegionConsumptionPct > 0 ? '+' : ''}
                  {vehicleStats.vsRegionConsumptionPct}% vs region)
                </span>
              )}
            </dd>
          </div>
        </dl>
      )}

      {!vehicleStats && fleetL100 != null && (
        <p className="stats-kpi-inline">
          Średnie spalanie floty w okresie (wg regionów): <strong>{fleetL100} L/100 km</strong>
        </p>
      )}

      {vehicleStats && vehicleStats.fuelLitersPer100Km == null && vehicleStats.fuelCount > 0 && (
        <p className="filter-hint">
          Brak przebiegu w okresie — spalanie wymaga kilometrów (Mileage na POC lub licznik na
          pojeździe). Odśwież katalog pojazdów.
        </p>
      )}

      {regionRows.length === 0 ? (
        <p className="empty-hint">Brak kosztów paliwa w wybranym okresie (DPD_POC).</p>
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
                    {r.fuelLitersPer100Km != null
                      ? ` · ${r.fuelLitersPer100Km.toFixed(1)} L/100km`
                      : ''}
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
                  <th className="col-numeric">L</th>
                  <th className="col-numeric">Przebieg</th>
                  <th className="col-numeric">L/100 km</th>
                  <th className="col-numeric">PLN/km</th>
                </tr>
              </thead>
              <tbody>
                {regionRows.map((r) => (
                  <tr key={r.region}>
                    <td>{r.region}</td>
                    <td className="col-numeric">{r.vehicleCount}</td>
                    <td className="col-numeric">
                      {r.fuelLiters > 0 ? r.fuelLiters.toFixed(1) : '—'}
                    </td>
                    <td className="col-numeric">
                      {r.drivenKm > 0 ? r.drivenKm.toLocaleString('pl-PL') : '—'}
                    </td>
                    <td className="col-numeric">
                      {r.fuelLitersPer100Km != null ? r.fuelLitersPer100Km.toFixed(1) : '—'}
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

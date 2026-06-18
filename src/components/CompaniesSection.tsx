import type { FleetCostStats } from '../services/fleetStats';
import type { CompanyCatalogData, CompanyCatalogItem } from '../services/companyCatalog';
import { vehiclesForCompany } from '../services/companyCatalog';
import type { HealthScoreResult } from '../utils/healthScore';
import { healthGradeClass } from '../utils/healthScore';
import type { VehicleCatalogItem } from '../services/vehicleCatalog';
import { FleetStatsPanel } from './FleetStatsPanel';
import { useI18n } from '../i18n/I18nProvider';
import { formatLocale } from '../i18n/uiLabels';

interface Props {
  catalog: CompanyCatalogData | null;
  loading: boolean;
  error: string | null;
  filtered: CompanyCatalogItem[];
  fleetVehicles: VehicleCatalogItem[];
  activeCompanyId: string | null;
  activeCompanyStats: FleetCostStats | null;
  activeCompanyHealth: HealthScoreResult | null;
  onSelectCompany: (id: string) => void;
  onRefresh: () => void;
  onOpenVehicle: (registration: string) => void;
  onExportCompanyPdf: () => void;
}

export function CompaniesSection({
  catalog,
  loading,
  error,
  filtered,
  fleetVehicles,
  activeCompanyId,
  activeCompanyStats,
  activeCompanyHealth,
  onSelectCompany,
  onRefresh,
  onOpenVehicle,
  onExportCompanyPdf,
}: Props) {
  const { t, locale } = useI18n();
  const fmt = formatLocale(locale);

  const active =
    activeCompanyId && catalog
      ? filtered.find((c) => c.id === activeCompanyId) ??
        catalog.companies.find((c) => c.id === activeCompanyId) ??
        null
      : null;
  const assigned = active ? vehiclesForCompany(fleetVehicles, active.name) : [];

  return (
    <div className="layout master-detail-layout">
      <section className="panel table-panel master-pane">
        <div className="panel-head">
          <h2>{t('companies.listTitle')}</h2>
          <button type="button" className="btn btn-ghost" disabled={loading} onClick={onRefresh}>
            {t('header.refreshCount', { count: catalog?.totalCompanies ?? '…' })}
          </button>
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('table.company')}</th>
                <th>{t('common.regionCity')}</th>
                <th className="col-numeric">{t('common.health')}</th>
                <th className="col-numeric">{t('common.costs')}</th>
                <th className="col-numeric">{t('companies.vehiclesCol')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="center">
                    {t('companies.loading')}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="center">
                    {catalog ? t('companies.noFilter') : t('companies.noData')}
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr
                    key={c.id}
                    className={activeCompanyId === c.id ? 'row-active' : ''}
                    onClick={() => onSelectCompany(c.id)}
                  >
                    <td>{c.name}</td>
                    <td>{c.areaLabel || '—'}</td>
                    <td className="col-numeric">
                      {c.healthGrade ? (
                        <span className={healthGradeClass(c.healthGrade)}>{c.healthScore}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="col-numeric">
                      {c.totalCost != null && c.totalCost > 0
                        ? c.totalCost.toLocaleString(fmt, { maximumFractionDigits: 0 })
                        : '—'}
                    </td>
                    <td className="col-numeric">{c.vehicleCount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel detail-panel detail-pane">
        {!active ? (
          <p className="placeholder">{t('companies.selectHintLong')}</p>
        ) : (
          <>
            <div className="detail-preview-card">
              <h3 className="section-title">{t('companies.previewTitle')}</h3>
              <dl className="detail-grid detail-grid-compact">
                <div className="detail-item">
                  <dt>{t('common.name')}</dt>
                  <dd>{active.name}</dd>
                </div>
                <div className="detail-item">
                  <dt>{t('common.regionCity')}</dt>
                  <dd>{active.areaLabel || '—'}</dd>
                </div>
                <div className="detail-item">
                  <dt>{t('companies.fleetVehicles')}</dt>
                  <dd>{active.vehicleCount}</dd>
                </div>
              </dl>
            </div>

            {activeCompanyStats && activeCompanyHealth && (
              <FleetStatsPanel
                stats={activeCompanyStats}
                health={activeCompanyHealth}
                title={t('companies.statsTitle')}
                onExportPdf={onExportCompanyPdf}
              />
            )}

            <h3 className="section-title">{t('companies.b2bVehicles')}</h3>
            <div className="table-wrap table-wrap-nested">
              <table>
                <thead>
                  <tr>
                    <th>{t('vehicles.registration')}</th>
                    <th>{t('common.regionCity')}</th>
                    <th className="col-numeric">{t('common.health')}</th>
                  </tr>
                </thead>
                <tbody>
                  {assigned.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="center">
                        {t('companies.noVehicles')}
                      </td>
                    </tr>
                  ) : (
                    assigned.map((v) => (
                      <tr key={v.id} onClick={() => onOpenVehicle(v.registration)}>
                        <td>{v.registration}</td>
                        <td>{v.areaLabel || '—'}</td>
                        <td className="col-numeric">
                          {v.healthGrade ? (
                            <span className={healthGradeClass(v.healthGrade)}>{v.healthScore}</span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="hint-small">{t('companies.clickRegistration')}</p>
          </>
        )}
      </section>
    </div>
  );
}

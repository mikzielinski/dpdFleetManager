import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PaginationCursor } from '@uipath/uipath-typescript/core';
import { AuthLoginScreen, BYPASS_AUTH, useAuth } from './hooks/useAuth';
import { usePolling } from './hooks/usePolling';
import { ORCHESTRATOR_RELEASE_NAME, PAGE_SIZE, TABLE_COLUMNS, type TableColumn } from './config';
import {
  displayField,
  downloadInvoiceBlob,
  fetchRecordById,
  fetchRecordsPage,
  fetchVehicleFlagHistory,
  loadEntityContext,
  translateRecord,
  updateRecordStatus,
  type EntityContext,
  type VehicleFlagHistoryItem,
} from './services/dataFabric';
import { GlobalFilterBar } from './components/GlobalFilterBar';
import {
  DEFAULT_CLAIMS_FILTERS,
  filterClaimRecords,
  getRecordNumericAmount,
  type ClaimsFilterState,
} from './utils/filterRecords';
import {
  findLatestInstance,
  isTerminalStatus,
  pollInstanceVariables,
  resolveMaestroTarget,
  startAnalysis,
  type AnalysisRun,
  type AnalysisVariables,
  type MaestroTarget,
} from './services/maestro';
import { AnalysisResults } from './components/AnalysisResults';
import { InvoicePreview } from './components/InvoicePreview';
import { VehicleCaseHistory } from './components/VehicleCaseHistory';
import {
  findInvoiceFileField,
  normalizeRegistration,
  pickField,
  recordId,
  type DpdRecord,
} from './utils/record';

export default function App() {
  const {
    sdk,
    isAuthenticated,
    isInitializing,
    authError,
    oauthUrlError,
    redirectUri,
    login,
    dismissOAuthError,
  } = useAuth();

  const [ctx, setCtx] = useState<EntityContext | null>(null);
  const ctxRef = useRef<EntityContext | null>(null);
  const [records, setRecords] = useState<DpdRecord[]>([]);
  const [cursor, setCursor] = useState<PaginationCursor | undefined>();
  const [cursorStack, setCursorStack] = useState<PaginationCursor[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [loadingTable, setLoadingTable] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeRecord, setActiveRecord] = useState<DpdRecord | null>(null);

  const [invoiceBlob, setInvoiceBlob] = useState<Blob | null>(null);
  const [invoiceMime, setInvoiceMime] = useState('application/octet-stream');
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  const [maestroTarget, setMaestroTarget] = useState<MaestroTarget | null>(null);
  const [maestroError, setMaestroError] = useState<string | null>(null);
  const [analysisRuns, setAnalysisRuns] = useState<AnalysisRun[]>([]);
  const [storedResults, setStoredResults] = useState<Record<string, AnalysisVariables>>({});
  const [globalBusy, setGlobalBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [recordTotal, setRecordTotal] = useState<number | null>(null);
  const [managerComment, setManagerComment] = useState('');
  const [decisionBusy, setDecisionBusy] = useState(false);

  const [vehicleHistory, setVehicleHistory] = useState<VehicleFlagHistoryItem[]>([]);
  const [vehicleHistoryLoading, setVehicleHistoryLoading] = useState(false);
  const [vehicleHistoryError, setVehicleHistoryError] = useState<string | null>(null);

  const [mainSection, setMainSection] = useState<'claims' | 'vehicles'>('claims');
  const [claimFilters, setClaimFilters] = useState<ClaimsFilterState>(DEFAULT_CLAIMS_FILTERS);
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [activeVehicleKey, setActiveVehicleKey] = useState<string | null>(null);

  const tableColumns: TableColumn[] = ctx?.tableColumns ?? TABLE_COLUMNS;

  const filteredRecords = useMemo(
    () => filterClaimRecords(records, tableColumns, claimFilters),
    [records, tableColumns, claimFilters],
  );

  const serviceOptions = useMemo(() => {
    const col = tableColumns.find((c) => c.key === 'serviceName');
    const set = new Set<string>();
    for (const r of records) {
      const v = col ? displayField(r, col) : pickField(r, 'serviceName');
      if (v && v !== '—') set.add(v);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pl'));
  }, [records, tableColumns]);

  const decisionOptions = useMemo(() => {
    const col = tableColumns.find((c) => c.key === 'decision');
    const set = new Set<string>();
    for (const r of records) {
      const v = col ? displayField(r, col) : pickField(r, 'decision');
      if (v && v !== '—') set.add(v);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pl'));
  }, [records, tableColumns]);

  const vehicleGroups = useMemo(() => {
    const map = new Map<string, { key: string; plateLabel: string; items: DpdRecord[] }>();
    for (const r of records) {
      const label = pickField(r, 'carRegistration');
      if (!label || label === '—') continue;
      const key = normalizeRegistration(label);
      let g = map.get(key);
      if (!g) {
        g = { key, plateLabel: label, items: [] };
        map.set(key, g);
      }
      g.items.push(r);
    }
    return [...map.values()].sort((a, b) => a.plateLabel.localeCompare(b.plateLabel, 'pl'));
  }, [records]);

  const filteredVehicleGroups = useMemo(() => {
    const raw = vehicleSearch.trim();
    const compact = raw.replace(/\s+/g, '').toLowerCase();
    if (!raw) return vehicleGroups;
    return vehicleGroups.filter((g) => {
      const plateNorm = normalizeRegistration(g.plateLabel).toLowerCase();
      const plateLoose = g.plateLabel.toLowerCase();
      return (
        (compact.length > 0 && plateNorm.includes(compact)) || plateLoose.includes(raw.toLowerCase())
      );
    });
  }, [vehicleGroups, vehicleSearch]);

  const activeVehicleGroup = useMemo(() => {
    if (!activeVehicleKey) return null;
    return vehicleGroups.find((g) => g.key === activeVehicleKey) ?? null;
  }, [activeVehicleKey, vehicleGroups]);

  const activeRun = analysisRuns.find(
    (r) => r.status === 'running' || r.status === 'starting',
  );

  const loadPage = useCallback(
    async (nextCursor?: PaginationCursor, resetStack = false) => {
      if (!isAuthenticated) return;
      setLoadingTable(true);
      setTableError(null);
      try {
        const page = await fetchRecordsPage(sdk, nextCursor, PAGE_SIZE);
        const maps = ctxRef.current?.choiceMaps ?? new Map();
        setRecords(page.items.map((r) => translateRecord(r, maps)));
        setCursor(page.nextCursor);
        setHasNext(page.hasNext);
        setRecordTotal(page.totalCount ?? page.items.length);
        if (resetStack) {
          setCursorStack([]);
          setPageIndex(0);
        }
      } catch (e) {
        setTableError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoadingTable(false);
      }
    },
    [sdk, isAuthenticated],
  );

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const entityCtx = await loadEntityContext(sdk);
        if (cancelled) return;
        ctxRef.current = entityCtx;
        setCtx(entityCtx);
        try {
          const target = await resolveMaestroTarget(sdk);
          if (cancelled) return;
          setMaestroTarget(target);
          setMaestroError(null);
        } catch (e) {
          if (!cancelled) {
            setMaestroTarget(null);
            setMaestroError(e instanceof Error ? e.message : String(e));
          }
        }
        await loadPage(undefined, true);
      } catch (e) {
        if (!cancelled) setTableError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, sdk, loadPage]);

  const selectRecord = useCallback(
    async (id: string) => {
      setActiveId(id);
      setInvoiceLoading(true);
      setInvoiceError(null);
      setInvoiceBlob(null);
      setVehicleHistory([]);
      setVehicleHistoryError(null);
      try {
        const rec = await fetchRecordById(sdk, id);
        const maps = ctxRef.current?.choiceMaps ?? new Map();
        const translated = translateRecord(rec, maps);
        setActiveRecord(translated);

        const carReg = pickField(translated, 'carRegistration');
        if (carReg !== '—') {
          setVehicleHistoryLoading(true);
          try {
            const history = await fetchVehicleFlagHistory(sdk, carReg, id);
            setVehicleHistory(history);
          } catch (e) {
            setVehicleHistoryError(e instanceof Error ? e.message : String(e));
          } finally {
            setVehicleHistoryLoading(false);
          }
        }

        const file = await downloadInvoiceBlob(
          sdk,
          translated,
          ctxRef.current?.fileFields ?? [],
        );
        if (file) {
          setInvoiceBlob(file.blob);
          setInvoiceMime(file.mime);
        } else if (!findInvoiceFileField(translated, ctxRef.current?.fileFields ?? [])) {
          setInvoiceError(
            'Nie znaleziono załącznika (pole Invoice File / InvoiceFile w Data Fabric).',
          );
        }
      } catch (e) {
        setInvoiceError(e instanceof Error ? e.message : String(e));
        setActiveRecord(null);
      } finally {
        setInvoiceLoading(false);
      }
    },
    [sdk],
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllPage = () => {
    const pageIds = filteredRecords.map((r) => recordId(r)).filter(Boolean);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const openVehicleInClaims = (plateQuery: string) => {
    setClaimFilters({ ...DEFAULT_CLAIMS_FILTERS, query: plateQuery });
    setMainSection('claims');
  };

  const runAnalysis = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!maestroTarget) {
      setStatusMsg(
        maestroError ??
          `Proces Maestro niedostępny — opublikuj ${ORCHESTRATOR_RELEASE_NAME} w folderze Shared/DPDDataInvestigator.`,
      );
      return;
    }
    setGlobalBusy(true);
    setStatusMsg(`Uruchamianie analizy Maestro (${ids.length})…`);
    const failures: string[] = [];

    for (const id of ids) {
      const startedAt = Date.now();
      const run: AnalysisRun = {
        recordIds: [id],
        folderKey: maestroTarget.folderKey,
        startedAt,
        status: 'starting',
      };
      setAnalysisRuns((prev) => [...prev, run]);

      try {
        await startAnalysis(sdk, maestroTarget, id);
        run.status = 'running';
        setAnalysisRuns((prev) => [...prev.slice(0, -1), { ...run, status: 'running' }]);

        let instanceId: string | undefined;
        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          instanceId = await findLatestInstance(sdk, maestroTarget, startedAt);
          if (instanceId) break;
        }
        if (!instanceId) throw new Error('Nie znaleziono instancji procesu po starcie.');

        run.instanceId = instanceId;
        setAnalysisRuns((prev) => [...prev.filter((x) => x.startedAt !== startedAt), { ...run, instanceId }]);
      } catch (e) {
        run.status = 'failed';
        run.error = e instanceof Error ? e.message : String(e);
        failures.push(run.error);
        setAnalysisRuns((prev) => [...prev.filter((x) => x.startedAt !== startedAt), run]);
      }
    }

    setGlobalBusy(false);
    if (failures.length > 0) {
      setStatusMsg(`Błąd analizy: ${failures.join('; ')}`);
    } else {
      setStatusMsg('Analiza uruchomiona — śledzenie postępu…');
    }
  };

  const pollTarget = activeRun?.instanceId;
  const pollFolder = activeRun?.folderKey;

  const pollFetch = useCallback(async () => {
    if (!pollTarget || !pollFolder) return null;
    return pollInstanceVariables(sdk, pollTarget, pollFolder);
  }, [sdk, pollTarget, pollFolder]);

  const { data: polledVars } = usePolling({
    fetchFn: pollFetch,
    enabled: !!pollTarget && !!pollFolder && isAuthenticated,
    interval: 5000,
    deps: [pollTarget],
  });

  useEffect(() => {
    if (!polledVars || !activeRun?.instanceId) return;
    const rid = polledVars.recordId ?? activeRun.recordIds[0];
    if (rid && (polledVars.fleetManagerNote || polledVars.combinedScore || polledVars.riskLevel)) {
      setStoredResults((prev) => ({ ...prev, [rid]: polledVars }));
    }
    if (isTerminalStatus(polledVars.latestRunStatus ?? polledVars.runStatus)) {
      setAnalysisRuns((prev) =>
        prev.map((r) =>
          r.instanceId === activeRun.instanceId
            ? { ...r, status: 'completed', variables: polledVars }
            : r,
        ),
      );
      setStatusMsg('Analiza zakończona.');
      if (activeId) void selectRecord(activeId);
    }
  }, [polledVars, activeRun, activeId, selectRecord]);

  const activeResults = useMemo(() => {
    if (!activeId) return null;
    return storedResults[activeId] ?? null;
  }, [activeId, storedResults]);

  const onRowClick = (r: DpdRecord) => {
    const id = recordId(r);
    if (id) void selectRecord(id);
  };

  const submitManagerDecision = async (status: string) => {
    if (!activeId || decisionBusy) return;
    setDecisionBusy(true);
    setStatusMsg(null);
    try {
      await updateRecordStatus(sdk, activeId, status, managerComment);
      setStatusMsg(`Zapisano decyzję: ${status}`);
      await loadPage(undefined, true);
      await selectRecord(activeId);
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setDecisionBusy(false);
    }
  };

  if (!BYPASS_AUTH && !isAuthenticated) {
    return (
      <AuthLoginScreen
        authError={authError}
        oauthUrlError={oauthUrlError}
        redirectUri={redirectUri}
        isInitializing={isInitializing}
        onLogin={() => void login()}
        onDismissOAuthError={() => dismissOAuthError()}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="header">
        <div className="header-left">
          <div className="dpd-logo">DPD</div>
          <span className="header-sep">|</span>
          <span className="header-title">Fleet Manager — koszty kierowców</span>
        </div>
        <div className="header-actions">
          {maestroTarget && (
            <span className="badge badge-muted" title={maestroTarget.processKey}>
              Maestro: {maestroTarget.name}
            </span>
          )}
          <button
            type="button"
            className="btn btn-analyze"
            disabled={globalBusy || selectedIds.size === 0 || !maestroTarget}
            title={!maestroTarget ? maestroError ?? 'Brak procesu Maestro' : undefined}
            onClick={() => void runAnalysis([...selectedIds])}
          >
            Analizuj zaznaczone ({selectedIds.size})
          </button>
          <button
            type="button"
            className="btn btn-analyze"
            disabled={globalBusy || !activeId || !maestroTarget}
            title={!maestroTarget ? maestroError ?? 'Brak procesu Maestro' : undefined}
            onClick={() => activeId && void runAnalysis([activeId])}
          >
            Analizuj bieżący
          </button>
        </div>
      </header>

      <nav className="main-nav" aria-label="Nawigacja główna">
        <button
          type="button"
          className={mainSection === 'claims' ? 'main-nav-btn main-nav-btn-active' : 'main-nav-btn'}
          onClick={() => setMainSection('claims')}
        >
          Zgłoszenia DPD_POC
        </button>
        <button
          type="button"
          className={mainSection === 'vehicles' ? 'main-nav-btn main-nav-btn-active' : 'main-nav-btn'}
          onClick={() => {
            setMainSection('vehicles');
            setActiveVehicleKey(null);
          }}
        >
          Pojazdy
        </button>
      </nav>

      <GlobalFilterBar
        section={mainSection}
        filters={claimFilters}
        onFiltersChange={setClaimFilters}
        vehicleSearch={vehicleSearch}
        onVehicleSearchChange={setVehicleSearch}
        serviceOptions={serviceOptions}
        decisionOptions={decisionOptions}
        filteredCount={
          mainSection === 'claims' ? filteredRecords.length : filteredVehicleGroups.length
        }
        totalCount={mainSection === 'claims' ? records.length : vehicleGroups.length}
        onReset={() => {
          setClaimFilters(DEFAULT_CLAIMS_FILTERS);
          setVehicleSearch('');
        }}
      />

      {activeRun && (
        <div className="progress-banner">
          <div className="loading-spinner small" />
          <span>
            Analiza w toku (instancja {activeRun.instanceId?.slice(0, 8) ?? '…'}) —{' '}
            {polledVars?.latestRunStatus ?? 'Running'}
          </span>
        </div>
      )}

      {maestroError && !maestroTarget && (
        <div className="progress-banner">
          <span>Maestro: {maestroError}</span>
        </div>
      )}

      {statusMsg && !activeRun && <div className="info-banner">{statusMsg}</div>}

      <div className="main-workspace">
        {mainSection === 'claims' ? (
          <div className="layout master-detail-layout">
            <section className="panel table-panel master-pane">
              <div className="panel-head">
                <h2>Zgłoszenia DPD_POC</h2>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void loadPage(undefined, true)}
                >
                  Odśwież zgłoszenia ({recordTotal ?? records.length})
                </button>
              </div>

              {tableError && <p className="error-text">{tableError}</p>}

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          checked={
                            filteredRecords.length > 0 &&
                            filteredRecords.every((r) => selectedIds.has(recordId(r)))
                          }
                          onChange={toggleSelectAllPage}
                        />
                      </th>
                      {tableColumns.map((c) => (
                        <th key={c.key}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loadingTable ? (
                      <tr>
                        <td colSpan={tableColumns.length + 1} className="center">
                          Ładowanie…
                        </td>
                      </tr>
                    ) : filteredRecords.length === 0 ? (
                      <tr>
                        <td colSpan={tableColumns.length + 1} className="center">
                          {records.length === 0
                            ? 'Brak zgłoszeń na tej stronie.'
                            : `Brak wierszy spełniających filtry (${records.length} rekordów na stronie).`}
                        </td>
                      </tr>
                    ) : (
                      filteredRecords.map((r) => {
                        const id = recordId(r);
                        const selected = id === activeId;
                        return (
                          <tr
                            key={id}
                            className={selected ? 'row-active' : ''}
                            onClick={() => onRowClick(r)}
                          >
                            <td onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedIds.has(id)}
                                onChange={() => toggleSelect(id)}
                              />
                            </td>
                            {tableColumns.map((c) => (
                              <td key={c.key}>{displayField(r, c)}</td>
                            ))}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="pager">
                <button
                  type="button"
                  disabled={pageIndex === 0}
                  onClick={() => {
                    const prev = cursorStack[cursorStack.length - 1];
                    setCursorStack((s) => s.slice(0, -1));
                    setPageIndex((p) => Math.max(0, p - 1));
                    void loadPage(prev);
                  }}
                >
                  ← Poprzednia
                </button>
                <span>Strona {pageIndex + 1}</span>
                <button
                  type="button"
                  disabled={!hasNext}
                  onClick={() => {
                    setCursorStack((s) => [...s, cursor!]);
                    setPageIndex((p) => p + 1);
                    void loadPage(cursor);
                  }}
                >
                  Następna →
                </button>
              </div>
            </section>

            <section className="panel detail-panel detail-pane">
              {!activeRecord ? (
                <p className="placeholder">Wybierz wiersz, aby zobaczyć szczegóły i fakturę.</p>
              ) : (
                <>
                  <div className="meta-row">
                    <span className="meta-label">Record ID:</span>
                    <span className="meta-value">{recordId(activeRecord)}</span>
                  </div>

                  <div className="detail-split">
                    <div className="detail-split-main">
                      <h3 className="section-title">Szczegóły zgłoszenia</h3>
                      <dl className="detail-grid">
                        {[
                          'carRegistration',
                          'serviceName',
                          'serviceDescription',
                          'companyName',
                          'taxId',
                          'amount',
                          'netPrice',
                          'totalPrice',
                          'date',
                          'invoiceFileName',
                          'decision',
                          'anomalyReason',
                          'comments',
                          'riskLevel',
                          'combinedScore',
                          'flagType',
                          'fleetManagerNote',
                        ].map((key) => (
                          <div key={key} className="detail-item">
                            <dt>{key}</dt>
                            <dd>{pickField(activeRecord, key)}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>

                    <aside className="detail-split-preview">
                      <h3 className="section-title">Szybki podgląd faktury</h3>
                      <InvoicePreview
                        blob={invoiceBlob}
                        mime={invoiceMime}
                        loading={invoiceLoading}
                        error={invoiceError}
                      />
                    </aside>
                  </div>

                  <VehicleCaseHistory
                    items={vehicleHistory}
                    loading={vehicleHistoryLoading}
                    error={vehicleHistoryError}
                    carRegistration={pickField(activeRecord, 'carRegistration')}
                  />

                  <AnalysisResults results={activeResults} />

                  <div className="decision-hint">
                    <p className="section-sub">Decyzja managera</p>
                    <textarea
                      className="manager-comment"
                      rows={3}
                      placeholder="Komentarz do decyzji (opcjonalnie)…"
                      value={managerComment}
                      onChange={(e) => setManagerComment(e.target.value)}
                    />
                    <div className="action-buttons preview-actions">
                      <button
                        type="button"
                        className="btn btn-approve"
                        disabled={decisionBusy || globalBusy}
                        onClick={() => void submitManagerDecision('Approved')}
                      >
                        ✓ Zatwierdź
                      </button>
                      <button
                        type="button"
                        className="btn btn-reject"
                        disabled={decisionBusy || globalBusy}
                        onClick={() => void submitManagerDecision('Rejected')}
                      >
                        ✗ Odrzuć
                      </button>
                      <button
                        type="button"
                        className="btn btn-clarify"
                        disabled={decisionBusy || globalBusy}
                        onClick={() => void submitManagerDecision('Clarification')}
                      >
                        ? Wyjaśnij
                      </button>
                      <button
                        type="button"
                        className="btn btn-escalate"
                        disabled={decisionBusy || globalBusy || !maestroTarget}
                        onClick={() => activeId && void runAnalysis([activeId])}
                      >
                        ↑ Analizuj (Maestro)
                      </button>
                    </div>
                    <p className="hint-small">
                      Zatwierdź/Odrzuć zapisuje Status w encji DPD_POC. „Analizuj” uruchamia{' '}
                      {ORCHESTRATOR_RELEASE_NAME} w folderze Shared/DPDDataInvestigator.
                    </p>
                  </div>
                </>
              )}
            </section>
          </div>
        ) : (
          <div className="layout master-detail-layout">
            <section className="panel table-panel master-pane">
              <div className="panel-head">
                <h2>Lista pojazdów</h2>
                <span className="panel-head-meta">{vehicleGroups.length} pojazdów na tej stronie</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Pojazd</th>
                      <th>Zgłoszeń</th>
                      <th className="col-numeric">Suma netto (strona)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVehicleGroups.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="center">
                          Brak pojazdów do wyświetlenia (sprawdź dane na bieżącej stronie zgłoszeń).
                        </td>
                      </tr>
                    ) : (
                      filteredVehicleGroups.map((g) => {
                        const sumNet = g.items.reduce(
                          (acc, r) => acc + (getRecordNumericAmount(r) ?? 0),
                          0,
                        );
                        const selectedV = activeVehicleKey === g.key;
                        return (
                          <tr
                            key={g.key}
                            className={selectedV ? 'row-active' : ''}
                            onClick={() => setActiveVehicleKey(g.key)}
                          >
                            <td>{g.plateLabel}</td>
                            <td>{g.items.length}</td>
                            <td className="col-numeric">
                              {sumNet.toLocaleString('pl-PL', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel detail-panel detail-pane">
              {!activeVehicleGroup ? (
                <p className="placeholder">
                  Wybierz pojazd z listy po lewej, aby zobaczyć skrót kosztów i przejść do zgłoszeń.
                </p>
              ) : (
                <>
                  <div className="detail-preview-card">
                    <h3 className="section-title">Podgląd pojazdu</h3>
                    <div className="meta-row">
                      <span className="meta-label">Rejestracja:</span>
                      <span className="meta-value">{activeVehicleGroup.plateLabel}</span>
                    </div>
                    <p className="hint-small">
                      {activeVehicleGroup.items.length} pozycji kosztów na tej stronie · suma netto:{' '}
                      {activeVehicleGroup.items
                        .reduce((acc, r) => acc + (getRecordNumericAmount(r) ?? 0), 0)
                        .toLocaleString('pl-PL', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                    </p>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => openVehicleInClaims(activeVehicleGroup.plateLabel)}
                    >
                      Otwórz zgłoszenia dla tego pojazdu
                    </button>
                  </div>

                  <h3 className="section-title">Koszty na bieżącej stronie</h3>
                  <div className="table-wrap table-wrap-nested">
                    <table>
                      <thead>
                        <tr>
                          <th>Usługa</th>
                          <th className="col-numeric">Kwota netto</th>
                          <th>Decyzja</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeVehicleGroup.items.map((r, idx) => {
                          const id = recordId(r);
                          return (
                            <tr
                              key={id || `row-${idx}`}
                              className={id === activeId ? 'row-active' : ''}
                              onClick={() => {
                                if (!id) return;
                                setMainSection('claims');
                                void selectRecord(id);
                              }}
                            >
                              <td>{pickField(r, 'serviceName')}</td>
                              <td className="col-numeric">{pickField(r, 'netPrice')}</td>
                              <td>{pickField(r, 'decision')}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="hint-small">
                    Kliknij wiersz, aby przejść do widoku zgłoszenia (master-detail) z fakturą i decyzją.
                  </p>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

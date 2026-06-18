import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PaginationCursor } from '@uipath/uipath-typescript/core';
import { AuthLoginScreen, BYPASS_AUTH, useAuth } from './hooks/useAuth';
import { usePolling } from './hooks/usePolling';
import {
  DETAIL_FIELD_KEYS,
  DETAIL_OPTIONAL_FIELDS,
  ORCHESTRATOR_RELEASE_NAME,
  PAGE_SIZE,
  TABLE_COLUMNS,
  type TableColumn,
} from './config';
import {
  displayField,
  downloadInvoiceBlob,
  fetchAllDpdRecords,
  fetchRecordById,
  fetchRecordsPage,
  fetchVehicleFlagForCostRecord,
  fetchVehicleFlagHistory,
  formatDataFabricWriteError,
  loadEntityContext,
  markDriverCorrectionReceived,
  requestInvoiceCorrection,
  translateRecord,
  updateRecordStatus,
  type EntityContext,
  type VehicleFlagHistoryItem,
} from './services/dataFabric';
import { CompaniesSection } from './components/CompaniesSection';
import { CompliancePanel } from './components/CompliancePanel';
import { FleetStatsPanel } from './components/FleetStatsPanel';
import { GlobalFilterBar } from './components/GlobalFilterBar';
import { LanguageSettings } from './components/LanguageSettings';
import { LanguageSettingsCard } from './components/LanguageSettingsCard';
import { InsightsSection } from './components/InsightsSection';
import { SettingsSection } from './components/SettingsSection';
import { useI18n } from './i18n/I18nProvider';
import {
  formatLocale,
  localizedFieldLabel,
  localizedTableColumns,
} from './i18n/uiLabels';
import {
  DEFAULT_CLAIMS_FILTERS,
  filterClaimRecords,
  getRecordNumericAmount,
  needsFullDatasetFilters,
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
  filterCompanyCatalog,
  loadCompanyCatalog,
  type CompanyCatalogData,
} from './services/companyCatalog';
import {
  fleetMedianCostPerClaim,
  statsForCompany,
  statsForFleet,
  statsForVehicle,
} from './services/fleetStats';
import {
  downloadCompanyReportPdf,
  downloadFleetSummaryPdf,
  downloadVehicleReportPdf,
} from './services/reportPdf';
import {
  buildPocCountByVehicleId,
  filterVehicleCatalog,
  loadVehicleCatalog,
  matchCostsToVehicle,
  type VehicleCatalogData,
  type VehicleCatalogItem,
} from './services/vehicleCatalog';
import { computeHealthScore } from './utils/healthScore';
import {
  buildDriverCorrectionUrl,
  isAwaitingDriverCorrection,
  isDriverCorrected,
  isTrustedDriverMessageOrigin,
  parseDriverCorrectionResolved,
} from './utils/driverIntegration';
import { extractVehicleCompliance } from './utils/vehicleCompliance';
import {
  DEFAULT_COMPANY_FILTERS,
  type CompanyFilterState,
} from './utils/companyFilters';
import { analysisFromRecord } from './utils/analysisFromRecord';
import { buildInsightRecords } from './utils/insightsEngine';
import {
  findInvoiceFileField,
  normalizeRegistration,
  pickField,
  recordId,
  type DpdRecord,
} from './utils/record';
import { DEFAULT_VEHICLE_FILTERS, type VehicleFilterState } from './utils/vehicleFilters';
import {
  enrichRecordForDetailView,
  pickDetailField,
  type DetailEnrichmentContext,
} from './utils/detailRecord';

export default function App() {
  const { t, locale } = useI18n();
  const fmt = formatLocale(locale);
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
  const [driverAlerts, setDriverAlerts] = useState<
    Array<{ id: string; recordId: string; message: string; at: string }>
  >([]);

  const [vehicleHistory, setVehicleHistory] = useState<VehicleFlagHistoryItem[]>([]);
  const [vehicleHistoryLoading, setVehicleHistoryLoading] = useState(false);
  const [vehicleHistoryError, setVehicleHistoryError] = useState<string | null>(null);
  const [activeVehicleFlag, setActiveVehicleFlag] = useState<VehicleFlagHistoryItem | null>(null);

  const [mainSection, setMainSection] = useState<
    'claims' | 'vehicles' | 'companies' | 'dashboard' | 'insights' | 'settings'
  >('claims');
  const [claimFilters, setClaimFilters] = useState<ClaimsFilterState>(DEFAULT_CLAIMS_FILTERS);
  const [vehicleFilters, setVehicleFilters] = useState<VehicleFilterState>(DEFAULT_VEHICLE_FILTERS);
  const [vehicleCatalog, setVehicleCatalog] = useState<VehicleCatalogData | null>(null);
  const [vehicleCatalogLoading, setVehicleCatalogLoading] = useState(false);
  const [vehicleCatalogError, setVehicleCatalogError] = useState<string | null>(null);
  const [allPocCosts, setAllPocCosts] = useState<DpdRecord[]>([]);
  const [activeVehicleId, setActiveVehicleId] = useState<string | null>(null);
  const [companyCatalog, setCompanyCatalog] = useState<CompanyCatalogData | null>(null);
  const [companyCatalogLoading, setCompanyCatalogLoading] = useState(false);
  const [companyCatalogError, setCompanyCatalogError] = useState<string | null>(null);
  const [companyFilters, setCompanyFilters] = useState<CompanyFilterState>(DEFAULT_COMPANY_FILTERS);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);

  const tableColumns: TableColumn[] = ctx?.tableColumns ?? TABLE_COLUMNS;

  const displayTableColumns = useMemo(
    () => localizedTableColumns(tableColumns, t),
    [tableColumns, t],
  );

  const globalFilterActive = useMemo(
    () => needsFullDatasetFilters(claimFilters),
    [claimFilters],
  );

  const filteredRecords = useMemo(
    () => filterClaimRecords(records, tableColumns, claimFilters),
    [records, tableColumns, claimFilters],
  );

  const filteredPageCount = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE) || 1);

  const displayRecords = useMemo(() => {
    if (!globalFilterActive) return filteredRecords;
    const start = pageIndex * PAGE_SIZE;
    return filteredRecords.slice(start, start + PAGE_SIZE);
  }, [globalFilterActive, filteredRecords, pageIndex]);

  const prevGlobalFilterRef = useRef(false);

  const serviceOptions = useMemo(() => {
    const col = tableColumns.find((c) => c.key === 'serviceName');
    const set = new Set<string>();
    for (const r of records) {
      const v = col ? displayField(r, col) : pickField(r, 'serviceName');
      if (v && v !== '—') set.add(v);
    }
    return [...set].sort((a, b) => a.localeCompare(b, locale));
  }, [records, tableColumns, locale]);

  const decisionOptions = useMemo(() => {
    const col = tableColumns.find((c) => c.key === 'decision');
    const set = new Set<string>();
    for (const r of records) {
      const v = col ? displayField(r, col) : pickField(r, 'decision');
      if (v && v !== '—') set.add(v);
    }
    return [...set].sort((a, b) => a.localeCompare(b, locale));
  }, [records, tableColumns, locale]);

  const fleetMedianCost = useMemo(
    () => fleetMedianCostPerClaim(allPocCosts),
    [allPocCosts],
  );

  const enrichedVehicles = useMemo((): VehicleCatalogItem[] => {
    if (!vehicleCatalog) return [];
    return vehicleCatalog.vehicles.map((v) => {
      const compliance = v.compliance ?? extractVehicleCompliance(v.raw, v.registration);
      const stats = statsForVehicle(
        v,
        allPocCosts,
        vehicleCatalog.pocVehicleFieldNames,
        tableColumns,
      );
      const health = computeHealthScore({
        stats,
        complianceIssueCount: compliance.complianceIssues.length,
        fleetMedianCostPerClaim: fleetMedianCost,
      });
      return {
        ...v,
        compliance,
        healthScore: health.score,
        healthGrade: health.grade,
        totalCost: stats.totalCost,
      };
    });
  }, [vehicleCatalog, allPocCosts, tableColumns, fleetMedianCost]);

  const filteredVehicles = useMemo(() => {
    return filterVehicleCatalog(enrichedVehicles, vehicleFilters);
  }, [enrichedVehicles, vehicleFilters]);

  const enrichedCompanies = useMemo(() => {
    if (!companyCatalog) return [];
    return companyCatalog.companies.map((c) => {
      const stats = statsForCompany(
        c.name,
        enrichedVehicles,
        allPocCosts,
        vehicleCatalog?.pocVehicleFieldNames ?? [],
        tableColumns,
      );
      const health = computeHealthScore({
        stats,
        complianceIssueCount: 0,
        fleetMedianCostPerClaim: fleetMedianCost,
      });
      return {
        ...c,
        healthScore: health.score,
        healthGrade: health.grade,
        totalCost: stats.totalCost,
      };
    });
  }, [companyCatalog, enrichedVehicles, allPocCosts, vehicleCatalog, tableColumns, fleetMedianCost]);

  const filteredCompanies = useMemo(() => {
    const base = enrichedCompanies.length ? enrichedCompanies : (companyCatalog?.companies ?? []);
    return filterCompanyCatalog(base, companyFilters);
  }, [enrichedCompanies, companyCatalog, companyFilters]);

  const vehicleIdsByPlate = useMemo(() => {
    const map = new Map<string, string>();
    if (!vehicleCatalog) return map;
    for (const v of vehicleCatalog.vehicles) {
      if (!v.registration.trim() || !v.id) continue;
      map.set(normalizeRegistration(v.registration), v.id);
    }
    return map;
  }, [vehicleCatalog]);

  const pocCountByVehicleId = useMemo(() => {
    if (!vehicleCatalog?.pocVehicleFieldNames.length) return new Map<string, number>();
    return buildPocCountByVehicleId(
      allPocCosts,
      vehicleCatalog.pocVehicleFieldNames,
      vehicleIdsByPlate,
    );
  }, [allPocCosts, vehicleCatalog, vehicleIdsByPlate]);

  const activeVehicle = useMemo((): VehicleCatalogItem | null => {
    if (!activeVehicleId) return null;
    return enrichedVehicles.find((v) => v.id === activeVehicleId) ?? null;
  }, [activeVehicleId, enrichedVehicles]);

  const activeVehicleStats = useMemo(() => {
    if (!activeVehicle || !vehicleCatalog) return null;
    return statsForVehicle(
      activeVehicle,
      allPocCosts,
      vehicleCatalog.pocVehicleFieldNames,
      tableColumns,
    );
  }, [activeVehicle, allPocCosts, vehicleCatalog, tableColumns]);

  const activeVehicleHealth = useMemo(() => {
    if (!activeVehicleStats || !activeVehicle) return null;
    return computeHealthScore({
      stats: activeVehicleStats,
      complianceIssueCount: activeVehicle.compliance?.complianceIssues.length ?? 0,
      fleetMedianCostPerClaim: fleetMedianCost,
    });
  }, [activeVehicleStats, activeVehicle, fleetMedianCost]);

  const activeCompany = useMemo(() => {
    if (!activeCompanyId) return null;
    return filteredCompanies.find((c) => c.id === activeCompanyId) ?? null;
  }, [activeCompanyId, filteredCompanies]);

  const activeCompanyStats = useMemo(() => {
    if (!activeCompany || !vehicleCatalog) return null;
    return statsForCompany(
      activeCompany.name,
      enrichedVehicles,
      allPocCosts,
      vehicleCatalog.pocVehicleFieldNames,
      tableColumns,
    );
  }, [activeCompany, enrichedVehicles, allPocCosts, vehicleCatalog, tableColumns]);

  const activeCompanyHealth = useMemo(() => {
    if (!activeCompanyStats) return null;
    return computeHealthScore({
      stats: activeCompanyStats,
      complianceIssueCount: 0,
      fleetMedianCostPerClaim: fleetMedianCost,
    });
  }, [activeCompanyStats, fleetMedianCost]);

  const fleetStats = useMemo(
    () => statsForFleet(allPocCosts, tableColumns),
    [allPocCosts, tableColumns],
  );

  const fleetHealth = useMemo(
    () =>
      computeHealthScore({
        stats: fleetStats,
        complianceIssueCount: 0,
        fleetMedianCostPerClaim: fleetMedianCost,
      }),
    [fleetStats, fleetMedianCost],
  );

  const insightRecords = useMemo(
    () => buildInsightRecords(allPocCosts, tableColumns, fleetMedianCost),
    [allPocCosts, tableColumns, fleetMedianCost],
  );

  const activeVehicleCosts = useMemo(() => {
    if (!activeVehicle || !vehicleCatalog) return [];
    return matchCostsToVehicle(
      allPocCosts,
      activeVehicle,
      vehicleCatalog.pocVehicleFieldNames,
    );
  }, [activeVehicle, allPocCosts, vehicleCatalog]);

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

  const loadAllForFilters = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoadingTable(true);
    setTableError(null);
    try {
      const all = await fetchAllDpdRecords(sdk);
      const maps = ctxRef.current?.choiceMaps ?? new Map();
      setRecords(all.items.map((r) => translateRecord(r, maps)));
      setRecordTotal(all.totalCount);
      setHasNext(false);
      setCursor(undefined);
      setCursorStack([]);
      setPageIndex(0);
    } catch (e) {
      setTableError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingTable(false);
    }
  }, [sdk, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (globalFilterActive) {
      void loadAllForFilters();
    } else if (prevGlobalFilterRef.current) {
      void loadPage(undefined, true);
    }
    prevGlobalFilterRef.current = globalFilterActive;
  }, [globalFilterActive, isAuthenticated, loadAllForFilters, loadPage]);

  useEffect(() => {
    if (globalFilterActive) setPageIndex(0);
  }, [claimFilters, globalFilterActive]);

  const loadVehicleTabData = useCallback(async () => {
    if (!isAuthenticated) return;
    setVehicleCatalogLoading(true);
    setVehicleCatalogError(null);
    try {
      const pocPage = await fetchAllDpdRecords(sdk);
      const maps = ctxRef.current?.choiceMaps ?? new Map();
      const pocItems = pocPage.items.map((r) => translateRecord(r, maps));
      const catalog = await loadVehicleCatalog(sdk, pocItems);
      setVehicleCatalog(catalog);
      setAllPocCosts(pocItems);
    } catch (e) {
      setVehicleCatalogError(e instanceof Error ? e.message : String(e));
      setVehicleCatalog(null);
      setAllPocCosts([]);
    } finally {
      setVehicleCatalogLoading(false);
    }
  }, [sdk, isAuthenticated]);

  useEffect(() => {
    if (mainSection !== 'vehicles' && mainSection !== 'dashboard' && mainSection !== 'insights') return;
    if (!isAuthenticated) return;
    if (vehicleCatalog || vehicleCatalogLoading) return;
    void loadVehicleTabData();
  }, [mainSection, isAuthenticated, vehicleCatalog, vehicleCatalogLoading, loadVehicleTabData]);

  useEffect(() => {
    if (mainSection === 'vehicles') setActiveVehicleId(null);
  }, [vehicleFilters, mainSection]);

  useEffect(() => {
    if (mainSection === 'companies') setActiveCompanyId(null);
  }, [companyFilters, mainSection]);

  const loadCompanyTabData = useCallback(async () => {
    if (!isAuthenticated) return;
    setCompanyCatalogLoading(true);
    setCompanyCatalogError(null);
    try {
      let fleet = vehicleCatalog?.vehicles ?? [];
      if (!vehicleCatalog) {
        const pocPage = await fetchAllDpdRecords(sdk);
        const maps = ctxRef.current?.choiceMaps ?? new Map();
        const pocItems = pocPage.items.map((r) => translateRecord(r, maps));
        const cat = await loadVehicleCatalog(sdk, pocItems);
        setVehicleCatalog(cat);
        setAllPocCosts(pocItems);
        fleet = cat.vehicles;
      }
      const companies = await loadCompanyCatalog(sdk, fleet);
      setCompanyCatalog(companies);
    } catch (e) {
      setCompanyCatalogError(e instanceof Error ? e.message : String(e));
      setCompanyCatalog(null);
    } finally {
      setCompanyCatalogLoading(false);
    }
  }, [sdk, isAuthenticated, vehicleCatalog]);

  useEffect(() => {
    if (mainSection !== 'companies' && mainSection !== 'dashboard') return;
    if (!isAuthenticated) return;
    if (companyCatalog || companyCatalogLoading) return;
    if (mainSection === 'dashboard' && !vehicleCatalog) return;
    void loadCompanyTabData();
  }, [mainSection, isAuthenticated, companyCatalog, companyCatalogLoading, vehicleCatalog, loadCompanyTabData]);

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
            const msg = e instanceof Error ? e.message : String(e);
            setMaestroError(
              /authentication failed|insufficient_scope|401/i.test(msg)
                ? `${msg} — wyloguj się i zaloguj ponownie (token musi mieć OR.Execution, OR.Jobs, OR.Folders.Read).`
                : msg,
            );
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
      setActiveVehicleFlag(null);
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
          try {
            const linkedFlag = await fetchVehicleFlagForCostRecord(sdk, id, carReg);
            setActiveVehicleFlag(linkedFlag);
          } catch {
            setActiveVehicleFlag(null);
          }
        } else {
          try {
            const linkedFlag = await fetchVehicleFlagForCostRecord(sdk, id);
            setActiveVehicleFlag(linkedFlag);
          } catch {
            setActiveVehicleFlag(null);
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
          setInvoiceError(t('claims.invoiceMissing'));
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
    const pageIds = displayRecords.map((r) => recordId(r)).filter(Boolean);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const openVehicleInFleet = (registration: string) => {
    setMainSection('vehicles');
    setVehicleFilters({ ...DEFAULT_VEHICLE_FILTERS, query: registration });
    setActiveVehicleId(null);
    const v = vehicleCatalog?.vehicles.find(
      (x) => normalizeRegistration(x.registration) === normalizeRegistration(registration),
    );
    if (v) setActiveVehicleId(v.id);
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
      setStatusMsg(t('claims.analysisStarted'));
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
      setStatusMsg(t('claims.analysisDone'));
      if (activeId) void selectRecord(activeId);
    }
  }, [polledVars, activeRun, activeId, selectRecord]);

  const activeResults = useMemo(() => {
    if (!activeId) return null;
    const stored = storedResults[activeId];
    if (stored) return stored;
    if (!activeRecord) return null;
    return analysisFromRecord(activeRecord, activeVehicleFlag);
  }, [activeId, storedResults, activeRecord, activeVehicleFlag]);

  const detailContext = useMemo((): DetailEnrichmentContext => {
    return {
      analysis: activeResults,
      vehicleFlag: activeVehicleFlag,
      fileFields: ctx?.fileFields ?? [],
    };
  }, [activeResults, activeVehicleFlag, ctx?.fileFields]);

  const detailRecord = useMemo(() => {
    if (!activeRecord) return null;
    return enrichRecordForDetailView(activeRecord, detailContext);
  }, [activeRecord, detailContext]);

  useEffect(() => {
    if (detailRecord && import.meta.env.DEV) {
      (window as Window & { __lastRecord?: DpdRecord }).__lastRecord = detailRecord;
    }
  }, [detailRecord]);

  const invoiceDownloadUrl = useMemo(() => {
    if (!invoiceBlob) return null;
    return URL.createObjectURL(invoiceBlob);
  }, [invoiceBlob]);

  useEffect(() => {
    return () => {
      if (invoiceDownloadUrl) URL.revokeObjectURL(invoiceDownloadUrl);
    };
  }, [invoiceDownloadUrl]);

  const invoiceDownloadName = useMemo(() => {
    if (!detailRecord) return t('claims.invoiceDefaultName');
    const name = pickDetailField(detailRecord, 'invoiceFileName', detailContext);
    return name !== '—' ? name : t('claims.invoiceDefaultName');
  }, [detailRecord, detailContext]);

  const visibleDetailFields = useMemo(() => {
    const optional = new Set<string>(DETAIL_OPTIONAL_FIELDS);
    const fileFields = ctx?.fileFields ?? [];
    const hasInvoiceAttachment =
      (activeRecord && !!findInvoiceFileField(activeRecord, fileFields)) ||
      !!invoiceBlob ||
      invoiceLoading;

    return DETAIL_FIELD_KEYS.filter((key) => {
      if (key === 'invoiceFileName') {
        return hasInvoiceAttachment && (!!invoiceBlob || invoiceLoading);
      }
      if (!optional.has(key)) return true;
      if (!detailRecord && !activeRecord) return false;
      const val = detailRecord
        ? pickDetailField(detailRecord, key, detailContext)
        : pickField(activeRecord!, key);
      return val !== '—';
    });
  }, [
    activeRecord,
    detailRecord,
    detailContext,
    invoiceBlob,
    invoiceLoading,
    ctx?.fileFields,
  ]);

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
      setManagerComment('');
      await loadPage(undefined, true);
      await selectRecord(activeId);
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setDecisionBusy(false);
    }
  };

  const submitInvoiceRequest = async () => {
    if (!activeId || decisionBusy) return;
    const message = managerComment.trim() || t('claims.defaultInvoiceMessage');
    setDecisionBusy(true);
    setStatusMsg(null);
    try {
      await requestInvoiceCorrection(sdk, activeId, message);
      setStatusMsg(t('banner.invoiceRequestSuccess'));
      setManagerComment('');
      await loadPage(undefined, true);
      await selectRecord(activeId);
    } catch (e) {
      setStatusMsg(formatDataFabricWriteError(e));
    } finally {
      setDecisionBusy(false);
    }
  };

  const handleDriverCorrectionResolved = useCallback(
    async (recordId: string, closedAt?: string) => {
      try {
        await markDriverCorrectionReceived(sdk, recordId, closedAt);
        const alertId = `${recordId}-${Date.now()}`;
        setDriverAlerts((prev) => [
          {
            id: alertId,
            recordId,
            message: `Kierowca poprawił zgłoszenie ${recordId.slice(0, 8)}… — status: Driver Corrected`,
            at: new Date().toLocaleString(fmt),
          },
          ...prev.slice(0, 4),
        ]);
        setStatusMsg(`Kierowca zaktualizował zgłoszenie — oznaczono jako „Driver Corrected”.`);
        await loadPage(undefined, true);
        await selectRecord(recordId);
      } catch (e) {
        setStatusMsg(e instanceof Error ? e.message : String(e));
      }
    },
    [sdk, loadPage, selectRecord],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isTrustedDriverMessageOrigin(event.origin)) return;
      const resolved = parseDriverCorrectionResolved(event.data);
      if (!resolved) return;
      void handleDriverCorrectionResolved(resolved.recordId, resolved.closedAt);
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [handleDriverCorrectionResolved]);

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
          <div className="brand-logo">
            Xelto <span className="brand-logo-express">{t('brand.express')}</span>
          </div>
          <span className="header-sep">|</span>
          <div className="header-titles">
            <span className="header-title">{t('app.title')}</span>
            <span className="header-sub">{t('app.subtitle')}</span>
          </div>
          <span className="header-version" title="App version">
            v{import.meta.env.VITE_APP_VERSION ?? '?'}
          </span>
        </div>
        <div className="header-actions">
          <LanguageSettings />
          {maestroTarget && (
            <span className="badge badge-muted" title={maestroTarget.processKey}>
              {t('header.maestroReady', { name: maestroTarget.name })}
            </span>
          )}
          <button
            type="button"
            className="btn btn-analyze"
            disabled={globalBusy || selectedIds.size === 0 || !maestroTarget}
            title={!maestroTarget ? maestroError ?? t('header.maestroMissing') : undefined}
            onClick={() => void runAnalysis([...selectedIds])}
          >
            {t('header.analyzeSelected', { count: selectedIds.size })}
          </button>
          <button
            type="button"
            className="btn btn-analyze"
            disabled={globalBusy || !activeId || !maestroTarget}
            title={!maestroTarget ? maestroError ?? t('header.maestroMissing') : undefined}
            onClick={() => activeId && void runAnalysis([activeId])}
          >
            {t('header.analyzeCurrent')}
          </button>
        </div>
      </header>

      <nav className="main-nav" aria-label={t('app.title')}>
        <button
          type="button"
          className={mainSection === 'dashboard' ? 'main-nav-btn main-nav-btn-active' : 'main-nav-btn'}
          onClick={() => setMainSection('dashboard')}
        >
          {t('nav.dashboard')}
        </button>
        <button
          type="button"
          className={mainSection === 'claims' ? 'main-nav-btn main-nav-btn-active' : 'main-nav-btn'}
          onClick={() => setMainSection('claims')}
        >
          {t('nav.claims')}
        </button>
        <button
          type="button"
          className={mainSection === 'vehicles' ? 'main-nav-btn main-nav-btn-active' : 'main-nav-btn'}
          onClick={() => {
            setMainSection('vehicles');
            setActiveVehicleId(null);
          }}
        >
          {t('nav.vehicles')}
        </button>
        <button
          type="button"
          className={mainSection === 'companies' ? 'main-nav-btn main-nav-btn-active' : 'main-nav-btn'}
          onClick={() => {
            setMainSection('companies');
            setActiveCompanyId(null);
          }}
        >
          {t('nav.companies')}
        </button>
        <button
          type="button"
          className={mainSection === 'insights' ? 'main-nav-btn main-nav-btn-active' : 'main-nav-btn'}
          onClick={() => setMainSection('insights')}
        >
          {t('nav.insights')}
        </button>
        <button
          type="button"
          className={mainSection === 'settings' ? 'main-nav-btn main-nav-btn-active' : 'main-nav-btn'}
          onClick={() => setMainSection('settings')}
        >
          {t('nav.settings')}
        </button>
        <button
          type="button"
          className="main-nav-btn main-nav-btn-report"
          title={t('nav.fleetPdf')}
          onClick={() => {
            downloadFleetSummaryPdf({
              stats: fleetStats,
              vehicleCount: vehicleCatalog?.totalVehicles ?? 0,
              companyCount: companyCatalog?.totalCompanies ?? 0,
              locale,
            });
          }}
        >
          {t('nav.fleetPdf')}
        </button>
      </nav>

      <div className="language-info-rail">
        <LanguageSettingsCard />
      </div>

      {mainSection !== 'dashboard' && mainSection !== 'insights' && mainSection !== 'settings' && (
        <GlobalFilterBar
        section={mainSection}
        filters={claimFilters}
        onFiltersChange={setClaimFilters}
        vehicleFilters={vehicleFilters}
        onVehicleFiltersChange={setVehicleFilters}
        companyFilters={companyFilters}
        onCompanyFiltersChange={setCompanyFilters}
        areaOptions={vehicleCatalog?.areaOptions ?? []}
        companyAreaOptions={companyCatalog?.areaOptions ?? []}
        vehicleCompanyOptions={vehicleCatalog?.companyOptions ?? []}
        serviceOptions={serviceOptions}
        decisionOptions={decisionOptions}
        filteredCount={
          mainSection === 'claims'
            ? filteredRecords.length
            : mainSection === 'vehicles'
              ? filteredVehicles.length
              : filteredCompanies.length
        }
        totalCount={
          mainSection === 'claims'
            ? records.length
            : mainSection === 'vehicles'
              ? (vehicleCatalog?.totalVehicles ?? 0)
              : (companyCatalog?.totalCompanies ?? 0)
        }
        globalFilterActive={mainSection === 'claims' && globalFilterActive}
        datasetTotal={recordTotal}
        onReset={() => {
          setClaimFilters(DEFAULT_CLAIMS_FILTERS);
          setVehicleFilters(DEFAULT_VEHICLE_FILTERS);
          setCompanyFilters(DEFAULT_COMPANY_FILTERS);
        }}
        />
      )}

      {activeRun && (
        <div className="progress-banner">
          <div className="loading-spinner small" />
          <span>
            {t('claims.analysisProgress', {
              id: activeRun.instanceId?.slice(0, 8) ?? '…',
              status: polledVars?.latestRunStatus ?? 'Running',
            })}
          </span>
        </div>
      )}

      {maestroError && !maestroTarget && (
        <div className="progress-banner">
          <span>{t('banner.maestroError', { error: maestroError })}</span>
        </div>
      )}

      {statusMsg && !activeRun && <div className="info-banner">{statusMsg}</div>}

      {driverAlerts.length > 0 && (
        <div className="driver-alerts" aria-live="polite">
          {driverAlerts.map((alert) => (
            <div key={alert.id} className="driver-alert driver-alert--corrected">
              <div>
                <strong>{t('banner.driverAlertTitle')}</strong>
                <p>{alert.message}</p>
                <span className="driver-alert-time">{alert.at}</span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  void selectRecord(alert.recordId);
                  setDriverAlerts((prev) => prev.filter((item) => item.id !== alert.id));
                }}
              >
                {t('banner.driverAlertShow')}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="main-workspace">
        {mainSection === 'dashboard' ? (
          <section className="panel dashboard-panel">
            <div className="panel-head">
              <div>
                <h2>{t('dashboard.title')}</h2>
                <p className="panel-sub">{t('dashboard.subtitle')}</p>
              </div>
              <div className="dashboard-head-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={vehicleCatalogLoading}
                  onClick={() => void loadVehicleTabData()}
                >
                  {vehicleCatalogLoading ? t('dashboard.loading') : t('dashboard.refresh')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    downloadFleetSummaryPdf({
                      stats: fleetStats,
                      vehicleCount: vehicleCatalog?.totalVehicles ?? 0,
                      companyCount: companyCatalog?.totalCompanies ?? 0,
                      locale,
                    });
                  }}
                >
                  {t('stats.downloadPdf')}
                </button>
              </div>
            </div>

            {vehicleCatalogError && <p className="error-text">{vehicleCatalogError}</p>}

            {vehicleCatalogLoading && allPocCosts.length === 0 ? (
              <p className="placeholder dashboard-loading">{t('dashboard.loading')}</p>
            ) : (
              <>
                <div className="dashboard-kpi-row">
                  <div className="dashboard-kpi">
                    <span className="dashboard-kpi-label">{t('dashboard.kpiVehicles')}</span>
                    <span className="dashboard-kpi-value">
                      {vehicleCatalog?.totalVehicles ?? '—'}
                    </span>
                  </div>
                  <div className="dashboard-kpi">
                    <span className="dashboard-kpi-label">{t('dashboard.kpiCompanies')}</span>
                    <span className="dashboard-kpi-value">
                      {companyCatalog?.totalCompanies ?? '—'}
                    </span>
                  </div>
                  <div className="dashboard-kpi">
                    <span className="dashboard-kpi-label">{t('dashboard.kpiClaims')}</span>
                    <span className="dashboard-kpi-value">{fleetStats.claimCount}</span>
                  </div>
                  <div className="dashboard-kpi dashboard-kpi-warn">
                    <span className="dashboard-kpi-label">{t('dashboard.kpiFlagged')}</span>
                    <span className="dashboard-kpi-value">{fleetStats.flaggedCount}</span>
                  </div>
                </div>

                <FleetStatsPanel
                  stats={fleetStats}
                  health={fleetHealth}
                  title={t('dashboard.statsTitle')}
                  onExportPdf={() => {
                    downloadFleetSummaryPdf({
                      stats: fleetStats,
                      vehicleCount: vehicleCatalog?.totalVehicles ?? 0,
                      companyCount: companyCatalog?.totalCompanies ?? 0,
                      locale,
                    });
                  }}
                />

                <div className="dashboard-bottom-grid">
                  {fleetStats.byDecision.length > 0 && (
                    <div className="dashboard-card">
                      <h3 className="dashboard-card-title">{t('dashboard.decisionsTitle')}</h3>
                      <ul className="dashboard-decision-list">
                        {fleetStats.byDecision.map((d) => (
                          <li key={d.label} className="dashboard-decision-item">
                            <span className="dashboard-decision-label">{d.label}</span>
                            <span className="dashboard-decision-count">{d.count}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <section className="dashboard-risk-section dashboard-card">
                    <div className="dashboard-risk-head">
                      <div>
                        <h3 className="dashboard-card-title">{t('dashboard.riskTitle')}</h3>
                        <p className="panel-sub">{t('dashboard.riskSubtitle')}</p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setMainSection('insights')}
                      >
                        {t('dashboard.openInsights')}
                      </button>
                    </div>
                    {insightRecords.length === 0 ? (
                      <p className="placeholder">{t('dashboard.noRisk')}</p>
                    ) : (
                      <ul className="dashboard-risk-list">
                        {insightRecords.slice(0, 8).map((item) => {
                          const { record, analysis, riskScore } = item;
                          const id = recordId(record);
                          return (
                            <li key={id}>
                              <button
                                type="button"
                                className="dashboard-risk-card"
                                onClick={() => {
                                  setMainSection('insights');
                                }}
                              >
                                <span className="dashboard-risk-reg">
                                  {pickField(record, 'carRegistration', 'CarRegistration')}
                                </span>
                                <span className="dashboard-risk-service">
                                  {pickField(record, 'serviceName', 'ServiceName')}
                                </span>
                                <span className="dashboard-risk-meta">
                                  <span className="dashboard-risk-score">{riskScore}</span>
                                  {analysis?.riskLevel && (
                                    <span className="dashboard-risk-badge">{analysis.riskLevel}</span>
                                  )}
                                  {analysis?.combinedScore && (
                                    <span>
                                      {t('analysis.fraudScore')}: {analysis.combinedScore}
                                    </span>
                                  )}
                                  {!analysis && <span>{t('dashboard.flaggedOnly')}</span>}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                </div>
              </>
            )}
          </section>
        ) : mainSection === 'insights' ? (
          <InsightsSection
            items={insightRecords}
            fleetMedian={fleetMedianCost}
            loading={vehicleCatalogLoading && allPocCosts.length === 0}
            error={vehicleCatalogError}
            maestroReady={Boolean(maestroTarget)}
            onOpenClaim={(id) => {
              setMainSection('claims');
              void selectRecord(id);
            }}
            onAnalyzeSelected={() => {
              if (selectedIds.size > 0) {
                void runAnalysis([...selectedIds]);
                return;
              }
              setMainSection('claims');
            }}
          />
        ) : mainSection === 'settings' ? (
          <SettingsSection />
        ) : mainSection === 'claims' ? (
          <div className="layout master-detail-layout">
            <section className="panel table-panel master-pane">
              <div className="panel-head">
                <h2>{t('nav.claims')}</h2>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() =>
                    void (globalFilterActive ? loadAllForFilters() : loadPage(undefined, true))
                  }
                >
                  {t('header.refreshCount', { count: recordTotal ?? records.length })}
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
                            displayRecords.length > 0 &&
                            displayRecords.every((r) => selectedIds.has(recordId(r)))
                          }
                          onChange={toggleSelectAllPage}
                        />
                      </th>
                      {displayTableColumns.map((c) => (
                        <th key={c.key}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loadingTable ? (
                      <tr>
                        <td colSpan={displayTableColumns.length + 1} className="center">
                          {globalFilterActive ? t('claims.loadingAll') : t('common.loading')}
                        </td>
                      </tr>
                    ) : filteredRecords.length === 0 ? (
                      <tr>
                        <td colSpan={displayTableColumns.length + 1} className="center">
                          {records.length === 0
                            ? t('claims.empty')
                            : globalFilterActive
                              ? t('claims.noFilterMatchGlobal', { count: records.length })
                              : t('claims.noFilterMatchPage', { count: records.length })}
                        </td>
                      </tr>
                    ) : (
                      displayRecords.map((r) => {
                        const id = recordId(r);
                        const selected = id === activeId;
                        const awaitingDriver = isAwaitingDriverCorrection(r);
                        const driverCorrected = isDriverCorrected(r);
                        const rowClass = [
                          selected ? 'row-active' : '',
                          awaitingDriver ? 'row-awaiting-driver' : '',
                          driverCorrected ? 'row-driver-corrected' : '',
                        ]
                          .filter(Boolean)
                          .join(' ');
                        return (
                          <tr
                            key={id}
                            className={rowClass}
                            onClick={() => onRowClick(r)}
                          >
                            <td onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedIds.has(id)}
                                onChange={() => toggleSelect(id)}
                              />
                            </td>
                            {displayTableColumns.map((c) => (
                              <td key={c.key}>
                                {c.key === 'decision' ? (
                                  <span
                                    className={[
                                      'status-chip',
                                      awaitingDriver ? 'status-chip--action' : '',
                                      driverCorrected ? 'status-chip--corrected' : '',
                                    ]
                                      .filter(Boolean)
                                      .join(' ')}
                                  >
                                    {displayField(r, c)}
                                  </span>
                                ) : (
                                  displayField(r, c)
                                )}
                              </td>
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
                    if (globalFilterActive) {
                      setPageIndex((p) => Math.max(0, p - 1));
                      return;
                    }
                    const prev = cursorStack[cursorStack.length - 1];
                    setCursorStack((s) => s.slice(0, -1));
                    setPageIndex((p) => Math.max(0, p - 1));
                    void loadPage(prev);
                  }}
                >
                  {t('pager.previous')}
                </button>
                <span>
                  {t('pager.page', { current: pageIndex + 1 })}
                  {globalFilterActive && filteredRecords.length > 0
                    ? t('pager.pageOf', {
                        total: filteredPageCount,
                        matching: filteredRecords.length,
                      })
                    : ''}
                </span>
                <button
                  type="button"
                  disabled={globalFilterActive ? pageIndex >= filteredPageCount - 1 : !hasNext}
                  onClick={() => {
                    if (globalFilterActive) {
                      setPageIndex((p) => p + 1);
                      return;
                    }
                    setCursorStack((s) => [...s, cursor!]);
                    setPageIndex((p) => p + 1);
                    void loadPage(cursor);
                  }}
                >
                  {t('pager.next')}
                </button>
              </div>
            </section>

            <section className="panel detail-panel detail-pane">
              {!activeRecord ? (
                <p className="placeholder">{t('claims.selectRowInvoice')}</p>
              ) : (
                <>
                  <div className="meta-row">
                    <span className="meta-label">{t('common.recordId')}:</span>
                    <span className="meta-value">{recordId(activeRecord)}</span>
                  </div>

                  <div className="detail-split">
                    <div className="detail-split-main">
                      <h3 className="section-title">{t('claims.detailsTitle')}</h3>
                      <dl className="detail-grid">
                        {visibleDetailFields.map((key) => (
                          <div key={key} className="detail-item">
                            <dt>{localizedFieldLabel(key, t)}</dt>
                            <dd>
                              {key === 'invoiceFileName' ? (
                                invoiceLoading ? (
                                  <span className="hint-small">{t('claims.downloadingAttachment')}</span>
                                ) : invoiceDownloadUrl ? (
                                  <a
                                    className="invoice-download-link"
                                    href={invoiceDownloadUrl}
                                    download={invoiceDownloadName}
                                  >
                                    {t('claims.downloadFile', { name: invoiceDownloadName })}
                                  </a>
                                ) : (
                                  '—'
                                )
                              ) : detailRecord ? (
                                pickDetailField(detailRecord, key, detailContext)
                              ) : (
                                pickField(activeRecord, key)
                              )}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>

                    <aside className="detail-split-preview">
                      <h3 className="section-title">{t('claims.invoicePreview')}</h3>
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
                    <p className="section-sub">{t('claims.managerDecision')}</p>
                    {activeRecord && isAwaitingDriverCorrection(activeRecord) && (
                      <div className="driver-review-banner">
                        <strong>{t('claims.awaitingDriverTitle')}</strong>
                        <p>{t('claims.awaitingDriverText')}</p>
                        <a
                          className="driver-review-link"
                          href={buildDriverCorrectionUrl(
                            activeId ?? '',
                            pickField(activeRecord, 'fleetManagerNote', 'FleetManagerNote') !== '—'
                              ? pickField(activeRecord, 'fleetManagerNote', 'FleetManagerNote')
                              : t('claims.defaultInvoiceMessage'),
                          )}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t('claims.openDriverApp')}
                        </a>
                      </div>
                    )}
                    {activeRecord && isDriverCorrected(activeRecord) && (
                      <div className="driver-corrected-banner">
                        <strong>{t('banner.driverCorrectedBannerTitle')}</strong>
                        <p>{t('banner.driverCorrectedBannerText')}</p>
                      </div>
                    )}
                    <textarea
                      className="manager-comment"
                      rows={3}
                      placeholder={t('claims.managerCommentPlaceholder')}
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
                        {t('claims.approveBtn')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-reject"
                        disabled={decisionBusy || globalBusy}
                        onClick={() => void submitManagerDecision('Rejected')}
                      >
                        {t('claims.rejectBtn')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-clarify"
                        disabled={decisionBusy || globalBusy}
                        onClick={() => void submitInvoiceRequest()}
                        title={t('claims.defaultInvoiceMessage')}
                      >
                        {t('claims.requestInvoiceIcon')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-escalate"
                        disabled={decisionBusy || globalBusy || !maestroTarget}
                        onClick={() => activeId && void runAnalysis([activeId])}
                      >
                        ↑ {t('claims.analyzeMaestro')}
                      </button>
                    </div>
                    <p className="hint-small">{t('claims.actionsHint')}</p>
                  </div>
                </>
              )}
            </section>
          </div>
        ) : mainSection === 'vehicles' ? (
          <div className="layout master-detail-layout">
            <section className="panel table-panel master-pane">
              <div className="panel-head">
                <h2>{t('vehicles.listTitle')}</h2>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={vehicleCatalogLoading}
                  onClick={() => {
                    setVehicleCatalog(null);
                    void loadVehicleTabData();
                  }}
                >
                  {t('header.refreshCount', { count: vehicleCatalog?.totalVehicles ?? '…' })}
                </button>
              </div>

              {vehicleCatalogError && <p className="error-text">{vehicleCatalogError}</p>}

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t('table.vehicle')}</th>
                      <th>{t('common.regionCity')}</th>
                      <th>{t('vehicles.courierCompany')}</th>
                      <th className="col-numeric">{t('common.health')}</th>
                      <th className="col-numeric">{t('common.costs')}</th>
                      <th className="col-numeric">{t('vehicles.poc')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicleCatalogLoading ? (
                      <tr>
                        <td colSpan={6} className="center">
                          {t('vehicles.loading')}
                        </td>
                      </tr>
                    ) : filteredVehicles.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="center">
                          {vehicleCatalog ? t('vehicles.noFilter') : t('vehicles.noData')}
                        </td>
                      </tr>
                    ) : (
                      filteredVehicles.map((v) => {
                        const pocCount = pocCountByVehicleId.get(v.id) ?? 0;
                        const selectedV = activeVehicleId === v.id;
                        return (
                          <tr
                            key={v.id}
                            className={selectedV ? 'row-active' : ''}
                            onClick={() => setActiveVehicleId(v.id)}
                          >
                            <td>{v.registration}</td>
                            <td>{v.areaLabel || '—'}</td>
                            <td>{v.companyLabel || '—'}</td>
                            <td className="col-numeric">
                              {v.healthGrade ? (
                                <span className={`health-grade health-grade-${v.healthGrade.toLowerCase()}`}>
                                  {v.healthScore}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="col-numeric">
                              {v.totalCost != null && v.totalCost > 0
                                ? v.totalCost.toLocaleString(fmt, { maximumFractionDigits: 0 })
                                : '—'}
                            </td>
                            <td className="col-numeric">{pocCount}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel detail-panel detail-pane">
              {!activeVehicle ? (
                <p className="placeholder">{t('vehicles.selectHintLong')}</p>
              ) : (
                <>
                  <div className="detail-preview-card">
                    <h3 className="section-title">{t('vehicles.previewTitle')}</h3>
                    <div className="meta-row">
                      <span className="meta-label">{t('vehicles.registration')}:</span>
                      <span className="meta-value">{activeVehicle.registration}</span>
                    </div>
                    <dl className="detail-grid detail-grid-compact">
                      <div className="detail-item">
                        <dt>{t('common.regionCity')}</dt>
                        <dd>{activeVehicle.areaLabel || '—'}</dd>
                      </div>
                      <div className="detail-item">
                        <dt>{t('vehicles.courierCompany')}</dt>
                        <dd>{activeVehicle.companyLabel || '—'}</dd>
                      </div>
                    </dl>
                    <p className="hint-small">
                      {t('vehicles.claimsSummary', {
                        count: activeVehicleCosts.length,
                        total: activeVehicleCosts
                          .reduce((acc, r) => acc + (getRecordNumericAmount(r) ?? 0), 0)
                          .toLocaleString(fmt, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }),
                      })}
                    </p>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => openVehicleInClaims(activeVehicle.registration)}
                    >
                      {t('vehicles.openClaims')}
                    </button>
                  </div>

                  {activeVehicle.compliance && <CompliancePanel compliance={activeVehicle.compliance} />}

                  {activeVehicleStats && activeVehicleHealth && (
                    <FleetStatsPanel
                      stats={activeVehicleStats}
                      health={activeVehicleHealth}
                      title={t('vehicles.statsTitle')}
                      onExportPdf={() => {
                        const compliance =
                          activeVehicle.compliance ??
                          extractVehicleCompliance(activeVehicle.raw, activeVehicle.registration);
                        downloadVehicleReportPdf({
                          vehicle: activeVehicle,
                          stats: activeVehicleStats,
                          health: activeVehicleHealth,
                          compliance,
                          locale,
                        });
                      }}
                    />
                  )}

                  <h3 className="section-title">{t('vehicles.costsInRegister')}</h3>
                  <div className="table-wrap table-wrap-nested">
                    <table>
                      <thead>
                        <tr>
                          <th>{t('table.service')}</th>
                          <th className="col-numeric">{t('vehicles.netAmount')}</th>
                          <th>{t('common.status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeVehicleCosts.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="center">
                              {t('vehicles.noCosts')}
                            </td>
                          </tr>
                        ) : (
                          activeVehicleCosts.map((r, idx) => {
                            const id = recordId(r);
                            return (
                              <tr
                                key={id || `cost-${idx}`}
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
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="hint-small">{t('vehicles.clickCostHint')}</p>
                </>
              )}
            </section>
          </div>
        ) : (
          <CompaniesSection
            catalog={companyCatalog}
            loading={companyCatalogLoading}
            error={companyCatalogError}
            filtered={filteredCompanies}
            fleetVehicles={enrichedVehicles}
            activeCompanyId={activeCompanyId}
            activeCompanyStats={activeCompanyStats}
            activeCompanyHealth={activeCompanyHealth}
            onSelectCompany={setActiveCompanyId}
            onRefresh={() => {
              setCompanyCatalog(null);
              void loadCompanyTabData();
            }}
            onOpenVehicle={openVehicleInFleet}
            onExportCompanyPdf={() => {
              if (!activeCompany || !activeCompanyStats || !activeCompanyHealth) return;
              downloadCompanyReportPdf({
                company: activeCompany,
                stats: activeCompanyStats,
                health: activeCompanyHealth,
                vehicles: enrichedVehicles.filter((v) => v.companyLabel === activeCompany.name),
                locale,
              });
            }}
          />
        )}
      </div>
    </div>
  );
}

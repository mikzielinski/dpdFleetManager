import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PaginationCursor } from '@uipath/uipath-typescript/core';
import { AuthLoginScreen, BYPASS_AUTH, useAuth } from './hooks/useAuth';
import { usePolling } from './hooks/usePolling';
import { ORCHESTRATOR_RELEASE_NAME, PAGE_SIZE, TABLE_COLUMNS, type TableColumn } from './config';
import {
  displayField,
  downloadInvoiceBlob,
  fetchAllDpdRecords,
  fetchRecordById,
  fetchRecordsPage,
  fetchVehicleFlagHistory,
  loadEntityContext,
  translateRecord,
  updateRecordStatus,
  type EntityContext,
  type VehicleFlagHistoryItem,
} from './services/dataFabric';
import { CompaniesSection } from './components/CompaniesSection';
import { CompliancePanel } from './components/CompliancePanel';
import { DashboardSection } from './components/DashboardSection';
import { InsightsSection } from './components/insights/InsightsSection';
import { FleetStatsPanel } from './components/FleetStatsPanel';
import { GlobalFilterBar } from './components/GlobalFilterBar';
import { SortableTh } from './components/SortableTh';
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
import { resolveVehicleCompliance } from './utils/vehicleCompliance';
import { applyPocDatasetPolicy } from './data/demoStagingPoc';
import { FuelRegionPanel } from './components/FuelRegionPanel';
import {
  aggregateFuelByRegion,
  statsForVehicleFuelPeriod,
} from './services/regionFuelAnalytics';
import {
  DEFAULT_PERIOD_FILTER,
  filterRecordsByPeriod,
  filterRecordsByPreviousPeriod,
  isPeriodFilterActive,
  type PeriodFilterState,
} from './utils/periodFilter';
import {
  DEFAULT_COMPANY_FILTERS,
  type CompanyFilterState,
} from './utils/companyFilters';
import {
  DEFAULT_DASHBOARD_FILTERS,
  type DashboardFilterState,
} from './utils/dashboardFilters';
import {
  buildDashboardData,
  filterPocForDashboard,
} from './services/dashboardAnalytics';
import { buildInsightsData, pocForInsights } from './services/insightsAnalytics';
import { getClaimSortValue } from './utils/claimSort';
import { sortArray, toggleSort, EMPTY_SORT, type SortState } from './utils/tableSort';
import {
  findInvoiceFileField,
  normalizeRegistration,
  pickField,
  recordId,
  type DpdRecord,
} from './utils/record';
import { DEFAULT_VEHICLE_FILTERS, type VehicleFilterState } from './utils/vehicleFilters';

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

  const [mainSection, setMainSection] = useState<
    'claims' | 'vehicles' | 'companies' | 'dashboard' | 'insights'
  >('claims');
  const [claimsSort, setClaimsSort] = useState<SortState>(EMPTY_SORT);
  const [vehicleSort, setVehicleSort] = useState<
    SortState<'registration' | 'area' | 'company' | 'health' | 'cost' | 'poc'>
  >({ key: null, direction: 'asc' });
  const [dashboardFilters, setDashboardFilters] =
    useState<DashboardFilterState>(DEFAULT_DASHBOARD_FILTERS);
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
  const [periodFilter, setPeriodFilter] = useState<PeriodFilterState>(DEFAULT_PERIOD_FILTER);

  const tableColumns: TableColumn[] = ctx?.tableColumns ?? TABLE_COLUMNS;

  const periodFilterActive = isPeriodFilterActive(periodFilter);

  const pocSourceForPeriod = allPocCosts.length > 0 ? allPocCosts : records;

  const periodFilteredPoc = useMemo(
    () => filterRecordsByPeriod(pocSourceForPeriod, periodFilter),
    [pocSourceForPeriod, periodFilter],
  );

  const globalFilterActive = useMemo(
    () => needsFullDatasetFilters(claimFilters) || periodFilterActive,
    [claimFilters, periodFilterActive],
  );

  const filteredRecords = useMemo(() => {
    const scoped = filterRecordsByPeriod(records, periodFilter);
    return filterClaimRecords(scoped, tableColumns, claimFilters);
  }, [records, periodFilter, tableColumns, claimFilters]);

  const sortedFilteredRecords = useMemo(() => {
    if (!claimsSort.key) return filteredRecords;
    const key = claimsSort.key;
    return sortArray(filteredRecords, claimsSort, (r) => getClaimSortValue(r, key, tableColumns));
  }, [filteredRecords, claimsSort, tableColumns]);

  const filteredPageCount = Math.max(1, Math.ceil(sortedFilteredRecords.length / PAGE_SIZE) || 1);

  const displayRecords = useMemo(() => {
    if (!globalFilterActive) return sortedFilteredRecords;
    const start = pageIndex * PAGE_SIZE;
    return sortedFilteredRecords.slice(start, start + PAGE_SIZE);
  }, [globalFilterActive, sortedFilteredRecords, pageIndex]);

  const prevGlobalFilterRef = useRef(false);

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

  const fleetMedianCost = useMemo(
    () => fleetMedianCostPerClaim(periodFilteredPoc),
    [periodFilteredPoc],
  );

  const enrichedVehicles = useMemo((): VehicleCatalogItem[] => {
    if (!vehicleCatalog) return [];
    return vehicleCatalog.vehicles.map((v) => {
      const compliance = resolveVehicleCompliance(v.raw, v.registration);
      const stats = statsForVehicle(
        v,
        periodFilteredPoc,
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
  }, [vehicleCatalog, periodFilteredPoc, tableColumns, fleetMedianCost]);

  const filteredVehicles = useMemo(() => {
    return filterVehicleCatalog(enrichedVehicles, vehicleFilters);
  }, [enrichedVehicles, vehicleFilters]);

  const enrichedCompanies = useMemo(() => {
    if (!companyCatalog) return [];
    return companyCatalog.companies.map((c) => {
      const stats = statsForCompany(
        c.name,
        enrichedVehicles,
        periodFilteredPoc,
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
  }, [companyCatalog, enrichedVehicles, periodFilteredPoc, vehicleCatalog, tableColumns, fleetMedianCost]);

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
      periodFilteredPoc,
      vehicleCatalog.pocVehicleFieldNames,
      vehicleIdsByPlate,
    );
  }, [periodFilteredPoc, vehicleCatalog, vehicleIdsByPlate]);

  const sortedFilteredVehicles = useMemo(() => {
    return sortArray(filteredVehicles, vehicleSort, (v) => {
      switch (vehicleSort.key) {
        case 'registration':
          return v.registration;
        case 'area':
          return v.areaLabel || null;
        case 'company':
          return v.companyLabel || null;
        case 'health':
          return v.healthScore ?? null;
        case 'cost':
          return v.totalCost ?? null;
        case 'poc':
          return pocCountByVehicleId.get(v.id) ?? 0;
        default:
          return v.registration;
      }
    });
  }, [filteredVehicles, vehicleSort, pocCountByVehicleId]);

  const activeVehicle = useMemo((): VehicleCatalogItem | null => {
    if (!activeVehicleId) return null;
    return enrichedVehicles.find((v) => v.id === activeVehicleId) ?? null;
  }, [activeVehicleId, enrichedVehicles]);

  const activeVehicleStats = useMemo(() => {
    if (!activeVehicle || !vehicleCatalog) return null;
    return statsForVehicle(
      activeVehicle,
      periodFilteredPoc,
      vehicleCatalog.pocVehicleFieldNames,
      tableColumns,
    );
  }, [activeVehicle, periodFilteredPoc, vehicleCatalog, tableColumns]);

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
      periodFilteredPoc,
      vehicleCatalog.pocVehicleFieldNames,
      tableColumns,
    );
  }, [activeCompany, enrichedVehicles, periodFilteredPoc, vehicleCatalog, tableColumns]);

  const activeCompanyHealth = useMemo(() => {
    if (!activeCompanyStats) return null;
    return computeHealthScore({
      stats: activeCompanyStats,
      complianceIssueCount: 0,
      fleetMedianCostPerClaim: fleetMedianCost,
    });
  }, [activeCompanyStats, fleetMedianCost]);

  const fleetStats = useMemo(
    () => statsForFleet(periodFilteredPoc, tableColumns),
    [periodFilteredPoc, tableColumns],
  );

  const regionFuelRows = useMemo(() => {
    if (!vehicleCatalog?.vehicles.length) return [];
    return aggregateFuelByRegion(
      periodFilteredPoc,
      pocSourceForPeriod,
      enrichedVehicles,
      periodFilter,
    );
  }, [periodFilteredPoc, pocSourceForPeriod, enrichedVehicles, periodFilter, vehicleCatalog]);

  const dashboardPoc = useMemo(
    () => filterPocForDashboard(periodFilteredPoc, enrichedVehicles, dashboardFilters),
    [periodFilteredPoc, enrichedVehicles, dashboardFilters],
  );

  const dashboardPocPrevious = useMemo(() => {
    const prev = filterRecordsByPreviousPeriod(pocSourceForPeriod, periodFilter);
    return filterPocForDashboard(prev, enrichedVehicles, dashboardFilters);
  }, [pocSourceForPeriod, periodFilter, enrichedVehicles, dashboardFilters]);

  const insightsPoc = useMemo(
    () => pocForInsights(periodFilteredPoc, enrichedVehicles, dashboardFilters),
    [periodFilteredPoc, enrichedVehicles, dashboardFilters],
  );

  const insightsPocPrevious = useMemo(() => {
    const prev = filterRecordsByPreviousPeriod(pocSourceForPeriod, periodFilter);
    return pocForInsights(prev, enrichedVehicles, dashboardFilters);
  }, [pocSourceForPeriod, periodFilter, enrichedVehicles, dashboardFilters]);

  const dashboardRegionFuel = useMemo(() => {
    const cat = dashboardFilters.category;
    if (cat && cat !== 'Paliwo') return [];
    const rows =
      !dashboardFilters.area
        ? regionFuelRows
        : regionFuelRows.filter((r) => r.region === dashboardFilters.area);
    return rows;
  }, [regionFuelRows, dashboardFilters.area, dashboardFilters.category]);

  const dashboardData = useMemo(() => {
    if (!periodFilteredPoc.length && !enrichedVehicles.length) return null;
    return buildDashboardData(
      dashboardPoc,
      enrichedVehicles,
      enrichedCompanies,
      dashboardRegionFuel,
      tableColumns,
      dashboardFilters,
      dashboardPocPrevious,
    );
  }, [
    dashboardPoc,
    dashboardPocPrevious,
    enrichedVehicles,
    enrichedCompanies,
    dashboardRegionFuel,
    tableColumns,
    dashboardFilters,
    periodFilteredPoc.length,
  ]);

  const insightsData = useMemo(() => {
    if (!insightsPoc.length && !enrichedVehicles.length) return null;
    return buildInsightsData(
      insightsPoc,
      insightsPocPrevious,
      pocSourceForPeriod,
      enrichedVehicles,
      enrichedCompanies,
      dashboardRegionFuel,
      tableColumns,
      dashboardFilters,
    );
  }, [
    insightsPoc,
    insightsPocPrevious,
    pocSourceForPeriod,
    enrichedVehicles,
    enrichedCompanies,
    dashboardRegionFuel,
    tableColumns,
    dashboardFilters,
  ]);

  const activeVehicleFuelStats = useMemo(() => {
    if (!activeVehicle || !vehicleCatalog) return null;
    return statsForVehicleFuelPeriod(
      activeVehicle,
      periodFilteredPoc,
      pocSourceForPeriod,
      vehicleCatalog.pocVehicleFieldNames,
      periodFilter,
      regionFuelRows,
    );
  }, [
    activeVehicle,
    periodFilteredPoc,
    pocSourceForPeriod,
    vehicleCatalog,
    periodFilter,
    regionFuelRows,
  ]);

  const activeVehicleCosts = useMemo(() => {
    if (!activeVehicle || !vehicleCatalog) return [];
    return matchCostsToVehicle(
      periodFilteredPoc,
      activeVehicle,
      vehicleCatalog.pocVehicleFieldNames,
    );
  }, [activeVehicle, periodFilteredPoc, vehicleCatalog]);

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
  }, [claimFilters, globalFilterActive, periodFilter]);

  useEffect(() => {
    setPageIndex(0);
  }, [claimsSort]);

  const loadVehicleTabData = useCallback(async () => {
    if (!isAuthenticated) return;
    setVehicleCatalogLoading(true);
    setVehicleCatalogError(null);
    try {
      const pocPage = await fetchAllDpdRecords(sdk);
      const maps = ctxRef.current?.choiceMaps ?? new Map();
      const pocItems = pocPage.items.map((r) => translateRecord(r, maps));
      const catalog = await loadVehicleCatalog(sdk, pocItems);
      const pocWithDemo = applyPocDatasetPolicy(catalog.vehicles, pocItems);
      setVehicleCatalog(catalog);
      setAllPocCosts(pocWithDemo);
    } catch (e) {
      setVehicleCatalogError(e instanceof Error ? e.message : String(e));
      setVehicleCatalog(null);
      setAllPocCosts([]);
    } finally {
      setVehicleCatalogLoading(false);
    }
  }, [sdk, isAuthenticated]);

  const ensurePocCostsLoaded = useCallback(async () => {
    if (!isAuthenticated || allPocCosts.length > 0) return;
    try {
      const pocPage = await fetchAllDpdRecords(sdk);
      const maps = ctxRef.current?.choiceMaps ?? new Map();
      const pocItems = pocPage.items.map((r) => translateRecord(r, maps));
      if (vehicleCatalog) {
        setAllPocCosts(applyPocDatasetPolicy(vehicleCatalog.vehicles, pocItems));
      } else {
        const catalog = await loadVehicleCatalog(sdk, pocItems);
        setVehicleCatalog(catalog);
        setAllPocCosts(applyPocDatasetPolicy(catalog.vehicles, pocItems));
      }
    } catch {
      /* vehicles tab refresh shows errors */
    }
  }, [sdk, isAuthenticated, allPocCosts.length, vehicleCatalog]);

  useEffect(() => {
    if (!isAuthenticated || !periodFilterActive) return;
    void ensurePocCostsLoaded();
  }, [periodFilterActive, isAuthenticated, ensurePocCostsLoaded]);

  useEffect(() => {
    if (
      (mainSection !== 'vehicles' && mainSection !== 'dashboard' && mainSection !== 'insights') ||
      !isAuthenticated
    )
      return;
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
        setAllPocCosts(applyPocDatasetPolicy(cat.vehicles, pocItems));
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
    if (mainSection !== 'companies' && mainSection !== 'dashboard' && mainSection !== 'insights')
      return;
    if (!isAuthenticated || companyCatalog || companyCatalogLoading) return;
    void loadCompanyTabData();
  }, [mainSection, isAuthenticated, companyCatalog, companyCatalogLoading, loadCompanyTabData]);

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
          Rejestr Rozliczeń
        </button>
        <button
          type="button"
          className={mainSection === 'vehicles' ? 'main-nav-btn main-nav-btn-active' : 'main-nav-btn'}
          onClick={() => {
            setMainSection('vehicles');
            setActiveVehicleId(null);
          }}
        >
          Pojazdy
        </button>
        <button
          type="button"
          className={mainSection === 'companies' ? 'main-nav-btn main-nav-btn-active' : 'main-nav-btn'}
          onClick={() => {
            setMainSection('companies');
            setActiveCompanyId(null);
          }}
        >
          Firma
        </button>
        <button
          type="button"
          className={mainSection === 'dashboard' ? 'main-nav-btn main-nav-btn-active' : 'main-nav-btn'}
          onClick={() => setMainSection('dashboard')}
        >
          Dashboard
        </button>
        <button
          type="button"
          className={mainSection === 'insights' ? 'main-nav-btn main-nav-btn-active' : 'main-nav-btn'}
          onClick={() => setMainSection('insights')}
        >
          Insights
        </button>
        <button
          type="button"
          className="main-nav-btn main-nav-btn-report"
          title="Podsumowanie floty PDF"
          onClick={() => {
            void downloadFleetSummaryPdf({
              stats: fleetStats,
              vehicleCount: vehicleCatalog?.totalVehicles ?? 0,
              companyCount: companyCatalog?.totalCompanies ?? 0,
            });
          }}
        >
          Raport floty PDF
        </button>
      </nav>

      <GlobalFilterBar
        section={mainSection}
        filters={claimFilters}
        onFiltersChange={setClaimFilters}
        vehicleFilters={vehicleFilters}
        onVehicleFiltersChange={setVehicleFilters}
        companyFilters={companyFilters}
        onCompanyFiltersChange={setCompanyFilters}
        dashboardFilters={dashboardFilters}
        onDashboardFiltersChange={setDashboardFilters}
        areaOptions={vehicleCatalog?.areaOptions ?? []}
        companyAreaOptions={companyCatalog?.areaOptions ?? []}
        vehicleCompanyOptions={vehicleCatalog?.companyOptions ?? []}
        serviceOptions={serviceOptions}
        decisionOptions={decisionOptions}
        filteredCount={
          mainSection === 'claims'
            ? sortedFilteredRecords.length
            : mainSection === 'vehicles'
              ? sortedFilteredVehicles.length
              : mainSection === 'dashboard'
                ? dashboardPoc.length
                : mainSection === 'insights'
                  ? insightsPoc.length
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
        period={periodFilter}
        onPeriodChange={setPeriodFilter}
        pocInPeriodCount={periodFilteredPoc.length}
        pocTotalCount={pocSourceForPeriod.length}
        onReset={() => {
          setClaimFilters(DEFAULT_CLAIMS_FILTERS);
          setVehicleFilters(DEFAULT_VEHICLE_FILTERS);
          setCompanyFilters(DEFAULT_COMPANY_FILTERS);
          setDashboardFilters(DEFAULT_DASHBOARD_FILTERS);
          setPeriodFilter(DEFAULT_PERIOD_FILTER);
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
                <h2>Rejestr Rozliczeń</h2>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() =>
                    void (globalFilterActive ? loadAllForFilters() : loadPage(undefined, true))
                  }
                >
                  Odśwież ({recordTotal ?? records.length})
                </button>
              </div>

              {tableError && <p className="error-text">{tableError}</p>}

              <div className="table-wrap">
                <table className="fleet-table">
                  <thead>
                    <tr>
                      <th className="col-check">
                        <input
                          type="checkbox"
                          checked={
                            displayRecords.length > 0 &&
                            displayRecords.every((r) => selectedIds.has(recordId(r)))
                          }
                          onChange={toggleSelectAllPage}
                        />
                      </th>
                      {tableColumns.map((c) => (
                        <SortableTh
                          key={c.key}
                          label={c.label}
                          sortKey={c.key}
                          sort={claimsSort}
                          onSort={(key) => setClaimsSort((s) => toggleSort(s, key))}
                          className={
                            c.key === 'netPrice' || c.key === 'amount' ? 'col-numeric' : undefined
                          }
                        />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loadingTable ? (
                      <tr>
                        <td colSpan={tableColumns.length + 1} className="center">
                          {globalFilterActive
                            ? 'Ładowanie wszystkich zgłoszeń…'
                            : 'Ładowanie…'}
                        </td>
                      </tr>
                    ) : sortedFilteredRecords.length === 0 ? (
                      <tr>
                        <td colSpan={tableColumns.length + 1} className="center">
                          {records.length === 0
                            ? 'Brak zgłoszeń.'
                            : globalFilterActive
                              ? `Brak wierszy spełniających filtry (przeszukano ${records.length} rekordów w bazie).`
                              : `Brak wierszy spełniających filtry (${records.length} rekordów na stronie).`}
                        </td>
                      </tr>
                    ) : (
                      displayRecords.map((r) => {
                        const id = recordId(r);
                        const selected = id === activeId;
                        return (
                          <tr
                            key={id}
                            className={selected ? 'row-active' : ''}
                            onClick={() => onRowClick(r)}
                          >
                            <td className="col-check" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedIds.has(id)}
                                onChange={() => toggleSelect(id)}
                              />
                            </td>
                            {tableColumns.map((c) => (
                              <td
                                key={c.key}
                                className={
                                  c.key === 'netPrice' || c.key === 'amount'
                                    ? 'col-numeric'
                                    : c.key === 'companyName' ||
                                        c.key === 'serviceName' ||
                                        c.key === 'carRegistration'
                                      ? 'col-text-wrap'
                                      : undefined
                                }
                              >
                                {displayField(r, c)}
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
                  ← Poprzednia
                </button>
                <span>
                  Strona {pageIndex + 1}
                  {globalFilterActive && sortedFilteredRecords.length > 0
                    ? ` z ${filteredPageCount} (${sortedFilteredRecords.length} pasujących)`
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
        ) : mainSection === 'vehicles' ? (
          <div className="layout master-detail-layout">
            <section className="panel table-panel master-pane">
              <div className="panel-head">
                <h2>Lista pojazdów (DPD_B2B_Vehicles)</h2>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={vehicleCatalogLoading}
                  onClick={() => {
                    setVehicleCatalog(null);
                    void loadVehicleTabData();
                  }}
                >
                  Odśwież ({vehicleCatalog?.totalVehicles ?? '…'})
                </button>
              </div>

              {vehicleCatalogError && <p className="error-text">{vehicleCatalogError}</p>}

              <div className="table-wrap">
                <table className="fleet-table">
                  <thead>
                    <tr>
                      <SortableTh
                        label="Pojazd"
                        sortKey="registration"
                        sort={vehicleSort}
                        onSort={(key) => setVehicleSort((s) => toggleSort(s, key))}
                      />
                      <SortableTh
                        label="Region / miasto"
                        sortKey="area"
                        sort={vehicleSort}
                        onSort={(key) => setVehicleSort((s) => toggleSort(s, key))}
                      />
                      <SortableTh
                        label="Firma kurierska"
                        sortKey="company"
                        sort={vehicleSort}
                        onSort={(key) => setVehicleSort((s) => toggleSort(s, key))}
                      />
                      <SortableTh
                        label="Health"
                        sortKey="health"
                        sort={vehicleSort}
                        onSort={(key) => setVehicleSort((s) => toggleSort(s, key))}
                        className="col-numeric"
                      />
                      <SortableTh
                        label="Koszty"
                        sortKey="cost"
                        sort={vehicleSort}
                        onSort={(key) => setVehicleSort((s) => toggleSort(s, key))}
                        className="col-numeric"
                      />
                      <SortableTh
                        label="POC"
                        sortKey="poc"
                        sort={vehicleSort}
                        onSort={(key) => setVehicleSort((s) => toggleSort(s, key))}
                        className="col-numeric"
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {vehicleCatalogLoading ? (
                      <tr>
                        <td colSpan={6} className="center">
                          Ładowanie pojazdów i słowników regionów / firm…
                        </td>
                      </tr>
                    ) : sortedFilteredVehicles.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="center">
                          {vehicleCatalog
                            ? 'Brak pojazdów spełniających filtry.'
                            : 'Brak danych pojazdów.'}
                        </td>
                      </tr>
                    ) : (
                      sortedFilteredVehicles.map((v) => {
                        const pocCount = pocCountByVehicleId.get(v.id) ?? 0;
                        const selectedV = activeVehicleId === v.id;
                        return (
                          <tr
                            key={v.id}
                            className={selectedV ? 'row-active' : ''}
                            onClick={() => setActiveVehicleId(v.id)}
                          >
                            <td>{v.registration}</td>
                            <td className="col-text-wrap">{v.areaLabel || '—'}</td>
                            <td className="col-text-wrap">{v.companyLabel || '—'}</td>
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
                                ? v.totalCost.toLocaleString('pl-PL', { maximumFractionDigits: 0 })
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
                <>
                  <p className="placeholder">
                    Wybierz pojazd z listy po lewej (B2B), aby zobaczyć region, firmę i koszty w
                    wybranym okresie.
                  </p>
                  {regionFuelRows.length > 0 && (
                    <FuelRegionPanel
                      period={periodFilter}
                      regionRows={regionFuelRows}
                      title="Paliwo wg regionu (flota)"
                    />
                  )}
                </>
              ) : (
                <>
                  <div className="detail-preview-card">
                    <h3 className="section-title">Podgląd pojazdu</h3>
                    <div className="meta-row">
                      <span className="meta-label">Rejestracja:</span>
                      <span className="meta-value">{activeVehicle.registration}</span>
                    </div>
                    <dl className="detail-grid detail-grid-compact">
                      <div className="detail-item">
                        <dt>Region / miasto</dt>
                        <dd>{activeVehicle.areaLabel || '—'}</dd>
                      </div>
                      <div className="detail-item">
                        <dt>Firma kurierska</dt>
                        <dd>{activeVehicle.companyLabel || '—'}</dd>
                      </div>
                    </dl>
                    <p className="hint-small">
                      {activeVehicleCosts.length} zgłoszeń DPD_POC · suma netto:{' '}
                      {activeVehicleCosts
                        .reduce((acc, r) => acc + (getRecordNumericAmount(r) ?? 0), 0)
                        .toLocaleString('pl-PL', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                    </p>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => openVehicleInClaims(activeVehicle.registration)}
                    >
                      Otwórz rejestr rozliczeń dla tego pojazdu
                    </button>
                  </div>

                  {activeVehicle.compliance && <CompliancePanel compliance={activeVehicle.compliance} />}

                  <FuelRegionPanel
                    period={periodFilter}
                    regionRows={regionFuelRows}
                    vehicleStats={activeVehicleFuelStats}
                    title="Paliwo i przebieg w okresie"
                  />

                  {activeVehicleStats && activeVehicleHealth && (
                    <FleetStatsPanel
                      stats={activeVehicleStats}
                      health={activeVehicleHealth}
                      title="Statystyki kosztów pojazdu"
                      onExportPdf={() => {
                        const compliance =
                          activeVehicle.compliance ??
                          resolveVehicleCompliance(activeVehicle.raw, activeVehicle.registration);
                        void downloadVehicleReportPdf({
                          vehicle: activeVehicle,
                          stats: activeVehicleStats,
                          health: activeVehicleHealth,
                          compliance,
                        });
                      }}
                    />
                  )}

                  <h3 className="section-title">Rozliczenia w rejestrze</h3>
                  <div className="table-wrap table-wrap-nested">
                    <table className="fleet-table">
                      <thead>
                        <tr>
                          <th>Usługa</th>
                          <th className="col-numeric">Kwota netto</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeVehicleCosts.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="center">
                              Brak kosztów POC dla tej rejestracji.
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
                  <p className="hint-small">
                    Kliknij wiersz kosztu, aby otworzyć zgłoszenie z fakturą i decyzją managera.
                  </p>
                </>
              )}
            </section>
          </div>
        ) : mainSection === 'dashboard' ? (
          <DashboardSection
            data={dashboardData}
            loading={vehicleCatalogLoading || companyCatalogLoading}
            period={periodFilter}
            filters={dashboardFilters}
            onFiltersChange={setDashboardFilters}
            vehicleCount={vehicleCatalog?.totalVehicles ?? enrichedVehicles.length}
            companyCount={companyCatalog?.totalCompanies ?? enrichedCompanies.length}
          />
        ) : mainSection === 'insights' ? (
          <InsightsSection
            data={insightsData}
            loading={vehicleCatalogLoading || companyCatalogLoading}
            period={periodFilter}
            filters={dashboardFilters}
            onFiltersChange={setDashboardFilters}
          />
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
              void downloadCompanyReportPdf({
                company: activeCompany,
                stats: activeCompanyStats,
                health: activeCompanyHealth,
                vehicles: enrichedVehicles.filter((v) => v.companyLabel === activeCompany.name),
              });
            }}
          />
        )}
      </div>
    </div>
  );
}

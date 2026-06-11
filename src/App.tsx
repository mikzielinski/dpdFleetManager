import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PaginationCursor } from '@uipath/uipath-typescript/core';
import { AuthLoginScreen, BYPASS_AUTH, useAuth } from './hooks/useAuth';
import { usePolling } from './hooks/usePolling';
import {
  DETAIL_FIELD_KEYS,
  DETAIL_FIELD_LABELS,
  DETAIL_FULL_WIDTH_FIELDS,
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
  loadEntityContext,
  translateRecord,
  updateRecordStatus,
  type EntityContext,
  type VehicleFlagHistoryItem,
} from './services/dataFabric';
import { CompaniesSection } from './components/CompaniesSection';
import { CompliancePanel } from './components/CompliancePanel';
import { DashboardSection } from './components/DashboardSection';
import { FleetStatsPanel } from './components/FleetStatsPanel';
import { InsightsSection } from './components/InsightsSection';
import { SortableDataTable, type DataTableColumn } from './components/SortableDataTable';
import { GlobalFilterBar } from './components/GlobalFilterBar';
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
  type CompanyCatalogItem,
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
import { computeHealthScore, healthGradeClass } from './utils/healthScore';
import {
  applyTableView,
  type ColumnFilters,
  type TableSortState,
} from './utils/sortableTable';
import { extractVehicleCompliance } from './utils/vehicleCompliance';
import {
  DEFAULT_COMPANY_FILTERS,
  type CompanyFilterState,
} from './utils/companyFilters';
import {
  findInvoiceFileField,
  normalizeRegistration,
  pickField,
  recordId,
  type DpdRecord,
} from './utils/record';
import { DEFAULT_VEHICLE_FILTERS, type VehicleFilterState } from './utils/vehicleFilters';
import { analysisVariablesFromRecord } from './utils/analysisFromRecord';
import {
  enrichRecordForDetailView,
  pickDetailField,
  type DetailEnrichmentContext,
} from './utils/detailRecord';

export default function App() {
  const {
    sdk,
    isAuthenticated,
    sdkReady,
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
  const [activeVehicleFlag, setActiveVehicleFlag] = useState<VehicleFlagHistoryItem | null>(null);

  const [mainSection, setMainSection] = useState<
    'dashboard' | 'claims' | 'vehicles' | 'companies' | 'insights'
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

  const [claimsSort, setClaimsSort] = useState<TableSortState | null>(null);
  const [claimsColumnFilters, setClaimsColumnFilters] = useState<ColumnFilters>({});
  const [vehiclesSort, setVehiclesSort] = useState<TableSortState | null>(null);
  const [vehiclesColumnFilters, setVehiclesColumnFilters] = useState<ColumnFilters>({});
  const [companiesSort, setCompaniesSort] = useState<TableSortState | null>(null);
  const [companiesColumnFilters, setCompaniesColumnFilters] = useState<ColumnFilters>({});

  const tableColumns: TableColumn[] = ctx?.tableColumns ?? TABLE_COLUMNS;

  const globalFilterActive = useMemo(
    () => needsFullDatasetFilters(claimFilters),
    [claimFilters],
  );

  const filteredRecords = useMemo(
    () => filterClaimRecords(records, tableColumns, claimFilters),
    [records, tableColumns, claimFilters],
  );

  const claimDataColumns = useMemo((): DataTableColumn<DpdRecord>[] => {
    const numericKeys = new Set(['netPrice', 'grossPrice', 'amount', 'totalPrice']);
    return tableColumns.map((col) => ({
      key: col.key,
      label: col.label,
      align: numericKeys.has(col.key) ? ('right' as const) : ('left' as const),
      render: (r) => displayField(r, col),
      sortValue: (r) => {
        const text = displayField(r, col);
        if (numericKeys.has(col.key)) {
          const n = Number.parseFloat(text.replace(/\s/g, '').replace(',', '.'));
          return Number.isFinite(n) ? n : text;
        }
        return text;
      },
      filterText: (r) => displayField(r, col),
    }));
  }, [tableColumns]);

  const claimColumnKeys = useMemo(
    () => claimDataColumns.map((c) => c.key),
    [claimDataColumns],
  );

  const tableViewRecords = useMemo(
    () =>
      applyTableView(
        filteredRecords,
        claimsSort,
        claimsColumnFilters,
        claimColumnKeys,
        (r, key) => {
          const col = tableColumns.find((c) => c.key === key);
          return col ? displayField(r, col) : '';
        },
        (r, key) => {
          const col = claimDataColumns.find((c) => c.key === key);
          return col?.sortValue?.(r) ?? '';
        },
      ),
    [
      filteredRecords,
      claimsSort,
      claimsColumnFilters,
      claimColumnKeys,
      tableColumns,
      claimDataColumns,
    ],
  );

  const filteredPageCount = Math.max(1, Math.ceil(tableViewRecords.length / PAGE_SIZE) || 1);

  const displayRecords = useMemo(() => {
    if (!globalFilterActive) return tableViewRecords;
    const start = pageIndex * PAGE_SIZE;
    return tableViewRecords.slice(start, start + PAGE_SIZE);
  }, [globalFilterActive, tableViewRecords, pageIndex]);

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

  type VehicleTableRow = VehicleCatalogItem & { pocCount: number };

  const vehicleDataColumns = useMemo((): DataTableColumn<VehicleTableRow>[] => [
    {
      key: 'registration',
      label: 'Pojazd',
      render: (v) => v.registration,
      sortValue: (v) => v.registration,
      filterText: (v) => v.registration,
    },
    {
      key: 'areaLabel',
      label: 'Region / miasto',
      render: (v) => v.areaLabel || '—',
      sortValue: (v) => v.areaLabel,
      filterText: (v) => v.areaLabel,
    },
    {
      key: 'companyLabel',
      label: 'Firma kurierska',
      render: (v) => v.companyLabel || '—',
      sortValue: (v) => v.companyLabel,
      filterText: (v) => v.companyLabel,
    },
    {
      key: 'rate',
      label: 'Rate',
      align: 'right',
      render: (v) =>
        v.healthGrade ? (
          <span className={healthGradeClass(v.healthGrade)}>{v.healthGrade}</span>
        ) : (
          '—'
        ),
      sortValue: (v) => v.healthGrade ?? '',
      filterText: (v) => v.healthGrade ?? '',
    },
    {
      key: 'healthScore',
      label: 'Health',
      align: 'right',
      render: (v) =>
        v.healthScore != null ? (
          <span className={v.healthGrade ? healthGradeClass(v.healthGrade) : ''}>{v.healthScore}</span>
        ) : (
          '—'
        ),
      sortValue: (v) => v.healthScore ?? null,
      filterText: (v) => (v.healthScore != null ? String(v.healthScore) : ''),
    },
    {
      key: 'totalCost',
      label: 'Koszty',
      align: 'right',
      render: (v) =>
        v.totalCost != null && v.totalCost > 0
          ? v.totalCost.toLocaleString('pl-PL', { maximumFractionDigits: 0 })
          : '—',
      sortValue: (v) => v.totalCost ?? null,
      filterText: (v) => (v.totalCost != null ? String(v.totalCost) : ''),
    },
    {
      key: 'pocCount',
      label: 'POC',
      align: 'right',
      render: (v) => v.pocCount,
      sortValue: (v) => v.pocCount,
      filterText: (v) => String(v.pocCount),
    },
  ], []);

  const vehicleColumnKeys = useMemo(
    () => vehicleDataColumns.map((c) => c.key),
    [vehicleDataColumns],
  );

  const vehicleTableRows = useMemo((): VehicleTableRow[] => {
    return filteredVehicles.map((v) => ({
      ...v,
      pocCount: pocCountByVehicleId.get(v.id) ?? 0,
    }));
  }, [filteredVehicles, pocCountByVehicleId]);

  const displayVehicles = useMemo(
    () =>
      applyTableView(
        vehicleTableRows,
        vehiclesSort,
        vehiclesColumnFilters,
        vehicleColumnKeys,
        (v, key) => vehicleDataColumns.find((c) => c.key === key)?.filterText?.(v) ?? '',
        (v, key) => vehicleDataColumns.find((c) => c.key === key)?.sortValue?.(v) ?? '',
      ),
    [
      vehicleTableRows,
      vehiclesSort,
      vehiclesColumnFilters,
      vehicleColumnKeys,
      vehicleDataColumns,
    ],
  );

  const companyDataColumns = useMemo((): DataTableColumn<CompanyCatalogItem>[] => [
    {
      key: 'name',
      label: 'Firma',
      render: (c) => c.name,
      sortValue: (c) => c.name,
      filterText: (c) => c.name,
    },
    {
      key: 'areaLabel',
      label: 'Region / miasto',
      render: (c) => c.areaLabel || '—',
      sortValue: (c) => c.areaLabel,
      filterText: (c) => c.areaLabel,
    },
    {
      key: 'rate',
      label: 'Rate',
      align: 'right',
      render: (c) =>
        c.healthGrade ? (
          <span className={healthGradeClass(c.healthGrade)}>{c.healthGrade}</span>
        ) : (
          '—'
        ),
      sortValue: (c) => c.healthGrade ?? '',
      filterText: (c) => c.healthGrade ?? '',
    },
    {
      key: 'healthScore',
      label: 'Health',
      align: 'right',
      render: (c) =>
        c.healthScore != null ? (
          <span className={c.healthGrade ? healthGradeClass(c.healthGrade) : ''}>{c.healthScore}</span>
        ) : (
          '—'
        ),
      sortValue: (c) => c.healthScore ?? null,
      filterText: (c) => (c.healthScore != null ? String(c.healthScore) : ''),
    },
    {
      key: 'totalCost',
      label: 'Koszty',
      align: 'right',
      render: (c) =>
        c.totalCost != null && c.totalCost > 0
          ? c.totalCost.toLocaleString('pl-PL', { maximumFractionDigits: 0 })
          : '—',
      sortValue: (c) => c.totalCost ?? null,
      filterText: (c) => (c.totalCost != null ? String(c.totalCost) : ''),
    },
    {
      key: 'vehicleCount',
      label: 'Pojazdy',
      align: 'right',
      render: (c) => c.vehicleCount,
      sortValue: (c) => c.vehicleCount,
      filterText: (c) => String(c.vehicleCount),
    },
  ], []);

  const companyColumnKeys = useMemo(
    () => companyDataColumns.map((c) => c.key),
    [companyDataColumns],
  );

  const displayCompanies = useMemo(
    () =>
      applyTableView(
        filteredCompanies,
        companiesSort,
        companiesColumnFilters,
        companyColumnKeys,
        (c, key) => companyDataColumns.find((x) => x.key === key)?.filterText?.(c) ?? '',
        (c, key) => companyDataColumns.find((x) => x.key === key)?.sortValue?.(c) ?? '',
      ),
    [
      filteredCompanies,
      companiesSort,
      companiesColumnFilters,
      companyColumnKeys,
      companyDataColumns,
    ],
  );

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
        complianceIssueCount: enrichedVehicles.reduce(
          (n, v) => n + (v.compliance?.complianceIssues.length ?? 0),
          0,
        ),
        fleetMedianCostPerClaim: fleetMedianCost,
      }),
    [fleetStats, enrichedVehicles, fleetMedianCost],
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
      if (!isAuthenticated || !sdkReady) return;
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
    [sdk, isAuthenticated, sdkReady],
  );

  const loadAllForFilters = useCallback(async () => {
    if (!isAuthenticated || !sdkReady) return;
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
  }, [sdk, isAuthenticated, sdkReady]);

  useEffect(() => {
    if (!isAuthenticated || !sdkReady) return;
    if (globalFilterActive) {
      void loadAllForFilters();
    } else if (prevGlobalFilterRef.current) {
      void loadPage(undefined, true);
    }
    prevGlobalFilterRef.current = globalFilterActive;
  }, [globalFilterActive, isAuthenticated, sdkReady, loadAllForFilters, loadPage]);

  useEffect(() => {
    if (globalFilterActive) setPageIndex(0);
  }, [claimFilters, globalFilterActive]);

  const loadVehicleTabData = useCallback(async () => {
    if (!isAuthenticated || !sdkReady) return;
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
  }, [sdk, isAuthenticated, sdkReady]);

  const needsFleetCatalog =
    mainSection === 'vehicles' ||
    mainSection === 'dashboard' ||
    mainSection === 'insights' ||
    mainSection === 'companies';

  useEffect(() => {
    if (!needsFleetCatalog || !isAuthenticated || !sdkReady) return;
    if (vehicleCatalog || vehicleCatalogLoading) return;
    void loadVehicleTabData();
  }, [
    needsFleetCatalog,
    isAuthenticated,
    sdkReady,
    vehicleCatalog,
    vehicleCatalogLoading,
    loadVehicleTabData,
  ]);

  useEffect(() => {
    if (mainSection === 'vehicles') setActiveVehicleId(null);
  }, [vehicleFilters, mainSection]);

  useEffect(() => {
    if (mainSection === 'companies') setActiveCompanyId(null);
  }, [companyFilters, mainSection]);

  const loadCompanyTabData = useCallback(async () => {
    if (!isAuthenticated || !sdkReady) return;
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
  }, [sdk, isAuthenticated, sdkReady, vehicleCatalog]);

  useEffect(() => {
    if (
      mainSection !== 'companies' &&
      mainSection !== 'dashboard' &&
      mainSection !== 'insights'
    ) {
      return;
    }
    if (!isAuthenticated || !sdkReady) return;
    if (companyCatalog || companyCatalogLoading) return;
    void loadCompanyTabData();
  }, [mainSection, isAuthenticated, sdkReady, companyCatalog, companyCatalogLoading, loadCompanyTabData]);

  useEffect(() => {
    if (!isAuthenticated || !sdkReady) return;
    void loadPage(undefined, true);
  }, [isAuthenticated, sdkReady, loadPage]);

  useEffect(() => {
    if (!isAuthenticated || !sdkReady) return;
    let cancelled = false;
    (async () => {
      try {
        const entityCtx = await loadEntityContext(sdk);
        if (cancelled) return;
        ctxRef.current = entityCtx;
        setCtx(entityCtx);
      } catch (e) {
        if (!cancelled && import.meta.env.DEV) {
          console.warn('[DataFabric] loadEntityContext:', e);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, sdkReady, sdk]);

  useEffect(() => {
    if (!ctx?.choiceMaps.size) return;
    setRecords((prev) => {
      if (prev.length === 0) return prev;
      return prev.map((r) => translateRecord(r, ctx.choiceMaps));
    });
  }, [ctx]);

  useEffect(() => {
    if (!isAuthenticated || !sdkReady) return;
    let cancelled = false;
    (async () => {
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
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, sdkReady, sdk]);

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

  const openVehicleById = (vehicleId: string) => {
    setMainSection('vehicles');
    setVehicleFilters(DEFAULT_VEHICLE_FILTERS);
    setActiveVehicleId(vehicleId);
  };

  const openClaimById = (id: string) => {
    setMainSection('claims');
    void selectRecord(id);
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

  const recordWithFlagData = useMemo(() => {
    if (!activeRecord) return null;
    return enrichRecordForDetailView(activeRecord, {
      vehicleFlag: activeVehicleFlag,
      fileFields: ctx?.fileFields ?? [],
    });
  }, [activeRecord, activeVehicleFlag, ctx?.fileFields]);

  const activeResults = useMemo(() => {
    if (!activeId) return null;
    const fromSession = storedResults[activeId];
    if (fromSession) return fromSession;
    return analysisVariablesFromRecord(recordWithFlagData, activeVehicleFlag, activeId);
  }, [activeId, storedResults, recordWithFlagData, activeVehicleFlag]);

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
    if (!detailRecord) return 'faktura.pdf';
    const name = pickDetailField(detailRecord, 'invoiceFileName', detailContext);
    return name !== '—' ? name : 'faktura.pdf';
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

  const fullWidthFieldSet = useMemo(
    () => new Set<string>(DETAIL_FULL_WIDTH_FIELDS),
    [],
  );

  const visibleGridFields = useMemo(
    () => visibleDetailFields.filter((key) => !fullWidthFieldSet.has(key)),
    [visibleDetailFields, fullWidthFieldSet],
  );

  const visibleLongFields = useMemo(
    () => visibleDetailFields.filter((key) => fullWidthFieldSet.has(key)),
    [visibleDetailFields, fullWidthFieldSet],
  );

  const renderDetailFieldValue = (key: string) => {
    if (key === 'invoiceFileName') {
      if (invoiceLoading) return <span className="hint-small">Pobieranie załącznika…</span>;
      if (invoiceDownloadUrl) {
        return (
          <a
            className="invoice-download-link"
            href={invoiceDownloadUrl}
            download={invoiceDownloadName}
            title={invoiceDownloadName}
          >
            Pobierz
          </a>
        );
      }
      return '—';
    }
    if (detailRecord) return pickDetailField(detailRecord, key, detailContext);
    return pickField(activeRecord!, key);
  };

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
          <span className="header-version" title="Wersja aplikacji">
            v{import.meta.env.VITE_APP_VERSION ?? '?'}
          </span>
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
          className={mainSection === 'dashboard' ? 'main-nav-btn main-nav-btn-active' : 'main-nav-btn'}
          onClick={() => setMainSection('dashboard')}
        >
          Dashboard
        </button>
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
          className={mainSection === 'insights' ? 'main-nav-btn main-nav-btn-active' : 'main-nav-btn'}
          onClick={() => setMainSection('insights')}
        >
          Analizy
        </button>
        <button
          type="button"
          className="main-nav-btn main-nav-btn-report"
          title="Podsumowanie floty PDF"
          onClick={() => {
            downloadFleetSummaryPdf({
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
        areaOptions={vehicleCatalog?.areaOptions ?? []}
        companyAreaOptions={companyCatalog?.areaOptions ?? []}
        vehicleCompanyOptions={vehicleCatalog?.companyOptions ?? []}
        serviceOptions={serviceOptions}
        decisionOptions={decisionOptions}
        filteredCount={
          mainSection === 'claims'
            ? tableViewRecords.length
            : mainSection === 'vehicles'
              ? displayVehicles.length
              : mainSection === 'companies'
                ? displayCompanies.length
                : allPocCosts.length
        }
        totalCount={
          mainSection === 'claims'
            ? records.length
            : mainSection === 'vehicles'
              ? (vehicleCatalog?.totalVehicles ?? 0)
              : mainSection === 'companies'
                ? (companyCatalog?.totalCompanies ?? 0)
                : allPocCosts.length
        }
        globalFilterActive={mainSection === 'claims' && globalFilterActive}
        datasetTotal={recordTotal}
        onReset={() => {
          setClaimFilters(DEFAULT_CLAIMS_FILTERS);
          setVehicleFilters(DEFAULT_VEHICLE_FILTERS);
          setCompanyFilters(DEFAULT_COMPANY_FILTERS);
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
                <SortableDataTable
                  columns={claimDataColumns}
                  rows={loadingTable ? [] : displayRecords}
                  rowKey={(r) => recordId(r)}
                  sort={claimsSort}
                  onSortChange={setClaimsSort}
                  columnFilters={claimsColumnFilters}
                  onColumnFiltersChange={setClaimsColumnFilters}
                  onRowClick={onRowClick}
                  activeRowKey={activeId}
                  loading={loadingTable}
                  loadingMessage={
                    globalFilterActive ? 'Ładowanie wszystkich zgłoszeń…' : 'Ładowanie…'
                  }
                  emptyMessage={
                    records.length === 0
                      ? 'Brak zgłoszeń.'
                      : tableViewRecords.length === 0
                        ? globalFilterActive
                          ? `Brak wierszy spełniających filtry (przeszukano ${records.length} rekordów w bazie).`
                          : `Brak wierszy spełniających filtry (${records.length} rekordów na stronie).`
                        : 'Brak danych.'
                  }
                  leadingHeader={
                    <input
                      type="checkbox"
                      checked={
                        displayRecords.length > 0 &&
                        displayRecords.every((r) => selectedIds.has(recordId(r)))
                      }
                      onChange={toggleSelectAllPage}
                      aria-label="Zaznacz wszystkie na stronie"
                    />
                  }
                  renderLeadingCell={(r) => (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(recordId(r))}
                      onChange={() => toggleSelect(recordId(r))}
                      aria-label="Zaznacz wiersz"
                    />
                  )}
                />
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
                  {globalFilterActive && tableViewRecords.length > 0
                    ? ` z ${filteredPageCount} (${tableViewRecords.length} pasujących)`
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
                        {visibleGridFields.map((key) => (
                          <div key={key} className="detail-item">
                            <dt>{DETAIL_FIELD_LABELS[key] ?? key}</dt>
                            <dd>{renderDetailFieldValue(key)}</dd>
                          </div>
                        ))}
                      </dl>

                      {visibleLongFields.length > 0 ? (
                        <div className="detail-long-fields">
                          {visibleLongFields.map((key) => (
                            <div key={key} className="detail-long-item">
                              <h4 className="detail-long-label">
                                {DETAIL_FIELD_LABELS[key] ?? key}
                              </h4>
                              <p className="detail-long-value">{renderDetailFieldValue(key)}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}
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
                <SortableDataTable
                  columns={vehicleDataColumns}
                  rows={displayVehicles}
                  rowKey={(v) => v.id}
                  sort={vehiclesSort}
                  onSortChange={setVehiclesSort}
                  columnFilters={vehiclesColumnFilters}
                  onColumnFiltersChange={setVehiclesColumnFilters}
                  onRowClick={(v) => setActiveVehicleId(v.id)}
                  activeRowKey={activeVehicleId}
                  loading={vehicleCatalogLoading}
                  loadingMessage="Ładowanie pojazdów i słowników regionów / firm…"
                  emptyMessage={
                    vehicleCatalog
                      ? 'Brak pojazdów spełniających filtry.'
                      : 'Brak danych pojazdów.'
                  }
                />
              </div>
            </section>

            <section className="panel detail-panel detail-pane">
              {!activeVehicle ? (
                <p className="placeholder">
                  Wybierz pojazd z listy po lewej (B2B), aby zobaczyć region, firmę i powiązane koszty
                  DPD_POC.
                </p>
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

                  {activeVehicleStats && activeVehicleHealth && (
                    <FleetStatsPanel
                      stats={activeVehicleStats}
                      health={activeVehicleHealth}
                      title="Statystyki kosztów pojazdu"
                      onExportPdf={() => {
                        const compliance =
                          activeVehicle.compliance ??
                          extractVehicleCompliance(activeVehicle.raw, activeVehicle.registration);
                        downloadVehicleReportPdf({
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
                    <table>
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
            stats={fleetStats}
            health={fleetHealth}
            vehicleCount={vehicleCatalog?.totalVehicles ?? 0}
            companyCount={companyCatalog?.totalCompanies ?? 0}
            loading={vehicleCatalogLoading}
            error={vehicleCatalogError}
            onRefresh={() => {
              setVehicleCatalog(null);
              setCompanyCatalog(null);
              void loadVehicleTabData();
              void loadCompanyTabData();
            }}
            onExportPdf={() =>
              downloadFleetSummaryPdf({
                stats: fleetStats,
                vehicleCount: vehicleCatalog?.totalVehicles ?? 0,
                companyCount: companyCatalog?.totalCompanies ?? 0,
              })
            }
          />
        ) : mainSection === 'insights' ? (
          <InsightsSection
            costs={allPocCosts}
            vehicles={enrichedVehicles}
            companies={enrichedCompanies}
            fleetStats={fleetStats}
            tableColumns={tableColumns}
            loading={vehicleCatalogLoading || companyCatalogLoading}
            error={vehicleCatalogError ?? companyCatalogError}
            onRefresh={() => {
              setVehicleCatalog(null);
              setCompanyCatalog(null);
              void loadVehicleTabData();
              void loadCompanyTabData();
            }}
            onOpenClaim={openClaimById}
            onOpenVehicle={openVehicleById}
          />
        ) : (
          <CompaniesSection
            catalog={companyCatalog}
            loading={companyCatalogLoading}
            error={companyCatalogError}
            rows={displayCompanies}
            columns={companyDataColumns}
            sort={companiesSort}
            onSortChange={setCompaniesSort}
            columnFilters={companiesColumnFilters}
            onColumnFiltersChange={setCompaniesColumnFilters}
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
              });
            }}
          />
        )}
      </div>
    </div>
  );
}

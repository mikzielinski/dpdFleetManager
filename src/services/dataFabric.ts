import { Entities, ChoiceSets } from '@uipath/uipath-typescript/entities';
import type { EntityGetResponse } from '@uipath/uipath-typescript/entities';
import type { UiPath, PaginationCursor } from '@uipath/uipath-typescript/core';
import {
  CORRECTION_REQUEST_STATUS,
  DRIVER_CORRECTED_STATUS,
  DRIVER_NOTIFICATION_CLOSED,
  DRIVER_NOTIFICATION_OPEN,
  DPD_POC_ENTITY_ID,
  DPD_VEHICLE_FLAGS_ENTITY_ID,
  INVOICE_FILE_FIELD_CANDIDATES,
  TABLE_COLUMNS,
  TABLE_FIELD_LABEL_OVERRIDES,
  TABLE_FIELD_PREFERENCES,
  type TableColumn,
} from '../config';
import {
  findInvoiceFileField,
  formatValue,
  isDisplayableField,
  listInvoiceFileFieldCandidates,
  normalizeDpdRecord,
  pickVehicleFlagField,
  recordId,
  registrationsMatch,
  resolveChoiceSetLabel,
  resolveRecordField,
  type DpdRecord,
} from '../utils/record';
import {
  BYPASS_AUTH,
  DEMO_INVOICE_PDF,
  getAllMockRecords,
  getMockRecordById,
  mockEntityContext,
  parseDemoCursor,
  sliceMockRecords,
} from './demoData';

/** User-facing message when OAuth token lacks DataFabric.Data.Write. */
export function formatDataFabricWriteError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (/insufficient_scope/i.test(msg)) {
    return (
      'Brak uprawnień do zapisu w Data Fabric (insufficient_scope). ' +
      'Administrator musi dodać scope DataFabric.Data.Write w External Application ' +
      '(Admin → External Applications) i zalogować się ponownie w Fleet Manager.'
    );
  }
  return msg;
}

export interface EntityContext {
  entity: EntityGetResponse;
  fileFields: string[];
  choiceMaps: Map<string, Map<number, string>>;
  tableColumns: TableColumn[];
}

function fieldToColumnKey(fieldName: string): string {
  if (fieldName === 'Status') return 'decision';
  if (fieldName === 'CarRegistraction') return 'carRegistration';
  return fieldName.charAt(0).toLowerCase() + fieldName.slice(1);
}

export function buildTableColumnsFromEntity(entity: EntityGetResponse): TableColumn[] {
  const byName = new Map(
    (entity.fields ?? [])
      .filter((f) => f.name && isDisplayableField(f.name) && f.fieldDisplayType !== 'File')
      .map((f) => [f.name!, f]),
  );

  const columns: TableColumn[] = [];
  for (const pref of TABLE_FIELD_PREFERENCES) {
    const field = byName.get(pref);
    if (!field?.name) continue;
    columns.push({
      key: fieldToColumnKey(field.name),
      fieldName: field.name,
      label: TABLE_FIELD_LABEL_OVERRIDES[field.name] ?? field.displayName ?? field.name,
    });
    byName.delete(pref);
  }

  if (columns.length === 0) {
    for (const field of entity.fields ?? []) {
      if (!field.name || !isDisplayableField(field.name) || field.fieldDisplayType === 'File') {
        continue;
      }
      columns.push({
        key: fieldToColumnKey(field.name),
        fieldName: field.name,
        label: TABLE_FIELD_LABEL_OVERRIDES[field.name] ?? field.displayName ?? field.name,
      });
      if (columns.length >= 6) break;
    }
  }

  return columns.length > 0 ? columns : [...TABLE_COLUMNS];
}

export async function loadEntityContext(sdk: UiPath): Promise<EntityContext> {
  if (BYPASS_AUTH) return mockEntityContext();

  const entities = new Entities(sdk);
  const choiceSets = new ChoiceSets(sdk);
  const entity = await entities.getById(DPD_POC_ENTITY_ID);
  const tableColumns = buildTableColumnsFromEntity(entity);

  const fileFields =
    entity.fields
      ?.filter((f) => f.fieldDisplayType === 'File')
      .map((f) => f.name)
      .filter(Boolean) ?? [];

  for (const c of INVOICE_FILE_FIELD_CANDIDATES) {
    if (!fileFields.includes(c) && entity.fields?.some((f) => f.name === c)) {
      fileFields.push(c);
    }
  }
  for (const f of entity.fields ?? []) {
    if (f.fieldDisplayType !== 'File' || !f.name) continue;
    const label = (f.displayName ?? f.name).toLowerCase();
    if (/invoice|faktur|receipt|załącz|attachment/.test(label) && !fileFields.includes(f.name)) {
      fileFields.push(f.name);
    }
  }
  if (!fileFields.includes('InvoiceRecipt')) {
    fileFields.push('InvoiceRecipt');
  }

  const choiceMaps = new Map<string, Map<number, string>>();
  for (const field of entity.fields ?? []) {
    const csId = field.referenceChoiceSet?.id ?? (field as { choiceSetId?: string }).choiceSetId;
    if (!csId || !field.name) continue;
    const page = await choiceSets.getById(csId, { pageSize: 200 });
    const byId = new Map<number, string>();
    for (const v of page.items) {
      byId.set(v.numberId, v.displayName || v.name);
    }
    choiceMaps.set(field.name, byId);
    choiceMaps.set(fieldToColumnKey(field.name), byId);
  }

  return { entity, fileFields, choiceMaps, tableColumns };
}

export function translateRecord(
  record: DpdRecord,
  choiceMaps: Map<string, Map<number, string>>,
): DpdRecord {
  const out = normalizeDpdRecord(record);
  const seenMaps = new Set<Map<number, string>>();

  for (const [fieldKey, map] of choiceMaps) {
    if (seenMaps.has(map)) continue;
    seenMaps.add(map);

    const columnKey =
      fieldKey === 'Status' ? 'decision' : fieldKey.charAt(0).toLowerCase() + fieldKey.slice(1);
    const raw = resolveRecordField(out, fieldKey, columnKey);
    const label = resolveChoiceSetLabel(raw, map);
    if (!label) continue;

    out[`_${fieldKey}Label`] = label;
    if (columnKey !== fieldKey) out[`_${columnKey}Label`] = label;
    if (fieldKey === 'Status') {
      out.decision = label;
      out.status = label;
    }
  }
  return out;
}

export async function fetchRecordsPage(
  sdk: UiPath,
  cursor?: PaginationCursor,
  pageSize = 25,
): Promise<{
  items: DpdRecord[];
  nextCursor?: PaginationCursor;
  hasNext: boolean;
  totalCount?: number;
}> {
  if (BYPASS_AUTH) {
    await Promise.resolve();
    return sliceMockRecords(parseDemoCursor(cursor), pageSize);
  }

  const entities = new Entities(sdk);
  const result = await entities.getAllRecords(DPD_POC_ENTITY_ID, {
    pageSize,
    cursor,
    expansionLevel: 2,
  });

  const page = normalizeRecordsPage(result, pageSize);

  return {
    items: page.items.map((r) => normalizeDpdRecord(r)),
    nextCursor: page.nextCursor,
    hasNext: page.hasNext,
    totalCount: page.totalCount,
  };
}

/** SDK page object or raw read envelope `{ value, totalRecordCount }`. */
function normalizeRecordsPage(
  result: unknown,
  pageSize: number,
): {
  items: DpdRecord[];
  nextCursor?: PaginationCursor;
  hasNext: boolean;
  totalCount?: number;
} {
  const r = result as Record<string, unknown>;
  const items = (Array.isArray(r.items)
    ? r.items
    : Array.isArray(r.value)
      ? r.value
      : []) as DpdRecord[];

  const totalCount =
    typeof r.totalCount === 'number'
      ? r.totalCount
      : typeof r.totalRecordCount === 'number'
        ? r.totalRecordCount
        : undefined;

  const hasNext =
    typeof r.hasNextPage === 'boolean'
      ? r.hasNextPage
      : totalCount != null
        ? items.length < totalCount
        : items.length >= pageSize;

  return {
    items,
    nextCursor: r.nextCursor as PaginationCursor | undefined,
    hasNext,
    totalCount,
  };
}

export async function fetchRecordById(sdk: UiPath, id: string): Promise<DpdRecord> {
  if (BYPASS_AUTH) {
    await Promise.resolve();
    const rec = getMockRecordById(id);
    if (!rec) throw new Error(`Rekord nie znaleziony: ${id}`);
    return rec;
  }

  const entities = new Entities(sdk);
  const raw = (await entities.getRecordById(DPD_POC_ENTITY_ID, id, {
    expansionLevel: 2,
  })) as DpdRecord;
  return normalizeDpdRecord(raw);
}

export async function updateRecordStatus(
  sdk: UiPath,
  recordId: string,
  status: string,
  managerNote?: string,
): Promise<void> {
  if (BYPASS_AUTH) {
    await Promise.resolve();
    return;
  }

  const entities = new Entities(sdk);
  const patch: Record<string, unknown> = { Status: status };
  if (managerNote?.trim()) {
    patch.FleetManagerNote = managerNote.trim();
    patch.Comments = managerNote.trim();
  }
  await entities.updateRecordById(DPD_POC_ENTITY_ID, recordId, patch, { expansionLevel: 1 });
}

/** Ask driver to correct invoice — sets review mode fields consumed by Driver App. */
export async function requestInvoiceCorrection(
  sdk: UiPath,
  recordId: string,
  message: string,
): Promise<void> {
  if (BYPASS_AUTH) {
    await Promise.resolve();
    return;
  }

  const entities = new Entities(sdk);
  const note = message.trim();

  // Core fields — always present on DPD_POC
  await entities.updateRecordById(
    DPD_POC_ENTITY_ID,
    recordId,
    {
      Status: CORRECTION_REQUEST_STATUS,
      FleetManagerNote: note,
    },
    { expansionLevel: 1 },
  );

  // Optional notification metadata — may not exist in entity schema yet
  try {
    await entities.updateRecordById(
      DPD_POC_ENTITY_ID,
      recordId,
      {
        DriverNotificationStatus: DRIVER_NOTIFICATION_OPEN,
        CorrectionRequestedAt: new Date().toISOString(),
      },
      { expansionLevel: 0 },
    );
  } catch {
    /* non-fatal if schema lacks these fields */
  }
}

/** Mark record as corrected by driver — easy to filter in claims register. */
export async function markDriverCorrectionReceived(
  sdk: UiPath,
  recordId: string,
  resolvedAt?: string,
): Promise<void> {
  if (BYPASS_AUTH) {
    await Promise.resolve();
    return;
  }

  const entities = new Entities(sdk);
  await entities.updateRecordById(
    DPD_POC_ENTITY_ID,
    recordId,
    { Status: DRIVER_CORRECTED_STATUS },
    { expansionLevel: 1 },
  );

  try {
    await entities.updateRecordById(
      DPD_POC_ENTITY_ID,
      recordId,
      {
        DriverNotificationStatus: DRIVER_NOTIFICATION_CLOSED,
        CorrectionResolvedAt: resolvedAt ?? new Date().toISOString(),
      },
      { expansionLevel: 0 },
    );
  } catch {
    /* non-fatal */
  }
}

export async function downloadInvoiceBlob(
  sdk: UiPath,
  record: DpdRecord,
  fileFields: string[],
): Promise<{ blob: Blob; mime: string } | null> {
  if (BYPASS_AUTH) {
    await Promise.resolve();
    const fieldName = findInvoiceFileField(record, fileFields);
    if (!fieldName) return null;
    return { blob: DEMO_INVOICE_PDF, mime: 'application/pdf' };
  }

  const entities = new Entities(sdk);
  const id = String(record.Id ?? record.id ?? '');
  if (!id) return null;

  const candidates = listInvoiceFileFieldCandidates(record, fileFields);
  if (candidates.length === 0) return null;

  let lastError: unknown;
  for (const fieldName of candidates) {
    try {
      const blob = await entities.downloadAttachment(DPD_POC_ENTITY_ID, id, fieldName);
      const meta = record[fieldName];
      const mime =
        (isFileMeta(meta) && meta.contentType) || blob.type || 'application/octet-stream';
      return { blob, mime };
    } catch (e) {
      lastError = e;
    }
  }

  if (import.meta.env.DEV && lastError) {
    console.warn('[DF] downloadInvoiceBlob failed', id, candidates, lastError);
  }
  return null;
}

export interface VehicleFlagHistoryItem {
  id: string;
  vehicleId: string;
  flaggedAt: string;
  description: string;
  requiresAction: string;
  aiConfidenceScore: string;
  relatedCostRecordId: string;
  raw: DpdRecord;
}

/** Load all DPD_POC rows (paginated API walk). Use for global in-app filters. */
export async function fetchAllDpdRecords(sdk: UiPath): Promise<{
  items: DpdRecord[];
  totalCount: number;
}> {
  if (BYPASS_AUTH) {
    await Promise.resolve();
    const items = getAllMockRecords();
    return { items, totalCount: items.length };
  }

  const items = await fetchAllEntityRecords(sdk, DPD_POC_ENTITY_ID, { expansionLevel: 2 });
  return { items, totalCount: items.length };
}

export type FetchAllEntityRecordsOptions = {
  expansionLevel?: number;
};

export async function fetchAllEntityRecords(
  sdk: UiPath,
  entityId: string,
  options?: FetchAllEntityRecordsOptions,
): Promise<DpdRecord[]> {
  const entities = new Entities(sdk);
  const items: DpdRecord[] = [];
  let cursor: PaginationCursor | undefined;
  let guard = 0;
  const expansionLevel = options?.expansionLevel ?? 1;

  do {
    const result = await entities.getAllRecords(entityId, {
      pageSize: 100,
      cursor,
      expansionLevel,
    });
    const page = normalizeRecordsPage(result, 100);
    items.push(...page.items.map((r) => normalizeDpdRecord(r)));
    if (!page.hasNext || !page.nextCursor) break;
    cursor = page.nextCursor;
    guard += 1;
  } while (guard < 20);

  return items;
}

/** Flag linked to a specific DPD_POC cost record (Related Cost Record ID), or latest for registration. */
export async function fetchVehicleFlagForCostRecord(
  sdk: UiPath,
  costRecordId: string,
  carRegistration?: string,
): Promise<VehicleFlagHistoryItem | null> {
  const id = costRecordId.trim();
  if (!id) return null;

  if (BYPASS_AUTH) {
    await Promise.resolve();
    return null;
  }

  const rows = await fetchAllEntityRecords(sdk, DPD_VEHICLE_FLAGS_ENTITY_ID, {
    expansionLevel: 0,
  });
  const idNorm = id.toLowerCase();

  const linked = rows.filter((row) => {
    const related = pickVehicleFlagField(row, 'relatedCostRecordId');
    return related !== '—' && related.trim().toLowerCase() === idNorm;
  });

  const pool = linked.length > 0 ? linked : carRegistration?.trim()
    ? rows.filter((row) =>
        registrationsMatch(carRegistration, pickVehicleFlagField(row, 'vehicleId')),
      )
    : [];

  if (pool.length === 0) return null;

  pool.sort((a, b) => {
    const da = Date.parse(pickVehicleFlagField(a, 'flaggedAt')) || 0;
    const db = Date.parse(pickVehicleFlagField(b, 'flaggedAt')) || 0;
    return db - da;
  });

  const row = pool[0];
  return {
    id: recordId(row),
    vehicleId: pickVehicleFlagField(row, 'vehicleId'),
    flaggedAt: pickVehicleFlagField(row, 'flaggedAt'),
    description: pickVehicleFlagField(row, 'description'),
    requiresAction: pickVehicleFlagField(row, 'requiresAction'),
    aiConfidenceScore: pickVehicleFlagField(row, 'aiConfidenceScore'),
    relatedCostRecordId: pickVehicleFlagField(row, 'relatedCostRecordId'),
    raw: row,
  };
}

/** Previous flags for the same registration (DPD_VehicleFlags), excluding the active fee record when linked. */
export async function fetchVehicleFlagHistory(
  sdk: UiPath,
  carRegistration: string,
  activeFeeRecordId?: string,
): Promise<VehicleFlagHistoryItem[]> {
  const reg = carRegistration.trim();
  if (!reg) return [];

  if (BYPASS_AUTH) {
    await Promise.resolve();
    return [];
  }

  const rows = await fetchAllEntityRecords(sdk, DPD_VEHICLE_FLAGS_ENTITY_ID, {
    expansionLevel: 0,
  });
  const activeNorm = activeFeeRecordId?.trim().toLowerCase();

  const matched = rows.filter((row) => {
    const vehicleId = pickVehicleFlagField(row, 'vehicleId');
    if (!registrationsMatch(reg, vehicleId)) return false;

    const related = pickVehicleFlagField(row, 'relatedCostRecordId');
    if (activeNorm && related && related !== '—') {
      const relatedNorm = related.trim().toLowerCase();
      if (relatedNorm === activeNorm) return false;
    }
    return true;
  });

  matched.sort((a, b) => {
    const da = Date.parse(pickVehicleFlagField(a, 'flaggedAt')) || 0;
    const db = Date.parse(pickVehicleFlagField(b, 'flaggedAt')) || 0;
    return db - da;
  });

  return matched.map((row) => ({
    id: recordId(row),
    vehicleId: pickVehicleFlagField(row, 'vehicleId'),
    flaggedAt: pickVehicleFlagField(row, 'flaggedAt'),
    description: pickVehicleFlagField(row, 'description'),
    requiresAction: pickVehicleFlagField(row, 'requiresAction'),
    aiConfidenceScore: pickVehicleFlagField(row, 'aiConfidenceScore'),
    relatedCostRecordId: pickVehicleFlagField(row, 'relatedCostRecordId'),
    raw: row,
  }));
}

function isFileMeta(v: unknown): v is { contentType?: string } {
  return typeof v === 'object' && v !== null;
}

export function displayField(record: DpdRecord, column: TableColumn | string): string {
  const fieldName = typeof column === 'string' ? column : column.fieldName;
  const columnKey = typeof column === 'string' ? column : column.key;
  const v = resolveRecordField(record, fieldName, columnKey);
  if (v === undefined) return '—';
  return formatValue(v);
}

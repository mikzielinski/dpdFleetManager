import type { EntityGetResponse } from '@uipath/uipath-typescript/entities';
import { FieldDisplayType } from '@uipath/uipath-typescript/entities';
import { formatValue } from './record';
import type { DpdRecord } from './record';

/** Normalize entity API/display names for comparison (DPDB2BVehicles ≈ DPD_B2B_Vehicles). */
export function normalizeEntityKey(name: string): string {
  return name.toLowerCase().replace(/[\s_]/g, '');
}

export function entityNameMatches(
  referenceEntityName: string | undefined,
  candidates: readonly string[],
): boolean {
  if (!referenceEntityName?.trim()) return false;
  const ref = normalizeEntityKey(referenceEntityName);
  return candidates.some((c) => normalizeEntityKey(c) === ref);
}

/** Relationship fields on `entity` that point at one of `targetEntityNames`. */
export function findRelationshipFieldNames(
  entity: EntityGetResponse | null | undefined,
  targetEntityNames: readonly string[],
): string[] {
  const names: string[] = [];
  for (const f of entity?.fields ?? []) {
    if (!f.name) continue;
    if (f.fieldDisplayType !== FieldDisplayType.Relationship) continue;
    const refName = f.referenceEntityName ?? f.referenceEntity?.name;
    const refId = f.referenceEntity?.id;
    const matchesName = entityNameMatches(refName, targetEntityNames);
    const matchesId =
      refId != null &&
      targetEntityNames.some((t) => t.length > 30 && t.toLowerCase() === refId.toLowerCase());
    if (matchesName || matchesId) names.push(f.name);
  }
  return names;
}

export function extractRelationshipId(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    const id = o.Id ?? o.id;
    return id !== undefined && id !== null ? String(id) : '';
  }
  return String(value);
}

/** Label from an expanded relationship object or lookup map by FK id. */
export function labelFromRelationshipField(
  record: DpdRecord,
  fieldName: string,
  labelFields: readonly string[],
  lookup?: Map<string, string>,
): string {
  const v = record[fieldName];
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'object' && !Array.isArray(v)) {
    const label = pickRecordLabel(v as DpdRecord, labelFields);
    if (label !== '—') return label;
    const id = extractRelationshipId(v);
    if (id && lookup?.has(id)) return lookup.get(id)!;
    return id || '—';
  }
  const id = String(v);
  if (lookup?.has(id)) return lookup.get(id)!;
  return id || '—';
}

export function resolveRelationshipLabel(
  row: DpdRecord,
  entity: EntityGetResponse | null | undefined,
  targetEntityNames: readonly string[],
  labelFields: readonly string[],
  fallbackRefFields: readonly string[],
  inlineFields: readonly string[],
  lookup?: Map<string, string>,
): string {
  const schemaFields = findRelationshipFieldNames(entity, targetEntityNames);
  const refFields = schemaFields.length > 0 ? schemaFields : fallbackRefFields;
  for (const fn of refFields) {
    const label = labelFromRelationshipField(row, fn, labelFields, lookup);
    if (label !== '—' && label.trim() !== '') return label;
  }
  return lookupLabel(lookup ?? new Map(), row, refFields, inlineFields);
}

/** Vehicle record Id linked from a DPD_POC cost row (relationship or registration fallback). */
export function resolveLinkedVehicleId(
  pocRow: DpdRecord,
  pocEntity: EntityGetResponse | null | undefined,
  vehicleEntityNames: readonly string[],
  vehicleRefFallback: readonly string[],
): string {
  const fields = findRelationshipFieldNames(pocEntity, vehicleEntityNames);
  const keys = fields.length > 0 ? fields : vehicleRefFallback;
  for (const k of keys) {
    const id = extractRelationshipId(pocRow[k]);
    if (id) return id;
  }
  return '';
}

/** Pick first non-empty label from record keys (supports expanded relationship objects). */
export function pickRecordLabel(record: DpdRecord, fieldNames: readonly string[]): string {
  for (const name of fieldNames) {
    const v = record[name];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      const nested =
        o.displayName ?? o.DisplayName ?? o.name ?? o.Name ?? o.title ?? o.Title ?? o.label;
      if (nested !== undefined && nested !== null && nested !== '') {
        return formatValue(nested);
      }
      const id = o.Id ?? o.id;
      if (id !== undefined && id !== null && id !== '') return String(id);
    }
    const s = formatValue(v);
    if (s !== '—') return s;
  }
  return '—';
}

/** Resolve API field name from entity schema using candidates and optional display-name hint. */
export function resolveSchemaFieldName(
  entity: EntityGetResponse | null | undefined,
  candidates: readonly string[],
  displayHint?: RegExp,
): string | null {
  const fields = entity?.fields ?? [];
  for (const c of candidates) {
    if (fields.some((f) => f.name === c)) return c;
  }
  if (displayHint) {
    const hit = fields.find((f) => displayHint.test(f.displayName ?? f.name ?? ''));
    if (hit?.name) return hit.name;
  }
  return null;
}

/** Collect Id -> label map from reference entity rows. */
export function buildLookupMap(
  rows: DpdRecord[],
  idFields: readonly string[],
  labelFields: readonly string[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    let id = '';
    for (const k of idFields) {
      const v = row[k];
      if (v !== undefined && v !== null && v !== '') {
        id = String(v);
        break;
      }
    }
    if (!id) id = String(row.Id ?? row.id ?? '');
    if (!id) continue;
    const label = pickRecordLabel(row, labelFields);
    if (label !== '—') map.set(id, label);
  }
  return map;
}

export function lookupLabel(
  map: Map<string, string>,
  record: DpdRecord,
  refFields: readonly string[],
  inlineFields: readonly string[],
): string {
  for (const k of refFields) {
    const v = record[k];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      const label = pickRecordLabel(record, [k]);
      if (label !== '—') return label;
      const id = String((v as Record<string, unknown>).Id ?? (v as Record<string, unknown>).id ?? '');
      if (id && map.has(id)) return map.get(id)!;
    } else {
      const id = String(v);
      if (map.has(id)) return map.get(id)!;
    }
  }
  const inline = pickRecordLabel(record, inlineFields);
  return inline !== '—' ? inline : '—';
}

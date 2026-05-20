import type { EntityGetResponse } from '@uipath/uipath-typescript/entities';
import { formatValue } from './record';
import type { DpdRecord } from './record';

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

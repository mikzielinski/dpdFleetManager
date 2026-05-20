import type { TableColumn } from '../config';
import { displayField } from '../services/dataFabric';
import { getRecordNumericAmount } from './filterRecords';
import type { DpdRecord } from './record';
import { getRecordDate, pickField } from './record';

export function getClaimSortValue(
  r: DpdRecord,
  key: string,
  tableColumns: TableColumn[],
): string | number | null {
  if (key === 'netPrice' || key === 'amount' || key === 'totalPrice') {
    return getRecordNumericAmount(r);
  }
  if (key === 'date') {
    const d = getRecordDate(r);
    return d ? d.getTime() : null;
  }
  const col = tableColumns.find((c) => c.key === key);
  if (col) {
    const v = displayField(r, col);
    return v === '—' ? null : v;
  }
  const v = pickField(r, key);
  return v === '—' ? null : v;
}

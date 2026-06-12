import type { TableColumn } from '../config';
import { getCaseStatusFromRecord } from '../utils/caseStatus';
import type { DpdRecord } from '../utils/record';

interface Props {
  record: DpdRecord;
  tableColumns?: TableColumn[];
}

export function CaseStatusBadge({ record, tableColumns }: Props) {
  const info = getCaseStatusFromRecord(record, tableColumns);
  const showFraudTag = info.kind === 'fraud' && !/fraud|oszust/i.test(info.label);

  return (
    <span className={info.badgeClass}>
      {info.label}
      {showFraudTag ? <span className="case-status-fraud-tag">Fraud</span> : null}
    </span>
  );
}

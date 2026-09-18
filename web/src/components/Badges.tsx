import type { ChangeAction, Severity, VerificationStatus } from '@adi/engine/types';

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`badge severity-${severity.toLowerCase()}`}>{severity}</span>;
}

const STATUS_LABEL: Readonly<Record<VerificationStatus, string>> = {
  MATCHED: 'Matched',
  UNCONFIRMED: 'Unconfirmed',
  CONTRADICTED: 'Contradicted',
};

export function StatusBadge({ status }: { status: VerificationStatus }) {
  return <span className={`badge status-${status.toLowerCase()}`}>{STATUS_LABEL[status]}</span>;
}

export function ActionBadge({ action }: { action: ChangeAction }) {
  return <span className={`badge action-${action.toLowerCase()}`}>{action}</span>;
}

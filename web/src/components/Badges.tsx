import type { ChangeAction, Severity, VerificationStatus } from '@adi/engine/types';
import { SEVERITY_ICONS, STATUS_ICONS } from '../lib/icons.tsx';

export function SeverityBadge({ severity }: { severity: Severity }) {
  const SeverityIcon = SEVERITY_ICONS[severity];
  return (
    <span className={`badge tone-${severity.toLowerCase()}`}>
      <SeverityIcon weight="fill" aria-hidden="true" />
      {severity}
    </span>
  );
}

const STATUS_LABEL: Readonly<Record<VerificationStatus, string>> = {
  MATCHED: 'Matched',
  UNCONFIRMED: 'Unconfirmed',
  CONTRADICTED: 'Contradicted',
};

export function StatusBadge({ status }: { status: VerificationStatus }) {
  const StatusIcon = STATUS_ICONS[status];
  return (
    <span className={`badge tone-${status.toLowerCase()}`}>
      <StatusIcon weight="fill" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ActionBadge({ action }: { action: ChangeAction }) {
  return <span className={`badge action-${action.toLowerCase()}`}>{action}</span>;
}

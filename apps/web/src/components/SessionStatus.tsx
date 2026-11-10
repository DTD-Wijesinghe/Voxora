import type { UiSessionStatus } from '../types';

interface SessionStatusProps { status: UiSessionStatus; }
const labels: Record<UiSessionStatus, string> = { connecting: 'Connecting', live: 'Live', muted: 'Muted', reconnecting: 'Reconnecting', error: 'Connection issue', ended: 'Ended' };

export function SessionStatus({ status }: SessionStatusProps) {
  return <span className={`status-pill status-pill--${status}`}><span className="status-pill__dot" />{labels[status]}</span>;
}


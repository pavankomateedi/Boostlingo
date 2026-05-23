import type { ProviderStatusEvent } from '@workbench/types';
import type { SessionStatus } from '../hooks/useInterpreterSession.js';

interface StatusBarProps {
  status: SessionStatus;
  providerStatuses: ProviderStatusEvent[];
  error: string | null;
}

const STATUS_STYLES: Record<SessionStatus, { label: string; dot: string }> = {
  idle: { label: 'Idle', dot: 'bg-slate-500' },
  connecting: { label: 'Connecting…', dot: 'bg-amber-400 animate-pulse' },
  live: { label: 'Live', dot: 'bg-emerald-400 animate-pulse' },
  stopping: { label: 'Stopping…', dot: 'bg-amber-400' },
  error: { label: 'Error', dot: 'bg-rose-500' },
};

const PROVIDER_DOT: Record<string, string> = {
  healthy: 'bg-emerald-400',
  degraded: 'bg-amber-400',
  unavailable: 'bg-rose-500',
};

/** Shows session status, downstream provider health (circuit breakers), and errors. */
export function StatusBar({ status, providerStatuses, error }: StatusBarProps) {
  const style = STATUS_STYLES[status];
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="inline-flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
        <span className="font-medium text-slate-200">{style.label}</span>
      </span>
      {providerStatuses
        .filter((p) => p.status !== 'healthy')
        .map((p) => (
        <span
          key={p.provider}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-xs text-slate-300"
          title={p.detail ?? p.status}
        >
          <span className={`h-2 w-2 rounded-full ${PROVIDER_DOT[p.status] ?? 'bg-slate-500'}`} />
          {p.provider}
        </span>
      ))}
      {error && <span className="text-xs text-rose-400">{error}</span>}
    </div>
  );
}

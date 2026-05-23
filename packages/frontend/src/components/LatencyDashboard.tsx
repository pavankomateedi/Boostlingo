import type { LatencyEvent, LatencyStage, Mode } from '@workbench/types';
import type { LatencyThresholds } from '../lib/config.js';

interface LatencyDashboardProps {
  latencies: LatencyEvent[];
  mode: Mode | null;
  thresholds: LatencyThresholds;
}

const RING = 10;

const STAGE_LABELS: Record<LatencyStage, string> = {
  stt_first_word: 'STT first word',
  stt_final: 'STT final',
  translation_first_token: 'Translation first token',
  translation_final: 'Translation final',
  tts_first_chunk: 'TTS first chunk',
  e2e: 'End-to-end',
};

const CASCADE_STAGES: LatencyStage[] = [
  'stt_first_word',
  'stt_final',
  'translation_first_token',
  'translation_final',
  'tts_first_chunk',
  'e2e',
];

/**
 * Per-stage latency instrumentation (the required UI metric). Rolling P50/P95
 * are computed over the last {@link RING} turns per stage and colour-coded green
 * / amber / red against the configured thresholds, so the dominant stage in the
 * cascade is obvious at a glance.
 */
export function LatencyDashboard({ latencies, mode, thresholds }: LatencyDashboardProps) {
  const stages = mode === 'realtime' ? (['e2e'] as LatencyStage[]) : CASCADE_STAGES;
  const e2eThreshold = mode === 'realtime' ? thresholds.realtimeE2e : thresholds.cascadeE2e;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-2.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Latency{mode ? ` · ${mode}` : ''}
      </span>
      {stages.map((stage) => {
        const values = recent(latencies, stage);
        const p50 = percentile(values, 50);
        const p95 = percentile(values, 95);
        const threshold = thresholdFor(stage, thresholds, e2eThreshold);
        return (
          <span key={stage} className="inline-flex items-baseline gap-1.5 text-xs">
            <span className="text-slate-400">{STAGE_LABELS[stage]}</span>
            <span className={`tabular-nums font-medium ${colorClass(p50, threshold)}`}>
              {values.length ? `${p50} ms` : '—'}
            </span>
            {values.length ? (
              <span className="tabular-nums text-[10px] text-slate-600">p95 {p95}</span>
            ) : null}
          </span>
        );
      })}
      <span className="ml-auto text-[10px] text-slate-600">
        target &lt; {e2eThreshold} ms · last {RING} turns
      </span>
    </div>
  );
}

function recent(latencies: LatencyEvent[], stage: LatencyStage): number[] {
  return latencies
    .filter((l) => l.stage === stage)
    .slice(-RING)
    .map((l) => l.ms);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))] ?? 0);
}

function thresholdFor(
  stage: LatencyStage,
  thresholds: LatencyThresholds,
  e2eThreshold: number,
): number | null {
  switch (stage) {
    case 'stt_first_word':
      return thresholds.sttFirstWord;
    case 'translation_first_token':
      return thresholds.translationFirstToken;
    case 'tts_first_chunk':
      return thresholds.ttsFirstChunk;
    case 'e2e':
      return e2eThreshold;
    default:
      return null;
  }
}

function colorClass(ms: number, threshold: number | null): string {
  if (threshold === null) return 'text-slate-200';
  if (ms <= threshold * 0.66) return 'text-emerald-400';
  if (ms <= threshold) return 'text-amber-400';
  return 'text-rose-400';
}

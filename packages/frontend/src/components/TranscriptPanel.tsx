import { useEffect, useRef } from 'react';
import type { InterpreterTurn } from '../hooks/useInterpreterSession.js';

interface TranscriptPanelProps {
  turns: InterpreterTurn[];
  interimSource: string;
  interimTarget: string;
  sourceName: string;
  targetName: string;
}

/**
 * Side-by-side source and target transcripts. Each column scrolls independently
 * and auto-follows the latest line; interim (not-yet-final) text shows dimmed so
 * the user sees partials stream in before they commit.
 */
export function TranscriptPanel({
  turns,
  interimSource,
  interimTarget,
  sourceName,
  targetName,
}: TranscriptPanelProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Column
        title={sourceName}
        accent="text-sky-300"
        lines={turns.map((t) => ({ id: t.turnId, text: t.source }))}
        interim={interimSource}
      />
      <Column
        title={targetName}
        accent="text-emerald-300"
        lines={turns.map((t) => ({ id: t.turnId, text: t.target }))}
        interim={interimTarget}
      />
    </div>
  );
}

interface ColumnProps {
  title: string;
  accent: string;
  lines: { id: string; text: string }[];
  interim: string;
}

function Column({ title, accent, lines, interim }: ColumnProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, interim]);

  const visible = lines.filter((l) => l.text.length > 0);

  return (
    <div className="flex h-[62vh] min-h-[22rem] flex-col rounded-lg border border-slate-700 bg-slate-900/50">
      <div className={`border-b border-slate-700 px-5 py-3 text-sm font-semibold ${accent}`}>
        {title}
      </div>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4 text-lg">
        {visible.length === 0 && interim.length === 0 ? (
          <p className="text-slate-600">Waiting for speech…</p>
        ) : (
          visible.map((l) => (
            <p key={l.id} className="leading-relaxed text-slate-100">
              {l.text}
            </p>
          ))
        )}
        {interim.length > 0 && <p className="italic leading-relaxed text-slate-500">{interim}</p>}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LanguagePairCode, Mode } from '@workbench/types';
import { fetchConfig, type WorkbenchConfig } from './lib/config.js';
import { useInterpreterSession } from './hooks/useInterpreterSession.js';
import { ModeToggle } from './components/ModeToggle.js';
import { LanguageSelector } from './components/LanguageSelector.js';
import { TranscriptPanel } from './components/TranscriptPanel.js';
import { LatencyDashboard } from './components/LatencyDashboard.js';
import { AudioVisualizer } from './components/AudioVisualizer.js';
import { StatusBar } from './components/StatusBar.js';

export function App() {
  const [config, setConfig] = useState<WorkbenchConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('cascade');
  const [pair, setPair] = useState<LanguagePairCode>('en-es');

  const { state, start, stop, updateLanguage } = useInterpreterSession(pair);

  useEffect(() => {
    fetchConfig()
      .then((cfg) => {
        setConfig(cfg);
        setPair(cfg.defaultLanguagePair);
        // Default to Realtime when the server has an OpenAI key; otherwise fall
        // back to Cascade so we never preselect the disabled mode.
        setMode(cfg.realtimeAvailable ? 'realtime' : 'cascade');
      })
      .catch((err: unknown) =>
        setLoadError(err instanceof Error ? err.message : 'Failed to load config'),
      );
  }, []);

  const running = state.status === 'live' || state.status === 'connecting' || state.status === 'stopping';
  const currentPair = useMemo(
    () => config?.languagePairs.find((p) => p.code === pair),
    [config, pair],
  );

  const handleMode = (next: Mode) => {
    setMode(next);
    if (running) void start(next, pair);
  };

  const handlePair = (next: LanguagePairCode) => {
    setPair(next);
    if (running) updateLanguage(next);
  };

  const handleExport = () => {
    const data = state.sessionLog ?? {
      sessionId: 'live-snapshot',
      mode,
      languagePair: pair,
      turns: state.turns,
      latencies: state.latencies,
      exportedAt: new Date().toISOString(),
    };
    downloadJson(`session-${mode}-${Date.now()}.json`, data);
  };

  if (loadError) {
    return (
      <Shell>
        <p className="text-rose-400">Could not reach the backend: {loadError}</p>
        <p className="mt-2 text-sm text-slate-400">
          Start it with <code className="text-slate-200">pnpm dev</code> and reload.
        </p>
      </Shell>
    );
  }

  if (!config) {
    return (
      <Shell>
        <p className="text-slate-400">Loading…</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <ModeToggle mode={mode} realtimeAvailable={config.realtimeAvailable} onChange={handleMode} />
          <LanguageSelector pairs={config.languagePairs} value={pair} onChange={handlePair} />
        </div>
        <div className="flex items-center gap-3">
          <AudioVisualizer level={state.level} active={state.status === 'live'} />
          {running ? (
            <button
              type="button"
              onClick={() => void stop()}
              className="rounded-md bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-500"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void start(mode, pair)}
              className="rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Start session
            </button>
          )}
          <button
            type="button"
            onClick={handleExport}
            disabled={state.turns.length === 0 && !state.sessionLog}
            className="rounded-md border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-40"
          >
            Export JSON
          </button>
        </div>
      </div>

      <div className="mt-4">
        <StatusBar status={state.status} providerStatuses={state.providerStatuses} error={state.error} />
      </div>

      <div className="mt-6">
        <TranscriptPanel
          turns={state.turns}
          interimSource={state.interimSource}
          interimTarget={state.interimTarget}
          sourceName={currentPair?.source.name ?? 'Source'}
          targetName={currentPair?.target.name ?? 'Target'}
        />
      </div>

      <div className="mt-4">
        <LatencyDashboard latencies={state.latencies} mode={state.mode} thresholds={config.latencyThresholds} />
      </div>

      <footer className="mt-6 text-[11px] text-slate-500">
        Models — realtime: {config.models.realtime} · transcribe: {config.models.transcribe} ·
        translation: {config.models.translation} · tts: {config.models.tts}
        {!config.realtimeAvailable && ' · (Realtime disabled: no OpenAI key on server)'}
      </footer>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white">AI Interpreter Workbench</h1>
        <p className="text-sm text-slate-400">
          Realtime API vs. Cascade pipeline — live interpretation, side by side.
        </p>
      </header>
      {children}
    </div>
  );
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

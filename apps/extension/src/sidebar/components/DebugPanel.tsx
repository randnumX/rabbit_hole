interface DebugPanelProps {
  debugTranscript: string;
  error: string | null;
  warnings: string[];
  onTranscriptChange: (value: string) => void;
  onAnalyzeTranscript: () => void;
  onLoadSample: () => void;
}

export function DebugPanel({
  debugTranscript,
  error,
  warnings,
  onTranscriptChange,
  onAnalyzeTranscript,
  onLoadSample,
}: DebugPanelProps) {
  return (
    <section className="rounded-[24px] border border-orange-300/18 bg-[rgba(245,130,84,0.08)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-orange-100/65">Debug fallback</div>
          <div className="mt-1 text-lg font-semibold text-orange-50">Paste a transcript or load the demo fixture</div>
        </div>
        <button
          type="button"
          className="rounded-full border border-orange-200/20 px-4 py-2 text-sm font-medium text-orange-50 hover:bg-orange-200/10"
          onClick={onLoadSample}
        >
          Load sample
        </button>
      </div>

      <textarea
        className="mt-4 h-36 w-full rounded-[20px] border border-white/10 bg-black/24 p-3 text-sm leading-relaxed text-moon outline-none placeholder:text-moon/35"
        placeholder={'User: I want to build a browser extension\nAssistant: Start with a manifest and content script'}
        value={debugTranscript}
        onChange={(event) => onTranscriptChange(event.target.value)}
      />

      {warnings.length > 0 ? (
        <div className="mt-3 rounded-2xl border border-white/8 bg-black/16 p-3 text-sm text-moon/70">
          {warnings.join(' ')}
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 rounded-2xl border border-red-300/18 bg-red-400/8 p-3 text-sm text-red-100">{error}</div>
      ) : null}

      <button
        type="button"
        className="mt-4 rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-medium text-moon hover:bg-white/12"
        onClick={onAnalyzeTranscript}
      >
        Analyze pasted transcript
      </button>
    </section>
  );
}

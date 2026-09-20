import { useState } from 'react';

interface SettingsPanelProps {
  llmEndpointUrl: string;
  llmApiKey: string;
  llmModel: string;
  onSave: (settings: { endpointUrl: string; apiKey: string; model: string }) => Promise<void>;
  onClear: () => Promise<void>;
}

export function SettingsPanel({ llmEndpointUrl, llmApiKey, llmModel, onSave, onClear }: SettingsPanelProps) {
  const [endpointUrl, setEndpointUrl] = useState(llmEndpointUrl);
  const [apiKey, setApiKey] = useState(llmApiKey);
  const [model, setModel] = useState(llmModel);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!endpointUrl.trim() || !model.trim()) {
      setStatus('Endpoint URL and model name are required.');
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      await onSave({ endpointUrl: endpointUrl.trim(), apiKey: apiKey.trim(), model: model.trim() });
      setStatus('Saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await onClear();
      setEndpointUrl('');
      setApiKey('');
      setModel('');
      setStatus('Cleared. Hybrid and Probabilistic modes are unavailable until you configure an endpoint again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-[24px] border border-cyan-300/18 bg-[rgba(84,163,245,0.08)] p-4">
      <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-100/65">LLM endpoint</div>
      <div className="mt-1 text-lg font-semibold text-cyan-50">Hybrid &amp; Probabilistic modes</div>
      <p className="mt-1.5 text-sm leading-relaxed text-moon/62">
        Point at a remote OpenAI-compatible API, or a local server such as Ollama or LM Studio (e.g.{' '}
        <code className="rounded bg-black/24 px-1 py-0.5 text-xs">http://localhost:11434/v1/chat/completions</code>).
        Deterministic mode always works with no endpoint configured.
      </p>

      <div className="mt-4 space-y-3">
        <label className="block text-sm">
          <span className="text-moon/70">Endpoint URL</span>
          <input
            className="mt-1 w-full rounded-2xl border border-white/10 bg-black/24 p-2.5 text-sm text-moon outline-none placeholder:text-moon/35 focus:border-cyan-300/30"
            placeholder="https://api.openai.com/v1/chat/completions"
            value={endpointUrl}
            onChange={(event) => setEndpointUrl(event.target.value)}
          />
        </label>

        <label className="block text-sm">
          <span className="text-moon/70">Model</span>
          <input
            className="mt-1 w-full rounded-2xl border border-white/10 bg-black/24 p-2.5 text-sm text-moon outline-none placeholder:text-moon/35 focus:border-cyan-300/30"
            placeholder="gpt-4o-mini"
            value={model}
            onChange={(event) => setModel(event.target.value)}
          />
        </label>

        <label className="block text-sm">
          <span className="text-moon/70">API key (optional)</span>
          <input
            type="password"
            className="mt-1 w-full rounded-2xl border border-white/10 bg-black/24 p-2.5 text-sm text-moon outline-none placeholder:text-moon/35 focus:border-cyan-300/30"
            placeholder="Leave blank for local servers that don't require one"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </label>
      </div>

      {status ? <div className="mt-3 rounded-2xl border border-white/8 bg-black/16 p-3 text-sm text-moon/70">{status}</div> : null}

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          className="rounded-full border border-cyan-200/20 bg-cyan-200/10 px-4 py-2 text-sm font-medium text-cyan-50 hover:bg-cyan-200/16 disabled:cursor-not-allowed disabled:opacity-45"
          onClick={() => void handleSave()}
          disabled={saving}
        >
          Save
        </button>
        <button
          type="button"
          className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-moon/85 hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-45"
          onClick={() => void handleClear()}
          disabled={saving}
        >
          Clear
        </button>
      </div>
    </section>
  );
}

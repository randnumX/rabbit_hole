import { LLM_SETTINGS_STORAGE_KEY } from '@/shared/config';

/** Persisted shape for the user-configured LLM endpoint (remote API or localhost server). */
export interface StoredLlmSettings {
  endpointUrl: string;
  apiKey?: string;
  model: string;
}

// chrome.* is unavailable outside a real extension context (e.g. component tests
// that render the sidebar with mocked bindings instead of the extension runtime).
function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

export async function getStoredLlmSettings(): Promise<StoredLlmSettings | null> {
  if (!hasChromeStorage()) return null;
  const result = await chrome.storage.local.get(LLM_SETTINGS_STORAGE_KEY);
  const value = result[LLM_SETTINGS_STORAGE_KEY] as StoredLlmSettings | undefined;
  return value && value.endpointUrl && value.model ? value : null;
}

export async function setStoredLlmSettings(settings: StoredLlmSettings | null): Promise<void> {
  if (!hasChromeStorage()) return;
  if (settings === null) {
    await chrome.storage.local.remove(LLM_SETTINGS_STORAGE_KEY);
    return;
  }
  await chrome.storage.local.set({ [LLM_SETTINGS_STORAGE_KEY]: settings });
}

function originPatternForUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}/*`;
  } catch {
    return null;
  }
}

/**
 * Requests the runtime host permission for the given endpoint's origin (MV3's
 * recommended pattern over a static broad host_permissions entry). Must be called
 * from a user gesture (e.g. the Settings panel's Save button click).
 */
export async function requestLlmEndpointPermission(url: string): Promise<boolean> {
  if (!hasChromeStorage()) return false;
  const origin = originPatternForUrl(url);
  if (!origin) return false;
  return chrome.permissions.request({ origins: [origin] });
}

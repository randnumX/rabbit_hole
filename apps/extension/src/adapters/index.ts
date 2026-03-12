import { chatgptAdapter } from './chatgpt';
import { claudeAdapter } from './claude';
import { geminiAdapter } from './gemini';
import type { SiteAdapter } from './types';

const adapters: SiteAdapter[] = [chatgptAdapter, claudeAdapter, geminiAdapter];

export function resolveAdapter(locationRef: Location): SiteAdapter | null {
  const url = new URL(locationRef.href);
  return adapters.find((adapter) => adapter.canHandle(url)) ?? null;
}

export { adapters, chatgptAdapter, claudeAdapter, geminiAdapter };

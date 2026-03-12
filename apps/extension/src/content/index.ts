import React from 'react';
import { createRoot } from 'react-dom/client';
import type { AnalysisRequest } from '@rabbithole/shared-types';
import { resolveAdapter } from '@/adapters';
import type { ConversationActivityHandlers } from '@/adapters/types';
import { SidebarApp } from '@/sidebar/App';
import { sampleAnalysis, sampleConversationRequest } from '@/fixtures';
import { APP_IDS, SIDEBAR_WIDTH_PX } from '@/shared/config';
import type { TranscriptTargetContext } from '@/shared/transcriptTarget';
import type {
  AnalyzeConversationMessage,
  AnalyzeResponsePayload,
  BackgroundResponse,
  BackendStatusPayload,
  LoadSampleConversationMessage,
  SampleConversationPayload,
} from '@/shared/messages';
import sidebarCss from '@/sidebar/styles/index.css?inline';

function injectHighlightStyles() {
  if (document.getElementById(APP_IDS.highlightStyleId)) {
    return;
  }

  const style = document.createElement('style');
  style.id = APP_IDS.highlightStyleId;
  style.textContent = `
    [data-rabbithole-highlight="true"] {
      outline: 2px solid rgba(107, 224, 184, 0.92);
      outline-offset: 4px;
      border-radius: 18px;
      box-shadow: 0 0 28px rgba(107, 224, 184, 0.26);
      transition: outline-color 180ms ease, box-shadow 180ms ease;
    }
  `;
  document.head.appendChild(style);
}

function injectDockingStyles() {
  if (document.getElementById(APP_IDS.layoutStyleId)) {
    return;
  }

  const style = document.createElement('style');
  style.id = APP_IDS.layoutStyleId;
  style.textContent = `
    :root {
      --rabbithole-panel-width: ${SIDEBAR_WIDTH_PX}px;
    }

    html[${APP_IDS.dockAttribute}="open"] body {
      padding-right: calc(var(--rabbithole-panel-width) + 16px) !important;
      transition: padding-right 220ms ease;
    }

    html[${APP_IDS.dockAttribute}="open"] main,
    html[${APP_IDS.dockAttribute}="open"] [role="main"] {
      max-width: calc(100vw - var(--rabbithole-panel-width) - 16px) !important;
      transition: max-width 220ms ease;
    }

    html[${APP_IDS.dockAttribute}="open"] body > *:not(#${APP_IDS.mountId}) {
      transition: max-width 220ms ease, width 220ms ease, margin-right 220ms ease;
    }
  `;
  document.head.appendChild(style);
}

function setDockedLayout(open: boolean, width: number) {
  document.documentElement.style.setProperty('--rabbithole-panel-width', `${Math.max(width, 0)}px`);
  if (open) {
    document.documentElement.setAttribute(APP_IDS.dockAttribute, 'open');
    return;
  }

  document.documentElement.removeAttribute(APP_IDS.dockAttribute);
}

function sendBackgroundMessage<T>(message: AnalyzeConversationMessage | LoadSampleConversationMessage | { type: 'BACKEND_STATUS' }) {
  return new Promise<T>((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: BackgroundResponse<T>) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response?.ok || !response.data) {
        reject(new Error(response?.error ?? 'Extension message failed.'));
        return;
      }

      resolve(response.data);
    });
  });
}

function createMountPoint() {
  let host = document.getElementById(APP_IDS.mountId);
  if (host) {
    return host;
  }

  host = document.createElement('div');
  host.id = APP_IDS.mountId;
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.pointerEvents = 'none';
  host.style.zIndex = '2147483647';
  document.body.appendChild(host);
  return host;
}

function mountSidebar() {
  const adapter = resolveAdapter(window.location);
  if (!adapter) {
    return;
  }

  injectHighlightStyles();
  injectDockingStyles();

  const host = createMountPoint();
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });

  if (!shadow.querySelector('style')) {
    const style = document.createElement('style');
    style.textContent = sidebarCss;
    shadow.appendChild(style);
  }

  let rootElement = shadow.getElementById('rabbithole-react-root') as HTMLDivElement | null;
  if (!rootElement) {
    rootElement = document.createElement('div');
    rootElement.id = 'rabbithole-react-root';
    shadow.appendChild(rootElement);
  }

  const bindings = {
    extractConversation: () => {
      const extracted = adapter.extractTurns(document);
      const request: AnalysisRequest = {
        conversation_id: extracted.conversationId,
        source: extracted.source,
        turns: extracted.turns,
      };
      return {
        request,
        warnings: extracted.warnings,
      };
    },
    analyzeRequest: async (request: AnalysisRequest, force: boolean) =>
      sendBackgroundMessage<AnalyzeResponsePayload>({
        type: 'ANALYZE_CONVERSATION',
        payload: {
          request,
          pageUrl: window.location.href,
          force,
        },
      }),
    loadSampleConversation: async () => {
      try {
        return await sendBackgroundMessage<SampleConversationPayload>({ type: 'LOAD_SAMPLE_CONVERSATION' });
      } catch {
        return {
          request: sampleConversationRequest,
          analysis: sampleAnalysis,
        };
      }
    },
    jumpToTurn: (turnId: number, context?: TranscriptTargetContext) => {
      adapter.scrollToTurn(turnId, context);
    },
    fetchBackendStatus: () => sendBackgroundMessage<BackendStatusPayload>({ type: 'BACKEND_STATUS' }),
    watchConversationActivity: (handlers: ConversationActivityHandlers) =>
      adapter.observeActivity?.(document, handlers) ?? (() => {}),
    setDockedLayout,
  };

  createRoot(rootElement).render(
    React.createElement(React.StrictMode, null, React.createElement(SidebarApp, { bindings })),
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountSidebar, { once: true });
} else {
  mountSidebar();
}

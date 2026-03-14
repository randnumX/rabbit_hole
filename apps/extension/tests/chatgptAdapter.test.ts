import { chatgptAdapter } from '@/adapters/chatgpt';
import { APP_IDS } from '@/shared/config';

describe('chatgptAdapter', () => {
  it('collapses a user prompt and assistant reply into one exchange node', () => {
    document.body.innerHTML = `
      <main>
        <article data-message-author-role="user">
          <div class="markdown"><p>How do I build the extension?</p></div>
        </article>
        <article data-message-author-role="assistant">
          <div class="markdown">
            <p>Start with a manifest.</p>
            <pre><code>console.log("hello")</code></pre>
          </div>
        </article>
      </main>
    `;

    const result = chatgptAdapter.extractTurns(document);

    expect(result.turns).toHaveLength(1);
    expect(result.turns[0]).toMatchObject({
      id: 1,
      role: 'user',
      prompt_text: 'How do I build the extension?',
    });
    expect(result.turns[0].text).toContain('Assistant:');
    expect(result.turns[0].response_text).toContain('Start with a manifest.');
    expect(result.turns[0].text).toContain('```');
    expect(document.querySelectorAll(`[${APP_IDS.transcriptAttribute}="1"]`)).toHaveLength(2);
  });

  it('merges low-signal acknowledgements into the surrounding exchange', () => {
    document.body.innerHTML = `
      <main>
        <article data-message-author-role="user">
          <div class="markdown"><p>Help me build the extension.</p></div>
        </article>
        <article data-message-author-role="assistant">
          <div class="markdown"><p>Start with the manifest and content script.</p></div>
        </article>
        <article data-message-author-role="user">
          <div class="markdown"><p>yes</p></div>
        </article>
        <article data-message-author-role="assistant">
          <div class="markdown"><p>Then wire the sidebar injection flow.</p></div>
        </article>
      </main>
    `;

    const result = chatgptAdapter.extractTurns(document);

    expect(result.turns).toHaveLength(1);
    expect(result.turns[0].text).toContain('User: yes');
    expect(result.turns[0].prompt_text).toBe('Help me build the extension.');
    expect(result.turns[0].response_text).toContain('Then wire the sidebar injection flow.');
    expect(result.warnings[0]).toContain('Collapsed 4 raw messages into 1 exchange nodes.');
  });

  it('rebuilds transcript markers before scrolling to a collapsed exchange node', () => {
    document.body.innerHTML = `
      <main>
        <article data-message-author-role="user">
          <div class="markdown"><p>Question one</p></div>
        </article>
        <article data-message-author-role="assistant">
          <div class="markdown"><p>Answer one</p></div>
        </article>
        <article data-message-author-role="user">
          <div class="markdown"><p>Question two</p></div>
        </article>
        <article data-message-author-role="assistant">
          <div class="markdown"><p>Answer two</p></div>
        </article>
      </main>
    `;

    const scrollIntoView = vi.fn();
    for (const element of document.querySelectorAll<HTMLElement>('[data-message-author-role]')) {
      element.scrollIntoView = scrollIntoView;
    }

    chatgptAdapter.extractTurns(document);
    for (const element of document.querySelectorAll<HTMLElement>(`[${APP_IDS.transcriptAttribute}]`)) {
      element.removeAttribute(APP_IDS.transcriptAttribute);
    }

    chatgptAdapter.scrollToTurn(2);

    expect(scrollIntoView).toHaveBeenCalled();
    expect(document.querySelectorAll(`[${APP_IDS.transcriptAttribute}="2"]`)).toHaveLength(2);
  });

  it('prefers cached extracted nodes when scrolling so turn ids do not drift on recompute', () => {
    document.body.innerHTML = `
      <main>
        <article data-message-author-role="user">
          <div class="markdown"><p>Question one</p></div>
        </article>
        <article data-message-author-role="assistant">
          <div class="markdown"><p>Answer one</p></div>
        </article>
        <article data-message-author-role="user" style="display:none">
          <div class="markdown"><p>Hidden question that should not remap ids</p></div>
        </article>
        <article data-message-author-role="user">
          <div class="markdown"><p>Question two</p></div>
        </article>
        <article data-message-author-role="assistant">
          <div class="markdown"><p>Answer two</p></div>
        </article>
      </main>
    `;

    const visibleUser = document.querySelectorAll<HTMLElement>('[data-message-author-role="user"]')[0]!;
    const visibleAssistant = document.querySelectorAll<HTMLElement>('[data-message-author-role="assistant"]')[0]!;
    const visibleScroll = vi.fn();
    visibleUser.scrollIntoView = visibleScroll;
    visibleAssistant.scrollIntoView = visibleScroll;

    const result = chatgptAdapter.extractTurns(document);
    expect(result.turns).toHaveLength(2);

    chatgptAdapter.scrollToTurn(1);

    expect(visibleScroll).toHaveBeenCalled();
    expect(visibleUser.getAttribute(APP_IDS.transcriptAttribute)).toBe('1');
    expect(visibleAssistant.getAttribute(APP_IDS.transcriptAttribute)).toBe('1');
  });

  it('matches the current transcript by analyzed exchange text when cached nodes are gone', () => {
    document.body.innerHTML = `
      <main>
        <article data-message-author-role="user">
          <div class="markdown"><p>Question one</p></div>
        </article>
        <article data-message-author-role="assistant">
          <div class="markdown"><p>Answer one</p></div>
        </article>
        <article data-message-author-role="user">
          <div class="markdown"><p>Question two</p></div>
        </article>
        <article data-message-author-role="assistant">
          <div class="markdown"><p>Answer two</p></div>
        </article>
      </main>
    `;

    const result = chatgptAdapter.extractTurns(document);
    const secondTurn = result.turns[1]!;

    document.body.innerHTML = `
      <main>
        <article data-message-author-role="user">
          <div class="markdown"><p>Question one</p></div>
        </article>
        <article data-message-author-role="assistant">
          <div class="markdown"><p>Answer one</p></div>
        </article>
        <article data-message-author-role="user">
          <div class="markdown"><p>Inserted extra question</p></div>
        </article>
        <article data-message-author-role="assistant">
          <div class="markdown"><p>Inserted extra answer</p></div>
        </article>
        <article data-message-author-role="user">
          <div class="markdown"><p>Question two</p></div>
        </article>
        <article data-message-author-role="assistant">
          <div class="markdown"><p>Answer two</p></div>
        </article>
      </main>
    `;

    const remountedQuestionTwo = document.querySelectorAll<HTMLElement>('[data-message-author-role="user"]')[2]!;
    const remountedAnswerTwo = document.querySelectorAll<HTMLElement>('[data-message-author-role="assistant"]')[2]!;
    const scrollIntoView = vi.fn();
    remountedQuestionTwo.scrollIntoView = scrollIntoView;
    remountedAnswerTwo.scrollIntoView = scrollIntoView;

    chatgptAdapter.scrollToTurn(2, {
      promptText: secondTurn.prompt_text,
      responseText: secondTurn.response_text,
      text: secondTurn.text,
    });

    expect(scrollIntoView).toHaveBeenCalled();
    expect(remountedQuestionTwo.getAttribute(APP_IDS.transcriptAttribute)).toBe('2');
    expect(remountedAnswerTwo.getAttribute(APP_IDS.transcriptAttribute)).toBe('2');
  });

  it('observes composer typing, waiting, and transcript settlement for live rabbit updates', async () => {
    vi.useFakeTimers();

    document.body.innerHTML = `
      <main>
        <article data-message-author-role="user">
          <div class="markdown"><p>Explain RoPE</p></div>
        </article>
        <article data-message-author-role="assistant">
          <div class="markdown"><p>RoPE rotates vectors.</p></div>
        </article>
        <form>
          <textarea data-testid="prompt-textarea"></textarea>
          <button type="submit" data-testid="send-button">Send</button>
        </form>
      </main>
    `;

    const onTypingChange = vi.fn();
    const onWaitingChange = vi.fn();
    const onConversationSettled = vi.fn();
    const cleanup = chatgptAdapter.observeActivity?.(document, {
      onTypingChange,
      onWaitingChange,
      onConversationSettled,
    });

    const textarea = document.querySelector('textarea')!;
    textarea.value = 'Keep going';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onTypingChange).toHaveBeenLastCalledWith(true);

    document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(onTypingChange).toHaveBeenLastCalledWith(false);
    expect(onWaitingChange).toHaveBeenLastCalledWith(true);

    textarea.value = '';
    const article = document.createElement('article');
    article.setAttribute('data-message-author-role', 'assistant');
    article.innerHTML = '<div class="markdown"><p>New answer arrived.</p></div>';
    document.querySelector('main')!.appendChild(article);

    await vi.advanceTimersByTimeAsync(1200);

    expect(onWaitingChange).toHaveBeenLastCalledWith(false);
    expect(onConversationSettled).toHaveBeenCalledTimes(1);

    cleanup?.();
    vi.useRealTimers();
  });
});

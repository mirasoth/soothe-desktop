import { randomUUID } from 'node:crypto';
import type { WebContents } from 'electron';
import { Client, type InputOptions } from '@mirasoth/soothe-client';
import { Channels, type TabConnectionState, type TabEventEnvelope, type TabStatusEvent } from '@shared/ipc';
import { getSettings } from './settings.js';

const DEFAULT_VERBOSITY = 'full';
// Exponential backoff capped at 30s — retry forever until the user closes the
// tab or the daemon answers. Index `n` is the n-th consecutive failed attempt.
const RECONNECT_BACKOFF_MS = [500, 1_000, 2_000, 4_000, 8_000, 15_000, 30_000];

interface Tab {
  tabId: string;
  loopId: string;
  client: Client;
  consumeAbort: AbortController;
  closing: boolean;
}

interface OpenOptions {
  loopId?: string;
}

interface OpenResult {
  tabId: string;
  loopId: string;
}

class WSManager {
  private tabs = new Map<string, Tab>();
  private senders = new Set<WebContents>();

  registerSender(wc: WebContents): void {
    this.senders.add(wc);
    wc.on('destroyed', () => {
      this.senders.delete(wc);
    });
  }

  has(tabId: string): boolean {
    return this.tabs.has(tabId);
  }

  async open(opts: OpenOptions): Promise<OpenResult> {
    const tabId = randomUUID();
    const url = getSettings().daemonUrl;
    const client = new Client(url);

    this.broadcastStatus({ tabId, state: 'connecting' });

    let loopId: string;
    try {
      await client.connect();
      await client.waitForDaemonReady(10_000);

      const supplied = opts.loopId?.trim();
      if (!supplied) {
        loopId = await this.createNewLoop(client);
      } else {
        loopId = supplied;
        await client.sendLoopReattach(loopId);
      }

      await client.sendLoopSubscribe(loopId, DEFAULT_VERBOSITY);
      await client.waitForSubscriptionConfirmed(loopId, DEFAULT_VERBOSITY, 10_000);
    } catch (err) {
      client.close();
      const message = err instanceof Error ? err.message : String(err);
      this.broadcastStatus({ tabId, state: 'error', error: message });
      throw err;
    }

    const consumeAbort = new AbortController();
    const tab: Tab = {
      tabId,
      loopId,
      client,
      consumeAbort,
      closing: false,
    };
    this.tabs.set(tabId, tab);
    this.broadcastStatus({ tabId, state: 'ready' });
    void this.consumeMessages(tab);

    return { tabId, loopId };
  }

  async input(
    tabId: string,
    text: string,
    options: Omit<InputOptions, 'loopID'> = {},
    extras: Record<string, unknown> = {},
  ): Promise<void> {
    const tab = this.tabs.get(tabId);
    if (!tab) throw new Error(`unknown tabId: ${tabId}`);
    if (Object.keys(extras).length === 0) {
      await tab.client.sendInput(text, { loopID: tab.loopId, ...options });
      return;
    }
    // Build raw loop_input frame so we can carry fields the InputOptions
    // helper doesn't expose (clarification_answer, intent_hint, etc.).
    const payload: Record<string, unknown> = {
      type: 'loop_input',
      loop_id: tab.loopId,
      content: text,
      autonomous: options.autonomous ?? false,
    };
    if (options.attachments) payload.attachments = options.attachments;
    if (options.model) payload.model = options.model;
    if (options.modelParams) payload.model_params = options.modelParams;
    if (options.maxIterations !== undefined) payload.max_iterations = options.maxIterations;
    if (options.subagent) payload.preferred_subagent = options.subagent;
    if (options.interactive) payload.interactive = true;
    for (const [k, v] of Object.entries(extras)) {
      if (v !== undefined) payload[k] = v;
    }
    await tab.client.sendMessage(payload);
  }

  async command(tabId: string, cmd: string): Promise<void> {
    const tab = this.tabs.get(tabId);
    if (!tab) throw new Error(`unknown tabId: ${tabId}`);
    await tab.client.sendCommand(cmd);
  }

  async close(tabId: string, mode: 'detach' | 'delete'): Promise<void> {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    tab.closing = true;
    tab.consumeAbort.abort();
    try {
      if (mode === 'delete') {
        await tab.client.deleteLoop(tab.loopId, 10_000).catch(() => undefined);
      } else {
        await tab.client.sendLoopDetach(tab.loopId).catch(() => undefined);
      }
    } finally {
      tab.client.close();
      this.tabs.delete(tabId);
    }
  }

  async listSkills(tabId: string): Promise<unknown> {
    const tab = this.tabs.get(tabId);
    if (!tab) throw new Error(`unknown tabId: ${tabId}`);
    return tab.client.listSkills(15_000);
  }

  disposeAll(): void {
    for (const tab of this.tabs.values()) {
      tab.consumeAbort.abort();
      try {
        tab.client.close();
      } catch {
        // ignore
      }
    }
    this.tabs.clear();
  }

  private async createNewLoop(client: Client): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        client.removeListener('message', onMessage);
        reject(new Error('timeout waiting for loop_new_response'));
      }, 15_000);

      const onMessage = (msg: unknown): void => {
        const m = msg as { type?: string; loop_id?: string; success?: boolean; error?: string };
        if (m?.type === 'loop_new_response') {
          clearTimeout(timer);
          client.removeListener('message', onMessage);
          if (m.success === false) {
            reject(new Error(m.error ?? 'loop_new failed'));
            return;
          }
          if (typeof m.loop_id === 'string' && m.loop_id) {
            resolve(m.loop_id);
            return;
          }
          reject(new Error('loop_new_response missing loop_id'));
        }
      };

      client.on('message', onMessage);
      client.sendLoopNew().catch((err: unknown) => {
        clearTimeout(timer);
        client.removeListener('message', onMessage);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  private async consumeMessages(tab: Tab): Promise<void> {
    // Consume the currently-connected client until the connection drops or the
    // tab is closed.
    try {
      for await (const msg of tab.client.receiveMessages(tab.consumeAbort.signal)) {
        if (tab.closing) return;
        this.broadcastEvent({ tabId: tab.tabId, event: msg as Record<string, unknown> });
      }
    } catch {
      // swallow — fall through to the reconnect loop below
    }

    if (tab.closing) return;

    // Connection ended (daemon restart, network blip, etc.). Reconnect with
    // capped exponential backoff. Retry forever until either the user closes
    // the tab or a fresh subscription is established.
    let attempt = 0;
    while (!tab.closing) {
      const delay = RECONNECT_BACKOFF_MS[Math.min(attempt, RECONNECT_BACKOFF_MS.length - 1)]!;
      this.broadcastStatus({
        tabId: tab.tabId,
        state: 'reconnecting',
        error: attempt > 0 ? `retry #${attempt + 1} in ${Math.round(delay / 1000)}s` : undefined,
      });
      await new Promise(resolve => setTimeout(resolve, delay));
      if (tab.closing) return;

      try {
        const fresh = new Client(getSettings().daemonUrl);
        await fresh.connect();
        await fresh.waitForDaemonReady(10_000);
        await fresh.sendLoopReattach(tab.loopId);
        await fresh.sendLoopSubscribe(tab.loopId, DEFAULT_VERBOSITY);
        await fresh.waitForSubscriptionConfirmed(tab.loopId, DEFAULT_VERBOSITY, 10_000);
        tab.client = fresh;
        tab.consumeAbort = new AbortController();
        this.broadcastStatus({ tabId: tab.tabId, state: 'ready' });
        void this.consumeMessages(tab);
        return;
      } catch (err) {
        // Tear down the half-open client and keep trying. We *don't* flip to
        // 'error' here — the user shouldn't see "Connection error" while a
        // reconnect is still in progress.
        attempt += 1;
        const message = err instanceof Error ? err.message : String(err);
        // Surface the most recent error in the status so the renderer can
        // optionally show "still trying… (last error: ECONNREFUSED)".
        this.broadcastStatus({
          tabId: tab.tabId,
          state: 'reconnecting',
          error: message,
        });
      }
    }
  }

  private broadcastEvent(envelope: TabEventEnvelope): void {
    for (const wc of this.senders) {
      if (!wc.isDestroyed()) wc.send(Channels.TabEvent, envelope);
    }
  }

  private broadcastStatus(status: TabStatusEvent): void {
    for (const wc of this.senders) {
      if (!wc.isDestroyed()) wc.send(Channels.TabStatus, status);
    }
  }
}

export const wsManager = new WSManager();

export function statusFor(_tabId: string): TabConnectionState {
  return 'connecting';
}

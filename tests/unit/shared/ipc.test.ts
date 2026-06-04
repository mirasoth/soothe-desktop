import { describe, expect, it } from 'vitest';
import { Channels, DefaultSettings } from '@shared/ipc';

describe('IPC channel constants', () => {
  it('are stable strings', () => {
    expect(Channels.DaemonHealth).toBe('daemon:health');
    expect(Channels.TabOpen).toBe('tab:open');
    expect(Channels.TabEvent).toBe('tab:event');
  });

  it('have unique values', () => {
    const values = Object.values(Channels);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('DefaultSettings', () => {
  it('uses localhost ws URL', () => {
    expect(DefaultSettings.daemonUrl).toMatch(/^ws:\/\/127\.0\.0\.1:8765$/);
  });

  it('defaults to system theme', () => {
    expect(DefaultSettings.theme).toBe('system');
  });
});

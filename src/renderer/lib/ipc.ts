import type { SootheBridge } from '@shared/ipc';

export function soothe(): SootheBridge {
  if (typeof window === 'undefined' || !window.soothe) {
    throw new Error('soothe bridge unavailable — preload did not run');
  }
  return window.soothe;
}

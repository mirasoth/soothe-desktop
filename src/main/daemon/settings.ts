import Store from 'electron-store';
import { DefaultSettings, type Settings, type SettingsPatch } from '@shared/ipc';

const store = new Store<Settings>({
  name: 'soothe-desktop',
  defaults: DefaultSettings,
  clearInvalidConfig: true,
});

export function getSettings(): Settings {
  return {
    ...DefaultSettings,
    ...store.store,
  };
}

export function patchSettings(patch: SettingsPatch): Settings {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    (store as unknown as { set: (k: string, v: unknown) => void }).set(key, value);
  }
  return getSettings();
}

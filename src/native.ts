import { Capacitor } from '@capacitor/core';

// Всё нативное — только внутри приложения; в браузере функции тихо ничего не делают.
export const isNative = Capacitor.isNativePlatform();

type HapticsMod = typeof import('@capacitor/haptics');
let hap: HapticsMod | null = null;
let hapOn = true;
let lastBuzz = 0;

export async function initNative(h: { back: () => void }) {
  if (!isNative) return;
  const [{ StatusBar }, { App }, { SplashScreen }, haptics] = await Promise.all([
    import('@capacitor/status-bar'),
    import('@capacitor/app'),
    import('@capacitor/splash-screen'),
    import('@capacitor/haptics'),
  ]);
  hap = haptics;
  StatusBar.hide().catch(() => undefined);
  App.addListener('backButton', () => h.back());
  SplashScreen.hide().catch(() => undefined);
}

export function setHaptics(on: boolean) {
  hapOn = on;
}

// вибро-отдача: лёгкая, средняя, тяжёлая; не чаще раза в 60 мс
export function buzz(kind: 'light' | 'medium' | 'heavy') {
  if (!hap || !hapOn) return;
  const now = performance.now();
  if (now - lastBuzz < 60) return;
  lastBuzz = now;
  const style = kind === 'heavy' ? hap.ImpactStyle.Heavy : kind === 'medium' ? hap.ImpactStyle.Medium : hap.ImpactStyle.Light;
  hap.Haptics.impact({ style }).catch(() => undefined);
}

export async function exitApp() {
  if (!isNative) return;
  const { App } = await import('@capacitor/app');
  App.exitApp().catch(() => undefined);
}

// Сейв дублируется в нативное хранилище: iOS может почистить данные WebView, а Preferences — нет
export async function restoreSave(key: string) {
  if (!isNative) return;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key });
    if (value && !localStorage.getItem(key)) localStorage.setItem(key, value);
  } catch {
    // нет хранилища — играем на localStorage
  }
}

export function mirrorSave(key: string, value: string) {
  if (!isNative) return;
  import('@capacitor/preferences').then(({ Preferences }) => Preferences.set({ key, value })).catch(() => undefined);
}

export function clearSave(key: string) {
  if (!isNative) return;
  import('@capacitor/preferences').then(({ Preferences }) => Preferences.remove({ key })).catch(() => undefined);
}

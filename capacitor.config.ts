import type { CapacitorConfig } from '@capacitor/cli';

// appId — постоянный идентификатор в сторах, менять после первой публикации нельзя
const config: CapacitorConfig = {
  appId: 'com.beyondflamez.neonhex',
  appName: 'Neon Hex',
  webDir: 'dist',
  backgroundColor: '#07050a',
  ios: {
    contentInset: 'never',
    scrollEnabled: false,
    backgroundColor: '#07050a',
  },
  android: {
    backgroundColor: '#07050a',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      launchAutoHide: true,
      backgroundColor: '#07050a',
      showSpinner: false,
    },
  },
};

export default config;

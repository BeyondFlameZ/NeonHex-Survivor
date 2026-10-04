import type { CapacitorConfig } from '@capacitor/cli';

// appId — постоянный идентификатор в сторах, менять после первой публикации нельзя
const config: CapacitorConfig = {
  appId: 'com.beyondflamez.neonhex',
  appName: 'Neon Hex',
  webDir: 'dist',
  backgroundColor: '#0b1424',
  ios: {
    contentInset: 'never',
    scrollEnabled: false,
    backgroundColor: '#0b1424',
  },
  android: {
    backgroundColor: '#0b1424',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      launchAutoHide: true,
      backgroundColor: '#0b1424',
      showSpinner: false,
    },
  },
};

export default config;

/**
 * Runtime platform – the only place that asks Capacitor where the app runs.
 * On the web (Vercel/PWA) Capacitor reports 'web', so every check is safe there.
 */
import { Capacitor } from '@capacitor/core';

export type Platform = 'web' | 'ios' | 'android';

export const platform = Capacitor.getPlatform() as Platform;
export const isNative = Capacitor.isNativePlatform();
export const isWeb = !isNative;
export const isIOS = platform === 'ios';
export const isAndroid = platform === 'android';

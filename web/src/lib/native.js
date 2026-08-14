/**
 * Capa nativa (Capacitor) con degradación a web.
 *
 * Todas las funciones detectan la plataforma: en el navegador usan las
 * APIs web de siempre; en la app nativa (Android/iOS) usan los plugins.
 * Así el mismo código sirve para la web y para las stores.
 *
 * Decisión de diseño: NADA de ubicación en segundo plano. Durante una
 * carrera la pantalla se mantiene encendida (keep-awake), que es lo que
 * quiere un copiloto y evita la revisión especial de background location
 * en Google Play.
 */
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { PushNotifications } from '@capacitor/push-notifications';
import { App as CapApp } from '@capacitor/app';
import { api } from './api.js';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'web' | 'android' | 'ios'

// ─────────────────────────────────────────────
// GPS — watch unificado.
// Devuelve una función stop(). El callback recibe un objeto con la misma
// forma que GeolocationPosition (coords.latitude, coords.speed, …), que es
// lo que ya consume Live.jsx.
// ─────────────────────────────────────────────
export async function watchPosition(onPosition, onError) {
  if (!isNative) {
    if (!navigator.geolocation) {
      onError?.(new Error('Este dispositivo no tiene GPS disponible en el navegador.'));
      return () => {};
    }
    const id = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true, maximumAge: 1000, timeout: 15000,
    });
    return () => navigator.geolocation.clearWatch(id);
  }

  // Nativo: pedir permiso en contexto (nunca en el arranque)
  try {
    const perm = await Geolocation.checkPermissions();
    if (perm.location !== 'granted') {
      const req = await Geolocation.requestPermissions();
      if (req.location !== 'granted') {
        onError?.(new Error('Permiso de ubicación denegado. Actívalo en los ajustes del sistema.'));
        return () => {};
      }
    }
  } catch (err) {
    onError?.(err);
    return () => {};
  }

  const id = await Geolocation.watchPosition(
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    (pos, err) => {
      if (err) onError?.(err);
      else if (pos) onPosition(pos);
    }
  );
  return () => Geolocation.clearWatch({ id });
}

// ─────────────────────────────────────────────
// Pantalla encendida durante la carrera
// ─────────────────────────────────────────────
let webWakeLock = null;

export async function keepScreenOn() {
  if (isNative) {
    try { await KeepAwake.keepAwake(); } catch { /* opcional */ }
  } else {
    try { webWakeLock = await navigator.wakeLock?.request('screen'); } catch { /* opcional */ }
  }
}

export async function allowScreenOff() {
  if (isNative) {
    try { await KeepAwake.allowSleep(); } catch { /* — */ }
  } else {
    try { webWakeLock?.release(); webWakeLock = null; } catch { /* — */ }
  }
}

// ─────────────────────────────────────────────
// Push nativo (FCM/APNs) — solo en app instalada.
// Registra el token en el backend; las notificaciones in-app por socket
// siguen funcionando igual, esto añade la entrega con la app cerrada.
// ─────────────────────────────────────────────
let pushListenersReady = false;

// El push solo se activa si Firebase está configurado en el proyecto nativo
// (google-services.json / GoogleService-Info.plist). Sin él, llamar a
// PushNotifications.register() CRASHEA la app a nivel nativo:
// "Default FirebaseApp is not initialized" — y un try/catch de JS no lo evita.
// Activar con VITE_ENABLE_PUSH=true en el build cuando Firebase esté listo.
const PUSH_ENABLED = import.meta.env.VITE_ENABLE_PUSH === 'true';

export async function registerPush(onNotificationTap) {
  if (!isNative || !PUSH_ENABLED) return false;

  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') return false;

    if (!pushListenersReady) {
      pushListenersReady = true;

      PushNotifications.addListener('registration', (token) => {
        api.post('/profile/push-token', { token: token.value, platform })
          .catch((e) => console.warn('[push] no se pudo registrar el token:', e.message));
      });

      PushNotifications.addListener('registrationError', (err) => {
        console.warn('[push] error de registro:', err);
      });

      // Toque en una notificación con la app cerrada/en segundo plano
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const route = action.notification?.data?.route;
        if (route) onNotificationTap?.(route);
      });
    }

    await PushNotifications.register();
    return true;
  } catch (err) {
    console.warn('[push] no disponible:', err.message);
    return false;
  }
}

// ─────────────────────────────────────────────
// Deep links r4ce://… → ruta interna
// ─────────────────────────────────────────────
export function listenDeepLinks(navigateTo) {
  if (!isNative) return () => {};
  const sub = CapApp.addListener('appUrlOpen', ({ url }) => {
    try {
      // r4ce://groups/abc → /groups/abc
      const u = new URL(url);
      const route = `/${u.host}${u.pathname}`.replace(/\/+$/, '') || '/';
      navigateTo(route);
    } catch { /* URL malformada: ignorar */ }
  });
  return () => sub.then?.((s) => s.remove());
}

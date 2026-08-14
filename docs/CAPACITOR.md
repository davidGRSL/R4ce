# Capacitor — app nativa Android/iOS

Estado: los proyectos nativos ya están generados y parcheados en el repo
(`web/android/`, `web/ios/`), con permisos declarados y deep links `r4ce://`.
El código web detecta la plataforma (`web/src/lib/native.js`) y usa plugins
nativos en la app: GPS, pantalla encendida, push y deep links.

## Decisión de diseño: sin background location

Durante una carrera la pantalla se mantiene SIEMPRE encendida (keep-awake),
en vez de rastrear con pantalla apagada. Ventajas: es lo que quiere un
copiloto, y evita `ACCESS_BACKGROUND_LOCATION` — la declaración especial de
Google Play (formulario + vídeo demo) que más retrasa la publicación.
La persistencia de carrera (`lib/liveSession.js`) sigue de red de seguridad.

## Primer arranque (en tu PC, PowerShell)

```powershell
cd web
npm install
npm run build
npx cap sync
```

`cap sync` copia el build web (`dist/`) y los plugins a los proyectos nativos.
**Repite `npm run build` + `npx cap sync` después de cada cambio en el código web.**

### Android (necesitas Android Studio)

```powershell
npx cap open android
```

Desde Android Studio: Run en un emulador o móvil por USB (modo desarrollador).
Para el AAB de la Play Store: Build > Generate Signed App Bundle.

### iOS (necesitas un Mac con Xcode)

```powershell
npx cap open ios
```

En el Mac, además: `sudo gem install cocoapods` y `pod install` dentro de
`web/ios/App` la primera vez.

## URL del backend

La app nativa NO puede usar el proxy de Vite: necesita la URL real del API.

```powershell
$env:VITE_API_URL = "https://api.tudominio.com"   # o http://192.168.1.X:3000 para probar en LAN
npm run build
npx cap sync
```

- Para probar en tu red local: usa la IP LAN de tu PC (no `localhost`) y añade
  esa URL a `WEB_URL`/`MOBILE_URL` del backend (CORS).
- Android bloquea HTTP en claro por defecto: para pruebas LAN sin HTTPS, añade
  `android:usesCleartextTraffic="true"` al `<application>` del
  `AndroidManifest.xml` (y QUÍTALO antes de publicar).
- Media: con el driver de storage `local` las URLs son relativas y el código
  las resuelve contra `VITE_API_URL` (helper `resolveMediaUrl`). En producción
  usa R2 (URLs absolutas).

## Iconos y splash

Hay branding provisional en `web/resources/` (icon.png, splash.png).
Cámbialo por el definitivo (icon 1024×1024, splash 2732×2732) y ejecuta:

```powershell
npm run cap:assets
```

## Push nativo (FCM — Android e iOS)

Sin configurar, el push está desactivado y todo lo demás funciona (socket +
notificaciones del navegador). Para activarlo:

1. Crea un proyecto en [Firebase Console](https://console.firebase.google.com).
2. Añade una app Android con id `com.r4ce.app` → descarga `google-services.json`
   → colócalo en `web/android/app/`.
3. Para iOS: añade app iOS, sube tu clave APNs (requiere Apple Developer) y
   coloca `GoogleService-Info.plist` en `web/ios/App/App/`.
4. Backend: Configuración del proyecto > Cuentas de servicio > Generar clave
   privada → pon el JSON (en una línea) en `.env`:
   `FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}`
5. `docker compose up -d --force-recreate --renew-anon-volumes backend`
   (firebase-admin es dependencia nueva).

El flujo ya está cableado: la app registra su token en `POST /profile/push-token`
y `utils/notify.js` envía push (mensajes de grupo, récords, noticias) con
`data.route` para que al tocar la notificación se abra la pantalla correcta.

## Permisos ya declarados

- **Android** (`web/android/app/src/main/AndroidManifest.xml`): ubicación
  precisa (solo en uso), micrófono, notificaciones, wake lock. SIN background
  location. Deep links `r4ce://`.
- **iOS** (`web/ios/App/App/Info.plist`): purpose strings en español para
  ubicación, micrófono, fotos y cámara. Scheme `r4ce://`.
- Los permisos se piden EN CONTEXTO: ubicación al activar Live, micrófono al
  grabar una nota de voz, notificaciones al abrir la app logueado.

## Notas de voz en la app

MediaRecorder funciona en el WebView de Android y en WKWebView (iOS 14.3+).
Si en algún dispositivo iOS fallara, el plan B es el plugin
`@capacitor-community/media` o similar — probar primero en TestFlight.

## Checklist de prueba en móvil real

1. Login y navegación general (safe areas: nada tapado por el notch).
2. Live: activar detección → permiso de ubicación en contexto → la pantalla
   no se apaga durante la carrera → tiempo guardado.
3. Chat: enviar texto, foto y nota de voz (permiso de micrófono en contexto).
4. Push: con Firebase configurado, recibir un mensaje de grupo con la app
   cerrada y tocar la notificación → debe abrir ese chat.
5. Modo avión en carrera → guardar → recuperar cobertura → el tiempo se envía.

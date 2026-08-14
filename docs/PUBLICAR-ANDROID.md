# Publicar R4ce en Google Play — guía paso a paso

Estado del proyecto: la app nativa ya compila y funciona (Capacitor + Android
Studio), `targetSdkVersion = 36`, que cumple el requisito de Google para
apps nuevas desde el 31 de agosto de 2026.

Orden real de trabajo: **1 → 8**. Los pasos 1 y 2 son de código; del 3 en
adelante son trámites en Play Console.

---

## 1. Backend público con HTTPS (BLOQUEANTE)

Una app publicada no puede apuntar a `10.0.2.2` ni a `192.168.1.42`. Necesitas
una URL pública con certificado. Dos caminos:

**Opción A — VPS (recomendado para producción real)**
Un servidor barato (Hetzner, DigitalOcean, Contabo: 4-6 €/mes) + dominio.
Se despliega el mismo `docker compose` y se pone Caddy o Nginx delante para
el HTTPS automático (Let's Encrypt).

**Opción B — Cloudflare Tunnel** (sirve si el backend sigue en tu PC)
Necesita un dominio en Cloudflare. Da HTTPS sin abrir puertos, pero tu PC
tiene que estar encendido siempre: válido para la beta, no para producción.

Junto con esto, del Bloque C de `PUBLICACION-STORES.md`:

- `JWT_SECRET` y `CHAT_MASTER_KEY` definitivos (⚠ cambiar CHAT_MASTER_KEY
  después invalida todo el histórico de chat: fíjala **antes** de tener usuarios).
- `STORAGE_DRIVER=r2` con credenciales de Cloudflare R2.
- `WEB_URL` / `MOBILE_URL` con los dominios reales.
- Backups automáticos de PostgreSQL.

---

## 2. Revertir los ajustes de desarrollo

En `web/capacitor.config.json`:

```json
"server": { "androidScheme": "https" },
```

y **borrar** el bloque `"android": { "allowMixedContent": true }`.

En `web/android/app/src/main/AndroidManifest.xml`: quitar el atributo
`android:networkSecurityConfig="@xml/network_security_config"` del
`<application>` (y ya puedes borrar ese XML).

Compilar apuntando a producción:

```powershell
cd C:\Users\Culebra\R4ce\web
$env:VITE_API_URL = "https://api.tudominio.com"
$env:VITE_ENABLE_PUSH = "true"   # solo si ya configuraste Firebase
npm run build
npx cap sync android
```

Verificación mínima antes de seguir: instala ese build en el emulador y
comprueba que login, tramos y chat funcionan contra el servidor real.

---

## 3. Identidad y versión de la app

En `web/android/app/build.gradle`:

```gradle
versionCode 1        // entero, SUBIR EN CADA SUBIDA a Play (1, 2, 3…)
versionName "1.0"    // texto visible para el usuario
```

`applicationId "com.r4ce.app"` es definitivo: **no se puede cambiar nunca**
una vez publicada la app.

Iconos y splash definitivos: sustituye `web/resources/icon.png` (1024×1024) y
`splash.png` (2732×2732) y ejecuta `npm run cap:assets`.

---

## 4. Firma de la app (keystore)

Google exige un AAB firmado. La clave la generas una vez y **la guardas como
oro**: si la pierdes, no puedes volver a actualizar la app.

```powershell
cd C:\Users\Culebra\R4ce\web\android\app
& "$env:LOCALAPPDATA\Android\Sdk\..\..\Programs\Android Studio\jbr\bin\keytool.exe" -genkey -v -keystore r4ce-release.keystore -alias r4ce -keyalg RSA -keysize 2048 -validity 10000
```

(Si esa ruta de `keytool` falla, en Android Studio: **Build → Generate Signed
App Bundle → Create new…**, que hace lo mismo con formulario.)

Guarda el `.keystore` y las contraseñas en un gestor de contraseñas y en una
copia de seguridad fuera del PC. Añade `*.keystore` al `.gitignore` — **nunca**
subas la clave al repositorio.

---

## 5. Generar el AAB

En Android Studio: **Build → Generate Signed App Bundle / APK → Android App
Bundle → Next**, selecciona el keystore, alias y contraseñas, variante
**release** → Finish.

El archivo sale en:
`web\android\app\build\outputs\bundle\release\app-release.aab`

---

## 6. Cuenta de Google Play Console

1. Alta en https://play.google.com/console — **25 USD, pago único**.
2. Verificación de identidad (DNI y dirección; puede tardar días).
3. Como cuenta personal, Google exige además declarar tus datos y, si vendes
   algo, aparecerán públicos en la ficha (normativa DSA en la UE).

---

## 7. Crear la ficha de la app

En Play Console: **Crear app** → nombre, idioma, tipo (app), gratuita.

Materiales que te pedirá:

- **Icono**: 512×512 PNG.
- **Gráfico destacado**: 1024×500.
- **Capturas**: mínimo 2 de teléfono (las sacas del emulador con el botón de
  cámara de la barra lateral).
- **Descripción corta** (80 caracteres) y **larga** (4000).
- **Política de privacidad**: URL pública → `https://tudominio.com/legal/privacidad`
  (ya la tienes implementada).

Formularios obligatorios (pestaña "Contenido de la aplicación"):

- **Seguridad de los datos**: declara ubicación, audio/fotos del chat,
  identificadores; y que hay cifrado en tránsito y borrado de cuenta.
- **Clasificación de contenido (IARC)**: cuestionario; al tener chat entre
  usuarios, marca "interacción entre usuarios".
- **Anuncios**: no.
- **Público objetivo**: 16+ (coherente con tus términos).
- **App de contenido generado por usuarios**: describe tu moderación
  (denuncias, bloqueos, revisión en 24h) — todo eso ya está implementado.

---

## 8. Pruebas y publicación

⚠ Requisito clave para cuentas **personales** creadas recientemente: antes de
poder publicar en producción necesitas una **prueba cerrada con al menos 12
testers que permanezcan optados 14 días seguidos**.

Secuencia:

1. **Prueba interna** (hasta 100 testers, sin espera): sube el AAB, invita por
   correo, verifica que instala y funciona. Empieza aquí.
2. **Prueba cerrada**: crea la lista con tus 12+ testers (amigos, foro de
   rally, club…). Que instalen y usen la app durante esos 14 días.
3. Cumplido el plazo, Play Console te habilita solicitar **acceso a producción**:
   rellenas un cuestionario sobre cómo fue la prueba.
4. **Producción**: revisión de Google (de días a ~1 semana en la primera).

Para cada nueva subida: sube `versionCode`, `npm run build`, `npx cap sync
android`, regenera el AAB firmado.

---

## Resumen de costes

| Concepto | Coste |
|---|---|
| Play Console | 25 USD (pago único) |
| VPS backend | ~5 €/mes |
| Dominio | ~10 €/año |
| Cloudflare R2 | Gratis hasta 10 GB |

> Recordatorio: los textos legales (términos y privacidad) son un borrador
> pendiente de revisión por un abogado — especialmente por el tratamiento de
> datos de ubicación (RGPD) y el disclaimer de seguridad vial.

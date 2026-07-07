# Producto — R4ce

## Visión

R4ce es la app para aficionados al rally y a la conducción deportiva que quieren cronometrar sus tramos favoritos, competir contra sus propios tiempos y los de su grupo de amigos, y llevar registro de su historial y sus coches — con la privacidad como pilar: nadie tiene por qué saber quién eres ni dónde corres si tú no quieres.

## Usuario objetivo

Conductores amateur que ya hacen "tramos" con amigos: quedadas de montaña, rutas conocidas, aficionados al rally que quieren medirse sin infraestructura de competición. Usan el móvil como cronómetro GPS mientras conducen (o de copiloto).

## Principios de producto

1. **Privacidad por defecto**: registro pseudónimo (el email nunca se guarda en claro), tiempos y tramos privados salvo que el usuario los publique, grupos cerrados por código de invitación, chat cifrado (previsto E2E por grupo).
2. **Cero fricción en pista**: la pantalla Live detecta sola el tramo cercano, arma la salida y arranca/para el crono por GPS. Anuncios por voz para no mirar la pantalla.
3. **Competición social, no pública por obligación**: rankings por tramo, comparación contra referencia (tu mejor tiempo o el líder), y capas de visibilidad: privado → grupos elegidos → público.
4. **Identidad de piloto**: perfil con pseudónimo, avatar, bio y garaje con los coches (foto y modelo 3D girando).

## Funcionalidades

### Implementado

- Cuentas: registro/login pseudónimo, sesiones con refresh rotativo, perfil editable con avatar.
- Tramos: creación dibujando sobre mapa (Leaflet) con checkpoints, silueta SVG del trazado, dificultad, publicar/despublicar, favoritos, búsqueda de tramos cercanos por GPS, compartir con grupos.
- Live timing: detección automática de tramo, cronometraje por GPS con splits en checkpoints, comparación por voz contra tiempo de referencia, guardado del tiempo con vehículo y visibilidad.
- Tiempos y rankings: historial personal, ranking por tramo, detalle de cada tiempo.
- Grupos: creación, códigos de invitación expirables/regenerables, roles (owner/moderator/member), contenido compartido al grupo.
- Garaje: vehículos con foto y modelo 3D (.glb optimizado), tiempos por vehículo.
- Web admin/piloto de escritorio (React) con dashboard.

### En el schema pero sin flujo completo

- Verificación de email (`is_active`, `email_hash`, SMTP configurado pero sin envío).
- Chat de grupos persistente y cifrado (`group_messages`, `encryption_key_encrypted`; hoy Socket.io solo hace relay).
- Estadísticas de usuario (`user_stats` existe pero con cálculo de km incorrecto).

### Futuro (no empezado)

- App móvil nativa (la experiencia Live está pensada para móvil; hoy es web).
- Modo evento/quedada: sesión en vivo con varios pilotos y clasificación en directo (Socket.io + Redis ya en la infra).
- Seguridad anti-abuso: rate limiting, validación de tiempos GPS (detección de trampas).

## Nota de responsabilidad

El producto cronometra conducción en vías que pueden ser abiertas. Cualquier feature nueva debe evitar incentivar conducción peligrosa (p. ej., no gamificar velocidad máxima en público) y los textos de la app deben recordar el uso en entornos legales/cerrados.

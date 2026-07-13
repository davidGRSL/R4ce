import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Páginas legales públicas (sin auth): /legal/terminos y /legal/privacidad.
 * Sirven también como URL para las fichas de Google Play y App Store.
 *
 * ⚠ BORRADOR: revisar con un abogado antes del lanzamiento público
 * (RGPD y responsabilidad por seguridad vial).
 */

function LegalShell({ title, updated, children }) {
  return (
    <div className="min-h-screen bg-paper">
      <div className="max-w-2xl mx-auto p-6 md:p-12">
        <Link to="/" className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-ink/50 hover:text-ink mb-8">
          <ArrowLeft size={14} /> R4ce
        </Link>
        <p className="eyebrow">Legal</p>
        <h1 className="text-3xl md:text-4xl font-bold mt-1 mb-2">{title}</h1>
        <p className="font-mono text-[11px] text-ink/40 uppercase tracking-widest mb-8">
          Última actualización: {updated}
        </p>
        <div className="space-y-6 text-sm text-ink/80 leading-relaxed [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_h2]:mt-8 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
          {children}
        </div>
        <p className="mt-12 pt-6 border-t border-ink/10 text-xs font-mono text-ink/40">
          Contacto: soporte@r4ce.app {/* TODO: email real antes de publicar */}
        </p>
      </div>
    </div>
  );
}

export function Terms() {
  return (
    <LegalShell title="Términos de uso" updated="11 · 07 · 2026">
      <h2>1. El servicio</h2>
      <p>
        R4ce es una plataforma de cronometraje amateur de tramos: creación de rutas GPS,
        registro de tiempos, rankings y grupos privados con chat. Al crear una cuenta
        aceptas estos términos en su totalidad.
      </p>

      <h2>2. Seguridad vial — condición esencial de uso</h2>
      <p>
        R4ce está destinada EXCLUSIVAMENTE al uso en circuitos cerrados, vías privadas
        o eventos autorizados. Al usar el modo Live aceptas que:
      </p>
      <ul>
        <li>No utilizarás la app para competir ni cronometrar en vías públicas abiertas al tráfico.</li>
        <li>El conductor no manipulará el dispositivo en marcha; el manejo corresponde al copiloto o se realiza con el vehículo detenido.</li>
        <li>Respetarás en todo momento la normativa de tráfico y seguridad aplicable.</li>
        <li>Eres el único responsable del uso que hagas de la app y de sus consecuencias. R4ce no organiza, promueve ni supervisa las actividades cronometradas.</li>
      </ul>

      <h2>3. Contenido de usuarios y tolerancia cero</h2>
      <p>
        Los usuarios pueden publicar contenido (tramos, tiempos, mensajes, fotos, vídeos,
        audio). Mantenemos una política de <strong>tolerancia cero</strong> con el contenido
        abusivo: acoso, incitación al odio, contenido sexual, violencia, suplantación,
        spam o cualquier actividad ilegal.
      </p>
      <ul>
        <li>Todo contenido puede ser denunciado por cualquier usuario desde la propia app.</li>
        <li>Las denuncias se revisan en un plazo máximo de 24 horas.</li>
        <li>El contenido infractor se elimina y las cuentas responsables pueden ser expulsadas sin previo aviso.</li>
        <li>Puedes bloquear a cualquier usuario para dejar de ver su contenido.</li>
      </ul>

      <h2>4. Tu cuenta</h2>
      <ul>
        <li>Debes ser mayor de 16 años (o contar con autorización de tus tutores legales).</li>
        <li>Eres responsable de la seguridad de tus credenciales.</li>
        <li>Puedes eliminar tu cuenta y todos tus datos en cualquier momento desde tu perfil.</li>
      </ul>

      <h2>5. Propiedad del contenido</h2>
      <p>
        Conservas los derechos sobre el contenido que publicas. Nos concedes una licencia
        limitada para almacenarlo y mostrarlo dentro del servicio según la visibilidad que
        elijas (privado, grupo o público).
      </p>

      <h2>6. Limitación de responsabilidad</h2>
      <p>
        El servicio se ofrece "tal cual", sin garantías de disponibilidad ni exactitud del
        cronometraje (que depende del GPS de tu dispositivo). En la máxima medida permitida
        por la ley, R4ce no responde de daños derivados del uso de la app, incluidos los
        producidos conduciendo.
      </p>

      <h2>7. Cambios</h2>
      <p>
        Si modificamos estos términos, te pediremos que aceptes la nueva versión al volver
        a entrar. La fecha de la versión vigente figura arriba.
      </p>
    </LegalShell>
  );
}

export function Privacy() {
  return (
    <LegalShell title="Política de privacidad" updated="11 · 07 · 2026">
      <h2>1. Responsable</h2>
      <p>
        R4ce (proyecto en fase beta). Contacto: soporte@r4ce.app.
        {/* TODO: identificar responsable real (nombre/razón social) antes de publicar */}
      </p>

      <h2>2. Qué datos tratamos y por qué</h2>
      <ul>
        <li><strong>Cuenta</strong>: nombre de usuario, contraseña (hash bcrypt) y pseudónimo público opcional. Base legal: ejecución del contrato.</li>
        <li><strong>Email</strong>: NO guardamos tu dirección, solo un hash irreversible que permite verificar la cuenta y evitar duplicados. La dirección se usa una única vez para enviarte el enlace de verificación.</li>
        <li><strong>Ubicación GPS</strong>: solo mientras usas el modo Live o creas tramos, para cronometrar y dibujar rutas. Los recorridos se guardan asociados a tus tiempos con la visibilidad que elijas. Nunca se rastrea en segundo plano fuera de una carrera.</li>
        <li><strong>Chat de grupos</strong>: los mensajes se almacenan cifrados (AES-256-GCM). La media (fotos, vídeo, audio) se almacena en nuestro proveedor de storage.</li>
        <li><strong>Registros técnicos</strong>: IP y acciones relevantes (auditoría de seguridad, prevención de abuso). Base legal: interés legítimo.</li>
      </ul>

      <h2>3. Con quién se comparten</h2>
      <p>
        Con nadie con fines comerciales. Proveedores de infraestructura (hosting,
        almacenamiento de archivos) actúan como encargados del tratamiento.
        No hay publicidad ni venta de datos.
      </p>

      <h2>4. Cuánto tiempo</h2>
      <p>
        Mientras mantengas la cuenta. Al eliminarla desde tu perfil se borran tus datos,
        contenidos y archivos. Los registros de auditoría se conservan el tiempo
        imprescindible por seguridad.
      </p>

      <h2>5. Tus derechos (RGPD)</h2>
      <p>
        Puedes ejercer acceso, rectificación, supresión, oposición, limitación y
        portabilidad escribiendo a soporte@r4ce.app, y reclamar ante la AEPD (aepd.es).
        La mayoría se ejercen directamente desde la app: editar perfil, cambiar
        visibilidad de tus contenidos o borrar la cuenta.
      </p>

      <h2>6. Menores</h2>
      <p>El servicio no está dirigido a menores de 16 años.</p>

      <h2>7. Cambios</h2>
      <p>Si esta política cambia de forma sustancial, te lo notificaremos en la app.</p>
    </LegalShell>
  );
}

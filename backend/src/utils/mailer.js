/**
 * Envío de emails (verificación de cuenta). Fail-soft:
 *   - Con SMTP configurado (SMTP_HOST en env) → envía de verdad.
 *   - Sin SMTP (desarrollo) → loguea el enlace en la consola del backend
 *     para poder probar el flujo sin servidor de correo.
 *
 * PRIVACIDAD: la dirección solo se usa en el momento del envío; en la BD
 * se guarda únicamente su hash (users.email_hash).
 */
import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return transporter;
}

/**
 * Envía el email de verificación.
 * @returns {Promise<{sent: boolean}>}
 */
export async function sendVerificationEmail(email, verifyUrl) {
  const t = getTransporter();

  if (!t) {
    console.log(`  [mailer] SMTP no configurado. Enlace de verificación para ${email}:`);
    console.log(`  [mailer]   ${verifyUrl}`);
    return { sent: false };
  }

  await t.sendMail({
    from: process.env.SMTP_FROM || '"R4ce" <no-reply@r4ce.app>',
    to: email,
    subject: 'Verifica tu cuenta de R4ce',
    text: `Hola,\n\nConfirma tu email para activar todas las funciones de R4ce:\n${verifyUrl}\n\nEl enlace caduca en 24 horas. Si no has creado esta cuenta, ignora este mensaje.`,
    html: `
      <div style="font-family:monospace;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="letter-spacing:-1px">R4ce</h2>
        <p>Confirma tu email para activar todas las funciones de R4ce.</p>
        <p style="margin:24px 0">
          <a href="${verifyUrl}"
             style="background:#121212;color:#fafaf7;padding:12px 24px;text-decoration:none;display:inline-block">
            VERIFICAR EMAIL
          </a>
        </p>
        <p style="color:#888;font-size:12px">El enlace caduca en 24 horas.
        Si no has creado esta cuenta, ignora este mensaje.</p>
      </div>`,
  });
  return { sent: true };
}

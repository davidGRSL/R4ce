/**
 * Avisos por voz (Web Speech API).
 * Se usa para anunciar tramos cercanos y diferencias en los checkpoints
 * sin que el piloto tenga que mirar la pantalla.
 */

let voiceEs = null;

function pickVoice() {
  if (voiceEs) return voiceEs;
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  voiceEs = voices.find((v) => v.lang?.startsWith('es')) ?? null;
  return voiceEs;
}

// Algunos navegadores cargan las voces en diferido
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => { voiceEs = null; pickVoice(); };
}

export function speak(text) {
  if (!window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel(); // no encolar avisos antiguos
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'es-ES';
    const v = pickVoice();
    if (v) utter.voice = v;
    utter.rate = 1.05;
    window.speechSynthesis.speak(utter);
  } catch {
    /* silencioso: la voz es un extra, nunca debe romper el crono */
  }
}

/** "+2.35 segundos" / "-1.20 segundos" para leer en voz alta una diferencia */
export function speakGap(diffMs, context = '') {
  const secs = Math.abs(diffMs / 1000).toFixed(1).replace('.', ' coma ');
  const sign = diffMs <= 0 ? 'mejor' : 'peor';
  speak(`${context} ${secs} segundos ${sign}`.trim());
}

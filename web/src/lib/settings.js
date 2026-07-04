/**
 * Ajustes locales del usuario (persisten en el dispositivo).
 */

const KEYS = {
  compareMode: 'r4ce.compareMode', // 'global' | 'personal'
  voiceEnabled: 'r4ce.voiceEnabled', // '1' | '0'
};

/** Contra qué se compara el crono: mejor global o mi mejor tiempo */
export function getCompareMode() {
  return localStorage.getItem(KEYS.compareMode) === 'personal' ? 'personal' : 'global';
}

export function setCompareMode(mode) {
  localStorage.setItem(KEYS.compareMode, mode === 'personal' ? 'personal' : 'global');
}

export function getVoiceEnabled() {
  return localStorage.getItem(KEYS.voiceEnabled) !== '0'; // activada por defecto
}

export function setVoiceEnabled(enabled) {
  localStorage.setItem(KEYS.voiceEnabled, enabled ? '1' : '0');
}

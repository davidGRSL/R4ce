import { useState } from 'react';
import { Flag, X } from 'lucide-react';
import { api } from '../lib/api.js';

/**
 * Diálogo de denuncia de contenido (UGC).
 * props:
 *   target: { type: 'message'|'stage'|'user', id, label }
 *   onClose()
 */
export default function ReportDialog({ target, onClose }) {
  const [reason,  setReason]  = useState('');
  const [sending, setSending] = useState(false);
  const [done,    setDone]    = useState(false);
  const [error,   setError]   = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (reason.trim().length < 5 || sending) return;
    setSending(true);
    setError(null);
    try {
      await api.post('/reports', {
        targetType: target.type,
        targetId: target.id,
        reason: reason.trim(),
      });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'No se pudo enviar la denuncia');
      setSending(false);
    }
  }

  const typeLabel = { message: 'mensaje', stage: 'tramo', user: 'usuario' }[target.type];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-carbon/60" onClick={onClose}>
      <div className="bg-paper border border-ink/10 max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Flag size={16} className="text-rally" />
            <h2 className="font-display text-lg font-bold">Denunciar {typeLabel}</h2>
          </div>
          <button onClick={onClose} className="p-1 text-ink/40 hover:text-ink"><X size={16} /></button>
        </div>

        {done ? (
          <div className="space-y-4">
            <p className="text-sm text-forest font-medium">
              Denuncia recibida. La revisaremos en un plazo máximo de 24 horas.
            </p>
            <button onClick={onClose} className="btn w-full justify-center py-2.5">Cerrar</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {target.label && (
              <p className="text-xs text-ink/50 border border-ink/10 px-3 py-2 truncate">{target.label}</p>
            )}
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="¿Qué ocurre con este contenido? (mínimo 5 caracteres)"
              rows={4}
              maxLength={1000}
              autoFocus
              className="input resize-none"
            />
            {error && <p className="text-rally text-xs font-mono">{error}</p>}
            <button
              type="submit"
              disabled={reason.trim().length < 5 || sending}
              className="btn w-full justify-center py-2.5 disabled:opacity-40"
            >
              {sending ? 'Enviando…' : 'Enviar denuncia'}
            </button>
            <p className="text-[10px] font-mono text-ink/40 leading-relaxed">
              Tolerancia cero con el contenido abusivo. Las denuncias falsas
              reiteradas también pueden suponer sanciones.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

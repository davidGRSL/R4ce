import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Pencil, Trash2, AlertTriangle, List } from 'lucide-react';
import { api } from '../lib/api.js';
import { formatDate } from '../lib/format.js';

export default function MyStagesPanel() {
  const navigate = useNavigate();
  const [open,    setOpen]    = useState(false);
  const [stages,  setStages]  = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded,  setLoaded]  = useState(false);

  async function loadStages() {
    setLoading(true);
    try {
      const { data } = await api.get('/stages/my/stages?limit=50');
      setStages(data.stages || []);
      setLoaded(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) loadStages();
  }

  function onDeleted(deletedId) {
    setStages((prev) => prev.filter((s) => s.id !== deletedId));
  }

  return (
    <section>
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <p className="eyebrow">Tu garaje</p>
          <h2 className="text-2xl font-bold mt-1">Mis tramos</h2>
        </div>
      </div>

      {/* Botón desplegable */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between border border-ink p-4 hover:bg-ink/[0.02] transition-colors"
      >
        <span className="flex items-center gap-2 font-medium">
          <List size={18} />
          Ver mis tramos creados
        </span>
        <ChevronDown size={18} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border border-ink border-t-0">
          {loading ? (
            <p className="p-6 font-mono text-sm text-ink/40">Cargando…</p>
          ) : stages.length === 0 ? (
            <div className="p-10 text-center">
              <p className="font-display text-2xl font-bold mb-2">
                Aún no has creado un tramo.
              </p>
              <p className="text-rally font-mono text-sm uppercase tracking-widest">
                ¡¿A qué esperas?!
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-ink/10">
              {stages.map((s) => (
                <StageRow key={s.id} stage={s} onEdit={() => navigate(`/stages/${s.id}/edit`)} onDeleted={onDeleted} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function StageRow({ stage, onEdit, onDeleted }) {
  // Estados de confirmación: 0 = normal, 1 = primer aviso, 2 = aviso final
  const [confirmStep, setConfirmStep] = useState(0);
  const [deleting,    setDeleting]    = useState(false);
  const [typed,       setTyped]       = useState('');

  async function doDelete() {
    setDeleting(true);
    try {
      await api.delete(`/stages/${stage.id}`);
      onDeleted(stage.id);
    } catch (err) {
      console.error(err);
      setDeleting(false);
      setConfirmStep(0);
    }
  }

  const visStyles = {
    public:  'border-forest text-forest',
    private: 'border-ink/30 text-ink/60',
    group:   'border-signal text-signal',
  };

  return (
    <li className="p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium truncate">{stage.name}</h3>
            <span className={`px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest border shrink-0 ${visStyles[stage.visibility]}`}>
              {stage.visibility}
            </span>
            {stage.isPublished && (
              <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest border border-ink/20 text-ink/50 shrink-0">
                Publicado
              </span>
            )}
          </div>
          <p className="text-xs font-mono text-ink/40 mt-1">
            Nv. {stage.difficultyLevel || '—'} · {formatDate(stage.createdAt)}
          </p>
        </div>

        {confirmStep === 0 && (
          <div className="flex gap-2 shrink-0">
            <button onClick={onEdit} className="btn-ghost text-xs py-1.5">
              <Pencil size={13} /> Editar
            </button>
            <button
              onClick={() => setConfirmStep(1)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-rally/30 text-rally hover:bg-rally hover:text-paper transition-colors"
            >
              <Trash2 size={13} /> Borrar
            </button>
          </div>
        )}
      </div>

      {/* Paso 1: primer aviso */}
      {confirmStep === 1 && (
        <div className="mt-4 border border-rally/40 bg-rally/5 p-4">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle size={16} className="text-rally mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-rally">¿Seguro que quieres borrar este tramo?</p>
              <p className="text-xs text-ink/60 mt-1">
                Se eliminarán también todos los tiempos asociados. Esta acción no se puede deshacer.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setConfirmStep(0)} className="btn-ghost text-xs py-1.5">Cancelar</button>
            <button
              onClick={() => setConfirmStep(2)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-rally text-rally hover:bg-rally hover:text-paper transition-colors"
            >
              Sí, continuar
            </button>
          </div>
        </div>
      )}

      {/* Paso 2: confirmación final escribiendo el nombre */}
      {confirmStep === 2 && (
        <div className="mt-4 border border-rally bg-rally/5 p-4">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle size={16} className="text-rally mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-rally">Confirmación final</p>
              <p className="text-xs text-ink/60 mt-1">
                Escribe <strong className="font-mono">{stage.name}</strong> para confirmar el borrado.
              </p>
            </div>
          </div>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={stage.name}
            className="input mb-3"
            autoFocus
          />
          <div className="flex gap-2">
            <button onClick={() => { setConfirmStep(0); setTyped(''); }} className="btn-ghost text-xs py-1.5">
              Cancelar
            </button>
            <button
              onClick={doDelete}
              disabled={typed !== stage.name || deleting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-rally text-paper border border-rally
                         disabled:opacity-40 disabled:cursor-not-allowed hover:bg-rally/90 transition-colors"
            >
              <Trash2 size={13} />
              {deleting ? 'Borrando…' : 'Borrar definitivamente'}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

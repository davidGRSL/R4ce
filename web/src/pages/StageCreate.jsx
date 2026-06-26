import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, MapPin, Flag, Crosshair, Save } from 'lucide-react';
import { api } from '../lib/api.js';
import { reverseGeocode } from '../lib/geocode.js';
import MapPicker from "../components/MapPicker.jsx";
import PlaceSearch from "../components/PlaceSearch.jsx";

const EMPTY = {
  name: '',
  description: '',
  visibility: 'private',
  difficultyLevel: 3,
  estimatedDuration: '',
  start: null,        // { name, coord: [lat,lng] }
  end: null,
  checkpoints: [],    // [{ name, coord: [lat,lng] }]
  groupIds: [],
};

export default function StageCreate() {
  const navigate = useNavigate();
  const { id } = useParams();          // si existe → modo edición
  const editing = Boolean(id);

  const [form,    setForm]    = useState(EMPTY);
  const [groups,  setGroups]  = useState([]);
  const [mode,    setMode]    = useState('checkpoint'); // qué coloca el clic: start|end|checkpoint
  const [recenter, setRecenter] = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(editing);

  // Cargar grupos del usuario
  useEffect(() => {
    api.get('/groups/my').then(({ data }) => setGroups(data.groups || [])).catch(() => {});
  }, []);

  // Modo edición: cargar tramo existente
  useEffect(() => {
    if (!editing) return;
    async function load() {
      try {
        const { data } = await api.get(`/stages/${id}`);
        const s = data.stage;
        const props = s.routeGeojson?.properties || {};
        setForm({
          name: s.name,
          description: s.description || '',
          visibility: s.visibility,
          difficultyLevel: s.difficultyLevel || 3,
          estimatedDuration: s.estimatedDuration || '',
          start: props.start ? { name: props.start.name, coord: [props.start.coord[1], props.start.coord[0]] } : null,
          end:   props.end   ? { name: props.end.name,   coord: [props.end.coord[1], props.end.coord[0]] } : null,
          checkpoints: (props.checkpoints || []).map((cp) => ({
            name: cp.name, coord: [cp.coord[1], cp.coord[0]],
          })),
          groupIds: [],
        });
      } catch (err) {
        setError('No se pudo cargar el tramo');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, editing]);

  // Clic en el mapa → coloca punto según el modo activo
  async function handleMapClick(lat, lng) {
    const name = await reverseGeocode(lat, lng);

    if (mode === 'start') {
      setForm((f) => ({ ...f, start: { name: name || 'Inicio', coord: [lat, lng] } }));
    } else if (mode === 'end') {
      setForm((f) => ({ ...f, end: { name: name || 'Meta', coord: [lat, lng] } }));
    } else {
      setForm((f) => ({
        ...f,
        checkpoints: [...f.checkpoints, { name: name || `CP${f.checkpoints.length + 1}`, coord: [lat, lng] }],
      }));
    }
  }

  function removeCheckpoint(i) {
    setForm((f) => ({ ...f, checkpoints: f.checkpoints.filter((_, idx) => idx !== i) }));
  }

  function toggleGroup(gid) {
    setForm((f) => ({
      ...f,
      groupIds: f.groupIds.includes(gid)
        ? f.groupIds.filter((g) => g !== gid)
        : [...f.groupIds, gid],
    }));
  }

  function validate() {
    if (!form.name.trim()) return 'El nombre es obligatorio';
    if (!form.start)       return 'Debes marcar el punto de inicio';
    if (!form.end)         return 'Debes marcar el punto de meta';
    if (form.checkpoints.length === 0) return 'Añade al menos un punto de referencia';
    if (form.visibility === 'group' && form.groupIds.length === 0)
      return 'Selecciona al menos un grupo';
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }

    setError('');
    setSaving(true);

    // Construir routeGeojson: inicio → checkpoints → fin (en [lng, lat] para GeoJSON)
    const coords = [
      [form.start.coord[1], form.start.coord[0]],
      ...form.checkpoints.map((cp) => [cp.coord[1], cp.coord[0]]),
      [form.end.coord[1], form.end.coord[0]],
    ];

    const routeGeojson = {
      type: 'LineString',
      coordinates: coords,
      properties: {
        start: { name: form.start.name, coord: [form.start.coord[1], form.start.coord[0]] },
        end:   { name: form.end.name,   coord: [form.end.coord[1], form.end.coord[0]] },
        checkpoints: form.checkpoints.map((cp) => ({
          name: cp.name, coord: [cp.coord[1], cp.coord[0]],
        })),
      },
    };

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      visibility: form.visibility,
      difficultyLevel: Number(form.difficultyLevel),
      estimatedDuration: form.estimatedDuration ? Number(form.estimatedDuration) : null,
      routeGeojson,
    };

    try {
      let stageId = id;
      if (editing) {
        await api.put(`/stages/${id}`, payload);
      } else {
        const { data } = await api.post('/stages', { ...payload, groupIds: form.groupIds });
        stageId = data.stage.id;
      }

      // Si es de grupo, sincronizar grupos
      if (form.visibility === 'group') {
        await api.post(`/stages/${stageId}/groups`, { groupIds: form.groupIds });
      }

      navigate('/stages');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Error al guardar el tramo');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-12 font-mono text-sm text-ink/40">Cargando…</div>;
  }

  return (
    <div className="p-8 lg:p-12 max-w-6xl">
      <button
        onClick={() => navigate('/stages')}
        className="text-sm text-ink/60 hover:text-rally inline-flex items-center gap-2 mb-6 font-mono uppercase tracking-widest text-xs"
      >
        <ArrowLeft size={14} /> Volver a tramos
      </button>

      <header className="mb-8">
        <p className="eyebrow">{editing ? 'Edición' : 'Taller de trazadas'}</p>
        <h1 className="text-4xl font-bold mt-1">
          {editing ? 'Editar tramo' : 'Crea tu circuito'}
        </h1>
      </header>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8">
        {/* Columna izquierda: mapa + puntos */}
        <div className="space-y-4">
          {/* Selector de modo */}
          <div className="flex gap-px bg-ink/10">
            <ModeButton active={mode === 'start'}      onClick={() => setMode('start')}      icon={Flag}      label="Inicio"     color="text-signal" />
            <ModeButton active={mode === 'checkpoint'} onClick={() => setMode('checkpoint')} icon={Crosshair} label="Referencia" color="text-rally" />
            <ModeButton active={mode === 'end'}        onClick={() => setMode('end')}        icon={MapPin}    label="Meta"       color="text-forest" />
          </div>

          <p className="text-xs text-ink/50 font-mono">
            Clica en el mapa para colocar el punto de <strong>{
              mode === 'start' ? 'inicio' : mode === 'end' ? 'meta' : 'referencia'
            }</strong>. También puedes buscar por nombre abajo.
          </p>

          <MapPicker
            start={form.start}
            end={form.end}
            checkpoints={form.checkpoints}
            onMapClick={handleMapClick}
            recenterTo={recenter}
          />

          {/* Buscadores de inicio y fin */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PlaceSearch
              label="Inicio"
              value={form.start?.name}
              coord={form.start?.coord}
              accentColor="bg-signal"
              onSelect={({ name, lat, lng }) => {
                setForm((f) => ({ ...f, start: { name, coord: [lat, lng] } }));
                setRecenter([lat, lng]);
              }}
            />
            <PlaceSearch
              label="Meta"
              value={form.end?.name}
              coord={form.end?.coord}
              accentColor="bg-forest"
              onSelect={({ name, lat, lng }) => {
                setForm((f) => ({ ...f, end: { name, coord: [lat, lng] } }));
                setRecenter([lat, lng]);
              }}
            />
          </div>

          {/* Lista de checkpoints */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Puntos de referencia ({form.checkpoints.length})</label>
              <span className="text-[10px] font-mono text-ink/40 uppercase tracking-widest">Obligatorio: mín. 1</span>
            </div>
            {form.checkpoints.length === 0 ? (
              <div className="border border-dashed border-ink/20 p-4 text-center">
                <p className="text-xs text-ink/40 font-mono">
                  Clica en el mapa en modo "Referencia" para añadir puntos
                </p>
              </div>
            ) : (
              <ul className="border border-ink/10 divide-y divide-ink/5">
                {form.checkpoints.map((cp, i) => (
                  <li key={i} className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-rally text-paper text-[10px] font-mono flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-sm truncate">{cp.name}</span>
                      <span className="font-mono text-[10px] text-ink/40 shrink-0">
                        {cp.coord[0].toFixed(4)}, {cp.coord[1].toFixed(4)}
                      </span>
                    </div>
                    <button type="button" onClick={() => removeCheckpoint(i)} className="text-ink/40 hover:text-rally p-1">
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Columna derecha: datos del tramo */}
        <aside className="space-y-5">
          <div>
            <label className="label">Nombre del tramo</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="El Pinar — Etapa 1"
              className="input"
            />
          </div>

          <div>
            <label className="label">Visibilidad</label>
            <div className="grid grid-cols-3 gap-px bg-ink/10">
              {['private', 'group', 'public'].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, visibility: v }))}
                  className={`py-2 text-[10px] font-mono uppercase tracking-widest transition-colors
                    ${form.visibility === v ? 'bg-ink text-paper' : 'bg-paper text-ink/60 hover:text-ink'}`}
                >
                  {v === 'private' ? 'Privado' : v === 'group' ? 'Grupo' : 'Público'}
                </button>
              ))}
            </div>
          </div>

          {/* Selector de grupos si visibility = group */}
          {form.visibility === 'group' && (
            <div>
              <label className="label">Grupos con acceso</label>
              {groups.length === 0 ? (
                <p className="text-xs text-ink/40 font-mono border border-ink/10 p-3">
                  No perteneces a ningún grupo.
                </p>
              ) : (
                <ul className="border border-ink/10 divide-y divide-ink/5 max-h-40 overflow-y-auto">
                  {groups.map((g) => (
                    <li key={g.id}>
                      <button
                        type="button"
                        onClick={() => toggleGroup(g.id)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-ink/[0.02] transition-colors"
                      >
                        <span className="text-sm">{g.name}</span>
                        <span className={`w-4 h-4 border ${form.groupIds.includes(g.id) ? 'bg-ink border-ink' : 'border-ink/30'} flex items-center justify-center`}>
                          {form.groupIds.includes(g.id) && <span className="text-paper text-[10px]">✓</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Dificultad (1-5)</label>
              <input
                type="number" min="1" max="5"
                value={form.difficultyLevel}
                onChange={(e) => setForm((f) => ({ ...f, difficultyLevel: e.target.value }))}
                className="input"
              />
            </div>
            <div>
              <label className="label">Duración est. (s)</label>
              <input
                type="number" min="0"
                value={form.estimatedDuration}
                onChange={(e) => setForm((f) => ({ ...f, estimatedDuration: e.target.value }))}
                placeholder="180"
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="label">Notas / descripción</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={4}
              placeholder="Tipo de firme, características, advertencias…"
              className="input resize-none"
            />
          </div>

          {error && (
            <div className="border border-rally bg-rally/5 p-3 text-sm text-rally font-mono">
              {error}
            </div>
          )}

          <button type="submit" disabled={saving} className="btn w-full justify-center disabled:opacity-50">
            <Save size={16} />
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear tramo'}
          </button>
        </aside>
      </form>


    </div>
  );
}

function ModeButton({ active, onClick, icon: Icon, label, color }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 py-3 transition-colors
        ${active ? 'bg-ink text-paper' : 'bg-paper hover:bg-ink/[0.02]'}`}
    >
      <Icon size={15} className={active ? 'text-paper' : color} />
      <span className="text-xs font-mono uppercase tracking-widest">{label}</span>
    </button>
  );
}

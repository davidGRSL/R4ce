import { useState, useEffect, useRef } from 'react';
import {
  Car, Plus, Loader2, Trash2, Camera, Box, Info, X,
} from 'lucide-react';
import { api } from '../lib/api.js';

/**
 * Garaje del piloto: coches con foto y/o modelo 3D (.glb) girando.
 * Se muestra dentro del perfil.
 */
export default function Garage() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg]           = useState(null);

  async function load() {
    try {
      const { data } = await api.get('/vehicles');
      setVehicles(data.vehicles || []);
    } catch {
      setMsg({ type: 'error', text: 'No se pudo cargar el garaje' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between border-b border-ink/10 pb-2 mb-4">
        <h2 className="font-mono text-xs uppercase tracking-widest text-ink/40">
          Tu garaje
        </h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 bg-ink text-paper px-4 py-2 text-sm font-medium
                     hover:bg-rally hover:text-white transition-colors"
        >
          {showForm ? <X size={15} /> : <Plus size={15} />}
          {showForm ? 'Cerrar' : 'Subir coche'}
        </button>
      </div>

      {/* Aviso + ejemplo en pequeño de cómo se verá el coche */}
      <div className="border border-signal/50 bg-signal/10 p-4 mb-4 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink flex items-center gap-2">
            <Info size={15} className="text-ink shrink-0" />
            Luce tu coche en el garaje
          </p>
          <p className="text-sm text-ink/80 mt-1 leading-relaxed">
            Sube una <strong>foto</strong> de tu coche y, si tienes un{' '}
            <strong>modelo 3D en formato .glb</strong>, súbelo también:
            aparecerá <strong>girando en 360°</strong> como en este ejemplo →
          </p>
        </div>
        {/* Ejemplo pequeñito: modelo 3D real girando */}
        <div className="shrink-0 text-center">
          <div className="w-32 h-24 border border-ink/20 overflow-hidden">
            <model-viewer
              src="/example-car.glb"
              alt="Ejemplo de coche 3D girando"
              auto-rotate
              rotation-per-second="30deg"
              interaction-prompt="none"
              disable-zoom
              camera-orbit="auto 78deg 72%"
              min-camera-orbit="auto auto 72%"
            />
          </div>
          <p className="text-[9px] font-mono uppercase tracking-widest text-ink/50 mt-1">Ejemplo 3D</p>
        </div>
      </div>

      {msg && (
        <p className={`text-sm font-mono mb-3 ${msg.type === 'ok' ? 'text-forest' : 'text-rally'}`}>
          {msg.text}
        </p>
      )}

      {showForm && (
        <NewVehicleForm
          onDone={(text) => {
            setShowForm(false);
            setMsg({ type: 'ok', text });
            load();
          }}
          onError={(text) => setMsg({ type: 'error', text })}
        />
      )}

      {loading ? (
        <p className="font-mono text-sm text-ink/40 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Cargando garaje…
        </p>
      ) : vehicles.length === 0 ? (
        <div className="border border-ink/10 p-8 text-center">
          <Car size={32} className="mx-auto text-ink/20 mb-3" strokeWidth={1.5} />
          <p className="text-sm text-ink/60">Tu garaje está vacío.</p>
          <p className="text-xs font-mono text-ink/40 uppercase tracking-widest mt-1">
            Pulsa «Subir coche» para estrenarlo
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {vehicles.map((v) => (
            <VehicleCard key={v.id} vehicle={v} onChanged={load} onError={(t) => setMsg({ type: 'error', text: t })} />
          ))}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────
// Formulario "Subir coche"
// ─────────────────────────────────────────────
function NewVehicleForm({ onDone, onError }) {
  const [form, setForm]       = useState({ name: '', make: '', model: '', year: '' });
  const [photo, setPhoto]     = useState(null);
  const [model3d, setModel3d] = useState(null);
  const [saving, setSaving]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return onError('Ponle un nombre a tu coche');
    setSaving(true);
    try {
      const { data } = await api.post('/vehicles', {
        name:  form.name.trim(),
        make:  form.make.trim() || null,
        model: form.model.trim() || null,
        year:  form.year ? parseInt(form.year) : null,
      });
      const id = data.vehicle.id;

      if (photo) {
        const fd = new FormData();
        fd.append('image', photo);
        await api.post(`/vehicles/${id}/photo`, fd);
      }
      if (model3d) {
        const fd = new FormData();
        fd.append('model', model3d);
        await api.post(`/vehicles/${id}/model`, fd);
      }
      onDone('Coche añadido al garaje');
    } catch (err) {
      onError(err.response?.data?.error?.message || 'Error al subir el coche');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-ink/15 p-4 mb-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Nombre *</label>
          <input
            type="text" maxLength={100} value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ej. Ford Fiesta R5" className="input"
          />
        </div>
        <div>
          <label className="label">Año</label>
          <input
            type="number" min="1900" max="2100" value={form.year}
            onChange={(e) => setForm({ ...form, year: e.target.value })}
            placeholder="2018" className="input"
          />
        </div>
        <div>
          <label className="label">Marca</label>
          <input
            type="text" maxLength={50} value={form.make}
            onChange={(e) => setForm({ ...form, make: e.target.value })}
            placeholder="Ford" className="input"
          />
        </div>
        <div>
          <label className="label">Modelo</label>
          <input
            type="text" maxLength={50} value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            placeholder="Fiesta" className="input"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FilePick
          icon={Camera}
          label="Foto del coche"
          hint="JPG, PNG o WEBP · máx. 8MB"
          accept="image/jpeg,image/png,image/webp"
          file={photo}
          onFile={setPhoto}
        />
        <FilePick
          icon={Box}
          label="Modelo 3D (opcional)"
          hint="Formato .glb · máx. 30MB · girará en 360°"
          accept=".glb,model/gltf-binary"
          file={model3d}
          onFile={setModel3d}
        />
      </div>

      <button
        type="submit" disabled={saving}
        className="inline-flex items-center gap-2 bg-ink text-paper px-5 py-2.5 text-sm font-medium
                   hover:bg-rally hover:text-white transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
        {saving ? 'Subiendo…' : 'Añadir al garaje'}
      </button>
    </form>
  );
}

function FilePick({ icon: Icon, label, hint, accept, file, onFile }) {
  const ref = useRef(null);
  return (
    <button
      type="button"
      onClick={() => ref.current?.click()}
      className={`border border-dashed p-3 text-left transition-colors
        ${file ? 'border-forest bg-forest/5' : 'border-ink/25 hover:border-ink'}`}
    >
      <p className="text-xs font-mono uppercase tracking-widest text-ink/60 flex items-center gap-2">
        <Icon size={13} /> {label}
      </p>
      <p className={`text-sm mt-1 truncate ${file ? 'text-forest font-medium' : 'text-ink/40'}`}>
        {file ? file.name : hint}
      </p>
      <input
        ref={ref} type="file" accept={accept} className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </button>
  );
}

// ─────────────────────────────────────────────
// Tarjeta de un coche del garaje
// ─────────────────────────────────────────────
function VehicleCard({ vehicle: v, onChanged, onError }) {
  const [busy, setBusy]       = useState(false);
  const [confirm, setConfirm] = useState(false);
  const photoRef = useRef(null);
  const modelRef = useRef(null);

  async function uploadFile(kind, file) {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append(kind === 'photo' ? 'image' : 'model', file);
      await api.post(`/vehicles/${v.id}/${kind}`, fd);
      onChanged();
    } catch (err) {
      onError(err.response?.data?.error?.message || 'Error al subir el archivo');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await api.delete(`/vehicles/${v.id}`);
      onChanged();
    } catch {
      onError('No se pudo borrar el vehículo');
      setBusy(false);
    }
  }

  return (
    <div className="border border-ink/10">
      {/* Visual: modelo 3D girando > foto > placeholder */}
      <div className={`aspect-video relative ${v.modelUrl ? 'bg-paper' : 'bg-carbon'}`}>
        {v.modelUrl ? (
          <model-viewer
            src={v.modelUrl}
            alt={v.name}
            auto-rotate
            rotation-per-second="30deg"
            camera-controls
            disable-zoom
            interaction-prompt="none"
            camera-orbit="auto 78deg 72%"
            min-camera-orbit="auto auto 72%"
          />
        ) : v.photoUrl ? (
          <img src={v.photoUrl} alt={v.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-ink/30">
            <Car size={36} strokeWidth={1.5} />
            <p className="text-[10px] font-mono uppercase tracking-widest mt-2">Sin foto</p>
          </div>
        )}
        {v.modelUrl && (
          <span className="absolute top-2 right-2 px-2 py-0.5 bg-rally text-white text-[9px] font-mono uppercase tracking-widest">
            3D · 360°
          </span>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium truncate">{v.name}</p>
            <p className="text-xs font-mono text-ink/50 mt-0.5">
              {[v.make, v.model, v.year].filter(Boolean).join(' · ') || '—'}
              {v.timesCount != null && ` · ${v.timesCount} tiempos`}
            </p>
          </div>
          {busy && <Loader2 size={15} className="animate-spin text-ink/40 shrink-0 mt-1" />}
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          <button
            onClick={() => photoRef.current?.click()}
            disabled={busy}
            className="btn-ghost text-xs py-1.5 disabled:opacity-40"
          >
            <Camera size={12} /> {v.photoUrl ? 'Cambiar foto' : 'Añadir foto'}
          </button>
          <button
            onClick={() => modelRef.current?.click()}
            disabled={busy}
            className="btn-ghost text-xs py-1.5 disabled:opacity-40"
          >
            <Box size={12} /> {v.modelUrl ? 'Cambiar 3D' : 'Añadir 3D'}
          </button>
          {confirm ? (
            <button
              onClick={handleDelete}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-rally text-white disabled:opacity-40"
            >
              <Trash2 size={12} /> ¿Seguro?
            </button>
          ) : (
            <button
              onClick={() => setConfirm(true)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-rally/30 text-rally
                         hover:bg-rally hover:text-white transition-colors disabled:opacity-40"
            >
              <Trash2 size={12} /> Borrar
            </button>
          )}
        </div>

        <input
          ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          onChange={(e) => uploadFile('photo', e.target.files?.[0])}
        />
        <input
          ref={modelRef} type="file" accept=".glb,model/gltf-binary" className="hidden"
          onChange={(e) => uploadFile('model', e.target.files?.[0])}
        />
      </div>
    </div>
  );
}

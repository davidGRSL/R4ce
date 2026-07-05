import { useState, useEffect, useRef } from 'react';
import { Camera, Trash2, Save, Loader2 } from 'lucide-react';
import { api } from '../lib/api.js';
import Garage from '../components/Garage.jsx';

function formatBest(ms) {
  if (ms == null) return '—';
  const totalSec = ms / 1000;
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg]         = useState(null);

  const [form, setForm] = useState({ pseudonym: '', bio: '', location: '' });
  const fileInput = useRef(null);

  async function load() {
    try {
      const { data } = await api.get('/profile');
      setProfile(data.profile);
      setStats(data.stats);
      setForm({
        pseudonym: data.profile.pseudonym || '',
        bio:       data.profile.bio || '',
        location:  data.profile.location || '',
      });
    } catch {
      setMsg({ type: 'error', text: 'No se pudo cargar el perfil' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const { data } = await api.patch('/profile', form);
      setProfile(data.profile);
      setMsg({ type: 'ok', text: 'Perfil actualizado' });
    } catch {
      setMsg({ type: 'error', text: 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const { data } = await api.post('/profile/avatar', fd);
      setProfile((p) => ({ ...p, avatarUrl: data.avatarUrl }));
      setMsg({ type: 'ok', text: 'Avatar actualizado' });
    } catch {
      setMsg({ type: 'error', text: 'Error al subir la imagen' });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function handleAvatarDelete() {
    setUploading(true);
    setMsg(null);
    try {
      await api.delete('/profile/avatar');
      setProfile((p) => ({ ...p, avatarUrl: null }));
      setMsg({ type: 'ok', text: 'Avatar eliminado' });
    } catch {
      setMsg({ type: 'error', text: 'Error al eliminar' });
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-10 flex items-center gap-3 text-ink/50">
        <Loader2 className="animate-spin" size={18} /> Cargando perfil…
      </div>
    );
  }

  const displayName = profile?.pseudonym || profile?.username || 'Piloto';
  const initials = displayName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const statItems = [
    { label: 'Tramos creados', value: stats?.stages ?? 0 },
    { label: 'Tiempos',        value: stats?.times ?? 0 },
    { label: 'Vehículos',      value: stats?.vehicles ?? 0 },
    { label: 'Grupos',         value: stats?.groups ?? 0 },
    { label: 'Mejor tiempo',   value: formatBest(stats?.bestTimeMs) },
  ];

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      {/* Cabecera */}
      <div className="flex items-center gap-5 mb-8">
        <div className="relative">
          {profile?.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={displayName}
              className="w-24 h-24 rounded-full object-cover border-2 border-ink/10"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-rally/20 text-rally flex items-center justify-center
                            text-2xl font-bold font-mono border-2 border-ink/10">
              {initials}
            </div>
          )}
          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-ink text-paper
                       flex items-center justify-center hover:bg-rally transition-colors disabled:opacity-50"
            title="Cambiar foto"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            className="hidden"
          />
        </div>

        <div>
          <h1 className="font-display text-3xl font-bold tracking-tighter">{displayName}</h1>
          <p className="text-sm text-ink/50 font-mono">@{profile?.username}</p>
          {profile?.avatarUrl && (
            <button
              onClick={handleAvatarDelete}
              disabled={uploading}
              className="mt-2 inline-flex items-center gap-1 text-xs font-mono uppercase tracking-widest
                         text-ink/40 hover:text-rally transition-colors disabled:opacity-50"
            >
              <Trash2 size={12} /> Quitar foto
            </button>
          )}
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
        {statItems.map((s) => (
          <div key={s.label} className="border border-ink/10 p-3">
            <p className="font-display text-2xl font-bold">{s.value}</p>
            <p className="text-[10px] font-mono text-ink/40 uppercase tracking-widest mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Garaje: coches con foto y modelo 3D girando */}
      <Garage />

      {/* Formulario */}
      <form onSubmit={handleSave} className="space-y-5">
        <h2 className="font-mono text-xs uppercase tracking-widest text-ink/40 border-b border-ink/10 pb-2">
          Editar perfil
        </h2>

        <div>
          <label className="block text-xs font-mono uppercase tracking-widest text-ink/50 mb-1">
            Nombre público
          </label>
          <input
            type="text"
            maxLength={50}
            value={form.pseudonym}
            onChange={(e) => setForm({ ...form, pseudonym: e.target.value })}
            className="w-full border border-ink/15 px-3 py-2 text-sm focus:outline-none focus:border-ink"
          />
        </div>

        <div>
          <label className="block text-xs font-mono uppercase tracking-widest text-ink/50 mb-1">
            Ubicación
          </label>
          <input
            type="text"
            maxLength={100}
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="Ej. Teruel, España"
            className="w-full border border-ink/15 px-3 py-2 text-sm focus:outline-none focus:border-ink"
          />
        </div>

        <div>
          <label className="block text-xs font-mono uppercase tracking-widest text-ink/50 mb-1">
            Bio
          </label>
          <textarea
            rows={4}
            maxLength={500}
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            placeholder="Cuéntanos sobre ti…"
            className="w-full border border-ink/15 px-3 py-2 text-sm focus:outline-none focus:border-ink resize-none"
          />
          <p className="text-[10px] font-mono text-ink/30 mt-1 text-right">{form.bio.length}/500</p>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 bg-ink text-paper px-5 py-2.5 text-sm font-medium
                       hover:bg-rally transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Guardar cambios
          </button>
          {msg && (
            <span className={`text-sm font-mono ${msg.type === 'ok' ? 'text-forest' : 'text-rally'}`}>
              {msg.text}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
import { useState, useRef, useEffect } from 'react';
import { Search, MapPin, Loader2 } from 'lucide-react';
import { searchPlace } from '../lib/geocode.js';

/**
 * PlaceSearch — input con autocompletado vía Nominatim.
 * props:
 *   label
 *   value: texto actual
 *   coord: [lat, lng] | null  (para mostrar si ya está resuelto)
 *   onSelect({ name, lat, lng })
 *   accentColor: clase tailwind para el punto (ej. 'bg-signal')
 */
export default function PlaceSearch({ label, value, coord, onSelect, accentColor = 'bg-rally' }) {
  const [text,     setText]     = useState(value || '');
  const [results,  setResults]  = useState([]);
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const debounce = useRef(null);
  const wrapper  = useRef(null);

  useEffect(() => {
    setText(value || '');
  }, [value]);

  // Cerrar al clicar fuera
  useEffect(() => {
    function onClickOutside(e) {
      if (wrapper.current && !wrapper.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function handleChange(e) {
    const q = e.target.value;
    setText(q);
    clearTimeout(debounce.current);

    if (q.trim().length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }

    setLoading(true);
    debounce.current = setTimeout(async () => {
      const found = await searchPlace(q);
      setResults(found);
      setOpen(true);
      setLoading(false);
    }, 600);
  }

  function pick(r) {
    setText(r.shortName);
    setOpen(false);
    onSelect({ name: r.shortName, lat: r.lat, lng: r.lng });
  }

  return (
    <div ref={wrapper} className="relative">
      <label className="label">{label}</label>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
        <input
          type="text"
          value={text}
          onChange={handleChange}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Escribe un lugar (ej. Alcañiz)…"
          className="input pl-9 pr-9"
        />
        {loading && (
          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/40 animate-spin" />
        )}
        {coord && !loading && (
          <span className={`absolute right-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full ${accentColor}`} />
        )}
      </div>

      {coord && (
        <p className="font-mono text-[10px] text-ink/40 mt-1">
          {coord[0].toFixed(5)}, {coord[1].toFixed(5)}
        </p>
      )}

      {open && results.length > 0 && (
        <ul className="absolute z-[1000] left-0 right-0 mt-1 bg-paper border border-ink shadow-lg max-h-56 overflow-y-auto">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => pick(r)}
                className="w-full text-left px-3 py-2 hover:bg-ink/[0.04] flex items-start gap-2 transition-colors"
              >
                <MapPin size={14} className="text-ink/40 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.shortName}</p>
                  <p className="text-[10px] text-ink/40 truncate">{r.name}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

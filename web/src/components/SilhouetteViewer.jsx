import { useState, useRef, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, RotateCw, Flag, Crosshair, MapPin } from 'lucide-react';

const ZOOM_MIN  = 0.5;
const ZOOM_MAX  = 4;
const ZOOM_STEP = 1.25;  // botones
const WHEEL_STEP = 1.15; // rueda del ratón
const ROT_STEP  = 15;    // grados por pulsación

const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

/**
 * Visor de la silueta del tramo, interactivo como un mapa:
 *   - Rueda del ratón → zoom hacia el cursor
 *   - Arrastrar (ratón o un dedo) → mover
 *   - Pellizco con dos dedos → zoom (móvil)
 *   - Doble clic/tap → acercar
 *   - Botones: zoom, rotación en pasos de 15°, mostrar/ocultar salida/CP/meta
 *
 * La ocultación funciona por CSS (ver index.css, .sil-viewer) tanto para
 * siluetas nuevas (grupos data-part) como para las ya guardadas en BD
 * (selectores por atributo fill/font-size).
 */
export default function SilhouetteViewer({ svg, className = '' }) {
  const [showStart, setShowStart] = useState(true);
  const [showCps,   setShowCps]   = useState(true);
  const [showEnd,   setShowEnd]   = useState(true);
  const [zoom,      setZoom]      = useState(1);
  const [rotation,  setRotation]  = useState(0);
  const [pan,       setPan]       = useState({ x: 0, y: 0 });
  const [smooth,    setSmooth]    = useState(true); // transición solo en acciones de botón
  const [dragging,  setDragging]  = useState(false);

  const canvasRef   = useRef(null);
  const pointersRef = useRef(new Map()); // pointerId → { x, y }
  const pinchRef    = useRef(null);      // { dist, zoom, pan, mid } al iniciar el pellizco

  // Estado vivo para los handlers nativos (evita closures obsoletos)
  const live = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  live.current = { zoom, pan };

  // Centro del lienzo en coordenadas de pantalla
  const center = useCallback(() => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, []);

  // Zoom manteniendo fijo el punto (px, py) de pantalla.
  // Con transform "translate(P) rotate scale" y origen en el centro c:
  //   P' = (1-k)(u-c) + kP   donde k = zoomNuevo / zoomViejo
  const zoomAt = useCallback((px, py, factor) => {
    const { zoom: z, pan: p } = live.current;
    const nz = clampZoom(z * factor);
    const k  = nz / z;
    if (k === 1) return;
    const c = center();
    const ux = px - c.x, uy = py - c.y;
    setZoom(nz);
    setPan({ x: (1 - k) * ux + k * p.x, y: (1 - k) * uy + k * p.y });
  }, [center]);

  // ── Rueda del ratón (listener nativo: React lo registra passive) ──
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    function onWheel(e) {
      e.preventDefault();
      setSmooth(false);
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP);
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // ── Arrastre y pellizco (Pointer Events: ratón + táctil) ──
  function onPointerDown(e) {
    canvasRef.current.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setSmooth(false);
    setDragging(true);

    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = {
        dist: Math.hypot(b.x - a.x, b.y - a.y),
        zoom: live.current.zoom,
        pan:  { ...live.current.pan },
        mid:  { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
    }
  }

  function onPointerMove(e) {
    const pts = pointersRef.current;
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pts.size === 2 && pinchRef.current) {
      // Pellizco: zoom sobre el punto medio + desplazamiento del punto medio
      const [a, b] = [...pts.values()];
      const pinch = pinchRef.current;
      const dist  = Math.hypot(b.x - a.x, b.y - a.y);
      const mid   = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const nz    = clampZoom(pinch.zoom * (dist / pinch.dist));
      const k     = nz / pinch.zoom;
      const c     = center();
      const ux = pinch.mid.x - c.x, uy = pinch.mid.y - c.y;
      setZoom(nz);
      setPan({
        x: (1 - k) * ux + k * pinch.pan.x + (mid.x - pinch.mid.x),
        y: (1 - k) * uy + k * pinch.pan.y + (mid.y - pinch.mid.y),
      });
    } else if (pts.size === 1) {
      // Arrastre con un puntero
      setPan((p) => ({ x: p.x + (e.clientX - prev.x), y: p.y + (e.clientY - prev.y) }));
    }
  }

  function onPointerEnd(e) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) setDragging(false);
  }

  function onDoubleClick(e) {
    setSmooth(true);
    zoomAt(e.clientX, e.clientY, ZOOM_STEP * ZOOM_STEP);
  }

  if (!svg) return null;

  const transformed = zoom !== 1 || rotation !== 0 || pan.x !== 0 || pan.y !== 0;

  function buttonZoom(factor) {
    setSmooth(true);
    const c = center();
    zoomAt(c.x, c.y, factor);
  }

  function reset() {
    setSmooth(true);
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  }

  const hideClasses = [
    !showStart && 'hide-start',
    !showCps   && 'hide-cps',
    !showEnd   && 'hide-end',
  ].filter(Boolean).join(' ');

  return (
    <div className={`border border-ink/10 ${className}`}>
      {/* Barra de controles */}
      <div className="flex items-center justify-between flex-wrap gap-2 px-2 py-1.5 border-b border-ink/10">
        {/* Toggles de puntos */}
        <div className="flex gap-1">
          <ToggleButton active={showStart} onClick={() => setShowStart((v) => !v)} icon={Flag} title="Mostrar/ocultar salida">
            Salida
          </ToggleButton>
          <ToggleButton active={showCps} onClick={() => setShowCps((v) => !v)} icon={Crosshair} title="Mostrar/ocultar referencias">
            CP
          </ToggleButton>
          <ToggleButton active={showEnd} onClick={() => setShowEnd((v) => !v)} icon={MapPin} title="Mostrar/ocultar meta">
            Meta
          </ToggleButton>
        </div>

        {/* Zoom + rotación */}
        <div className="flex items-center gap-1">
          <CtrlButton onClick={() => buttonZoom(1 / ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} title="Alejar"><ZoomOut size={14} /></CtrlButton>
          <CtrlButton onClick={() => buttonZoom(ZOOM_STEP)}     disabled={zoom >= ZOOM_MAX} title="Acercar"><ZoomIn size={14} /></CtrlButton>
          <span className="w-px h-4 bg-ink/10 mx-0.5" />
          <CtrlButton onClick={() => { setSmooth(true); setRotation((d) => d - ROT_STEP); }} title="Rotar a la izquierda"><RotateCcw size={14} /></CtrlButton>
          <CtrlButton onClick={() => { setSmooth(true); setRotation((d) => d + ROT_STEP); }} title="Rotar a la derecha"><RotateCw size={14} /></CtrlButton>
          {transformed && (
            <button
              type="button"
              onClick={reset}
              className="ml-1 px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-ink/50 hover:text-ink
                         border border-ink/15 hover:border-ink transition-colors"
              title="Restablecer vista"
            >
              1:1
            </button>
          )}
        </div>
      </div>

      {/* Lienzo interactivo */}
      <div
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onDoubleClick={onDoubleClick}
        className={`sil-viewer ${hideClasses} overflow-hidden p-3 select-none
                    ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ touchAction: 'none' }}
      >
        <div
          className={`[&_svg]:w-full [&_svg]:h-auto [&_svg]:pointer-events-none
                      ${smooth ? 'transition-transform duration-200 ease-out' : ''}`}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${zoom})` }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  );
}

function ToggleButton({ active, onClick, icon: Icon, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono uppercase tracking-widest border transition-colors
                  ${active
                    ? 'bg-ink text-paper border-ink'
                    : 'text-ink/40 border-ink/15 hover:text-ink hover:border-ink line-through'}`}
    >
      <Icon size={11} /> {children}
    </button>
  );
}

function CtrlButton({ onClick, disabled, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="p-1.5 text-ink/50 hover:text-ink border border-ink/15 hover:border-ink
                 transition-colors disabled:opacity-30 disabled:pointer-events-none"
    >
      {children}
    </button>
  );
}

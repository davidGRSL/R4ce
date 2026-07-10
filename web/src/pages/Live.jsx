import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Radar, Play, Square, MapPin, Volume2, VolumeX, Trophy, User,
  Flag, TimerReset, CheckCircle2, XCircle, Navigation, Save, CloudOff, History,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { distanceM, formatDistance, speedKmh } from '../lib/geo.js';
import { speak, speakGap } from '../lib/speech.js';
import { formatDuration, formatSignedGap } from '../lib/format.js';
import {
  getCompareMode, setCompareMode,
  getVoiceEnabled, setVoiceEnabled,
} from '../lib/settings.js';
import {
  saveRun, loadRun, clearRun,
  queueTime, flushPendingTimes, pendingTimesCount,
} from '../lib/liveSession.js';

// ── Radios de disparo (metros) ────────────────────────────
const NOTIFY_DIST   = 500;  // avisar de tramo cercano
const QUERY_RADIUS  = 1000; // radio de búsqueda en el backend
const START_ZONE    = 30;   // "en línea de salida"
const START_EXIT    = 40;   // al salir de la zona → arranca el crono
const CP_RADIUS     = 40;   // paso por checkpoint
const FINISH_RADIUS = 35;   // cruce de meta

// fases: idle → scanning → armed → ready → running → finished
export default function Live() {
  const [searchParams] = useSearchParams();

  const [phase, setPhase]       = useState('idle');
  const [position, setPosition] = useState(null);      // GeolocationPosition
  const [nearby, setNearby]     = useState([]);         // tramos cercanos
  const [candidate, setCandidate] = useState(null);     // tramo propuesto (banner)
  const [stage, setStage]       = useState(null);       // tramo en el que participo
  const [reference, setReference] = useState(null);     // tiempo de referencia {durationMs, splits, label}
  const [elapsed, setElapsed]   = useState(0);
  const [splits, setSplits]     = useState([]);         // [{checkpointIndex, ms}]
  const [gpsError, setGpsError] = useState(null);
  const [saveState, setSaveState] = useState('pending'); // pending | saving | saved | error
  const [visibility, setVisibility] = useState('public');
  const [compareMode, setCompareModeState] = useState(getCompareMode());
  const [voiceOn, setVoiceOn]   = useState(getVoiceEnabled());
  const [resumeRun, setResumeRun] = useState(null);   // carrera guardada para reanudar
  const [pendingCount, setPendingCount] = useState(0); // tiempos en cola offline

  // ── refs para leer estado fresco dentro del callback del GPS ──
  const phaseRef     = useRef(phase);
  const stageRef     = useRef(null);
  const referenceRef = useRef(null);
  const nextCpRef    = useRef(0);        // índice del próximo checkpoint (0-based)
  const startTsRef   = useRef(null);
  const splitsRef    = useRef([]);
  const trackRef     = useRef([]);
  const maxSpeedRef  = useRef(0);
  const notifiedRef  = useRef(new Set()); // tramos ya avisados
  const dismissedRef = useRef(new Set()); // tramos descartados por el usuario
  const lastQueryRef = useRef({ t: 0, coord: null });
  const watchIdRef   = useRef(null);
  const wakeLockRef  = useRef(null);
  const voiceRef     = useRef(voiceOn);
  const saveStateRef = useRef('pending');
  const lastPersistRef = useRef(0);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { voiceRef.current = voiceOn; }, [voiceOn]);
  useEffect(() => { saveStateRef.current = saveState; }, [saveState]);

  // ── Persistencia de la carrera (sobrevive a recargas y cierres) ──
  function persistRun(phaseOverride) {
    const ph = phaseOverride ?? phaseRef.current;
    if (!stageRef.current || !['armed', 'ready', 'running', 'finished'].includes(ph)) return;
    saveRun({
      phase:     ph,
      stage:     stageRef.current,
      reference: referenceRef.current,
      startTs:   startTsRef.current,
      splits:    splitsRef.current,
      track:     trackRef.current,
      maxSpeed:  maxSpeedRef.current,
      nextCp:    nextCpRef.current,
    });
  }

  const say = useCallback((text) => { if (voiceRef.current) speak(text); }, []);

  // ── Wake lock: pantalla encendida durante el crono ──
  async function acquireWakeLock() {
    try { wakeLockRef.current = await navigator.wakeLock?.request('screen'); } catch { /* opcional */ }
  }
  function releaseWakeLock() {
    try { wakeLockRef.current?.release(); wakeLockRef.current = null; } catch { /* — */ }
  }

  // ── Notificación de tramo cercano ──
  async function notifyStage(s) {
    const body = `Salida a ${formatDistance(s.distanceM)}. Toca para participar.`;
    try {
      if (Notification.permission === 'granted') {
        const reg = await navigator.serviceWorker?.getRegistration();
        if (reg) {
          reg.showNotification(`Tramo cerca: ${s.name}`, {
            body, icon: '/icon-192.png', badge: '/icon-192.png',
            tag: `stage-${s.id}`, data: { stageId: s.id }, vibrate: [200, 100, 200],
          });
        } else {
          new Notification(`Tramo cerca: ${s.name}`, { body, icon: '/icon-192.png' });
        }
      }
    } catch { /* la notificación es un extra */ }
    say(`Tramo ${s.name} a ${Math.round(s.distanceM)} metros. ¿Quieres participar?`);
  }

  // ── Consulta de tramos cercanos (throttle: 20 s o 150 m) ──
  async function queryNearby(coord) {
    const now = Date.now();
    const last = lastQueryRef.current;
    const moved = last.coord ? distanceM(last.coord, coord) : Infinity;
    if (now - last.t < 20000 && moved < 150) return;
    lastQueryRef.current = { t: now, coord };

    try {
      const { data } = await api.get('/stages/near', {
        params: { lat: coord[0], lng: coord[1], radius: QUERY_RADIUS },
      });
      const stages = data.stages ?? [];
      setNearby(stages);

      const fresh = stages.find(
        (s) => s.distanceM <= NOTIFY_DIST &&
               !notifiedRef.current.has(s.id) &&
               !dismissedRef.current.has(s.id)
      );
      if (fresh && phaseRef.current === 'scanning') {
        notifiedRef.current.add(fresh.id);
        setCandidate(fresh);
        notifyStage(fresh);
      }
    } catch { /* sin cobertura: se reintenta en el siguiente ciclo */ }
  }

  // ── Registro de un split (INICIO=0, checkpoints 1..n, META=n+1) ──
  function recordSplit(checkpointIndex, ms, label) {
    const split = { checkpointIndex, ms };
    splitsRef.current = [...splitsRef.current, split];
    setSplits(splitsRef.current);

    if (checkpointIndex === 0) return; // la salida no se compara (siempre 0)

    const ref = referenceRef.current;
    if (ref?.splits?.length) {
      const refSplit = ref.splits.find((r) => r.checkpointIndex === checkpointIndex)
        ?? ref.splits[splitsRef.current.length - 1];
      if (refSplit) {
        const diff = ms - refSplit.ms;
        speakGapIfOn(diff, label);
        return;
      }
    }
    say(`${label}. ${formatDuration(ms).replace('.', ' con ')}`);
  }
  function speakGapIfOn(diff, label) { if (voiceRef.current) speakGap(diff, label); }

  // ── Lógica principal por cada posición GPS ──
  function onPosition(pos) {
    setPosition(pos);
    setGpsError(null);
    const coord = [pos.coords.latitude, pos.coords.longitude];
    const ph = phaseRef.current;

    const kmh = speedKmh(pos);
    if (kmh != null && kmh > maxSpeedRef.current) maxSpeedRef.current = kmh;

    if (ph === 'scanning') {
      queryNearby(coord);
      return;
    }

    const s = stageRef.current;
    if (!s) return;

    if (ph === 'armed') {
      const d = distanceM(coord, s.start.coord);
      if (d <= START_ZONE) {
        setPhase('ready');
        persistRun('ready');
        say('En línea de salida. El crono arrancará al salir.');
      }
      return;
    }

    if (ph === 'ready') {
      const d = distanceM(coord, s.start.coord);
      if (d > START_EXIT) {
        // ¡Salida! Arranca el crono
        startTsRef.current = Date.now();
        splitsRef.current = [];
        trackRef.current = [];
        maxSpeedRef.current = 0;
        nextCpRef.current = 0;
        recordSplit(0, 0, 'Salida');
        setPhase('running');
        persistRun('running');
        say('¡Salida!');
      }
      return;
    }

    if (ph === 'running') {
      const ms = Date.now() - startTsRef.current;
      trackRef.current.push({
        lat: coord[0], lng: coord[1], t: ms,
        speed: kmh != null ? Math.round(kmh * 10) / 10 : null,
      });

      const cps = s.checkpoints ?? [];
      const nextCp = nextCpRef.current;

      if (nextCp < cps.length) {
        const d = distanceM(coord, cps[nextCp].coord);
        if (d <= CP_RADIUS) {
          nextCpRef.current = nextCp + 1;
          recordSplit(nextCp + 1, ms, cps[nextCp].name || `Punto ${nextCp + 1}`);
          persistRun('running');
        }
      }

      // La meta solo cuenta cuando se han pasado todos los checkpoints
      if (nextCpRef.current >= cps.length) {
        const dEnd = distanceM(coord, s.end.coord);
        if (dEnd <= FINISH_RADIUS && ms > 3000) {
          recordSplit(cps.length + 1, ms, 'Meta');
          setElapsed(ms);
          setPhase('finished');
          persistRun('finished');
          releaseWakeLock();
          announceFinish(ms);
          return;
        }
      }

      // Persistencia periódica del track (máx. cada 3 s)
      const now = Date.now();
      if (now - lastPersistRef.current > 3000) {
        lastPersistRef.current = now;
        persistRun('running');
      }
    }
  }

  function announceFinish(ms) {
    const ref = referenceRef.current;
    if (ref?.durationMs != null) {
      const diff = ms - ref.durationMs;
      say(diff <= 0
        ? `¡Meta! Mejor tiempo. ${Math.abs(diff / 1000).toFixed(1)} segundos más rápido.`
        : `Meta. ${(diff / 1000).toFixed(1)} segundos más lento.`);
    } else {
      say('Meta. Tiempo registrado.');
    }
  }

  // ── Arrancar / parar la vigilancia GPS ──
  async function startWatch() {
    if (!navigator.geolocation) {
      setGpsError('Este dispositivo no tiene GPS disponible en el navegador.');
      return false;
    }
    try { await Notification.requestPermission(); } catch { /* opcional */ }
    await acquireWakeLock();

    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = navigator.geolocation.watchPosition(
      onPosition,
      (err) => setGpsError(err.message || 'No se pudo obtener la posición GPS'),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
    return true;
  }

  async function startScanning() {
    if (!(await startWatch())) return;
    setPhase('scanning');
    say('Detección de tramos activada.');
  }

  function stopEverything() {
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    releaseWakeLock();
    clearRun(); // participación descartada a propósito: no ofrecer reanudar
    setPhase('idle');
    setCandidate(null);
    setStage(null);
    stageRef.current = null;
    setSplits([]);
    setElapsed(0);
  }

  useEffect(() => () => { // limpieza al salir de la página
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    releaseWakeLock();
    window.speechSynthesis?.cancel();
  }, []);

  // ── Al montar: reintentar tiempos encolados y detectar carrera pendiente ──
  useEffect(() => {
    flushPendingTimes()
      .then(({ remaining }) => setPendingCount(remaining))
      .catch(() => setPendingCount(pendingTimesCount()));
    const saved = loadRun();
    if (saved) setResumeRun(saved);
  }, []);

  // ── Volver la conexión: vaciar la cola de tiempos ──
  useEffect(() => {
    async function onOnline() {
      try {
        const { remaining } = await flushPendingTimes();
        setPendingCount(remaining);
        if (remaining === 0 && saveStateRef.current === 'queued') setSaveState('saved');
      } catch { /* siguiente intento */ }
    }
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  // ── Pantalla apagada/encendida: re-adquirir el wake lock (se pierde al ocultar) ──
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible' &&
          ['scanning', 'armed', 'ready', 'running'].includes(phaseRef.current)) {
        acquireWakeLock();
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // ── Aviso antes de cerrar/recargar con una carrera activa ──
  useEffect(() => {
    function onBeforeUnload(e) {
      if (['armed', 'ready', 'running'].includes(phaseRef.current)) {
        e.preventDefault();
        e.returnValue = ''; // requerido por Chrome para mostrar el diálogo
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // ── Reanudar una participación guardada ──
  async function resumeSavedRun() {
    const run = resumeRun;
    if (!run) return;
    setResumeRun(null);

    stageRef.current     = run.stage;
    referenceRef.current = run.reference ?? null;
    splitsRef.current    = run.splits ?? [];
    trackRef.current     = run.track ?? [];
    maxSpeedRef.current  = run.maxSpeed ?? 0;
    nextCpRef.current    = run.nextCp ?? 0;
    startTsRef.current   = run.startTs ?? null;

    setStage(run.stage);
    setReference(referenceRef.current);
    setSplits(splitsRef.current);
    setCandidate(null);
    setSaveState('pending');

    if (run.phase === 'finished') {
      // Cruzó la meta pero no llegó a guardar: directo al panel de resultado
      const totalMs = splitsRef.current[splitsRef.current.length - 1]?.ms ?? 0;
      setElapsed(totalMs);
      setPhase('finished');
    } else {
      setPhase(run.phase);
      await startWatch();
      say(`Participación en ${run.stage.name} reanudada.`);
    }
  }

  function discardSavedRun() {
    clearRun();
    setResumeRun(null);
  }

  // ── Participar en un tramo ──
  const participate = useCallback(async (stageId) => {
    try {
      const { data } = await api.get(`/stages/${stageId}/detail`);
      const st = data.stage;
      if (!st.start?.coord || !st.end?.coord) {
        setGpsError('Este tramo no tiene salida y meta definidas.');
        return;
      }

      // Los puntos se guardan en orden GeoJSON [lng, lat];
      // aquí trabajamos en [lat, lng] — normalizar al cargar.
      const toLatLng = ([lng, lat]) => [lat, lng];
      st.start = { ...st.start, coord: toLatLng(st.start.coord) };
      st.end   = { ...st.end,   coord: toLatLng(st.end.coord) };
      st.checkpoints = (st.checkpoints ?? []).map((cp) => ({
        ...cp,
        coord: toLatLng(cp.coord),
      }));
      const mode = getCompareMode();
      const ref =
        (mode === 'personal' ? data.myBest : (data.globalBest ?? data.myBest)) ?? null;

      setStage(st);
      stageRef.current = st;
      referenceRef.current = ref ? {
        durationMs: ref.durationMs,
        splits: ref.splits ?? [],
        label: mode === 'personal' ? 'Mi mejor' : (ref.pseudonym ? `Mejor: ${ref.pseudonym}` : 'Mejor global'),
      } : null;
      setReference(referenceRef.current);
      setCandidate(null);
      setSaveState('pending');
      setSplits([]);
      setElapsed(0);
      nextCpRef.current = 0;
      setPhase('armed');
      persistRun('armed');
      await acquireWakeLock();
      say(`Participando en ${st.name}. Dirígete a la salida.`);
    } catch {
      setGpsError('No se pudo cargar el tramo.');
    }
  }, [say]);

  // Si venimos de una notificación (/live?stage=xxx) → participar directamente
  useEffect(() => {
    const stageId = searchParams.get('stage');
    if (stageId) {
      participate(stageId);
      if (!watchIdRef.current) startScanning();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Tick del cronómetro en pantalla ──
  useEffect(() => {
    if (phase !== 'running') return;
    const t = setInterval(() => setElapsed(Date.now() - startTsRef.current), 53);
    return () => clearInterval(t);
  }, [phase]);

  // ── Guardar el tiempo al terminar ──
  // Sin cobertura, el tiempo se encola en el dispositivo y se reenvía
  // automáticamente cuando vuelva la conexión (evento 'online' o al
  // volver a abrir Live).
  async function saveTime() {
    setSaveState('saving');
    const track = trackRef.current;
    const durationMs = splitsRef.current[splitsRef.current.length - 1]?.ms ?? elapsed;
    let dist = 0;
    for (let i = 1; i < track.length; i++) {
      dist += distanceM([track[i - 1].lat, track[i - 1].lng], [track[i].lat, track[i].lng]);
    }
    const avgSpeed = durationMs > 0 ? (dist / 1000) / (durationMs / 3600000) : null;

    const payload = {
      stageId: stage.id,
      durationMs,
      visibility,
      splits: splitsRef.current,
      track,
      maxSpeed: maxSpeedRef.current || null,
      avgSpeed: avgSpeed ? Math.round(avgSpeed * 10) / 10 : null,
    };

    try {
      await api.post('/times', payload);
      setSaveState('saved');
      clearRun();
    } catch (err) {
      if (!err.response) {
        // Error de red (sin cobertura): encolar y dar por resuelto
        queueTime(payload);
        setPendingCount(pendingTimesCount());
        setSaveState('queued');
        clearRun();
      } else {
        setSaveState('error');
      }
    }
  }

  function toggleCompareMode() {
    const next = compareMode === 'global' ? 'personal' : 'global';
    setCompareMode(next);
    setCompareModeState(next);
  }
  function toggleVoice() {
    const next = !voiceOn;
    setVoiceEnabled(next);
    setVoiceOn(next);
    if (next) speak('Avisos de voz activados');
  }

  // ═══════════════════ RENDER ═══════════════════
  const accuracy = position?.coords?.accuracy;
  const coord = position ? [position.coords.latitude, position.coords.longitude] : null;

  return (
    <div className="max-w-xl mx-auto p-4 pb-24 md:pb-8 space-y-4">
      {/* Cabecera + ajustes */}
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">Modo Live</p>
          <h1 className="text-2xl font-bold font-display">Cronometraje GPS</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={toggleVoice}
            title="Avisos de voz"
            className={`p-2.5 border ${voiceOn ? 'border-ink bg-ink text-paper' : 'border-ink/20 text-ink/40'}`}
          >
            {voiceOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button
            onClick={toggleCompareMode}
            title="Referencia de comparación"
            className="p-2.5 border border-ink/20 flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider"
          >
            {compareMode === 'global' ? <Trophy size={14} /> : <User size={14} />}
            {compareMode === 'global' ? 'Mejor global' : 'Mi mejor'}
          </button>
        </div>
      </div>

      {gpsError && (
        <div className="border border-rally/40 bg-rally/5 text-rally px-4 py-3 text-sm">{gpsError}</div>
      )}

      {/* Tiempos pendientes de enviar (guardados sin cobertura) */}
      {pendingCount > 0 && (
        <div className="border border-signal/40 bg-signal/5 px-4 py-3 text-sm flex items-center gap-2">
          <CloudOff size={15} className="text-signal shrink-0" />
          <span>
            {pendingCount === 1 ? 'Hay 1 tiempo guardado' : `Hay ${pendingCount} tiempos guardados`} en
            este dispositivo pendiente{pendingCount > 1 ? 's' : ''} de enviar. Se enviará
            {pendingCount > 1 ? 'n' : ''} automáticamente al recuperar la conexión.
          </span>
        </div>
      )}

      {/* Participación interrumpida (recarga, cierre, batería…) */}
      {resumeRun && phase === 'idle' && (
        <div className="border-2 border-signal bg-signal/5 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <History size={20} className="text-signal shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-lg leading-tight">Participación interrumpida</p>
              <p className="text-sm text-ink/60">
                {resumeRun.stage.name}
                {resumeRun.phase === 'running' && resumeRun.startTs &&
                  ` · en carrera (${formatDuration(Date.now() - resumeRun.startTs)})`}
                {resumeRun.phase === 'finished' && ' · meta cruzada, tiempo sin guardar'}
                {(resumeRun.phase === 'armed' || resumeRun.phase === 'ready') && ' · esperando salida'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={resumeSavedRun} className="btn flex-1 py-3 flex items-center justify-center gap-2">
              <Play size={16} /> Reanudar
            </button>
            <button onClick={discardSavedRun} className="px-4 border border-ink/20 text-ink/60 text-sm">
              Descartar
            </button>
          </div>
        </div>
      )}

      {/* ── IDLE ── */}
      {phase === 'idle' && (
        <div className="border border-ink/10 p-8 text-center space-y-4">
          <Radar size={48} className="mx-auto text-ink/30" strokeWidth={1.5} />
          <p className="text-sm text-ink/60 max-w-sm mx-auto">
            Activa la detección y te avisaré con una notificación y por voz
            cuando pases cerca de la salida de un tramo. Mantén la app abierta
            (puede estar en segundo plano con la pantalla encendida).
          </p>
          <button onClick={startScanning} className="btn inline-flex items-center gap-2 px-6 py-3">
            <Play size={16} /> Activar detección
          </button>
        </div>
      )}

      {/* ── SCANNING ── */}
      {phase === 'scanning' && (
        <>
          <div className="border border-ink/10 p-5 flex items-center gap-4">
            <div className="relative">
              <Radar size={32} className="text-rally animate-pulse-slow" />
            </div>
            <div className="flex-1">
              <p className="font-medium">Buscando tramos cerca…</p>
              <p className="text-xs font-mono text-ink/50 mt-0.5">
                {coord
                  ? `GPS ±${Math.round(accuracy ?? 0)} m`
                  : 'Esperando señal GPS…'}
              </p>
            </div>
            <button onClick={stopEverything} className="p-2.5 border border-ink/20 text-ink/60" title="Parar">
              <Square size={16} />
            </button>
          </div>

          {candidate && (
            <div className="border-2 border-rally bg-rally/5 p-5 space-y-3">
              <div className="flex items-start gap-3">
                <Flag size={20} className="text-rally shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-lg leading-tight">{candidate.name}</p>
                  <p className="text-sm text-ink/60">
                    Salida a {formatDistance(candidate.distanceM)}
                    {candidate.checkpoints?.length > 0 && ` · ${candidate.checkpoints.length} checkpoints`}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => participate(candidate.id)}
                  className="btn flex-1 py-3 flex items-center justify-center gap-2"
                >
                  <Play size={16} /> Participar
                </button>
                <button
                  onClick={() => { dismissedRef.current.add(candidate.id); setCandidate(null); }}
                  className="px-4 border border-ink/20 text-ink/60 text-sm"
                >
                  Ahora no
                </button>
              </div>
            </div>
          )}

          {nearby.length > 0 && (
            <div className="border border-ink/10 divide-y divide-ink/5">
              {nearby.map((s) => (
                <button
                  key={s.id}
                  onClick={() => participate(s.id)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-ink/[0.03]"
                >
                  <MapPin size={16} className="text-ink/40 shrink-0" />
                  <span className="flex-1 font-medium text-sm">{s.name}</span>
                  <span className="font-mono text-xs text-ink/50">{formatDistance(s.distanceM)}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── ARMED / READY ── */}
      {(phase === 'armed' || phase === 'ready') && stage && (
        <div className="border border-ink/10 p-6 space-y-4 text-center">
          <p className="eyebrow">{stage.name}</p>
          {phase === 'armed' ? (
            <>
              <Navigation size={40} className="mx-auto text-signal" />
              <p className="font-bold text-xl">Dirígete a la salida</p>
              <p className="font-mono text-3xl">
                {coord && stage.start?.coord ? formatDistance(distanceM(coord, stage.start.coord)) : '—'}
              </p>
            </>
          ) : (
            <>
              <Flag size={40} className="mx-auto text-forest" />
              <p className="font-bold text-xl text-forest">En línea de salida</p>
              <p className="text-sm text-ink/60">El crono arrancará automáticamente al salir</p>
            </>
          )}
          {reference ? (
            <p className="text-xs font-mono text-ink/50">
              Referencia · {reference.label} · {formatDuration(reference.durationMs)}
            </p>
          ) : (
            <p className="text-xs font-mono text-ink/50">Sin referencia — primer tiempo del tramo</p>
          )}
          <button onClick={stopEverything} className="text-xs font-mono uppercase tracking-widest text-ink/50 underline">
            Cancelar
          </button>
        </div>
      )}

      {/* ── RUNNING ── */}
      {phase === 'running' && stage && (
        <div className="space-y-4">
          <div className="bg-carbon text-ink border-t-4 border-rally p-6 text-center">
            <p className="eyebrow">{stage.name}</p>
            <p className="font-mono text-5xl font-medium tabular-nums mt-2">{formatDuration(elapsed)}</p>
            {reference && (
              <p className="text-xs font-mono text-ink/50 mt-2">
                {reference.label} · {formatDuration(reference.durationMs)}
              </p>
            )}
          </div>
          <CheckpointList stage={stage} splits={splits} reference={reference} live nextCp={nextCpRef.current} />
          <button
            onClick={stopEverything}
            className="w-full py-3 border border-rally/40 text-rally text-sm font-mono uppercase tracking-widest"
          >
            Abandonar tramo
          </button>
        </div>
      )}

      {/* ── FINISHED ── */}
      {phase === 'finished' && stage && (
        <FinishedPanel
          stage={stage}
          splits={splits}
          reference={reference}
          elapsed={elapsed}
          saveState={saveState}
          visibility={visibility}
          setVisibility={setVisibility}
          onSave={saveTime}
          onRestart={async () => {
            setSplits([]); splitsRef.current = [];
            setElapsed(0); nextCpRef.current = 0;
            setSaveState('pending');
            setPhase('armed');
            persistRun('armed');
            // Si venimos de una reanudación en 'finished', el GPS no está activo
            if (watchIdRef.current == null) await startWatch();
          }}
          onExit={stopEverything}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Lista de checkpoints con comparativa verde/rojo
// ─────────────────────────────────────────────
function CheckpointList({ stage, splits, reference, live = false, nextCp = 0 }) {
  const cps = stage.checkpoints ?? [];
  // filas: INICIO (idx 0), checkpoints (1..n), META (n+1)
  const rows = [
    { checkpointIndex: 0, name: 'Salida' },
    ...cps.map((cp, i) => ({ checkpointIndex: i + 1, name: cp.name || `Checkpoint ${i + 1}` })),
    { checkpointIndex: cps.length + 1, name: 'Meta' },
  ];

  function refMsFor(checkpointIndex, rowPos) {
    if (!reference?.splits?.length) return null;
    const found = reference.splits.find((s) => s.checkpointIndex === checkpointIndex);
    return found?.ms ?? reference.splits[rowPos]?.ms ?? null;
  }

  return (
    <div className="border border-ink/10 divide-y divide-ink/5">
      {rows.map((row, i) => {
        const split = splits.find((s) => s.checkpointIndex === row.checkpointIndex);
        const refMs = refMsFor(row.checkpointIndex, i);
        const passed = !!split;
        const isNext = live && !passed && i === nextCp + 1; // siguiente objetivo visual
        const diff = passed && refMs != null && row.checkpointIndex !== 0 ? split.ms - refMs : null;

        return (
          <div
            key={row.checkpointIndex}
            className={`flex items-center gap-3 px-4 py-3 ${isNext ? 'bg-signal/10' : ''} ${!passed && !isNext ? 'opacity-45' : ''}`}
          >
            {passed
              ? (diff == null || diff <= 0
                  ? <CheckCircle2 size={16} className={diff == null ? 'text-ink/40' : 'text-forest'} />
                  : <XCircle size={16} className="text-rally" />)
              : <MapPin size={16} className={isNext ? 'text-signal' : 'text-ink/30'} />}

            <span className="flex-1 text-sm font-medium truncate">{row.name}</span>

            {refMs != null && (
              <span className="font-mono text-xs text-ink/40 tabular-nums">{formatDuration(refMs)}</span>
            )}

            <span className="font-mono text-sm tabular-nums w-24 text-right">
              {passed ? formatDuration(split.ms) : '—'}
            </span>

            <span
              className={`font-mono text-xs tabular-nums w-16 text-right font-bold
                ${diff == null ? 'text-ink/30' : diff <= 0 ? 'text-forest' : 'text-rally'}`}
            >
              {diff != null ? formatSignedGap(diff) : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// Panel de resultados finales
// ─────────────────────────────────────────────
function FinishedPanel({
  stage, splits, reference, elapsed,
  saveState, visibility, setVisibility, onSave, onRestart, onExit,
}) {
  const totalMs = splits[splits.length - 1]?.ms ?? elapsed;
  const totalDiff = reference?.durationMs != null ? totalMs - reference.durationMs : null;
  const improved = totalDiff != null && totalDiff <= 0;

  return (
    <div className="space-y-4">
      {/* Tiempo total */}
      <div className={`p-6 text-center text-white ${totalDiff == null ? 'bg-track' : improved ? 'bg-forest' : 'bg-rally'}`}>
        <p className="eyebrow !text-white/60">{stage.name} · Resultado</p>
        <p className="font-mono text-5xl font-medium tabular-nums mt-2">{formatDuration(totalMs)}</p>
        {totalDiff != null ? (
          <p className="font-mono text-lg mt-2 font-bold">
            {formatSignedGap(totalDiff)} s · {improved ? '¡MEJOR TIEMPO!' : `vs ${reference.label}`}
          </p>
        ) : (
          <p className="text-sm text-white/70 mt-2">Primer tiempo registrado en este tramo</p>
        )}
      </div>

      <CheckpointList stage={stage} splits={splits} reference={reference} />

      {/* Guardar */}
      <div className="border border-ink/10 p-4 space-y-3">
        {saveState === 'saved' ? (
          <p className="text-sm text-forest font-medium flex items-center gap-2">
            <CheckCircle2 size={16} /> Tiempo guardado
          </p>
        ) : saveState === 'queued' ? (
          <p className="text-sm text-signal font-medium flex items-start gap-2">
            <CloudOff size={16} className="shrink-0 mt-0.5" />
            <span>
              Sin cobertura — el tiempo está guardado en este dispositivo y se
              enviará automáticamente al recuperar la conexión.
            </span>
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono uppercase tracking-widest text-ink/50">Visibilidad</span>
              <div className="flex border border-ink/20">
                {['public', 'private'].map((v) => (
                  <button
                    key={v}
                    onClick={() => setVisibility(v)}
                    className={`px-3 py-1.5 text-xs font-mono uppercase ${visibility === v ? 'bg-ink text-paper' : 'text-ink/50'}`}
                  >
                    {v === 'public' ? 'Pública' : 'Privada'}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={onSave}
              disabled={saveState === 'saving'}
              className="btn w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save size={16} />
              {saveState === 'saving' ? 'Guardando…' : saveState === 'error' ? 'Error — reintentar' : 'Guardar tiempo'}
            </button>
          </>
        )}
      </div>

      <div className="flex gap-2">
        <button onClick={onRestart} className="flex-1 py-3 border border-ink/20 text-sm font-mono uppercase tracking-widest flex items-center justify-center gap-2">
          <TimerReset size={14} /> Repetir tramo
        </button>
        <button onClick={onExit} className="flex-1 py-3 border border-ink/20 text-sm font-mono uppercase tracking-widest text-ink/60">
          Salir
        </button>
      </div>

      <Link to={`/stages/${stage.id}`} className="block text-center text-xs font-mono uppercase tracking-widest text-ink/50 underline">
        Ver ranking del tramo
      </Link>
    </div>
  );
}

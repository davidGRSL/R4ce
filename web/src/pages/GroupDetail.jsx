import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, UsersRound, Crown, Shield, Send, Paperclip, Mic, Square,
  X, Trash2, Copy, RefreshCw, Check, LogOut, Pencil, ChevronUp, Settings,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { getUser } from '../lib/auth.js';

const ROLE_LABEL = { owner: 'Admin', moderator: 'Moderador', member: 'Miembro' };

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function formatDay(iso) {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
}

function dayKey(iso) {
  return new Date(iso).toDateString();
}

export default function GroupDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const me = getUser();

  const [group,    setGroup]    = useState(null);
  const [members,  setMembers]  = useState([]);
  const [error,    setError]    = useState(null);
  const [showPanel, setShowPanel] = useState(false);

  // Mensajes
  const [messages,     setMessages]     = useState([]);
  const [hasMore,      setHasMore]      = useState(false);
  const [nextBefore,   setNextBefore]   = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [typing,       setTyping]       = useState({}); // userId → { pseudonym, until }

  const scrollRef  = useRef(null);
  const bottomRef  = useRef(null);
  const stickToBottom = useRef(true);

  const isAdmin = group && ['owner', 'moderator'].includes(group.myRole);
  const isOwner = group?.myRole === 'owner';

  // ── Carga inicial ──
  const loadMembers = useCallback(async () => {
    try {
      const { data } = await api.get(`/groups/${id}/members`);
      setMembers(data.members || []);
    } catch (err) {
      console.error(err);
    }
  }, [id]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [gRes, mRes, msgRes] = await Promise.all([
          api.get(`/groups/${id}`),
          api.get(`/groups/${id}/members`),
          api.get(`/groups/${id}/messages?limit=50`),
        ]);
        if (!active) return;
        setGroup(gRes.data.group);
        setMembers(mRes.data.members || []);
        setMessages(msgRes.data.messages || []);
        setHasMore(msgRes.data.hasMore);
        setNextBefore(msgRes.data.nextBefore);
      } catch (err) {
        if (active) setError(err.response?.data?.error?.message || 'No se pudo cargar el grupo');
      }
    }
    load();
    return () => { active = false; };
  }, [id]);

  // ── Socket ──
  useEffect(() => {
    const socket = getSocket();

    function joinRoom() {
      socket.emit('group:join', id, (res) => {
        if (!res?.ok) console.warn('[chat] no se pudo unir a la room:', res?.error);
      });
    }

    function onMessage(msg) {
      if (msg.groupId !== id) return;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      setTyping((prev) => {
        if (!prev[msg.userId]) return prev;
        const { [msg.userId]: _, ...rest } = prev;
        return rest;
      });
    }

    function onDeleted({ groupId, messageId }) {
      if (groupId !== id) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId
          ? { ...m, deleted: true, content: null, mediaUrl: null, mediaType: null }
          : m))
      );
    }

    function onTyping({ groupId, userId, pseudonym }) {
      if (groupId !== id || userId === me?.id) return;
      setTyping((prev) => ({ ...prev, [userId]: { pseudonym, until: Date.now() + 3500 } }));
    }

    function onMemberChange({ groupId }) {
      if (groupId === id) loadMembers();
    }

    socket.on('connect', joinRoom);
    socket.on('group:message', onMessage);
    socket.on('group:message_deleted', onDeleted);
    socket.on('group:typing', onTyping);
    socket.on('group:member_change', onMemberChange);
    if (socket.connected) joinRoom();

    return () => {
      socket.emit('group:leave', id);
      socket.off('connect', joinRoom);
      socket.off('group:message', onMessage);
      socket.off('group:message_deleted', onDeleted);
      socket.off('group:typing', onTyping);
      socket.off('group:member_change', onMemberChange);
    };
  }, [id, me?.id, loadMembers]);

  // Expirar indicadores de "escribiendo"
  useEffect(() => {
    const interval = setInterval(() => {
      setTyping((prev) => {
        const now = Date.now();
        const next = Object.fromEntries(Object.entries(prev).filter(([, v]) => v.until > now));
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Autoscroll ──
  useEffect(() => {
    if (stickToBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  async function loadOlder() {
    if (!nextBefore || loadingOlder) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const { data } = await api.get(`/groups/${id}/messages?limit=50&before=${encodeURIComponent(nextBefore)}`);
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        return [...(data.messages || []).filter((m) => !known.has(m.id)), ...prev];
      });
      setHasMore(data.hasMore);
      setNextBefore(data.nextBefore);
      // Mantener la posición de lectura tras prepend
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingOlder(false);
    }
  }

  function appendMessage(msg) {
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
  }

  async function deleteMessage(messageId) {
    try {
      await api.delete(`/groups/${id}/messages/${messageId}`);
    } catch (err) {
      console.error(err);
    }
  }

  if (error) {
    return (
      <div className="p-8 lg:p-12">
        <Link to="/groups" className="inline-flex items-center gap-2 text-sm text-ink/60 hover:text-ink mb-6">
          <ArrowLeft size={16} /> Volver a grupos
        </Link>
        <div className="border border-ink/10 p-12 text-center">
          <p className="text-ink/60">{error}</p>
        </div>
      </div>
    );
  }

  if (!group) {
    return <p className="p-8 lg:p-12 font-mono text-sm text-ink/40">Cargando grupo…</p>;
  }

  const typingNames = Object.values(typing).map((t) => t.pseudonym);

  return (
    // 100dvh menos la barra inferior móvil (4rem); en escritorio ocupa toda la ventana
    <div className="flex flex-col h-[calc(100dvh-4rem)] md:h-dvh overflow-hidden">
      {/* Header del grupo */}
      <header className="flex items-center gap-3 px-4 md:px-6 py-3 border-b border-ink/10 bg-paper shrink-0">
        <Link to="/groups" className="p-1.5 hover:bg-ink/5 transition-colors" title="Volver a grupos">
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg font-bold truncate leading-tight">{group.name}</h1>
          <p className="text-[11px] font-mono text-ink/40 truncate">
            {group.memberCount} miembros
            {typingNames.length > 0 && (
              <span className="text-forest"> · {typingNames.slice(0, 2).join(', ')} escribiendo…</span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowPanel((v) => !v)}
          className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-mono uppercase tracking-widest border transition-colors
                      ${showPanel ? 'bg-ink text-paper border-ink' : 'border-ink/20 text-ink/60 hover:text-ink hover:border-ink'}`}
        >
          <Settings size={13} /> <span className="hidden sm:inline">Grupo</span>
        </button>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Chat */}
        <div className="flex flex-col flex-1 min-w-0">
          <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
            {hasMore && (
              <div className="text-center mb-4">
                <button
                  onClick={loadOlder}
                  disabled={loadingOlder}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest
                             border border-ink/20 text-ink/50 hover:text-ink hover:border-ink transition-colors"
                >
                  <ChevronUp size={12} />
                  {loadingOlder ? 'Cargando…' : 'Mensajes anteriores'}
                </button>
              </div>
            )}

            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <UsersRound size={32} className="text-ink/15 mb-3" strokeWidth={1.5} />
                <p className="text-ink/50 text-sm">Todavía no hay mensajes.</p>
                <p className="text-[11px] font-mono text-ink/30 uppercase tracking-widest mt-1">
                  Estrena el chat del grupo
                </p>
              </div>
            ) : (
              messages.map((m, i) => {
                const prev = messages[i - 1];
                const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
                const compact = !newDay && prev && prev.userId === m.userId && !prev.deleted;
                return (
                  <div key={m.id}>
                    {newDay && (
                      <div className="text-center my-4">
                        <span className="px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-ink/40 bg-ink/5">
                          {formatDay(m.createdAt)}
                        </span>
                      </div>
                    )}
                    <MessageBubble
                      msg={m}
                      own={m.userId === me?.id}
                      compact={compact}
                      canDelete={!m.deleted && (m.userId === me?.id || isAdmin)}
                      onDelete={() => deleteMessage(m.id)}
                    />
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          <Composer groupId={id} onSent={appendMessage} pseudonym={me?.pseudonym || me?.username} />
        </div>

        {/* Panel lateral: miembros + administración */}
        {showPanel && (
          <MembersPanel
            group={group}
            setGroup={setGroup}
            members={members}
            reloadMembers={loadMembers}
            isOwner={isOwner}
            isAdmin={isAdmin}
            meId={me?.id}
            onLeftOrDeleted={() => navigate('/groups')}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Burbuja de mensaje
// ─────────────────────────────────────────────
function MessageBubble({ msg, own, compact, canDelete, onDelete }) {
  const initials = (msg.pseudonym || '??')
    .split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className={`group flex gap-2.5 ${compact ? 'mt-0.5' : 'mt-3'} ${own ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className="w-8 shrink-0">
        {!compact && (
          msg.avatarUrl ? (
            <img src={msg.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-ink/10" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-rally/15 text-rally flex items-center justify-center text-[10px] font-bold font-mono">
              {initials}
            </div>
          )
        )}
      </div>

      <div className={`max-w-[75%] md:max-w-[60%] min-w-0 ${own ? 'items-end' : ''}`}>
        {!compact && (
          <p className={`text-[11px] font-mono mb-0.5 ${own ? 'text-right text-ink/40' : 'text-ink/50'}`}>
            {own ? 'Tú' : msg.pseudonym} · {formatTime(msg.createdAt)}
          </p>
        )}

        <div className={`relative px-3 py-2 text-sm break-words
                        ${own ? 'bg-ink text-paper' : 'bg-ink/[0.04] text-ink'}
                        ${msg.deleted ? 'italic opacity-60' : ''}`}>
          {msg.deleted ? (
            <span className="text-xs">Mensaje eliminado</span>
          ) : (
            <>
              {msg.mediaUrl && msg.messageType === 'image' && (
                <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="block mb-1">
                  <img src={msg.mediaUrl} alt="" className="max-h-64 w-auto object-contain" loading="lazy" />
                </a>
              )}
              {msg.mediaUrl && msg.messageType === 'video' && (
                <video src={msg.mediaUrl} controls preload="metadata" className="max-h-64 w-full mb-1" />
              )}
              {msg.mediaUrl && msg.messageType === 'audio' && (
                <audio src={msg.mediaUrl} controls preload="metadata" className="w-56 max-w-full mb-1" />
              )}
              {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}
            </>
          )}

          {canDelete && (
            <button
              onClick={onDelete}
              title="Eliminar mensaje"
              className={`absolute top-1 hidden group-hover:block p-1 transition-colors
                          ${own ? '-left-8 text-ink/30 hover:text-rally' : '-right-8 text-ink/30 hover:text-rally'}`}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Composer: texto + adjuntos + nota de voz
// ─────────────────────────────────────────────
function Composer({ groupId, onSent, pseudonym }) {
  const [text,       setText]       = useState('');
  const [attachment, setAttachment] = useState(null); // { file, kind, previewUrl }
  const [sending,    setSending]    = useState(false);
  const [sendError,  setSendError]  = useState(null);

  // Grabación de voz
  const [recording,  setRecording]  = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const recorderRef = useRef(null);
  const chunksRef   = useRef([]);
  const timerRef    = useRef(null);

  const fileInputRef = useRef(null);
  const lastTypingRef = useRef(0);

  function kindOf(file) {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    return null;
  }

  function pickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const kind = kindOf(file);
    if (!kind) {
      setSendError('Formato no soportado: solo imagen, vídeo o audio.');
      return;
    }
    setSendError(null);
    setAttachment({ file, kind, previewUrl: URL.createObjectURL(file) });
  }

  function clearAttachment() {
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
  }

  function notifyTyping() {
    const now = Date.now();
    if (now - lastTypingRef.current > 2000) {
      lastTypingRef.current = now;
      getSocket().emit('group:typing', groupId, pseudonym);
    }
  }

  // ── Nota de voz ──
  async function startRecording() {
    setSendError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size > 0) {
          const ext  = type.includes('ogg') ? 'ogg' : 'webm';
          const file = new File([blob], `nota-de-voz.${ext}`, { type });
          setAttachment({ file, kind: 'audio', previewUrl: URL.createObjectURL(blob) });
        }
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setRecSeconds(0);
      timerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch {
      setSendError('No se pudo acceder al micrófono. Revisa los permisos del navegador.');
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    clearInterval(timerRef.current);
    setRecording(false);
  }

  useEffect(() => () => {
    // Limpieza al desmontar: parar grabación y liberar preview
    recorderRef.current?.stop();
    clearInterval(timerRef.current);
  }, []);

  // ── Envío ──
  async function send(e) {
    e?.preventDefault();
    if (sending || recording) return;
    const content = text.trim();
    if (!content && !attachment) return;

    setSending(true);
    setSendError(null);
    try {
      let data;
      if (attachment) {
        const form = new FormData();
        form.append('media', attachment.file);
        if (content) form.append('content', content);
        ({ data } = await api.post(`/groups/${groupId}/messages/media`, form));
      } else {
        ({ data } = await api.post(`/groups/${groupId}/messages`, { content }));
      }
      onSent(data.message);
      setText('');
      clearAttachment();
    } catch (err) {
      setSendError(err.response?.data?.error?.message || 'No se pudo enviar el mensaje');
    } finally {
      setSending(false);
    }
  }

  const recMin = String(Math.floor(recSeconds / 60));
  const recSec = String(recSeconds % 60).padStart(2, '0');

  return (
    <div className="border-t border-ink/10 bg-paper px-4 md:px-6 py-3 shrink-0">
      {sendError && <p className="text-rally text-xs font-mono mb-2">{sendError}</p>}

      {/* Preview del adjunto */}
      {attachment && (
        <div className="flex items-center gap-3 mb-2 p-2 border border-ink/10 bg-ink/[0.02]">
          {attachment.kind === 'image' && (
            <img src={attachment.previewUrl} alt="" className="h-14 w-14 object-cover" />
          )}
          {attachment.kind === 'video' && (
            <video src={attachment.previewUrl} className="h-14 w-24 object-cover" muted />
          )}
          {attachment.kind === 'audio' && (
            <audio src={attachment.previewUrl} controls className="h-9 w-56 max-w-full" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs truncate">{attachment.file.name}</p>
            <p className="text-[10px] font-mono text-ink/40 uppercase">
              {attachment.kind} · {(attachment.file.size / 1024 / 1024).toFixed(1)}MB
            </p>
          </div>
          <button onClick={clearAttachment} className="p-1.5 text-ink/40 hover:text-rally transition-colors" title="Quitar adjunto">
            <X size={16} />
          </button>
        </div>
      )}

      <form onSubmit={send} className="flex items-end gap-2">
        {/* Adjuntar archivo */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,audio/*"
          onChange={pickFile}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={recording}
          className="p-2.5 text-ink/50 hover:text-ink border border-ink/15 hover:border-ink transition-colors disabled:opacity-30"
          title="Adjuntar imagen, vídeo o audio"
        >
          <Paperclip size={16} />
        </button>

        {/* Nota de voz */}
        {recording ? (
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex items-center gap-2 px-3 py-2.5 bg-rally text-white text-xs font-mono transition-colors"
            title="Parar grabación"
          >
            <Square size={13} fill="currentColor" />
            <span className="tabular-nums">{recMin}:{recSec}</span>
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          </button>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            disabled={!!attachment}
            className="p-2.5 text-ink/50 hover:text-rally border border-ink/15 hover:border-rally transition-colors disabled:opacity-30"
            title="Grabar nota de voz"
          >
            <Mic size={16} />
          </button>
        )}

        {/* Texto */}
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); notifyTyping(); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) send(e);
          }}
          placeholder={recording ? 'Grabando nota de voz…' : 'Escribe un mensaje…'}
          disabled={recording}
          rows={1}
          maxLength={4000}
          className="input flex-1 resize-none py-2.5 max-h-32 disabled:opacity-40"
          style={{ minHeight: '42px' }}
        />

        <button
          type="submit"
          disabled={sending || recording || (!text.trim() && !attachment)}
          className="p-2.5 bg-ink text-paper hover:bg-rally transition-colors disabled:opacity-30"
          title="Enviar"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────
// Panel de miembros + administración
// ─────────────────────────────────────────────
function MembersPanel({ group, setGroup, members, reloadMembers, isOwner, isAdmin, meId, onLeftOrDeleted }) {
  const [copied,       setCopied]       = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [editing,      setEditing]      = useState(false);
  const [editName,     setEditName]     = useState(group.name);
  const [editDesc,     setEditDesc]     = useState(group.description || '');
  const [busy,         setBusy]         = useState(false);

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(group.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard no disponible */ }
  }

  async function regenerate() {
    if (regenerating) return;
    if (!window.confirm('El código actual dejará de funcionar. ¿Generar uno nuevo?')) return;
    setRegenerating(true);
    try {
      const { data } = await api.post(`/groups/${group.id}/invite/regenerate`, {});
      setGroup((g) => ({ ...g, inviteCode: data.inviteCode, inviteCodeExpiresAt: data.inviteCodeExpiresAt }));
    } catch (err) {
      console.error(err);
    } finally {
      setRegenerating(false);
    }
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (busy || !editName.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.put(`/groups/${group.id}`, {
        name: editName.trim(),
        description: editDesc.trim() || null,
      });
      setGroup((g) => ({ ...g, name: data.group.name, description: data.group.description }));
      setEditing(false);
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(userId, role) {
    try {
      await api.patch(`/groups/${group.id}/members/${userId}/role`, { role });
      reloadMembers();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'No se pudo cambiar el rol');
    }
  }

  async function kick(member) {
    if (!window.confirm(`¿Expulsar a ${member.pseudonym} del grupo?`)) return;
    try {
      await api.delete(`/groups/${group.id}/members/${member.userId}`);
      reloadMembers();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'No se pudo expulsar al miembro');
    }
  }

  async function leave() {
    if (!window.confirm('¿Seguro que quieres abandonar el grupo?')) return;
    try {
      await api.post(`/groups/${group.id}/leave`);
      onLeftOrDeleted();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'No se pudo abandonar el grupo');
    }
  }

  async function destroy() {
    const typed = window.prompt(`Esto borrará el grupo y todo su chat de forma permanente.\nEscribe "${group.name}" para confirmar:`);
    if (typed !== group.name) return;
    try {
      await api.delete(`/groups/${group.id}`);
      onLeftOrDeleted();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'No se pudo borrar el grupo');
    }
  }

  return (
    <aside className="w-72 lg:w-80 border-l border-ink/10 bg-paper flex flex-col overflow-y-auto shrink-0">
      {/* Info + edición */}
      <div className="p-4 border-b border-ink/10">
        {!editing ? (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="eyebrow">Grupo</p>
                <h2 className="font-display text-lg font-bold leading-tight">{group.name}</h2>
              </div>
              {isOwner && (
                <button onClick={() => setEditing(true)} className="p-1.5 text-ink/40 hover:text-ink transition-colors" title="Editar grupo">
                  <Pencil size={14} />
                </button>
              )}
            </div>
            {group.description && <p className="text-xs text-ink/50 mt-1.5">{group.description}</p>}
          </>
        ) : (
          <form onSubmit={saveEdit} className="space-y-2">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={80}
              className="input"
            />
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Descripción"
              className="input resize-none"
            />
            <div className="flex gap-2">
              <button type="submit" disabled={busy || !editName.trim()}
                className="px-3 py-1.5 bg-ink text-paper text-[11px] font-mono uppercase tracking-widest disabled:opacity-40">
                Guardar
              </button>
              <button type="button" onClick={() => setEditing(false)}
                className="px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest text-ink/50 hover:text-ink">
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Código de invitación */}
      <div className="p-4 border-b border-ink/10">
        <p className="text-[10px] font-mono uppercase tracking-widest text-ink/40 mb-2">Código de invitación</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 bg-ink/[0.04] font-mono text-sm tracking-[0.2em] truncate">
            {group.inviteCode}
          </code>
          <button onClick={copyInvite} className="p-2 border border-ink/15 hover:border-ink transition-colors" title="Copiar código">
            {copied ? <Check size={14} className="text-forest" /> : <Copy size={14} />}
          </button>
          {isAdmin && (
            <button onClick={regenerate} disabled={regenerating}
              className="p-2 border border-ink/15 hover:border-ink transition-colors disabled:opacity-40" title="Regenerar código">
              <RefreshCw size={14} className={regenerating ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
        {group.inviteCodeExpiresAt && (
          <p className="text-[10px] font-mono text-ink/40 mt-1.5">
            Expira: {new Date(group.inviteCodeExpiresAt).toLocaleString('es-ES')}
          </p>
        )}
      </div>

      {/* Miembros */}
      <div className="p-4 flex-1">
        <p className="text-[10px] font-mono uppercase tracking-widest text-ink/40 mb-3">
          Miembros ({members.length})
        </p>
        <ul className="space-y-1">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-2 py-1.5 group/member">
              {m.role === 'owner' ? (
                <Crown size={13} className="text-signal shrink-0" />
              ) : m.role === 'moderator' ? (
                <Shield size={13} className="text-forest shrink-0" />
              ) : (
                <span className="w-[13px] shrink-0" />
              )}
              <span className="text-sm truncate flex-1">
                {m.pseudonym}{m.userId === meId && <span className="text-ink/40"> (tú)</span>}
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-ink/40">
                {ROLE_LABEL[m.role]}
              </span>

              {/* Acciones de administración */}
              {m.userId !== meId && m.role !== 'owner' && (isOwner || (isAdmin && m.role === 'member')) && (
                <span className="hidden group-hover/member:flex items-center gap-1">
                  {isOwner && m.role === 'member' && (
                    <button onClick={() => changeRole(m.userId, 'moderator')}
                      className="p-1 text-ink/40 hover:text-forest" title="Hacer moderador">
                      <Shield size={13} />
                    </button>
                  )}
                  {isOwner && m.role === 'moderator' && (
                    <button onClick={() => changeRole(m.userId, 'member')}
                      className="p-1 text-ink/40 hover:text-ink" title="Quitar moderador">
                      <Shield size={13} className="opacity-40" />
                    </button>
                  )}
                  <button onClick={() => kick(m)} className="p-1 text-ink/40 hover:text-rally" title="Expulsar">
                    <X size={13} />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Zona de peligro */}
      <div className="p-4 border-t border-ink/10 space-y-1">
        {!isOwner && (
          <button onClick={leave}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono uppercase tracking-widest text-ink/50 hover:text-rally transition-colors">
            <LogOut size={13} /> Abandonar grupo
          </button>
        )}
        {isOwner && (
          <button onClick={destroy}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono uppercase tracking-widest text-ink/50 hover:text-rally transition-colors">
            <Trash2 size={13} /> Borrar grupo
          </button>
        )}
      </div>
    </aside>
  );
}

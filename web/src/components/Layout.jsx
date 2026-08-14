import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation, Outlet } from 'react-router-dom';
import { LogOut, LayoutGrid, UsersRound, Route as RouteIcon, Radar, User, Bell, ShieldAlert } from 'lucide-react';
import { api, resolveMediaUrl } from '../lib/api.js';
import { clearTokens, getRefreshToken, getUser } from '../lib/auth.js';
import { getSocket, disconnectSocket } from '../lib/socket.js';
import { registerPush, listenDeepLinks } from '../lib/native.js';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();

  const [profile, setProfile] = useState(null);
  const [unread,  setUnread]  = useState(0);
  const [needsTos, setNeedsTos] = useState(false);
  const pathRef = useRef(location.pathname);
  useEffect(() => { pathRef.current = location.pathname; }, [location.pathname]);

  useEffect(() => {
    let active = true;
    api.get('/profile')
      .then(({ data }) => { if (active) setProfile(data.profile); })
      .catch(() => {}); // silencioso: si falla, usamos fallback de getUser()
    // ¿Cambió la versión de los términos desde la última aceptación?
    api.get('/auth/me')
      .then(({ data }) => { if (active) setNeedsTos(Boolean(data.user?.needsTos)); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  async function acceptTos() {
    try {
      await api.post('/auth/accept-tos');
      setNeedsTos(false);
    } catch { /* reintento en la próxima carga */ }
  }

  // ── App nativa: push (FCM/APNs) + deep links r4ce:// ──
  // En web ambas funciones son no-op (ver lib/native.js).
  useEffect(() => {
    registerPush((route) => navigate(route));
    const stopDeepLinks = listenDeepLinks((route) => navigate(route));
    return stopDeepLinks;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Notificaciones: contador inicial + tiempo real por socket ──
  useEffect(() => {
    let active = true;
    api.get('/notifications?limit=1')
      .then(({ data }) => { if (active) setUnread(data.unreadCount ?? 0); })
      .catch(() => {});

    const socket = getSocket();
    function onNotification(n) {
      // Si es un mensaje del grupo cuyo chat está abierto, no molestar:
      // marcarlo leído en silencio (el usuario ya lo está viendo).
      if (n.type === 'group_message' && pathRef.current === `/groups/${n.data?.groupId}`) {
        api.post('/notifications/read', { ids: [n.id] }).catch(() => {});
        return;
      }
      // Si estamos en la página de Avisos, ella se encarga
      if (pathRef.current === '/notifications') return;

      setUnread((u) => u + 1);

      // Notificación del navegador si la pestaña está en segundo plano
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(n.title, { body: n.body || undefined, icon: '/icon-192.png', tag: n.id });
        } catch { /* opcional */ }
      }
    }
    socket.on('notification:new', onNotification);

    // La página de Avisos comunica el contador tras marcar leídas
    function onCount(e) { setUnread(e.detail ?? 0); }
    window.addEventListener('r4ce:notif-count', onCount);

    return () => {
      socket.off('notification:new', onNotification);
      window.removeEventListener('r4ce:notif-count', onCount);
    };
  }, []);

  async function handleLogout() {
    try {
      await api.post('/auth/logout', { refreshToken: getRefreshToken() });
    } catch {}
    disconnectSocket();
    clearTokens();
    navigate('/login');
  }

  const navItems = [
    { to: '/',              label: 'Dashboard', icon: LayoutGrid },
    { to: '/live',          label: 'Live',      icon: Radar },
    { to: '/stages',        label: 'Tramos',    icon: RouteIcon },
    { to: '/groups',        label: 'Grupos',    icon: UsersRound },
    { to: '/notifications', label: 'Avisos',    icon: Bell, badge: unread },
    // Panel de administración: solo visible con rol admin (el backend
    // vuelve a comprobar el rol en cada petición)
    ...(profile?.role === 'admin'
      ? [{ to: '/admin', label: 'Admin', icon: ShieldAlert }]
      : []),
  ];

  const displayName = profile?.pseudonym || user?.pseudonym || user?.username || 'Piloto';
  const avatarUrl   = resolveMediaUrl(profile?.avatarUrl) || null;
  const initials    = displayName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="min-h-screen flex">
      {/* Sidebar — solo escritorio */}
      <aside className="w-64 bg-carbon text-ink hidden md:flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-ink/10">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold tracking-tighter italic">R4ce</span>
            <span className="font-mono text-[10px] text-ink/40 uppercase tracking-widest">v0.1</span>
          </div>
          <p className="text-[10px] font-mono text-ink/40 mt-1 uppercase tracking-widest">
            Panel de control
          </p>
          <div className="stripe-bar mt-4 -mb-1" />
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors
                 ${isActive
                    ? 'bg-rally text-white'
                    : 'text-ink/60 hover:text-ink hover:bg-white/5'}`
              }
            >
              <Icon size={16} strokeWidth={2.5} />
              <span>{label}</span>
              {badge > 0 && (
                <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-signal text-carbon
                                 text-[10px] font-mono font-bold flex items-center justify-center">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User + logout */}
        <div className="p-4 border-t border-ink/10">
          {/* Enlace al área personal */}
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `flex items-center gap-3 px-2 py-2 mb-2 transition-colors group
               ${isActive ? 'bg-white/10' : 'hover:bg-white/5'}`
            }
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="w-9 h-9 rounded-full object-cover border border-ink/20 shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-rally/20 text-rally flex items-center justify-center
                              text-xs font-bold font-mono border border-ink/20 shrink-0">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-mono text-ink/40 uppercase tracking-widest">Mi área</p>
              <p className="text-sm font-medium truncate group-hover:text-ink">{displayName}</p>
            </div>
          </NavLink>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono uppercase tracking-widest
                       text-ink/50 hover:text-rally transition-colors"
          >
            <LogOut size={14} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-x-hidden pb-16 md:pb-0">
        {/* Re-aceptación de términos tras un cambio de versión */}
        {needsTos && (
          <div className="bg-signal/10 border-b border-signal/30 px-4 py-2.5 flex items-center gap-3 flex-wrap text-sm">
            <span className="text-ink/70">
              Hemos actualizado los{' '}
              <NavLink to="/legal/terminos" target="_blank" className="text-rally underline">términos de uso</NavLink>
              {' '}y la{' '}
              <NavLink to="/legal/privacidad" target="_blank" className="text-rally underline">política de privacidad</NavLink>.
            </span>
            <button
              onClick={acceptTos}
              className="ml-auto px-3 py-1.5 bg-ink text-paper text-[11px] font-mono uppercase tracking-widest hover:bg-ink/80"
            >
              Aceptar
            </button>
          </div>
        )}
        <Outlet />
      </main>

      {/* Barra inferior — solo móvil */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-carbon text-ink
                   flex items-stretch border-t border-ink/10
                   pb-[env(safe-area-inset-bottom)]"
      >
        {[...navItems, { to: '/profile', label: 'Perfil', icon: User }].map(
          ({ to, label, icon: Icon, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center gap-0.5 py-2
                 text-[10px] font-mono uppercase tracking-wide
                 ${isActive ? 'text-rally' : 'text-ink/50'}`
              }
            >
              <span className="relative">
                <Icon size={18} strokeWidth={2.25} />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-signal text-carbon
                                   text-[9px] font-mono font-bold flex items-center justify-center">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </span>
              <span>{label}</span>
            </NavLink>
          )
        )}
      </nav>
    </div>
  );
}
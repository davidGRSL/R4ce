import { useState, useEffect } from 'react';
import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { LogOut, LayoutGrid, UsersRound, Route as RouteIcon, Radar, User } from 'lucide-react';
import { api } from '../lib/api.js';
import { clearTokens, getRefreshToken, getUser } from '../lib/auth.js';

export default function Layout() {
  const navigate = useNavigate();
  const user = getUser();

  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let active = true;
    api.get('/profile')
      .then(({ data }) => { if (active) setProfile(data.profile); })
      .catch(() => {}); // silencioso: si falla, usamos fallback de getUser()
    return () => { active = false; };
  }, []);

  async function handleLogout() {
    try {
      await api.post('/auth/logout', { refreshToken: getRefreshToken() });
    } catch {}
    clearTokens();
    navigate('/login');
  }

  const navItems = [
    { to: '/',         label: 'Dashboard', icon: LayoutGrid },
    { to: '/live',     label: 'Live',      icon: Radar },
    { to: '/stages',   label: 'Tramos',    icon: RouteIcon },
    { to: '/groups',   label: 'Grupos',    icon: UsersRound },
  ];

  const displayName = profile?.pseudonym || user?.pseudonym || user?.username || 'Piloto';
  const avatarUrl   = profile?.avatarUrl || null;
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
          {navItems.map(({ to, label, icon: Icon }) => (
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
        <Outlet />
      </main>

      {/* Barra inferior — solo móvil */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-carbon text-ink
                   flex items-stretch border-t border-ink/10
                   pb-[env(safe-area-inset-bottom)]"
      >
        {[...navItems, { to: '/profile', label: 'Perfil', icon: User }].map(
          ({ to, label, icon: Icon }) => (
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
              <Icon size={18} strokeWidth={2.25} />
              <span>{label}</span>
            </NavLink>
          )
        )}
      </nav>
    </div>
  );
}
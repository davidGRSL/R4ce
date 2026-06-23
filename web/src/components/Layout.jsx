import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { LogOut, LayoutGrid, Trophy, Clock } from 'lucide-react';
import { api } from '../lib/api.js';
import { clearTokens, getRefreshToken, getUser } from '../lib/auth.js';

export default function Layout() {
  const navigate = useNavigate();
  const user = getUser();

  async function handleLogout() {
    try {
      await api.post('/auth/logout', { refreshToken: getRefreshToken() });
    } catch {}
    clearTokens();
    navigate('/login');
  }

  const navItems = [
    { to: '/',         label: 'Dashboard', icon: LayoutGrid },
    { to: '/rankings', label: 'Rankings',  icon: Trophy },
    { to: '/times',    label: 'Tiempos',   icon: Clock },
  ];

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-ink text-paper flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-paper/10">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold tracking-tighter">R4ce</span>
            <span className="font-mono text-[10px] text-paper/40 uppercase tracking-widest">v0.1</span>
          </div>
          <p className="text-[10px] font-mono text-paper/40 mt-1 uppercase tracking-widest">
            Panel de control
          </p>
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
                    ? 'bg-paper text-ink'
                    : 'text-paper/70 hover:text-paper hover:bg-paper/5'}`
              }
            >
              <Icon size={16} strokeWidth={2.5} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User + logout */}
        <div className="p-4 border-t border-paper/10">
          <div className="mb-3">
            <p className="text-xs font-mono text-paper/40 uppercase tracking-widest">Sesión</p>
            <p className="text-sm font-medium mt-1 truncate">{user?.pseudonym || user?.username}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono uppercase tracking-widest
                       text-paper/60 hover:text-rally transition-colors"
          >
            <LogOut size={14} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}

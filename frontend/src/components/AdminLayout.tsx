// ============================================================
// Shell for admin pages — left sidebar navigation with a mobile
// hamburger collapse. Light + medical-green admin theme.
// ============================================================
import { useState } from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Users, BrainCircuit, Menu, X, ShieldCheck } from "lucide-react";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/accounts", label: "Accounts", icon: Users, end: false },
  { to: "/training", label: "AI Training", icon: BrainCircuit, end: false },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-admin-border">
        <ShieldCheck size={20} className="text-admin-accent shrink-0" />
        <div>
          <p className="text-[14px] font-bold leading-tight">MedCode AI</p>
          <p className="text-[11px] text-admin-accent font-semibold leading-tight">SuperAdmin</p>
        </div>
      </div>
      <nav className="flex-1 py-4 space-y-1">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-5 py-2.5 text-[13px] font-semibold transition-colors border-l-2 ${
                isActive
                  ? "border-admin-accent bg-admin-accent/10 text-admin-text"
                  : "border-transparent text-admin-muted hover:text-admin-text hover:bg-black/5"
              }`
            }>
            <item.icon size={15} /> {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-admin-bg text-admin-text">
      <aside className="hidden md:block w-60 shrink-0 bg-admin-card border-r border-admin-border">
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-60 bg-admin-card border-r border-admin-border">
            <button onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3 text-admin-muted hover:text-admin-text">
              <X size={18} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-admin-card border-b border-admin-border">
          <button onClick={() => setMobileOpen(true)} className="text-admin-muted hover:text-admin-text">
            <Menu size={18} />
          </button>
          <p className="text-[13px] font-bold">MedCode AI <span className="text-admin-accent">SuperAdmin</span></p>
        </div>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

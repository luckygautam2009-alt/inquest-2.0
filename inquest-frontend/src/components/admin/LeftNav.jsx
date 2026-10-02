import {
  Users,
  ShoppingBag,
  CreditCard,
  RotateCcw,
  Ticket,
  ShieldAlert,
  BookOpen,
  CheckCircle2,
  ShieldCheck,
  TrendingUp,
  FileText,
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'orders', label: 'Orders', icon: ShoppingBag },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'refunds', label: 'Refunds', icon: RotateCcw },
  { id: 'tickets', label: 'Tickets', icon: Ticket },
  { id: 'securityEvents', label: 'Security Events', icon: ShieldAlert },
  { id: 'policies', label: 'Policies', icon: BookOpen },
  { id: 'analytics', label: 'Analytics (2.0)', icon: TrendingUp },
  { id: 'auditlog', label: 'Audit Log (2.0)', icon: FileText },
];

export default function LeftNav({ activeTable, setActiveTable, data }) {
  return (
    <aside className="w-56 xl:w-64 border-r border-border bg-ink-light flex flex-col justify-between shrink-0 p-3 select-none transition-colors">
      <div className="space-y-3">
        {/* Navigation Section Header */}
        <div className="px-2.5 pt-1 flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider uppercase text-muted">
            Database Tables
          </span>
          <span className="text-[10px] font-mono text-muted/80 bg-ink-inset px-1.5 py-0.5 rounded border border-border">
            9 views
          </span>
        </div>

        <nav className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const count = data?.[item.id]?.length ?? 0;
            const isActive = activeTable === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTable(item.id)}
                className={`w-full group flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer ${
                  isActive
                    ? 'bg-amber/10 text-amber font-semibold border border-amber/25 shadow-2xs'
                    : 'text-paper-dim hover:text-paper hover:bg-ink-lighter/70'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? 'text-amber' : 'text-muted group-hover:text-paper'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
                {count > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 transition-colors ${
                      isActive
                        ? 'bg-amber/20 text-amber font-bold'
                        : 'bg-ink-inset text-muted group-hover:text-paper'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Bottom Section: System Status & Security Badge ── */}
      <div className="space-y-2 pt-3 border-t border-border">
        {/* System Online Card */}
        <div className="bg-ink-inset rounded-lg p-2.5 border border-border flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-verified animate-pulse shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-paper leading-tight flex items-center justify-between">
              <span>System Online</span>
              <span className="text-[9px] font-mono text-verified font-bold uppercase">Live</span>
            </div>
            <div className="text-[10px] text-muted truncate">Database synchronized</div>
          </div>
        </div>

        {/* Enterprise Security Footer */}
        <div className="px-1 flex items-center justify-between text-[10px] text-muted">
          <div className="flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-amber" />
            <span className="font-semibold text-paper/90">INQUEST Enterprise</span>
          </div>
          <span className="text-[9px] font-mono">v2.4</span>
        </div>
      </div>
    </aside>
  );
}

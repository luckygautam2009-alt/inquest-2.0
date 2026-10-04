import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, FileText, LogOut, Bell } from 'lucide-react';
import { getMyNotifications, markMyNotificationsRead } from '../../api/client';

export default function AccountMenu({ customer, actionNeeded, onOpenComplaints, onLogout }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const box = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await getMyNotifications();
      setItems(res.data.notifications || []);
      setUnread(res.data.unread || 0);
    } catch { /* ignore polling errors */ }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    function onDoc(e) { if (box.current && !box.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  async function readAll() {
    await markMyNotificationsRead();
    load();
  }

  const badge = unread + actionNeeded;
  const dot = { success: 'bg-verified', attention: 'bg-alert', info: 'bg-amber' };

  return (
    <div className="relative" ref={box}>
      <button type="button" onClick={() => { setOpen(!open); if (!open) load(); }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-verified-dim border border-verified/40 text-xs font-semibold text-verified cursor-pointer">
        <span className="w-6 h-6 rounded-full bg-verified text-ink flex items-center justify-center font-bold text-[11px]">{customer.name.charAt(0).toUpperCase()}</span>
        <span className="hidden sm:inline">{customer.name.split(' ')[0]}</span>
        <ChevronDown className="w-3.5 h-3.5" />
        {badge > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-alert text-white text-[10px] flex items-center justify-center font-bold">{badge}</span>}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border-strong bg-ink-light shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <div className="font-bold text-sm">{customer.name}</div>
            <div className="text-[11px] text-muted">{customer.email} · {customer.id}</div>
          </div>
          <button type="button" onClick={() => { setOpen(false); onOpenComplaints(); }}
            className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-ink-lighter cursor-pointer">
            <span className="flex items-center gap-2.5"><FileText className="w-4 h-4 text-amber" /> My complaints</span>
            {actionNeeded > 0 && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-alert-dim text-alert border border-alert/40">{actionNeeded} need your action</span>}
          </button>

          <div className="border-t border-border">
            <div className="flex items-center justify-between px-4 pt-2.5 pb-1">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted"><Bell className="w-3 h-3" /> Notifications</span>
              {unread > 0 && <button type="button" onClick={readAll} className="text-[11px] font-semibold text-amber hover:underline cursor-pointer">Mark all read</button>}
            </div>
            <div className="max-h-64 overflow-y-auto">
              {!items.length && <p className="px-4 py-3 text-xs text-muted">No notifications yet.</p>}
              {items.map((n) => (
                <div key={n.id} className={`px-4 py-2.5 border-t border-border/60 ${n.readAt ? 'opacity-60' : ''}`}>
                  <div className="flex items-start gap-2">
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${dot[n.severity] || dot.info}`} />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-paper">{n.title}</div>
                      {n.body && <div className="text-[11px] text-muted">{n.body}</div>}
                      <div className="text-[10px] text-muted/80 mt-0.5">{new Date(n.createdAt).toLocaleString('en-IN')}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button type="button" onClick={onLogout}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-muted hover:text-paper hover:bg-ink-lighter border-t border-border cursor-pointer">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

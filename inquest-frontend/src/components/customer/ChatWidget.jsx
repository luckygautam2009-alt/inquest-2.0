import { useEffect, useState } from 'react';
import { X, Camera, Check } from 'lucide-react';
import { registerComplaint } from '../../api/client';

export const ISSUES = [
  { key: 'double', label: 'I was charged twice', text: 'bhai payment 2 baar kat gyi, please jaldi fix karo' },
  { key: 'failed', label: 'Money deducted, order failed', text: 'payment kat gya but my order did not go through, please refund' },
  { key: 'damaged', label: 'Item arrived damaged', text: 'my item arrived with a cracked broken part, please refund' },
  { key: 'delay', label: 'My order is delayed', text: 'mera order abhi tak nahi aaya, delivery date nikal gayi' },
  { key: 'refund', label: 'Where is my refund?', text: 'where is my refund for this order' },
  { key: 'other', label: 'Something else', text: '' },
];

function Bubble({ children }) {
  return (
    <div className="flex">
      <div className="bg-ink-lighter border border-border rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm text-paper max-w-[88%]">{children}</div>
    </div>
  );
}

export default function ChatWidget({ customer, orders, open, setOpen, preset, onRegistered, onOpenComplaints }) {
  const [view, setView] = useState('menu');
  const [orderId, setOrderId] = useState('');
  const [issue, setIssue] = useState('other');
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState([]);
  const [photoError, setPhotoError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  function resetAll() {
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setView('menu'); setOrderId(''); setIssue('other'); setText(''); setPhotos([]);
    setPhotoError(null); setError(null); setDone(null); setBusy(false);
  }

  useEffect(() => {
    if (open && preset) {
      const i = ISSUES.find((x) => x.key === preset.issue) || ISSUES[ISSUES.length - 1];
      setView('form'); setOrderId(preset.orderId || ''); setIssue(i.key); setText(i.text);
      setDone(null); setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preset]);

  function close() { setOpen(false); resetAll(); }

  function pickIssue(key) {
    setIssue(key);
    setText(ISSUES.find((i) => i.key === key).text);
  }

  function pickPhotos(e) {
    setPhotoError(null);
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    const next = [...photos];
    for (const file of picked) {
      if (!file.type.startsWith('image/')) { setPhotoError('Only image files are allowed.'); continue; }
      if (file.size > 5 * 1024 * 1024) { setPhotoError('Each photo must be under 5 MB.'); continue; }
      if (next.length >= 3) { setPhotoError('You can attach up to 3 photos.'); break; }
      next.push({ file, url: URL.createObjectURL(file) });
    }
    setPhotos(next);
  }

  function removePhoto(i) {
    URL.revokeObjectURL(photos[i].url);
    setPhotos(photos.filter((_, idx) => idx !== i));
  }

  async function submit() {
    setError(null);
    if (text.trim().length < 8) { setError('Please describe the problem (at least 8 characters).'); return; }
    setBusy(true);
    try {
      const res = await registerComplaint({ orderId, complaintText: text.trim(), issueKey: issue, photos: photos.map((p) => p.file) });
      setDone(res.data);
      setView('done');
      if (onRegistered) onRegistered();
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const first = customer.name.split(' ')[0];
  const input = 'w-full bg-ink-lighter border border-border-strong rounded-lg px-3 py-2 text-sm text-paper focus:outline-none focus:ring-2 focus:ring-amber/50';
  const choice = 'w-full text-left text-sm font-semibold px-3.5 py-2.5 rounded-xl border border-amber/40 text-amber bg-amber-dim hover:bg-amber/20 cursor-pointer';

  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} aria-label="Open help chat" title="Need help?"
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-amber text-ink text-3xl shadow-lg hover:scale-105 transition-transform cursor-pointer flex items-center justify-center">
          {'\u{1F916}'}
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[22rem] max-w-[calc(100vw-2rem)] h-[34rem] max-h-[calc(100vh-3rem)] flex flex-col rounded-2xl border border-border-strong bg-ink-light shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-amber-dim">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">{'\u{1F916}'}</span>
              <div>
                <div className="text-sm font-bold text-paper leading-tight">Inquest Assistant</div>
                <div className="text-[11px] text-muted leading-tight">Here to help with your orders</div>
              </div>
            </div>
            <button type="button" onClick={close} aria-label="Close chat" className="cursor-pointer text-muted hover:text-paper"><X className="w-4 h-4" /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {view === 'menu' && (
              <>
                <Bubble>Hi {first}! How can I help you today?</Bubble>
                <div className="space-y-2 pl-1">
                  <button type="button" className={choice} onClick={() => { setView('form'); setText(''); setIssue('other'); }}>Register a complaint</button>
                  <button type="button" className={choice} onClick={() => { close(); onOpenComplaints(); }}>Check my complaints</button>
                </div>
              </>
            )}

            {view === 'form' && (
              <>
                <Bubble>I am sorry you ran into trouble. Tell me what happened and I will register a complaint for our team.</Bubble>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">Which order?</label>
                  <select value={orderId} onChange={(e) => setOrderId(e.target.value)} className={input}>
                    <option value="">Not about a specific order</option>
                    {orders.map((o) => <option key={o.id} value={o.id}>{o.id} · {o.product}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">What went wrong?</label>
                  <div className="flex flex-wrap gap-1.5">
                    {ISSUES.map((i) => (
                      <button key={i.key} type="button" onClick={() => pickIssue(i.key)}
                        className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-full border cursor-pointer ${issue === i.key ? 'bg-amber text-ink border-amber' : 'border-border-strong text-muted hover:text-paper'}`}>
                        {i.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">Tell us more</label>
                  <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000}
                    placeholder="Describe the problem (Hindi, English or Hinglish)" className={input} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
                      <Camera className="w-3.5 h-3.5 text-amber" /> Photos <span className="normal-case font-medium">(optional)</span>
                    </span>
                    {photos.length < 3 && (
                      <label className="text-xs font-semibold text-amber cursor-pointer hover:underline">
                        + Add photo
                        <input type="file" accept="image/*" multiple className="hidden" onChange={pickPhotos} />
                      </label>
                    )}
                  </div>
                  <p className="text-[11px] text-muted mb-2">For example, a clear photo of the cracked phone.</p>
                  {photos.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {photos.map((p, i) => (
                        <div key={p.url} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border-strong">
                          <img src={p.url} alt={`evidence ${i + 1}`} className="w-full h-full object-cover" />
                          <button type="button" onClick={() => removePhoto(i)} aria-label="Remove photo"
                            className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {photoError && <p className="text-xs text-alert font-semibold mt-1.5">{photoError}</p>}
                </div>
                {error && <p className="text-sm font-semibold text-alert">{error}</p>}
                <button type="button" disabled={busy} onClick={submit} className="w-full bg-amber text-ink font-bold py-2.5 rounded-lg cursor-pointer disabled:opacity-50">
                  {busy ? 'Registering…' : 'Submit complaint'}
                </button>
                <button type="button" onClick={() => setView('menu')} className="w-full text-xs font-semibold text-muted hover:text-paper cursor-pointer">Back</button>
              </>
            )}

            {view === 'done' && done && (
              <>
                <div className="rounded-xl border border-verified/40 bg-verified-dim p-4">
                  <div className="flex items-center gap-2 font-bold text-verified mb-1"><Check className="w-4 h-4" /> Complaint registered</div>
                  <p className="text-sm text-paper">Complaint #{done.id} has been registered successfully.</p>
                </div>
                <Bubble>Sorry for the inconvenience. A confirmation has been sent to {customer.email}. Our team will review your complaint, and you can follow it under <b>My complaints</b>.</Bubble>
                <div className="space-y-2 pl-1">
                  <button type="button" className={choice} onClick={() => { close(); onOpenComplaints(); }}>Check my complaints</button>
                  <button type="button" className="w-full text-xs font-semibold text-muted hover:text-paper cursor-pointer py-1" onClick={close}>Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

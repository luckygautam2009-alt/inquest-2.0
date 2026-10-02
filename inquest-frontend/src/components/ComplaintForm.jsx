import { useEffect, useState } from 'react';
import { createCustomer, getCustomers } from '../api/client';
import { ChevronDown, Plus, X, User, Mail, Shield, Sparkles, Camera } from 'lucide-react';

const TIER_COLORS = {
  platinum: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30',
  gold: 'text-amber bg-amber-dim border-amber/30',
  silver: 'text-muted bg-ink-lighter border-border-strong',
};

const FALLBACK_CUSTOMERS = [
  { id: 'CUST001', name: 'Ravi Sharma', tier: 'gold' },
  { id: 'CUST002', name: 'Priya Mehta', tier: 'silver' },
  { id: 'CUST003', name: 'Aman Verma', tier: 'platinum' },
  { id: 'CUST004', name: 'Sneha Kapoor', tier: 'silver' },
];

const SAMPLE_COMPLAINTS = [
  {
    label: 'Double charge',
    text: 'Bhai payment 2 baar kat gyi for order ORD-1021 but order status still pending!',
  },
  {
    label: 'Delivery Delay',
    text: 'Order ORD-8492 was promised 3 days ago. No update on delivery!',
  },
  {
    label: 'Refund Issue',
    text: 'I returned the item last week. Where is my refund for REF-3918?',
  },
];

export default function ComplaintForm({ onSubmit, loading }) {
  const [customers, setCustomers] = useState(FALLBACK_CUSTOMERS);
  const [customerId, setCustomerId] = useState('CUST001');
  const [complaintText, setComplaintText] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newTier, setNewTier] = useState('silver');
  const [showOrder, setShowOrder] = useState(false);
  const [orderProduct, setOrderProduct] = useState('');
  const [orderAmount, setOrderAmount] = useState('');
  const [orderStatus, setOrderStatus] = useState('delivered');
  const [orderGatewayStatus, setOrderGatewayStatus] = useState('success');
  const [orderLocalStatus, setOrderLocalStatus] = useState('success');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [charCount, setCharCount] = useState(0);
  const [photos, setPhotos] = useState([]);
  const [photoError, setPhotoError] = useState(null);

  async function loadCustomers(selectId) {
    try {
      const res = await getCustomers();
      const list = res.data || [];
      if (list.length) {
        setCustomers(list);
        if (selectId) {
          setCustomerId(selectId);
        } else if (!list.some((c) => c.id === customerId)) {
          setCustomerId(list[0].id);
        }
      }
    } catch {
      setCustomers(FALLBACK_CUSTOMERS);
    }
  }

  useEffect(() => {
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    if (complaintText.trim().length < 5 || loading) return;
    onSubmit(customerId, complaintText.trim(), photos.map((p) => p.file));
  }

  function handlePhotoPick(e) {
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

  function removePhoto(idx) {
    URL.revokeObjectURL(photos[idx].url);
    setPhotos(photos.filter((_, i) => i !== idx));
    setPhotoError(null);
  }

  function handleTextChange(e) {
    setComplaintText(e.target.value);
    setCharCount(e.target.value.length);
  }

  async function handleAddCustomer(e) {
    e.preventDefault();
    setFormError(null);
    if (newName.trim().length < 2 || !newEmail.trim()) {
      setFormError('Name (min 2 chars) and email are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: newName.trim(),
        email: newEmail.trim(),
        tier: newTier,
      };
      if (showOrder && orderProduct.trim() && orderAmount) {
        payload.order = {
          product: orderProduct.trim(),
          amount: Number(orderAmount),
          status: orderStatus,
          gatewayStatus: orderGatewayStatus,
          localStatus: orderLocalStatus,
        };
      }
      const res = await createCustomer(payload);
      const created = res.data.customer || res.data;
      setNewName('');
      setNewEmail('');
      setNewTier('silver');
      setOrderProduct('');
      setOrderAmount('');
      setOrderStatus('delivered');
      setOrderGatewayStatus('success');
      setOrderLocalStatus('success');
      setShowOrder(false);
      setShowAdd(false);
      await loadCustomers(created.id);
    } catch (err) {
      setFormError(err.message || 'Could not add customer');
    } finally {
      setSaving(false);
    }
  }

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const canSubmit = complaintText.trim().length >= 5 && !loading;

  return (
    <div className="relative">
      {/* Header label */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-2 h-7 bg-amber rounded-full shadow-xs" />
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-paper tracking-tight">Intake Case</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Customer selector */}
        <div>
          <label className="block text-xs font-bold text-paper-dim dark:text-muted uppercase tracking-wider mb-2.5">
            Select Customer
          </label>
          <div className="relative">
            <select
              id="customer-select"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full appearance-none bg-ink-lighter border border-border-strong rounded-xl
                         px-4 py-3.5 pr-10 text-base text-paper font-semibold
                         focus:outline-none focus:ring-2 focus:ring-amber/50 focus:border-amber
                         transition-colors cursor-pointer shadow-xs"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.id} ({c.tier?.toUpperCase() || 'STANDARD'})
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-paper-dim dark:text-muted pointer-events-none" />
          </div>

          {/* Selected customer badge */}
          {selectedCustomer && (
            <div className="mt-2.5 flex items-center justify-between flex-wrap gap-2 text-xs bg-ink-lighter/70 border border-border-strong rounded-xl p-2.5 shadow-2xs">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-ink border border-border-strong flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-paper-dim dark:text-muted" />
                </div>
                <span className="font-bold text-paper">{selectedCustomer.name}</span>
                {selectedCustomer.email && (
                  <span className="text-paper-dim dark:text-muted hidden sm:inline">({selectedCustomer.email})</span>
                )}
              </div>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border shadow-2xs ${TIER_COLORS[selectedCustomer.tier] || 'text-muted'}`}>
                {selectedCustomer.tier?.toUpperCase() || 'STANDARD'}
              </span>
            </div>
          )}

          {/* Add customer toggle */}
          <button
            type="button"
            onClick={() => { setShowAdd((v) => !v); setFormError(null); }}
            className="mt-3.5 flex items-center gap-1.5 text-xs font-bold text-amber hover:text-amber-light transition-colors cursor-pointer"
          >
            {showAdd ? (
              <><X className="w-4 h-4" /> Cancel adding customer</>
            ) : (
              <><Plus className="w-4 h-4" /> Add new customer</>
            )}
          </button>
        </div>

        {/* Add customer inline panel */}
        {showAdd && (
          <div className="border border-border-strong bg-ink-lighter rounded-xl p-4.5 space-y-3.5 fade-up shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Plus className="w-4 h-4 text-amber" />
              <span className="text-xs font-bold text-paper uppercase tracking-wider">New Customer Registration</span>
            </div>

            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-paper-dim dark:text-muted" />
              <input
                id="new-customer-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Full name (e.g. Ramesh Patel)"
                className="w-full bg-ink border border-border-strong rounded-lg pl-10 pr-3.5 py-2.5
                           text-sm text-paper placeholder:text-paper-dim/60 dark:placeholder:text-muted/60
                           focus:outline-none focus:ring-2 focus:ring-amber/50 focus:border-amber
                           transition-colors"
              />
            </div>

            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-paper-dim dark:text-muted" />
              <input
                id="new-customer-email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Email address"
                type="email"
                className="w-full bg-ink border border-border-strong rounded-lg pl-10 pr-3.5 py-2.5
                           text-sm text-paper placeholder:text-paper-dim/60 dark:placeholder:text-muted/60
                           focus:outline-none focus:ring-2 focus:ring-amber/50 focus:border-amber
                           transition-colors"
              />
            </div>

            <div className="relative">
              <Shield className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-paper-dim dark:text-muted" />
              <select
                id="new-customer-tier"
                value={newTier}
                onChange={(e) => setNewTier(e.target.value)}
                className="w-full appearance-none bg-ink border border-border-strong rounded-lg
                           pl-10 pr-3.5 py-2.5 text-sm text-paper font-medium
                           focus:outline-none focus:ring-2 focus:ring-amber/50 focus:border-amber
                           transition-colors cursor-pointer"
              >
                <option value="silver">Silver Tier</option>
                <option value="gold">Gold Tier</option>
                <option value="platinum">Platinum Tier</option>
              </select>
              <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-paper-dim dark:text-muted pointer-events-none" />
            </div>

            <button
              type="button"
              onClick={() => setShowOrder((v) => !v)}
              className="text-xs font-semibold text-amber hover:text-amber-light cursor-pointer"
            >
              {showOrder ? '- Hide order details' : '+ Seed an order (optional, for instant investigation)'}
            </button>

            {showOrder && (
              <div className="space-y-2.5 border-t border-border pt-3">
                <input
                  value={orderProduct}
                  onChange={(e) => setOrderProduct(e.target.value)}
                  placeholder="Product name (e.g. Gaming Mouse)"
                  className="w-full bg-ink border border-border-strong rounded-lg px-3.5 py-2.5 text-sm text-paper placeholder:text-paper-dim/60 dark:placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-amber/50"
                />
                <input
                  value={orderAmount}
                  onChange={(e) => setOrderAmount(e.target.value)}
                  placeholder="Amount (e.g. 2499)"
                  type="number"
                  className="w-full bg-ink border border-border-strong rounded-lg px-3.5 py-2.5 text-sm text-paper placeholder:text-paper-dim/60 dark:placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-amber/50"
                />
                <div className="grid grid-cols-2 gap-2.5">
                  <select
                    value={orderStatus}
                    onChange={(e) => setOrderStatus(e.target.value)}
                    className="bg-ink border border-border-strong rounded-lg px-3 py-2.5 text-sm text-paper"
                  >
                    <option value="delivered">Delivered</option>
                    <option value="in_transit">In Transit</option>
                  </select>
                  <div />
                  <select
                    value={orderGatewayStatus}
                    onChange={(e) => setOrderGatewayStatus(e.target.value)}
                    className="bg-ink border border-border-strong rounded-lg px-3 py-2.5 text-sm text-paper"
                  >
                    <option value="success">Gateway: Success</option>
                    <option value="failed">Gateway: Failed</option>
                  </select>
                  <select
                    value={orderLocalStatus}
                    onChange={(e) => setOrderLocalStatus(e.target.value)}
                    className="bg-ink border border-border-strong rounded-lg px-3 py-2.5 text-sm text-paper"
                  >
                    <option value="success">Local: Success</option>
                    <option value="failed">Local: Failed</option>
                  </select>
                </div>
                <p className="text-[11px] text-paper-dim dark:text-muted">
                  Tip: set Gateway=Success + Local=Failed to seed a duplicate-payment style case.
                </p>
              </div>
            )}

            {formError && (
              <p className="text-xs text-alert bg-alert-dim border border-alert/30 rounded-lg px-3 py-2 font-medium">
                {formError}
              </p>
            )}

            <button
              type="button"
              id="save-customer-btn"
              disabled={saving}
              onClick={handleAddCustomer}
              className="w-full bg-amber text-ink font-bold px-4 py-2.5 rounded-lg text-sm
                         disabled:opacity-50 hover:bg-amber-light active:scale-[0.98]
                         transition-all duration-150 cursor-pointer shadow-sm"
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" />
                  Saving customer...
                </span>
              ) : 'Save & Select Customer'}
            </button>
          </div>
        )}

        {/* Complaint textarea */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <label className="text-xs font-bold text-paper-dim dark:text-muted uppercase tracking-wider">
              Customer Complaint
            </label>
            <span className="text-[11px] font-semibold text-paper-dim dark:text-muted">Hindi / Hinglish supported</span>
          </div>

          <div className="relative">
            <textarea
              id="complaint-text"
              value={complaintText}
              onChange={handleTextChange}
              rows={4}
              placeholder="Describe the complaint in detail… e.g. 'Payment got deducted twice for order #ORD-1021' or 'Mera order abhi tak deliver nahi hua'"
              className="w-full bg-ink-lighter border border-border-strong rounded-xl
                         px-4 py-3.5 text-base text-paper placeholder:text-paper-dim/60 dark:placeholder:text-muted/60
                         resize-none leading-relaxed
                         focus:outline-none focus:ring-2 focus:ring-amber/50 focus:border-amber
                         transition-colors shadow-xs"
            />
            <span className={`absolute bottom-3 right-3 text-xs tabular-nums font-mono
              ${charCount > 0 ? 'text-paper-dim dark:text-muted font-semibold' : 'text-paper-dim/40 dark:text-muted/40'}`}>
              {charCount} chars
            </span>
          </div>

          {/* Photo evidence (2.0) */}
          <div className="mt-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-xs font-bold text-paper-dim dark:text-muted uppercase tracking-wider">
                <Camera className="w-3.5 h-3.5 text-amber" /> Photo evidence <span className="font-medium normal-case tracking-normal">(optional, up to 3)</span>
              </span>
              {photos.length < 3 && (
                <label className="text-xs font-semibold text-amber cursor-pointer hover:underline">
                  + Add photo
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoPick} />
                </label>
              )}
            </div>
            {photos.length > 0 && (
              <div className="flex gap-2.5 flex-wrap">
                {photos.map((p, i) => (
                  <div key={p.url} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border-strong">
                    <img src={p.url} alt={'evidence ' + (i + 1)} className="w-full h-full object-cover" />
                    <button type="button" onClick={() => removePhoto(i)} aria-label="Remove photo"
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {photoError && <p className="text-xs text-alert font-semibold mt-1.5">{photoError}</p>}
          </div>

          {/* Quick example prompts */}
          <div className="mt-3.5">
            <div className="flex items-center gap-1.5 text-xs text-paper-dim dark:text-muted mb-2 font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-amber" />
              <span>Quick test cases:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_COMPLAINTS.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setComplaintText(item.text);
                    setCharCount(item.text.length);
                  }}
                  className="text-xs font-medium bg-ink-lighter hover:bg-ink hover:border-amber/50 border border-border-strong text-paper px-3 py-1.5 rounded-lg transition-all duration-150 shadow-2xs cursor-pointer active:scale-95"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Submit */}
        <button
          id="submit-complaint-btn"
          type="submit"
          disabled={!canSubmit}
          className="w-full relative overflow-hidden font-bold text-base rounded-xl py-4
                     transition-all duration-200 active:scale-[0.98] cursor-pointer
                     disabled:cursor-not-allowed
                     bg-amber text-ink hover:bg-amber-light shadow-md hover:shadow-lg
                     disabled:bg-ink-lighter disabled:text-muted disabled:shadow-none"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-3">
              <span className="flex gap-1.5">
                <span className="w-2 h-2 rounded-full bg-ink dot-1" />
                <span className="w-2 h-2 rounded-full bg-ink dot-2" />
                <span className="w-2 h-2 rounded-full bg-ink dot-3" />
              </span>
              Investigating Evidence Chain…
            </span>
          ) : (
            'Investigate Complaint'
          )}
        </button>
      </form>
    </div>
  );
}

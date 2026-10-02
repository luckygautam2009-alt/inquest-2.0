import { useState, useEffect } from 'react';
import {
  X,
  Lock,
  Upload,
  Database,
  Search,
  LogOut,
  Shield,
  CheckCircle2,
  Sun,
  Moon,
  ShieldCheck,
  Command,
} from 'lucide-react';
import {
  getAdminOverview,
  uploadReferenceIdCard,
  getReferenceStatus,
  getOrCreateAdminProfile,
  updateAdminProfilePhoto,
  updateAdminProfileName,
} from '../api/client';
import { useTheme } from '../hooks/useTheme';
import IDScanner from './IDScanner';
import LeftNav from './admin/LeftNav';
import StatCards from './admin/StatCards';
import DataTable from './admin/DataTable';
import ProfileSidebar from './admin/ProfileSidebar';
import AnalyticsView from './admin/AnalyticsView';
import AuditLogView from './admin/AuditLogView';

export default function AdminPanel({ onClose }) {
  // Theme hook shared with the entire application
  const { theme, toggleTheme } = useTheme();

  // Pre-unlock verification state
  const [refConfigured, setRefConfigured] = useState(null); // null = checking
  const [setupPassword, setSetupPassword] = useState('');
  const [setupFile, setSetupFile] = useState(null);
  const [setupError, setSetupError] = useState(null);
  const [setupLoading, setSetupLoading] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [scanning, setScanning] = useState(false);

  const [unlocked, setUnlocked] = useState(false);
  const [data, setData] = useState(null);
  const [adminProfile, setAdminProfile] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [activeTable, setActiveTable] = useState('customers');

  // Top header search bar state (filters active table client-side across all columns)
  const [globalSearch, setGlobalSearch] = useState('');

  // Reference card update state (post-unlock)
  const [refFile, setRefFile] = useState(null);
  const [refMsg, setRefMsg] = useState(null);

  function handleStartScan(e) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('Name, email, and admin password are all required.');
      return;
    }
    setScanning(true);
  }

  async function handleVerified(verifyData) {
    setVerifyResult(verifyData);
    setLoading(true);
    try {
      const [overviewRes, profileRes] = await Promise.all([
        getAdminOverview(password),
        getOrCreateAdminProfile({ email, name, adminPassword: password }),
      ]);
      setData(overviewRes.data);
      if (profileRes.profile) {
        setAdminProfile(profileRes.profile);
      }
      setUnlocked(true);
    } catch (err) {
      setError(err.message || 'Could not load admin data');
      setScanning(false);
    } finally {
      setLoading(false);
    }
  }

  async function refreshOverview() {
    try {
      const r = await getAdminOverview(password);
      setData(r.data);
    } catch { /* keep stale data if refresh fails */ }
  }

  async function handleUpdatePhoto(photoBase64) {
    try {
      const res = await updateAdminProfilePhoto({ email, photo: photoBase64, adminPassword: password });
      if (res.success && res.profile) {
        setAdminProfile(res.profile);
      }
      return res;
    } catch (err) {
      console.error('Failed to update profile photo:', err);
      throw err;
    }
  }

  async function handleUpdateName(newName) {
    try {
      const res = await updateAdminProfileName({ email, name: newName, adminPassword: password });
      if (res.success && res.profile) {
        setAdminProfile(res.profile);
        setName(res.profile.name);
      }
      return res;
    } catch (err) {
      console.error('Failed to update profile name:', err);
      throw err;
    }
  }

  useEffect(() => {
    getReferenceStatus()
      .then((res) => setRefConfigured(res.data.configured))
      .catch(() => setRefConfigured(false));
  }, []);

  async function handleSetupReference(e) {
    e.preventDefault();
    setSetupError(null);
    if (!setupPassword.trim()) {
      setSetupError('Admin password is required.');
      return;
    }
    if (!setupFile) {
      setSetupError('Please upload the reference NIET ID card image.');
      return;
    }
    setSetupLoading(true);
    try {
      await uploadReferenceIdCard({ file: setupFile, adminPassword: setupPassword });
      setRefConfigured(true);
    } catch (err) {
      setSetupError(err.message || 'Could not save reference ID card');
    } finally {
      setSetupLoading(false);
    }
  }

  async function handleUploadReference() {
    if (!refFile) return;
    setRefMsg(null);
    try {
      await uploadReferenceIdCard({ file: refFile, adminPassword: password });
      setRefMsg('Reference ID card saved successfully.');
    } catch (err) {
      setRefMsg(err.message || 'Upload failed');
    }
  }

  // ── 1. POST-UNLOCK FULL-SCREEN ADMIN DASHBOARD ──
  if (unlocked) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-ink text-paper overflow-hidden font-sans select-none">
        {/* Full-width Top Enterprise Header */}
        <header className="h-14 px-4 sm:px-5 border-b border-border bg-ink-light flex items-center justify-between gap-4 shrink-0 shadow-xs z-20 transition-colors">
          {/* Left Brand Area */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-amber-dim text-amber flex items-center justify-center shrink-0 border border-amber/25 shadow-2xs overflow-hidden p-1">
              <img src="/favicon.png" alt="INQUEST Admin" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-paper leading-none tracking-tight">
                  INQUEST Admin
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-dim text-amber border border-amber/25">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber" />
                  Console
                </span>
              </div>
              <p className="text-[10px] text-muted hidden sm:block leading-tight mt-0.5">
                Biometric ID Verified Session
              </p>
            </div>
          </div>

          {/* Center Global Search Bar (Client-side filtering across active table) */}
          <div className="flex-1 max-w-lg mx-2 sm:mx-6">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search across all columns in active table…"
                className="w-full bg-ink-inset border border-border rounded-lg pl-8 pr-12 py-1.5 text-xs text-paper placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-amber/50 transition-all"
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 text-[10px] font-mono text-muted/70 bg-ink-light px-1 py-0.5 rounded border border-border pointer-events-none">
                <Command className="w-2.5 h-2.5" />
                <span>K</span>
              </div>
            </div>
          </div>

          {/* Right Controls: Staff Badge + Theme Toggle + Exit Dashboard */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Session indicator */}
            <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-ink-inset border border-border text-xs">
              <div className="w-6 h-6 rounded-full border border-amber/40 bg-amber-dim text-amber flex items-center justify-center font-bold text-[10px] overflow-hidden shrink-0 aspect-square">
                {adminProfile?.profile_photo ? (
                  <img
                    src={adminProfile.profile_photo}
                    alt={adminProfile.name || name}
                    className="w-full h-full object-cover object-center shrink-0 aspect-square block"
                  />
                ) : (
                  (adminProfile?.name || name)?.slice(0, 1).toUpperCase() || 'A'
                )}
              </div>
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-muted">Staff:</span>
                <span className="font-semibold text-paper truncate max-w-[120px]">{adminProfile?.name || name}</span>
                <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
              </div>
            </div>

            {/* Dark / Light Theme Toggle Button */}
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-ink-inset hover:bg-ink-lighter border border-border text-paper text-xs font-medium transition-all duration-150 cursor-pointer shadow-2xs"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              aria-label="Toggle color theme"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-light" />
                  <span className="hidden sm:inline text-[11px]">Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-slate-600" />
                  <span className="hidden sm:inline text-[11px]">Dark</span>
                </>
              )}
            </button>

            {/* Exit Dashboard */}
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-ink-inset hover:bg-ink text-paper text-xs font-medium transition-all cursor-pointer shadow-2xs"
              title="Exit admin dashboard"
            >
              <LogOut className="w-3.5 h-3.5 text-muted" />
              <span className="hidden sm:inline text-[11px]">Exit</span>
            </button>
          </div>
        </header>

        {/* 3-Column Dashboard Body */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Left Navigation */}
          <LeftNav
            activeTable={activeTable}
            setActiveTable={setActiveTable}
            data={data}
          />

          {/* Center Main Content Area */}
          <main className="flex-1 flex flex-col p-3.5 sm:p-4.5 overflow-y-auto min-w-0 bg-ink transition-colors">
            {activeTable === 'analytics' ? (
              <AnalyticsView adminPassword={password} />
            ) : activeTable === 'auditlog' ? (
              <AuditLogView
                adminPassword={password}
                adminName={adminProfile?.name || name}
                adminEmail={email}
                onChanged={refreshOverview}
              />
            ) : (
              <>
                {/* Real KPI Statistics */}
                <StatCards data={data} />

                {/* Dense Data Table */}
                <DataTable
                  activeTable={activeTable}
                  data={data}
                  searchQuery={globalSearch}
                  setSearchQuery={setGlobalSearch}
                />
              </>
            )}
          </main>

          {/* Right Profile & Activity Sidebar */}
          <ProfileSidebar
            verifiedName={adminProfile?.name || name}
            verifiedEmail={email}
            adminProfile={adminProfile}
            onUpdatePhoto={handleUpdatePhoto}
            onUpdateName={handleUpdateName}
            verifyResult={verifyResult}
            data={data}
            refFile={refFile}
            setRefFile={setRefFile}
            handleUploadReference={handleUploadReference}
            refMsg={refMsg}
          />
        </div>
      </div>
    );
  }

  // ── 2. PRE-UNLOCK AUTHENTICATION MODAL ──
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-ink-light border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-xl relative transition-colors">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-dim text-amber flex items-center justify-center border border-amber/20">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-paper">Admin Authentication</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted hover:text-paper hover:bg-ink-inset cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {refConfigured === null ? (
          <div className="p-10 text-center text-xs text-muted flex flex-col items-center justify-center gap-2">
            <span className="w-5 h-5 border-2 border-amber/40 border-t-amber rounded-full animate-spin" />
            <span>Checking security configuration…</span>
          </div>
        ) : !refConfigured ? (
          <form onSubmit={handleSetupReference} className="p-6 space-y-4 max-w-md mx-auto w-full">
            <div className="flex items-center gap-2 text-xs font-semibold text-paper mb-1">
              <Lock className="w-4 h-4 text-amber" /> One-time setup: upload the reference NIET ID card
            </div>
            <p className="text-xs text-muted leading-relaxed">
              No reference ID card is configured yet. Upload one photo of a valid NIET ID card template once — all future verification scans will be compared against it.
            </p>
            <input
              value={setupPassword}
              onChange={(e) => setSetupPassword(e.target.value)}
              type="password"
              placeholder="Admin password"
              className="w-full bg-ink-inset border border-border rounded-lg px-3.5 py-2 text-xs text-paper placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-amber/50"
            />
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl p-5 text-center cursor-pointer hover:border-amber/50 transition-colors bg-ink-inset/40">
              <Upload className="w-5 h-5 text-amber" />
              <span className="text-xs font-semibold text-paper">
                {setupFile ? setupFile.name : 'Upload reference NIET ID card photo'}
              </span>
              <span className="text-[10px] text-muted">JPG, PNG, or WebP</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setSetupFile(e.target.files?.[0] || null)} />
            </label>
            {setupError && <p className="text-xs text-alert">{setupError}</p>}
            <button
              type="submit"
              disabled={setupLoading}
              className="w-full bg-amber text-ink font-bold px-4 py-2 rounded-lg text-xs hover:bg-amber-light disabled:opacity-50 cursor-pointer transition-all shadow-xs"
            >
              {setupLoading ? 'Saving…' : 'Save Reference & Continue'}
            </button>
          </form>
        ) : (
          loading ? (
            <div className="p-12 flex flex-col items-center justify-center gap-3 text-center">
              <span className="w-7 h-7 border-2 border-amber/40 border-t-amber rounded-full animate-spin" />
              <p className="text-xs font-semibold text-paper">Unlocking admin console…</p>
            </div>
          ) : scanning ? (
            <div className="p-5 max-w-md mx-auto w-full">
              <IDScanner
                name={name.trim()}
                email={email.trim()}
                adminPassword={password}
                onVerified={handleVerified}
                onCancel={() => setScanning(false)}
              />
            </div>
          ) : (
            <form onSubmit={handleStartScan} className="p-5 sm:p-6 space-y-3.5 max-w-md mx-auto w-full">
              <div className="flex items-center gap-2 text-xs font-semibold text-paper mb-1">
                <Lock className="w-3.5 h-3.5 text-amber" /> Identity verification required to access admin console
              </div>

              <div className="space-y-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-muted mb-1">Full Name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Yash Gautam"
                    className="w-full bg-ink-inset border border-border rounded-lg px-3 py-2 text-xs text-paper placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-amber/50"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-muted mb-1">Email Address</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    placeholder="e.g. luckygautam2009@gmail.com"
                    className="w-full bg-ink-inset border border-border rounded-lg px-3 py-2 text-xs text-paper placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-amber/50"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-muted mb-1">Admin Password</label>
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    placeholder="••••••••••••"
                    className="w-full bg-ink-inset border border-border rounded-lg px-3 py-2 text-xs text-paper placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-amber/50"
                  />
                </div>
              </div>

              {error && <p className="text-xs text-alert">{error}</p>}

              <button
                type="submit"
                className="w-full bg-amber text-ink font-bold px-4 py-2.5 rounded-lg text-xs hover:bg-amber-light transition-all cursor-pointer shadow-xs"
              >
                Proceed to ID Verification
              </button>
            </form>
          )
        )}
      </div>
    </div>
  );
}

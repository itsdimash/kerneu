import { useState } from "react";
import { KerneuLogo } from "../app/components/common/KerneuLogo";
import { AlertCircle, AlertTriangle, ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import designImg from "../assets/design-illustration.jpg";
import { ROLES, ROLE_EMAILS } from "../data/roles";
import type { Role } from "../types";
import { useCallback, useEffect } from "react";
export function LoginPage({ onLogin }: { onLogin: (r: Role) => void }) {
  const [role, setRole] = useState<Role>("pm");
  const [email, setEmail] = useState(ROLE_EMAILS["pm"]);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState(false);
  const handleRoleSelect = (key: Role) => { setRole(key); setEmail(ROLE_EMAILS[key]); setAuthError(false); };
  const handleKeyEvent = useCallback((e: KeyboardEvent) => {
    if (e.getModifierState) setCapsLock(e.getModifierState("CapsLock"));
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyEvent);
    window.addEventListener("keyup", handleKeyEvent);
    return () => { window.removeEventListener("keydown", handleKeyEvent); window.removeEventListener("keyup", handleKeyEvent); };
  }, [handleKeyEvent]);

  const handleSignIn = () => {
    setAuthError(false);
    if (!password) { setAuthError(true); return; }
    setLoading(true);
    setTimeout(() => { setLoading(false); onLogin(role); }, 1400);
  };

  const inputBase = "w-full px-3.5 py-2.5 text-sm border rounded-lg bg-white text-slate-900 placeholder-slate-400 transition-all focus:outline-none focus:ring-2";
  const inputNormal = `${inputBase} border-[#E2E8F0] focus:ring-[#2563EB]/20 focus:border-[#2563EB]`;
  const inputError  = `${inputBase} border-red-400 bg-red-50/40 focus:ring-red-500/20 focus:border-red-400`;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      <div className="hidden lg:flex flex-col w-[460px] bg-[#265B92] flex-shrink-0 relative overflow-hidden">
        <img src={designImg} alt="Kerneu Group — Unitree humanoid robot" className="absolute inset-0 h-full w-full object-contain [object-position:center_10%]" />
        <div className="relative z-10 mt-auto p-12">
          <p className="text-blue-200/80 text-xs">© 2026 Kerneu Group</p>
          <p className="text-blue-200/60 text-xs">Internal ERP System</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-[400px]">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <KerneuLogo size={32} />
            <div><p className="font-semibold text-slate-900 text-sm">Kerneu Group</p><p className="text-slate-400 text-xs">ERP Platform</p></div>
          </div>
          <h1 className="text-[22px] font-semibold text-slate-900 mb-1">Sign In</h1>
          <p className="text-sm text-slate-500 mb-7">Access your Kerneu Group workspace</p>

          <div className="mb-6">
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(ROLES) as [Role, typeof ROLES[Role]][]).map(([key, cfg]) => (
                <button key={key} onClick={() => handleRoleSelect(key)} aria-pressed={role === key}
                  className={`text-left px-3 py-2.5 rounded-lg border transition-all text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 ${role === key ? "border-[#2563EB] bg-[#EFF6FF] text-blue-900" : "border-[#E2E8F0] bg-white text-slate-700 hover:border-slate-300"}`}>
                  <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${cfg.dot}`} /><span className="font-medium">{cfg.label}</span></div>
                  <div className={`text-xs mt-0.5 ml-4 ${role === key ? "text-blue-500" : "text-slate-400"}`}>{cfg.full}</div>
                </button>
              ))}
            </div>
          </div>

          {authError && (
            <div className="flex items-start gap-2.5 px-3.5 py-3 mb-5 bg-red-50 border border-red-200 rounded-lg" role="alert">
              <AlertCircle size={15} className="text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700 font-medium">Incorrect email or password.</p>
            </div>
          )}

          <div className="space-y-4 mb-5">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input id="login-email" type="email" value={email} onChange={e => { setEmail(e.target.value); setAuthError(false); }}
                autoComplete="email" className={authError ? inputError : inputNormal} />
            </div>
            <div>
              <div className="mb-1.5">
                <label htmlFor="login-password" className="text-sm font-medium text-slate-700">Password</label>
              </div>
              <div className="relative">
                <input id="login-password" type={showPassword ? "text" : "password"} value={password}
                  onChange={e => { setPassword(e.target.value); setAuthError(false); }}
                  onKeyDown={e => { if (e.getModifierState) setCapsLock(e.getModifierState("CapsLock")); }}
                  placeholder="••••••••" autoComplete="current-password"
                  className={`${authError ? inputError : inputNormal} pr-10`} />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {capsLock && (
                <p className="flex items-center gap-1.5 mt-1.5 text-xs text-amber-600" role="status">
                  <AlertTriangle size={11} /> Caps Lock is ON
                </p>
              )}
            </div>
          </div>

          <button type="button" onClick={handleSignIn} disabled={loading}
            className="w-full py-2.5 bg-[#265B92] hover:bg-[#1f4c7a] disabled:bg-[#265B92]/70 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#265B92]/40 focus:ring-offset-2"
            aria-busy={loading}>
            {loading ? (<><Loader2 size={15} className="animate-spin" />Signing in...</>) : (<>Sign In<ArrowRight size={15} /></>)}
          </button>

          <div className="lg:hidden mt-8 pt-6 border-t border-[#E2E8F0] text-center">
            <p className="text-xs text-slate-400">© 2026 Kerneu Group · Internal ERP System</p>
          </div>
        </div>
      </div>
    </div>
  );
}

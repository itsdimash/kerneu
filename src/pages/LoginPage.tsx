import { useState } from "react";
import { KerneuLogo, KerneuFullLogo } from "../app/components/common/KerneuLogo";
import { AlertCircle, AlertTriangle, ArrowRight, Eye, EyeOff, Loader2, Cpu, Mail, Lock } from "lucide-react";
import designImg from "../assets/robot-cutout.png";
import { ROLES, ROLE_EMAILS } from "../data/roles";
import type { Role } from "../types";
import { useCallback, useEffect, useRef } from "react";
import {api} from "../api/api";
import axios from "axios";
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

  // Purely decorative desktop mouse parallax for the branding panel's robot.
  // Uses a ref (not state) so pointer movement never triggers a re-render,
  // and is skipped entirely under prefers-reduced-motion.
  const parallaxRef = useRef<HTMLDivElement>(null);
  const handleBrandPanelMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!parallaxRef.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    parallaxRef.current.style.transform = `translate3d(${x * -14}px, ${y * -10}px, 0)`;
  };
  const handleBrandPanelMouseLeave = () => {
    if (parallaxRef.current) parallaxRef.current.style.transform = "translate3d(0,0,0)";
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyEvent);
    window.addEventListener("keyup", handleKeyEvent);
    return () => { window.removeEventListener("keydown", handleKeyEvent); window.removeEventListener("keyup", handleKeyEvent); };
  }, [handleKeyEvent]);

const handleSignIn = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setAuthError(false);

    if (!password) {
        setAuthError(true);
        return;
    }

    setLoading(true);

    try {
        const response = await api.post("/auth/login", {
            email,
            password,
        });
        const { user } = response.data;
        console.log("LOGIN RESPONSE:", response.data);

        console.log("Calling onLogin...");
        onLogin((user.role === "admin" ? "pm" : user.role) as Role);
        console.log("onLogin called");
        console.log(user);

        onLogin((user.role === "admin" ? "pm" : user.role) as Role);

    } catch (error) {
        console.error(error);
        setAuthError(true);
    } finally {
        setLoading(false);
    }
};

  const inputBase = "w-full pl-9 pr-3.5 py-2.5 text-sm border rounded-lg bg-card text-foreground placeholder-muted-foreground transition-all focus:outline-none focus:ring-2";
  const inputNormal = `${inputBase} border-border focus:ring-primary/20 focus:border-primary`;
  const inputError  = `${inputBase} border-destructive/60 bg-destructive-muted/40 focus:ring-destructive/20 focus:border-destructive/60`;

  return (
    <div className="min-h-screen bg-background flex">
      <div
        className="hidden lg:flex flex-col w-[560px] flex-shrink-0 relative overflow-hidden bg-[#F8FAFC] dark:bg-[#080A10] transition-colors duration-300"
        onMouseMove={handleBrandPanelMouseMove}
        onMouseLeave={handleBrandPanelMouseLeave}
      >
        {/* Ambient brand glow — soft ice-blue in light mode, vibrant electric
            blue in dark mode — plus a technical grid texture. Pure CSS, no
            new assets. A slow opacity breathe keeps the panel feeling alive
            without being distracting. */}
        <div className="absolute inset-0 animate-[kerneu-breathe_10s_ease-in-out_infinite] bg-[radial-gradient(circle_at_28%_18%,rgba(147,197,253,0.45),transparent_55%),radial-gradient(circle_at_80%_85%,rgba(191,219,254,0.3),transparent_50%)] dark:bg-[radial-gradient(circle_at_28%_18%,rgba(37,99,235,0.4),transparent_55%),radial-gradient(circle_at_80%_85%,rgba(59,130,246,0.18),transparent_50%)]" />
        <div className="absolute inset-0 opacity-[0.05] dark:opacity-[0.07] bg-[linear-gradient(rgba(15,23,42,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.5)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.6)_1px,transparent_1px)] bg-[size:36px_36px] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_78%)]" />
        {/* Soft edge vignette for depth — keeps focus centered on the robot. */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(226,232,240,0.55)_100%)] dark:bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.45)_100%)]" />

        <div className="relative z-10 px-10 pt-10 animate-in fade-in slide-in-from-top-2 duration-700">
          <KerneuFullLogo markSize={40} />
        </div>

        <div className="relative z-10 flex-1 min-h-0 flex items-center justify-center px-8 animate-in fade-in zoom-in-95 duration-1000">
          {/* True alpha-transparent cutout — no card, no crop, no mask
              trickery needed. object-contain shows the robot in full
              (never cropped), and drop-shadow traces its real silhouette
              for the glow, since filters respect the PNG's alpha channel.
              Outer div carries mouse-parallax (inline transform), inner div
              carries the idle floating loop — kept on separate elements so
              the two transforms never fight each other. */}
          <div ref={parallaxRef} className="transition-transform duration-300 ease-out">
            <div className="relative w-full max-w-[300px] aspect-[409/1008] flex items-center justify-center animate-[kerneu-float_7s_ease-in-out_infinite]">
              <div className="absolute inset-0 animate-[kerneu-breathe_8s_ease-in-out_infinite] bg-[radial-gradient(ellipse_at_center,rgba(147,197,253,0.45),transparent_60%)] dark:bg-[radial-gradient(ellipse_at_center,rgba(37,99,235,0.5),transparent_60%)] blur-3xl" />
              <img
                src={designImg}
                alt="Kerneu Group — Unitree humanoid robot"
                className="relative max-h-full max-w-full w-auto h-auto object-contain drop-shadow-[0_0_45px_rgba(147,197,253,0.55)] dark:drop-shadow-[0_0_65px_rgba(37,99,235,0.6)]"
              />
            </div>
          </div>
        </div>

        <div className="relative z-10 border-t border-foreground/[0.08] px-10 py-6 flex items-center justify-between">
          <div>
            <p className="text-foreground/70 text-xs font-medium">© 2026 Kerneu Group</p>
            <p className="text-foreground/40 text-xs">Internal ERP System</p>
          </div>
          <div className="flex items-center gap-1.5 text-foreground/50 text-[11px] font-mono uppercase tracking-wider">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
            Systems online
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 lg:p-12 relative overflow-hidden">
        {/* Faint echo of the branding panel's glow, tucked in the corner, to
            keep both halves of the page feeling like one cohesive surface. */}
        <div className="pointer-events-none absolute -top-24 -right-24 w-[420px] h-[420px] rounded-full bg-[radial-gradient(circle,rgba(91,95,239,0.07),transparent_70%)] dark:bg-[radial-gradient(circle,rgba(108,111,245,0.12),transparent_70%)] blur-3xl" />

        <div className="relative w-full max-w-[400px] animate-in fade-in slide-in-from-bottom-2 duration-700">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <KerneuLogo size={32} />
            <div><p className="font-semibold text-foreground text-sm">Kerneu Group</p><p className="text-muted-foreground text-xs">ERP Platform</p></div>
          </div>
          <div className="hidden lg:inline-flex items-center gap-1.5 pl-2.5 pr-3 py-1 rounded-full bg-primary/10 border border-primary/15 text-primary mb-5">
            <Cpu size={12} />
            <span className="text-[11px] font-medium uppercase tracking-wider">Robotics &amp; Automation Platform</span>
          </div>
          <h1 className="text-2xl font-semibold text-foreground mb-1 tracking-tight">Sign In</h1>
          <p className="text-sm text-muted-foreground mb-7">Access your Kerneu Group workspace</p>


          {authError && (
            <div className="flex items-start gap-2.5 px-3.5 py-3 mb-5 bg-destructive-muted border border-destructive/20 rounded-lg animate-in fade-in slide-in-from-top-1 duration-300" role="alert">
              <AlertCircle size={15} className="text-destructive mt-0.5 flex-shrink-0" />
              <p className="text-sm text-destructive font-medium">Incorrect email or password.</p>
            </div>
          )}

          <form onSubmit={handleSignIn}>
            <div className="space-y-4 mb-5">
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-foreground mb-1.5">Email</label>
                <div className="relative">
                  <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input id="login-email" type="email" value={email} onChange={e => { setEmail(e.target.value); setAuthError(false); }}
                    autoComplete="email" className={authError ? inputError : inputNormal} />
                </div>
              </div>
              <div>
                <div className="mb-1.5">
                  <label htmlFor="login-password" className="text-sm font-medium text-foreground">Password</label>
                </div>
                <div className="relative">
                  <Lock size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input id="login-password" type={showPassword ? "text" : "password"} value={password}
                    onChange={e => { setPassword(e.target.value); setAuthError(false); }}
                    onKeyDown={e => { if (e.getModifierState) setCapsLock(e.getModifierState("CapsLock")); }}
                    placeholder="••••••••" autoComplete="current-password"
                    className={`${authError ? inputError : inputNormal} pr-10`} />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer active:scale-90"
                    aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {capsLock && (
                  <p className="flex items-center gap-1.5 mt-1.5 text-xs text-amber-600 dark:text-amber-400" role="status">
                    <AlertTriangle size={11} /> Caps Lock is ON
                  </p>
                )}
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="group w-full py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-70 disabled:cursor-not-allowed text-primary-foreground text-sm font-semibold rounded-lg transition-all hover:shadow-[0_8px_24px_rgba(91,95,239,0.35)] active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
              aria-busy={loading}>
              {loading ? (<><Loader2 size={15} className="animate-spin" />Signing in...</>) : (<>Sign In<ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" /></>)}
            </button>
          </form>

          <div className="lg:hidden mt-8 pt-6 border-t border-border text-center">
            <p className="text-xs text-muted-foreground">© 2026 Kerneu Group · Internal ERP System</p>
          </div>
        </div>
      </div>
    </div>
  );
}
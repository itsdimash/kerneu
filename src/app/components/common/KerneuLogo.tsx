import React from "react";
export function KerneuLogo({ size = 36, dark = false }: { size?: number; dark?: boolean }) {
  const gid = React.useId();
  const fill = dark ? "#FFFFFF" : `url(#${gid})`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-label="Kerneu Group logo" role="img">
      {!dark && (
        <defs>
          <linearGradient id={gid} x1="6" y1="6" x2="34" y2="34" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2563EB" />
            <stop offset="1" stopColor="#7C3AED" />
          </linearGradient>
        </defs>
      )}
      {dark && <rect width="40" height="40" rx="9" fill="rgba(255,255,255,0.15)" />}
      {/* stem */}
      <rect x={dark ? 9 : 6} y={dark ? 10 : 8} width="5.5" height={dark ? 20 : 24} rx="2.5" fill={fill} />
      {/* upper arm */}
      <path d={dark ? "M14 20 L24 10 L30 10 L18.5 20 Z" : "M11 20 L24 7 L31 7 L18.5 20 Z"} fill={fill} />
      {/* lower arm */}
      <path d={dark ? "M14 20 L18.5 20 L30 30 L24 30 Z" : "M11 20 L18.5 20 L31 33 L24 33 Z"} fill={fill} />
    </svg>
  );
}
export function KerneuFullLogo({ markSize = 64 }: { markSize?: number }) {
  return (
    <div className="flex items-center" style={{ gap: markSize * 0.28 }}>
      <KerneuLogo size={markSize} />
      <div className="flex flex-col leading-none">
        <span className="font-extrabold tracking-tight text-slate-900"
          style={{ fontSize: markSize * 0.82, letterSpacing: "-0.02em" }}>Kerneu</span>
        <span className="font-semibold text-[#2D5FAB]"
          style={{ fontSize: markSize * 0.24, letterSpacing: markSize * 0.085, marginTop: markSize * 0.08 }}>GROUP</span>
      </div>
    </div>
  );
}

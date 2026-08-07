import kLogoImg from "../../../assets/k-logo.png";

export function KerneuLogo({ size = 36, animated = false }: { size?: number; animated?: boolean }) {
  return (
    <img
      src={kLogoImg}
      alt="Kerneu Group logo"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`object-contain ${animated ? "transition-transform duration-300 ease-out hover:scale-110" : ""}`}
    />
  );
}

export function KerneuFullLogo({ markSize = 64 }: { markSize?: number }) {
  return (
    <div className="flex items-center" style={{ gap: markSize * 0.28 }}>
      <KerneuLogo size={markSize} />
      <div className="flex flex-col leading-none">
        <span className="font-extrabold tracking-tight text-foreground"
          style={{ fontSize: markSize * 0.82, letterSpacing: "-0.02em" }}>Kerneu</span>
        <span className="font-semibold text-primary"
          style={{ fontSize: markSize * 0.24, letterSpacing: markSize * 0.085, marginTop: markSize * 0.08 }}>GROUP</span>
      </div>
    </div>
  );
}

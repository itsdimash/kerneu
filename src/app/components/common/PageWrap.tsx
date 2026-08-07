export function PageWrap({ title, subtitle, actions, children }: {
  title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode;
}): import("react").JSX.Element {
  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-[1440px] mx-auto animate-in fade-in slide-in-from-bottom-1 duration-500">
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-1 tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}


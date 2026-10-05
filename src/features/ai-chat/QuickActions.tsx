import type { QuickAction } from "./types";

export function QuickActions({
  actions,
  onSelect,
}: {
  actions: QuickAction[];
  onSelect: (action: QuickAction) => void;
}) {
  if (actions.length === 0) return null;
  return (
    <div className="mt-6 grid w-full max-w-xl grid-cols-1 gap-2.5 sm:grid-cols-2">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            type="button"
            onClick={() => onSelect(action)}
            className="flex items-start gap-3 rounded-xl border border-border bg-card px-3.5 py-3 text-left transition-colors hover:bg-muted"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon size={16} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-medium text-foreground">{action.label}</span>
              {action.description && (
                <span className="mt-0.5 block text-[12px] text-muted-foreground">{action.description}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

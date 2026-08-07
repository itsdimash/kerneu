import { ACTIVE_PROJECT } from "../../../data/projects";
export function ProjectHeader() {
  return (
    <div className="bg-card border-b border-border px-8 py-3 flex items-center flex-wrap gap-y-2">
      {[
        { label: "Проект",  value: ACTIVE_PROJECT.name,     bold: true },
        { label: "Клиент",  value: ACTIVE_PROJECT.client,   bold: false },
        { label: "Менеджер",value: ACTIVE_PROJECT.manager,  bold: false },
        { label: "Дедлайн", value: ACTIVE_PROJECT.deadline, bold: false },
      ].map((item, i) => (
        <div key={item.label} className="flex items-center">
          {i > 0 && <div className="w-px h-7 bg-border mx-6" />}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide leading-none mb-0.5">{item.label}</p>
            <p className={`text-sm ${item.bold ? "font-semibold text-foreground" : "text-foreground"} leading-tight`}>{item.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

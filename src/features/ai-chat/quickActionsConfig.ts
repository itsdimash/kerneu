import { FileSearch, Gavel, ImagePlus, Presentation } from "lucide-react";
import type { Role } from "../../types";
import type { QuickAction } from "./types";

const MANAGEMENT_ROLES: Role[] = ["commercial_director", "pm", "admin"];

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "presentation",
    label: "Создать презентацию",
    description: "Структура и слайды по вашей теме",
    icon: Presentation,
    promptTemplate: "Создай презентацию на тему: ",
    requiresFile: false,
  },
  {
    id: "image",
    label: "Сгенерировать картинку",
    description: "Опишите, что должно быть на изображении",
    icon: ImagePlus,
    promptTemplate: "Сгенерируй изображение: ",
    requiresFile: false,
  },
  {
    id: "contract-analysis",
    label: "Анализ договора",
    description: "Условия, сроки, штрафы и риски",
    icon: FileSearch,
    promptTemplate:
      "Проанализируй приложенный договор: выдели ключевые условия, сроки, суммы и штрафы, назови риски для нас и предложи правки.",
    requiresFile: true,
    accept: ".pdf,.docx",
    roles: MANAGEMENT_ROLES,
  },
  {
    id: "tender-docs",
    label: "Тендерная документация",
    description: "Разбор тендерных документов",
    icon: Gavel,
    // TODO: шаблон промпта предоставит владелец продукта. Пока пусто — карточка скрыта.
    promptTemplate: "",
    requiresFile: true,
    accept: ".pdf,.docx,.xlsx",
    roles: MANAGEMENT_ROLES,
  },
];

export function getQuickActions(role: Role): QuickAction[] {
  return QUICK_ACTIONS.filter(
    (action) => action.promptTemplate.trim().length > 0 && (!action.roles || action.roles.includes(role)),
  );
}

export const UPLOAD_NOTIFICATIONS = [
  { id: 1, file: "КП_Башня_v3.xlsx",       msg: "Требуется ввод цен — 3 позиции",       time: "10:32", variant: "warning" as const },
  { id: 2, file: "КП_Парковый_v1.xlsx",    msg: "Требуется ввод цен — 5 позиций",       time: "09:41", variant: "warning" as const },
  { id: 3, file: "Спецификация_Nord.pdf",  msg: "Ошибка обработки — неверный формат",   time: "09:58", variant: "error"   as const },
  { id: 4, file: "КП_Меридиан_final.xlsx", msg: "Обработано успешно — 8 позиций",       time: "10:15", variant: "success" as const },
  { id: 5, file: "КП_Технопарк_draft.xlsx",msg: "Файл в очереди на обработку",          time: "09:05", variant: "neutral" as const },
];

import type { Supplier } from "../types";

// TODO: replace with real API call (GET /suppliers/ with nested deliveries,
// or GET /suppliers/ + GET /suppliers/{id}/deliveries)
export const SUPPLIERS_INIT: Supplier[] = [
  {
    id: "sup-001",
    name: "ООО «Молочный край»",
    category: "Молочная продукция",
    deliveries: [
      { product: "Молоко 3.2%, 1л", date: "2026-07-28", qty: "200 шт", cost: 96000 },
      { product: "Творог 9%, 500г", date: "2026-07-28", qty: "80 шт", cost: 64000 },
      { product: "Сметана 20%, 400г", date: "2026-07-21", qty: "60 шт", cost: 39000 },
      { product: "Молоко 3.2%, 1л", date: "2026-07-14", qty: "200 шт", cost: 94000 },
    ],
  },
  {
    id: "sup-002",
    name: "Агрофирма «Светлый путь»",
    category: "Овощи и фрукты",
    deliveries: [
      { product: "Картофель молодой", date: "2026-07-29", qty: "500 кг", cost: 175000 },
      { product: "Помидоры грунтовые", date: "2026-07-22", qty: "300 кг", cost: 210000 },
      { product: "Огурцы тепличные", date: "2026-07-10", qty: "250 кг", cost: 137500 },
    ],
  },
  {
    id: "sup-003",
    name: "ИП Сидоров А.В.",
    category: "Хлебобулочные изделия",
    deliveries: [
      { product: "Хлеб пшеничный", date: "2026-07-30", qty: "400 шт", cost: 88000 },
      { product: "Батон нарезной", date: "2026-07-23", qty: "350 шт", cost: 70000 },
      { product: "Багет французский", date: "2026-07-16", qty: "150 шт", cost: 45000 },
    ],
  },
  {
    id: "sup-004",
    name: "ТОО «Мясной дом»",
    category: "Мясная продукция",
    deliveries: [
      { product: "Говядина вырезка", date: "2026-07-25", qty: "120 кг", cost: 384000 },
      { product: "Курица тушка", date: "2026-07-18", qty: "200 кг", cost: 260000 },
      { product: "Свинина шея", date: "2026-07-05", qty: "100 кг", cost: 190000 },
    ],
  },
  {
    id: "sup-005",
    name: "ООО «РыбТорг»",
    category: "Рыба и морепродукты",
    deliveries: [
      { product: "Лосось охлажденный", date: "2026-07-26", qty: "60 кг", cost: 216000 },
      { product: "Креветки тигровые", date: "2026-07-12", qty: "40 кг", cost: 168000 },
    ],
  },
  {
    id: "sup-006",
    name: "ИП Ким Е.С.",
    category: "Бакалея",
    deliveries: [
      { product: "Рис круглозерный", date: "2026-07-20", qty: "300 кг", cost: 135000 },
      { product: "Мука высший сорт", date: "2026-07-13", qty: "400 кг", cost: 92000 },
      { product: "Сахар-песок", date: "2026-06-29", qty: "250 кг", cost: 62500 },
    ],
  },
];

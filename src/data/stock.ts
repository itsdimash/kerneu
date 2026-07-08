export type StockItem = { id: number; sku: string; name: string; unit: string; total: number; reserved: number; defective: number; available: number };

export const STOCK_INIT: StockItem[] = [
  { id: 1, sku: "ALU-60-60", name: "Профиль алюминиевый 60×60",             unit: "м.п.", total: 5000,  reserved: 1200, defective:  0,  available: 3800 },
  { id: 2, sku: "GLZ-12-18", name: "Стеклопакет двухкамерный 1200×1800",   unit: "шт",   total:  240,  reserved:   80, defective: 12,  available:  160 },
  { id: 3, sku: "EPDM-UPL", name: "Уплотнитель EPDM",                       unit: "п.м.", total: 12000, reserved: 3500, defective:  0,  available: 8500 },
  { id: 4, sku: "BOLT-M8",  name: "Крепёж нержавеющий M8",                  unit: "шт",   total:  8000, reserved: 2000, defective:  5,  available: 6000 },
  { id: 5, sku: "FOAM-750", name: "Монтажная пена 750мл",                   unit: "шт",   total:   320, reserved:   60, defective:  0,  available:  260 },
  { id: 6, sku: "SIL-NEU",  name: "Силикон нейтральный (картридж)",         unit: "шт",   total:   180, reserved:   45, defective:  8,  available:  135 },
];

export const ARRIVALS = [
  { id: "ПР-0041", date: "18.07.2024", supplier: "ООО «МеталлТрейд»",  item: "Профиль алюминиевый 60×60",     qty: 500, unit: "м.п.", status: "arrived" },
  { id: "ПР-0042", date: "20.07.2024", supplier: "ИП Соколов А.В.",     item: "Крепёж нержавеющий M8",         qty: 1000,unit: "шт",   status: "transit" },
  { id: "ПР-0043", date: "22.07.2024", supplier: "АО «СтройМатериалы»", item: "Стеклопакет двухкамерный",      qty: 40,  unit: "шт",   status: "pending" },
];

export const SHIPMENTS = [
  { id: "ОТГ-0018", date: "19.07.2024", project: "Офисный комплекс «Башня»",  items: 3, status: "shipped"  },
  { id: "ОТГ-0019", date: "21.07.2024", project: "Реконструкция склада Nord", items: 2, status: "prepared" },
];
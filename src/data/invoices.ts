export type Invoice = {
  id: string; supplier: string; amount: number; planned: number; deviation: number;
  status: string; comment: string; dueDate: string;
};

export const INVOICES_INIT: Invoice[] = [
  { id: "СФ-2024-0142", supplier: "ООО «МеталлТрейд»",    amount: 2340000, planned: 2100000, deviation: 11.4, status: "pending",  comment: "",                        dueDate: "25.07.2024" },
  { id: "СФ-2024-0143", supplier: "ИП Соколов А.В.",       amount:  480000, planned:  470000, deviation:  2.1, status: "approved", comment: "Плановая закупка",         dueDate: "28.07.2024" },
  { id: "СФ-2024-0144", supplier: "АО «СтройМатериалы»",  amount: 1890000, planned: 1500000, deviation: 26.0, status: "rejected", comment: "Превышение лимита",        dueDate: "01.08.2024" },
  { id: "СФ-2024-0145", supplier: "ООО «Электромонтаж»",  amount:  675000, planned:  650000, deviation:  3.8, status: "paid",     comment: "Оплачено 19.07.2024",      dueDate: "20.07.2024" },
  { id: "СФ-2024-0146", supplier: "ЗАО «ВентСистемы»",    amount: 3200000, planned: 2800000, deviation: 14.3, status: "pending",  comment: "",                        dueDate: "05.08.2024" },
];
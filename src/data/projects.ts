import { ContractStatus } from "../types";

export const ACTIVE_PROJECT = {
  name: "Офисный комплекс «Башня»", client: "ООО «СтройТех»",
  manager: "А. Петров", deadline: "15.08.2024",
};

export type ProjectRow = {
  id: number; name: string; client: string; status: string; stage: string;
  margin: number; deadline: string; budget: number; manager: string;
  contractStatus: ContractStatus; responsible: string;
};

export const PROJECTS: ProjectRow[] = [
  { id: 1, name: "Офисный комплекс «Башня»",    client: "ООО «СтройТех»",     status: "active",    stage: "procurement", margin: 24.5, deadline: "15.08.2024", budget: 12500000, manager: "А. Петров",    contractStatus: "signed",   responsible: "Комдир"    },
  { id: 2, name: "Реконструкция склада Nord",    client: "АО «МегаБилд»",      status: "pending",   stage: "contract",    margin: 18.2, deadline: "30.07.2024", budget:  4800000, manager: "М. Козлова",   contractStatus: "pending",  responsible: "Комдир"    },
  { id: 3, name: "Торговый центр «Меридиан»",   client: "ГК «Меридиан»",      status: "review",    stage: "kp",          margin: 31.0, deadline: "01.09.2024", budget: 28000000, manager: "И. Волков",    contractStatus: "unsigned", responsible: "ПМ"        },
  { id: 4, name: "Жилой комплекс «Парковый»",   client: "ООО «Девелопмент»",  status: "completed", stage: "documents",   margin: 22.8, deadline: "20.06.2024", budget:  9200000, manager: "С. Нехорошев", contractStatus: "signed",   responsible: "Бухгалтер" },
];

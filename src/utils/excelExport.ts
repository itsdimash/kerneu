import * as XLSX from "xlsx-js-style";

// Убираем символы, недопустимые в имени файла на Windows/macOS,
// чтобы название поставщика можно было безопасно подставить в filename.
function sanitizeFilenamePart(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "_").trim();
}

function downloadWorkbook(workbook: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(workbook, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

function formatDateForFilename(date: Date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

// Ширина колонок общая для всех выгрузок: широкий "Товар" + узкие числовые/ед.
const NAME_QTY_UNIT_COLS: XLSX.ColInfo[] = [{ wch: 40 }, { wch: 10 }, { wch: 8 }];

// Общий стиль строки заголовков — переиспользуется всеми экспортами (в т.ч. AiChatPage).
export const HEADER_STYLE: XLSX.CellStyle = {
  fill: { fgColor: { rgb: "1F2937" } },
  font: { bold: true, color: { rgb: "FFFFFF" } },
};

// Красит первую строку листа (заголовки колонок) в HEADER_STYLE.
export function styleHeaderRow(worksheet: XLSX.WorkSheet, columnCount: number) {
  for (let col = 0; col < columnCount; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
    const cell = worksheet[cellAddress];
    if (cell) cell.s = HEADER_STYLE;
  }
}

function appendSheet(workbook: XLSX.WorkBook, rows: Record<string, unknown>[], sheetName: string, cols?: XLSX.ColInfo[]) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  if (cols) worksheet["!cols"] = cols;
  if (rows.length > 0) styleHeaderRow(worksheet, Object.keys(rows[0]).length);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
}

export interface SupplierExcelRow {
  "Товар": string;
  "Кол-во": number;
  "Ед.": string;
}

export function exportSupplierPurchasesToExcel(supplier: string, rows: SupplierExcelRow[]) {
  const workbook = XLSX.utils.book_new();
  appendSheet(workbook, rows, "Закупка", NAME_QTY_UNIT_COLS);
  const filename = `${sanitizeFilenamePart(supplier)}_закупка.xlsx`;
  downloadWorkbook(workbook, filename);
}

export interface SummaryByProductRow {
  "Товар": string;
  "Штук": number;
  "Ед.": string;
}

export interface AlreadyPurchasedRow {
  "Товар": string;
  "Поставщик": string;
  "Кол-во": number;
  "Статус": string;
}

export function exportProcurementSummaryToExcel(
  productRows: SummaryByProductRow[],
  purchasedRows: AlreadyPurchasedRow[]
) {
  const workbook = XLSX.utils.book_new();
  appendSheet(workbook, productRows, "Сводно по товарам", NAME_QTY_UNIT_COLS);
  appendSheet(workbook, purchasedRows, "Уже куплено", [{ wch: 40 }, { wch: 24 }, { wch: 10 }, { wch: 14 }]);
  downloadWorkbook(workbook, `Закупки_${formatDateForFilename()}.xlsx`);
}

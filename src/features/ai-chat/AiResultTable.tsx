import * as XLSX from "xlsx-js-style";
import { styleHeaderRow } from "../../utils/excelExport";
import type { Role } from "../../types";
import { SENSITIVE_COLUMN_PATTERN } from "./config";
import type { AiTableRow } from "./types";

export function downloadTableAsExcel(rows: AiTableRow[], filename: string) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  if (rows.length > 0) styleHeaderRow(worksheet, Object.keys(rows[0]).length);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Данные");
  XLSX.writeFile(workbook, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

export function AiResultTable({ rows, role }: { rows: AiTableRow[]; role: Role }) {
  if (!rows || rows.length === 0) return null;

  const allKeys = Object.keys(rows[0]);
  const keys =
    role === "warehouse"
      ? allKeys.filter((key) => !SENSITIVE_COLUMN_PATTERN.test(key))
      : allKeys;
  const hiddenCount = allKeys.length - keys.length;

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-border">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12.5px]">
          <thead>
            <tr className="bg-muted">
              {keys.map((key) => (
                <th key={key} className="px-3 py-2 font-medium capitalize text-muted-foreground">
                  {key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-border">
                {keys.map((key) => (
                  <td key={key} className="px-3 py-2 tabular-nums text-foreground">
                    {String(row[key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hiddenCount > 0 && (
        <div className="bg-muted px-3 py-2 text-[11.5px] text-muted-foreground">
          {hiddenCount} {hiddenCount === 1 ? "колонка скрыта" : "колонок скрыто"} — недоступно роли «Склад»
        </div>
      )}
    </div>
  );
}

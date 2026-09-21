"use client";

type ExcelValue = string | number | boolean | Date | null | undefined;

/** Creates a real .xlsx download for browser-only reports. */
export async function downloadXlsx({
  filename,
  sheetName = "Отчёт",
  rows,
}: {
  filename: string;
  sheetName?: string;
  rows: ExcelValue[][];
}) {
  const XLSX = await import("xlsx");
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  worksheet["!cols"] = Array.from({ length: columnCount }, (_, column) => ({
    wch: Math.min(48, Math.max(12, ...rows.map((row) => String(row[column] ?? "").length + 2))),
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, `${filename}.xlsx`, { compression: true });
}

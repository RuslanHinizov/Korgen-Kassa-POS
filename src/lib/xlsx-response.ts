import * as XLSX from "xlsx";
import { NextResponse } from "next/server";

type ExcelValue = string | number | boolean | Date | null | undefined;

function buildSheet(rows: ExcelValue[][]) {
  const worksheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: true, dateNF: "dd\\.mm\\.yyyy\\ hh:mm:ss" });
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  worksheet["!cols"] = Array.from({ length: columnCount }, (_, column) => {
    const width = Math.min(
      48,
      Math.max(
        12,
        ...rows.map((row) => String(row[column] ?? "").length + 2),
      ),
    );
    return { wch: width };
  });
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  return worksheet;
}

/** Builds a multi-sheet Excel workbook — e.g. the Полный отчёт export, one sheet per section. */
export function xlsxMultiSheetResponse({
  filename,
  sheets,
}: {
  filename: string;
  sheets: { name: string; rows: ExcelValue[][] }[];
}) {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(workbook, buildSheet(sheet.rows), sheet.name.slice(0, 31));
  }
  const file = XLSX.write(workbook, { bookType: "xlsx", type: "buffer", compression: true, cellDates: true });

  return new NextResponse(file, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Builds a real Excel workbook for server-side report downloads. */
export function xlsxResponse({
  filename,
  sheetName = "Отчёт",
  rows,
}: {
  filename: string;
  sheetName?: string;
  rows: ExcelValue[][];
}) {
  return xlsxMultiSheetResponse({ filename, sheets: [{ name: sheetName, rows }] });
}

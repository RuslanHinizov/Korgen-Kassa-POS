import * as XLSX from "xlsx";
import { NextResponse } from "next/server";

type ExcelValue = string | number | boolean | Date | null | undefined;

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
  const worksheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: true, dateNF: "dd\\.mm\\.yyyy\\ hh:mm" });
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

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  const file = XLSX.write(workbook, { bookType: "xlsx", type: "buffer", compression: true, cellDates: true });

  return new NextResponse(file, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

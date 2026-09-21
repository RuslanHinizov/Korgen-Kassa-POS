import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { xlsxResponse } from "@/lib/xlsx-response";

describe("xlsxResponse", () => {
  it("creates an .xlsx workbook with typed numeric cells", async () => {
    const response = xlsxResponse({
      filename: "test-report",
      sheetName: "Проверка",
      rows: [["Товар", "Сумма"], ["Чай", 1180]],
    });

    expect(response.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect(response.headers.get("content-disposition")).toContain('filename="test-report.xlsx"');

    const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: "buffer" });
    expect(workbook.SheetNames).toEqual(["Проверка"]);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Проверка"], { header: 1, raw: true })).toEqual([
      ["Товар", "Сумма"],
      ["Чай", 1180],
    ]);
  });
});

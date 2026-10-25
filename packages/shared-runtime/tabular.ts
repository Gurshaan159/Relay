import ExcelJS from "exceljs";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import { z } from "zod";
const optionsSchema = z.object({
  filter: z
    .object({
      column: z.string(),
      equals: z.union([z.string(), z.number(), z.boolean()]),
    })
    .optional(),
  sort: z
    .object({
      column: z.string(),
      direction: z.enum(["asc", "desc"]).default("asc"),
    })
    .optional(),
  sum: z.string().optional(),
  format: z.enum(["xlsx", "csv"]).default("xlsx"),
});
export async function tableFile(
  input: string,
  output: string,
  options: unknown,
) {
  const spec = optionsSchema.parse(options);
  const book = new ExcelJS.Workbook();
  if (input.endsWith(".xlsx")) {
    const bytes = await readFile(input);
    const zip = await JSZip.loadAsync(bytes);
    if (
      Object.keys(zip.files).some((n) =>
        /vbaProject|xl\/charts\/|xl\/pivot|xl\/externalLinks\/|xl\/drawings\//i.test(
          n,
        ),
      )
    )
      throw Error(
        "Workbook contains macros, charts, pivots or drawings. Use a manual transformation to preserve them.",
      );
    await book.xlsx.load(bytes as any);
  } else if (input.endsWith(".csv")) await book.csv.readFile(input);
  else throw Error("Use a .csv or ordinary .xlsx file");
  const sheet = book.worksheets[0];
  if (!sheet) throw Error("No worksheet found");
  if (
    sheet.getImages().length ||
    Object.keys((sheet.model as any).dataValidations || {}).length ||
    ((sheet as any).conditionalFormattings || []).length ||
    Object.keys((sheet as any).tables || {}).length
  )
    throw Error(
      "Advanced workbook formatting is not supported. Use a manual transformation.",
    );
  const columns = (sheet.getRow(1).values as any[]).slice(1).map(String);
  if (new Set(columns).size !== columns.length)
    throw Error("Column names must be unique");
  let rows: Record<string, any>[] = [];
  sheet.eachRow((row, i) => {
    if (i === 1) return;
    const record: Record<string, any> = {};
    columns.forEach((key, j) => {
      const value = row.getCell(j + 1).value;
      if (value && typeof value === "object")
        throw Error(
          "Formula and rich-text cells require a values-only export. Formula calculation is not supported.",
        );
      record[key] = value;
    });
    rows.push(record);
  });
  if (spec.filter)
    rows = rows.filter(
      (r) =>
        String(r[spec.filter!.column]).toLowerCase() ===
        String(spec.filter!.equals).toLowerCase(),
    );
  if (spec.sort)
    rows.sort((a, b) => {
      const av = a[spec.sort!.column],
        bv = b[spec.sort!.column];
      const compare =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return spec.sort!.direction === "desc" ? -compare : compare;
    });
  const out = new ExcelJS.Workbook();
  const data = out.addWorksheet("Records");
  data.addRow(columns);
  rows.forEach((r) => data.addRow(columns.map((c) => r[c])));
  data.getRow(1).font = { bold: true };
  data.columns.forEach((c) => (c.width = 22));
  const summary = out.addWorksheet("Summary");
  summary.addRows([
    ["Records", rows.length],
    ["Collected", new Date().toISOString()],
  ]);
  if (spec.sum)
    summary.addRow([
      `Total ${spec.sum}`,
      rows.reduce((n, r) => n + (Number(r[spec.sum!]) || 0), 0),
    ]);
  summary.columns.forEach((c) => (c.width = 28));
  if (spec.format === "csv")
    await out.csv.writeFile(output, { sheetName: "Records" });
  else await out.xlsx.writeFile(output);
  return rows;
}

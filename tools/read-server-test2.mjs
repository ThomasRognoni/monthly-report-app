import XlsxPopulate from "xlsx-populate";

try {
  const wb = await XlsxPopulate.fromFileAsync("tmp/server-test2.xlsx");
  const sheet = wb.sheet(0);
  const g36 = sheet.cell("G36").value();
  const e22 = sheet.cell("E22").value();
  console.log("G36 raw ->", g36, "type:", typeof g36);
  console.log("E22 raw ->", e22, "type:", typeof e22);
} catch (err) {
  console.error("Error reading file:", err);
  process.exit(1);
}

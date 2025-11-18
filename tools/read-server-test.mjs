import XlsxPopulate from "xlsx-populate";

try {
  const wb = await XlsxPopulate.fromFileAsync("tmp/server-test.xlsx");
  const sheet = wb.sheet(0);
  console.log("G36 =", sheet.cell("G36").value());
  console.log("E22 =", sheet.cell("E22").value());
} catch (err) {
  console.error("Failed to read tmp/server-test.xlsx", err);
  process.exit(1);
}

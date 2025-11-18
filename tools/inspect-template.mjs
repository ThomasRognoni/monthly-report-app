import XlsxPopulate from "xlsx-populate";
try {
  const wb = await XlsxPopulate.fromFileAsync(
    "src/assets/templates/10-ROGNONI-Rilevazione_estratti_template.xlsx"
  );
  const s = wb.sheet(0);
  console.log("G28 value:", s.cell("G28").value());
  console.log("G28 formula:", s.cell("G28").formula());
  console.log("G36 value:", s.cell("G36").value());
  console.log("G36 formula:", s.cell("G36").formula());
} catch (err) {
  console.error("inspect template error", err);
}

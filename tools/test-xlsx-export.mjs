import fs from "fs";
import path from "path";
import XlsxPopulate from "xlsx-populate";

async function run() {
  const repoRoot = path.resolve(process.cwd());
  const templatePath = path.join(
    repoRoot,
    "src",
    "assets",
    "templates",
    "10-ROGNONI-Rilevazione_estratti_template.xlsx"
  );
  const outDir = path.join(repoRoot, "tmp");
  const outPath = path.join(outDir, "test-export.xlsx");

  if (!fs.existsSync(templatePath)) {
    console.error("Template not found at", templatePath);
    process.exit(2);
  }

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log("Loading template:", templatePath);
  const buf = fs.readFileSync(templatePath);

  const workbook = await XlsxPopulate.fromDataAsync(buf);
  const sheet = workbook.sheet(0);

  console.log("Populating sample cells...");
  sheet.cell("B7").value("MESE DI TEST 11/2025");
  sheet.cell("B8").value("TEST USER");
  sheet.cell("G36").value(12.5);

  for (let i = 0; i < 5; i++) {
    const row = 47 + i;
    sheet.cell(`B${row}`).value(`01/11/2025`);
    sheet.cell(`C${row}`).value("D");
    sheet.cell(`D${row}`).value("Attività di prova");
    sheet.cell(`G${row}`).value(8);
  }

  console.log("Saving export to", outPath);
  const out = await workbook.outputAsync();
  fs.writeFileSync(outPath, Buffer.from(out));
  console.log(
    "Done. Inspect",
    outPath,
    "to verify styles and images were preserved."
  );
}

run().catch((err) => {
  console.error("Test export failed:", err);
  process.exit(1);
});

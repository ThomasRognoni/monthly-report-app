import XlsxPopulate from "xlsx-populate";

async function inspect(file) {
  try {
    const wb = await XlsxPopulate.fromFileAsync(file);
    const s = wb.sheet(0);
    const rows = [28, 29, 30, 31, 32, 33, 34];
    const values = rows.map((r) => ({
      row: r,
      value: s.cell(`G${r}`).value(),
    }));
    console.log(
      JSON.stringify(
        {
          file,
          values,
          G36: s.cell("G36").value(),
          E22: s.cell("E22").value(),
        },
        null,
        2
      )
    );
  } catch (err) {
    console.error("inspect error", err);
  }
}

await inspect("tmp/server-test4.xlsx");

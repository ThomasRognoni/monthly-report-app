import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import XlsxPopulate from "xlsx-populate";

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "5mb" }));

const TEMPLATE = path.join(
  process.cwd(),
  "src",
  "assets",
  "templates",
  "10-ROGNONI-Rilevazione_estratti_template.xlsx"
);

app.post("/export", async (req, res) => {
  try {
    const data = req.body;
    try {
      console.log("--- /export payload summary ---");
      console.log("totalDeclaredHours:", data.totalDeclaredHours);
      console.log("totalDeclaredDays:", data.totalDeclaredDays);
      console.log(
        "activityTotals keys:",
        Object.keys(data.activityTotals || {})
      );
      console.log(
        "activityTotals sample:",
        JSON.stringify(data.activityTotals || {}, null, 2)
      );
      console.log(
        "extractTotals sample:",
        JSON.stringify(data.extractTotals || {}, null, 2)
      );
    } catch (dbg) {
      console.warn("Failed to log payload debug info", dbg);
    }
    if (!fs.existsSync(TEMPLATE))
      return res.status(500).send("Template not found");

    const buf = fs.readFileSync(TEMPLATE);
    const workbook = await XlsxPopulate.fromDataAsync(buf);
    const sheet = workbook.sheet(0);

    sheet.cell("B7").value(`MESE DI ${formatMonthYear(new Date(data.month))}`);
    sheet.cell("B8").value(data.employeeName || "");

    sheet.cell("E21").value(data.totalWorkDays || 0);
    sheet.cell("E23").value(data.quadrature || 0);
    sheet.cell("E24").value(data.overtime || 0);

    if (Array.isArray(data.days)) {
      for (let i = 0; i < data.days.length; i++) {
        const day = data.days[i];
        const row = 47 + i;
        sheet.cell(`B${row}`).value(formatExcelDate(new Date(day.date)));
        sheet.cell(`C${row}`).value(day.code || "");
        sheet
          .cell(`D${row}`)
          .value(
            (data.activityCodes || []).find((ac) => ac.code === day.code)
              ?.description || ""
          );
        sheet.cell(`E${row}`).value(day.extract || "");
        sheet
          .cell(`F${row}`)
          .value(
            (data.extracts || []).find((e) => e.id === day.extract)?.client ||
              ""
          );
        const dayHours = typeof day.hours === "number" ? day.hours : 0;
        const dayValue = Math.round((dayHours / 8) * 100) / 100;
        console.log(
          `Writing daily row G${row}: hours=${dayHours} -> days=${dayValue}`
        );
        sheet.cell(`G${row}`).value(dayValue);
        sheet.cell(`H${row}`).value(day.notes || "");
      }
    }

    const activityRows = {
      D: 28,
      AA: 29,
      ST: 30,
      F: 31,
      PE: 32,
      MA: 33,
      L104: 34,
    };

    Object.entries(activityRows).forEach(([code, row]) => {
      const raw = (data.activityTotals && data.activityTotals[code]) || 0;
      const days =
        raw > 31
          ? Math.round((raw / 8) * 100) / 100
          : Math.round(raw * 100) / 100;
      console.log(`Activity ${code}: raw=${raw} -> days=${days}`);
      sheet.cell(`G${row}`).value(days);
    });

    let declaredRaw =
      typeof data.totalDeclaredDays === "number"
        ? data.totalDeclaredDays
        : typeof data.totalDeclaredHours === "number"
        ? data.totalDeclaredHours
        : 0;
    const roundedDeclared =
      Math.round((declaredRaw > 31 ? declaredRaw / 8 : declaredRaw) * 100) /
      100;
    sheet.cell("G36").value(roundedDeclared);
    sheet.cell("E22").value(roundedDeclared || 0);

    const extractRows = {
      ESA3582021: 39,
      BD0002022S: 40,
      ESA9992024S: 41,
      ESAPAM2024S: 42,
      ESA9982024S: 43,
    };

    (data.extracts || []).forEach((extract) => {
      const row = extractRows[extract.id];
      if (row) {
        const raw = (data.extractTotals && data.extractTotals[extract.id]) || 0;
        const days =
          raw > 31
            ? Math.round((raw / 8) * 100) / 100
            : Math.round(raw * 100) / 100;
        sheet.cell(`G${row}`).value(days);
      }
    });

    const out = await workbook.outputAsync();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${generateFileName(data)}"`
    );
    res.send(Buffer.from(out));
  } catch (err) {
    console.error("Export server error", err);
    res.status(500).send("Export failed");
  }
});

function formatExcelDate(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatMonthYear(date) {
  const d = new Date(date);
  const months = [
    "GENNAIO",
    "FEBBRAIO",
    "MARZO",
    "APRILE",
    "MAGGIO",
    "GIUGNO",
    "LUGLIO",
    "AGOSTO",
    "SETTEMBRE",
    "OTTOBRE",
    "NOVEMBRE",
    "DICEMBRE",
  ];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function generateFileName(data) {
  const m = new Date(data.month);
  const month = String(m.getMonth() + 1).padStart(2, "0");
  const year = m.getFullYear();
  return `ROGNONI-Rilevazione_estratti_${month}-${year}.xlsx`;
}

const PORT = process.env.EXPORT_PORT || 3000;
app.listen(PORT, () =>
  console.log(`Export server listening on http://localhost:${PORT}`)
);

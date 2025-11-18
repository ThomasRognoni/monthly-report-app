import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import {
  formatExcelDate,
  getMonthYearItalian,
  hoursToDays,
  roundTo2,
  isLikelyHours,
} from '../utils';

interface ExportData {
  employeeName: string;
  month: Date;
  days: any[];
  extracts: any[];
  activityTotals: { [key: string]: number };
  extractTotals: { [key: string]: number };
  totalWorkDays: number;
  totalDeclaredDays: number;
  totalDeclaredHours: number;
  quadrature: number;
  overtime: number;
  activityCodes: any[];
  holidays: any[];
}

@Injectable({ providedIn: 'root' })
export class ExcelExportService {
  private templateUrl =
    'assets/templates/10-ROGNONI-Rilevazione_estratti_template.xlsx';

  async generateExcel(data: ExportData): Promise<void> {
    try {
      // Client-side export only: attempt in-browser xlsx-populate then fallback to xlsx

      try {
        const importPaths = [
          'xlsx-populate/browser/xlsx-populate',
          'xlsx-populate/browser/xlsx-populate.js',
          'xlsx-populate',
        ];

        let XlsxPopulate: any = (window as any).XlsxPopulate || null;
        let lastErr: any = null;

        if (!XlsxPopulate) {
          for (const p of importPaths) {
            try {
              const mod: any = await import(p);
              XlsxPopulate = mod.default || mod;
              break;
            } catch (e) {
              lastErr = e;
            }
          }
        }

        if (!XlsxPopulate)
          throw lastErr || new Error('xlsx-populate import_failed');

        const response = await fetch(this.templateUrl);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();

        const workbookXp: any = await XlsxPopulate.fromDataAsync(arrayBuffer);
        const sheet = workbookXp.sheet(0);

        sheet.cell('B7').value(`MESE DI ${getMonthYearItalian(data.month)}`);
        sheet.cell('B8').value(data.employeeName || '');

        sheet.cell('E21').value(data.totalWorkDays || 0);
        const declaredDays =
          typeof data.totalDeclaredDays === 'number'
            ? data.totalDeclaredDays
            : typeof data.totalDeclaredHours === 'number'
            ? hoursToDays(data.totalDeclaredHours)
            : 0;
        sheet.cell('E22').value(declaredDays || 0);
        sheet.cell('E23').value(data.quadrature || 0);
        sheet.cell('E24').value(data.overtime || 0);

        this.updateActivityTotalsXp(sheet, data);
        this.updateExtractTotalsXp(sheet, data);
        this.insertDailyDataXp(sheet, data);

        const out = await workbookXp.outputAsync();
        const buffer = out instanceof ArrayBuffer ? out : out.buffer || out;
        this.saveAsExcelFile(buffer, this.generateFileName(data));
        return;
      } catch (xpErr) {
        console.warn(
          'xlsx-populate not available or failed, falling back to xlsx:',
          xpErr
        );
        // proceed to SheetJS fallback
      }

      const template = await this.loadTemplate();
      const workbook = this.populateTemplateWithData(template, data);

      const excelBuffer = XLSX.write(workbook, {
        bookType: 'xlsx',
        type: 'binary',
        bookSST: false,
      });

      const buffer = this.s2ab(excelBuffer);
      this.saveAsExcelFile(buffer, this.generateFileName(data));
    } catch (error) {
      console.error('Errore nella generazione del Excel:', error);
      throw new Error(
        'Impossibile generare il file Excel: ' + (error as Error).message
      );
    }
  }

  private s2ab(s: string): ArrayBuffer {
    const buf = new ArrayBuffer(s.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < s.length; i++) {
      view[i] = s.charCodeAt(i) & 0xff;
    }
    return buf;
  }

  private async loadTemplate(): Promise<XLSX.WorkBook> {
    try {
      const response = await fetch(this.templateUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return XLSX.read(arrayBuffer, {
        type: 'array',
        cellDates: true,
        cellStyles: true,
        cellFormula: true,
        sheetStubs: true,
      });
    } catch (error) {
      console.error('Errore nel caricamento del template:', error);
      throw new Error(
        `Template non trovato o non accessibile: ${this.templateUrl}`
      );
    }
  }

  private populateTemplateWithData(
    template: XLSX.WorkBook,
    data: ExportData
  ): XLSX.WorkBook {
    const firstSheetName = template.SheetNames[0];
    const worksheet = template.Sheets[firstSheetName];

    this.updateCellSafely(
      worksheet,
      'B7',
      `MESE DI ${getMonthYearItalian(data.month)}`
    );
    this.updateCellSafely(worksheet, 'B8', data.employeeName);

    this.updateCellSafely(worksheet, 'E21', data.totalWorkDays);
    const fallbackDeclaredDays =
      typeof data.totalDeclaredDays === 'number'
        ? data.totalDeclaredDays
        : typeof data.totalDeclaredHours === 'number'
        ? hoursToDays(data.totalDeclaredHours)
        : 0;
    this.updateCellSafely(worksheet, 'E22', fallbackDeclaredDays);
    this.updateCellSafely(worksheet, 'E23', data.quadrature);
    this.updateCellSafely(worksheet, 'E24', data.overtime);

    this.updateActivityTotals(worksheet, data);
    this.updateExtractTotals(worksheet, data);
    this.insertDailyData(worksheet, data);

    return template;
  }

  private updateActivityTotalsXp(sheet: any, data: ExportData): void {
    const activityRows: { [key: string]: number } = {
      D: 28,
      AA: 29,
      ST: 30,
      F: 31,
      PE: 32,
      MA: 33,
      L104: 34,
    };

    Object.entries(activityRows).forEach(([code, row]) => {
      const raw = data.activityTotals[code] || 0;
      const days = isLikelyHours(raw) ? hoursToDays(raw) : roundTo2(raw);
      sheet.cell(`G${row}`).value(days);
    });

    const declaredRaw =
      typeof data.totalDeclaredDays === 'number'
        ? data.totalDeclaredDays
        : typeof data.totalDeclaredHours === 'number'
        ? data.totalDeclaredHours
        : 0;
    const roundedTotalDays = roundTo2(
      declaredRaw > 31 ? declaredRaw / 8 : declaredRaw
    );
    sheet.cell('G36').value(roundedTotalDays);
  }

  private updateExtractTotalsXp(sheet: any, data: ExportData): void {
    const extractRows: { [key: string]: number } = {
      ESA3582021: 39,
      BD0002022S: 40,
      ESA9992024S: 41,
      ESAPAM2024S: 42,
      ESA9982024S: 43,
    };

    data.extracts.forEach((extract) => {
      const row = extractRows[extract.id];
      if (row) {
        const raw = data.extractTotals[extract.id] || 0;
        const days = isLikelyHours(raw) ? hoursToDays(raw) : roundTo2(raw);
        sheet.cell(`G${row}`).value(days);
      }
    });
  }

  private insertDailyDataXp(sheet: any, data: ExportData): void {
    for (let r = 47; r < 247; r++) {
      ['B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach((col) => {
        sheet.cell(`${col}${r}`).value('');
      });
    }

    data.days.forEach((day, index) => {
      const row = 47 + index;
      sheet.cell(`B${row}`).value(formatExcelDate(new Date(day.date)));
      sheet.cell(`C${row}`).value(day.code || '');

      const activityDescription =
        data.activityCodes.find((ac) => ac.code === day.code)?.description ||
        '';
      sheet.cell(`D${row}`).value(activityDescription);

      sheet.cell(`E${row}`).value(day.extract || '');
      const extractInfo = data.extracts.find((e) => e.id === day.extract);
      sheet.cell(`F${row}`).value(extractInfo?.client || '');

      const dayHours = typeof day.hours === 'number' ? day.hours : 0;
      sheet.cell(`G${row}`).value(hoursToDays(dayHours));
      sheet.cell(`H${row}`).value(day.notes || '');
    });
  }

  private updateActivityTotals(
    worksheet: XLSX.WorkSheet,
    data: ExportData
  ): void {
    const activityRows: { [key: string]: number } = {
      D: 28,
      AA: 29,
      ST: 30,
      F: 31,
      PE: 32,
      MA: 33,
      L104: 34,
    };

    Object.entries(activityRows).forEach(([code, row]) => {
      const hours = data.activityTotals[code] || 0;
      this.updateCellWithValue(worksheet, `G${row}`, hoursToDays(hours));
    });

    this.updateCellWithValue(
      worksheet,
      'G36',
      hoursToDays(data.totalDeclaredHours || 0)
    );
  }

  private updateExtractTotals(
    worksheet: XLSX.WorkSheet,
    data: ExportData
  ): void {
    const extractRows: { [key: string]: number } = {
      ESA3582021: 39,
      BD0002022S: 40,
      ESA9992024S: 41,
      ESAPAM2024S: 42,
      ESA9982024S: 43,
    };

    data.extracts.forEach((extract) => {
      const row = extractRows[extract.id];
      if (row) {
        const hours = data.extractTotals[extract.id] || 0;
        this.updateCellWithValue(worksheet, `G${row}`, hoursToDays(hours));
      }
    });
  }

  private updateCellWithValue(
    worksheet: XLSX.WorkSheet,
    cell: string,
    value: any
  ): void {
    if (!worksheet[cell]) worksheet[cell] = {};
    delete worksheet[cell].f;
    worksheet[cell].v = value;
    worksheet[cell].w = value?.toString() || '';
    if (typeof value === 'number') worksheet[cell].t = 'n';
    else if (value instanceof Date) worksheet[cell].t = 'd';
    else worksheet[cell].t = 's';
  }

  private insertDailyData(worksheet: XLSX.WorkSheet, data: ExportData): void {
    this.clearExistingData(worksheet, 47);

    data.days.forEach((day, index) => {
      const row = 47 + index;
      this.updateCellSafely(
        worksheet,
        `B${row}`,
        formatExcelDate(new Date(day.date))
      );
      this.updateCellSafely(worksheet, `C${row}`, day.code);

      const activityDescription =
        data.activityCodes.find((ac) => ac.code === day.code)?.description ||
        '';
      this.updateCellSafely(worksheet, `D${row}`, activityDescription);
      this.updateCellSafely(worksheet, `E${row}`, day.extract || '');

      const extractInfo = data.extracts.find((e) => e.id === day.extract);
      this.updateCellSafely(worksheet, `F${row}`, extractInfo?.client || '');

      const dayHours = typeof day.hours === 'number' ? day.hours : 0;
      this.updateCellSafely(worksheet, `G${row}`, hoursToDays(dayHours));
      this.updateCellSafely(worksheet, `H${row}`, day.notes || '');
    });
  }

  private clearExistingData(worksheet: XLSX.WorkSheet, startRow: number): void {
    let row = startRow;
    const columns = ['B', 'C', 'D', 'E', 'F', 'G', 'H'];
    while (worksheet[`B${row}`] && row < 200) {
      columns.forEach((col) => {
        const cell = `${col}${row}`;
        if (worksheet[cell]) {
          worksheet[cell].v = undefined;
          worksheet[cell].w = '';
        }
      });
      row++;
    }
  }

  private updateCellSafely(
    worksheet: XLSX.WorkSheet,
    cell: string,
    value: any
  ): void {
    if (!worksheet[cell]) {
      worksheet[cell] = { t: 's', v: value, w: value?.toString() || '' };
    } else {
      delete worksheet[cell].f;
      worksheet[cell].v = value;
      worksheet[cell].w = value?.toString() || '';
      if (typeof value === 'number') worksheet[cell].t = 'n';
      else if (value instanceof Date) worksheet[cell].t = 'd';
      else worksheet[cell].t = 's';
    }
  }

  private generateFileName(data: ExportData): string {
    const month = (data.month.getMonth() + 1).toString().padStart(2, '0');
    const year = data.month.getFullYear();
    const name = (data.employeeName || 'UNKNOWN').toString().trim();
    const last = (name.split(/\s+/).pop() || 'UNKNOWN')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase();
    const safe = last || 'UNKNOWN';
    return `${safe}-Rilevazione_estratti_${month}-${year}.xlsx`;
  }

  private saveAsExcelFile(buffer: ArrayBuffer, fileName: string): void {
    try {
      const data: Blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      saveAs(data, fileName);
    } catch (error) {
      console.error('Errore nel salvataggio del file:', error);
      throw new Error('Impossibile salvare il file Excel');
    }
  }
}

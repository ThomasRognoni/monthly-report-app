import { Injectable, inject } from '@angular/core';
import { PersistenceService } from './persistence.service';
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
  adminEmail?: string;
}

@Injectable({ providedIn: 'root' })
export class ExcelExportService {
  private templateUrl =
    'assets/templates/10-ROGNONI-Rilevazione_estratti_template.xlsx';
  private persistence = inject(PersistenceService);

  private async fetchWithTimeout(
    url: string,
    timeout = 8000,
    retries = 1
  ): Promise<Response> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      try {
        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp;
      } catch (err) {
        clearTimeout(id);
        if (attempt === retries) throw err;
        // small backoff
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
    throw new Error('Failed to fetch');
  }

  async generateExcel(data: ExportData): Promise<void> {
    try {

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

        const response = await this.fetchWithTimeout(this.templateUrl, 8000, 2);
        const arrayBuffer = await response.arrayBuffer();

        const workbookXp: any = await XlsxPopulate.fromDataAsync(arrayBuffer);
        const sheet = workbookXp.sheet(0);

        sheet.cell('B7').value(`MESE DI ${getMonthYearItalian(data.month)}`);
        sheet.cell('B8').value(data.employeeName || '');
        sheet.cell('B9').value(data.adminEmail || '');

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
      }

      const template = await this.loadTemplate();
      const workbook = this.populateTemplateWithData(template, data);

      const XLSXmod: any = await import('xlsx');
      const XLSX = XLSXmod.default || XLSXmod;
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

  private async loadTemplate(): Promise<any> {
    try {
      const response = await this.fetchWithTimeout(this.templateUrl, 10000, 2);
      const arrayBuffer = await response.arrayBuffer();
      const XLSXmod: any = await import('xlsx');
      const XLSX = XLSXmod.default || XLSXmod;
      return XLSX.read(arrayBuffer, {
        type: 'array',
        cellDates: true,
        cellStyles: true,
        cellFormula: true,
        sheetStubs: true,
      });
    } catch (error) {
      console.error(
        'Errore nel caricamento del template (timeout/retry):',
        error
      );
      try {
        const XLSXmod: any = await import('xlsx');
        const XLSX = XLSXmod.default || XLSXmod;
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([['']]);
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        return wb;
      } catch (innerErr) {
        throw new Error(
          `Template non accessibile e fallback non riuscito: ${innerErr}`
        );
      }
    }
  }

  private populateTemplateWithData(template: any, data: ExportData): any {
    const firstSheetName = template.SheetNames[0];
    const worksheet = template.Sheets[firstSheetName];

    this.updateCellSafely(
      worksheet,
      'B7',
      `MESE DI ${getMonthYearItalian(data.month)}`
    );
    this.updateCellSafely(worksheet, 'B8', data.employeeName);
    this.updateCellSafely(worksheet, 'B9', data.adminEmail || '');

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

  private updateActivityTotals(worksheet: any, data: ExportData): void {
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

  private updateExtractTotals(worksheet: any, data: ExportData): void {
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

  private updateCellWithValue(worksheet: any, cell: string, value: any): void {
    if (!worksheet[cell]) worksheet[cell] = {};
    delete worksheet[cell].f;
    worksheet[cell].v = value;
    worksheet[cell].w = value?.toString() || '';
    if (typeof value === 'number') worksheet[cell].t = 'n';
    else if (value instanceof Date) worksheet[cell].t = 'd';
    else worksheet[cell].t = 's';
  }

  private insertDailyData(worksheet: any, data: ExportData): void {
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

  private clearExistingData(worksheet: any, startRow: number): void {
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

  private updateCellSafely(worksheet: any, cell: string, value: any): void {
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
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const result = reader.result;
          if (result && typeof result === 'string') {
            const dataUrl = result;
            try {
              this.persistence.saveExportHistory({
                filename: fileName,
                date: new Date().toLocaleString(),
                dataUrl,
              });
            } catch (err) {}
          }
        } catch (err) {}
      };
      reader.readAsDataURL(data);
      (async () => {
        try {
          const mod: any = await import('file-saver');
          const saveAsFn = mod.saveAs || mod.default || mod;
          saveAsFn(data, fileName);
        } catch (err) {
          console.error(
            'file-saver dynamic import failed, attempting global save:',
            err
          );
          const globalSave: any = (window as any).saveAs;
          if (typeof globalSave === 'function') {
            globalSave(data, fileName);
          } else {
            throw new Error('saveAs unavailable');
          }
        }
      })();
    } catch (error) {
      console.error('Errore nel salvataggio del file:', error);
      throw new Error('Impossibile salvare il file Excel');
    }
  }
}

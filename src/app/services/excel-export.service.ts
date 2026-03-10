import { Injectable, inject } from '@angular/core';
import { PersistenceService } from './persistence.service';
import { AppLoggerService } from './app-logger.service';
import {
  formatExcelDate,
  getMonthYearItalian,
  hoursToDaysRounded,
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
  private readonly REQUIRED_DAILY_HOURS = 8;
  private readonly HOURS_EPSILON = 1e-6;
  private readonly EXTRACT_SECTION_START_ROW = 39;
  private readonly EXTRACT_SECTION_END_ROW = 43;
  private readonly EXTRACT_TEMPLATE_ROW = 39;
  private readonly SECTION_COLUMNS = ['B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
  private readonly DETAIL_TITLE_BASE_ROW = 45;
  private readonly DETAIL_HEADER_BASE_ROW = 46;

  private readonly templateRelativePath =
    'assets/templates/10-ROGNONI-Rilevazione_estratti_template.xlsx';
  private readonly templateUrl = `./${this.templateRelativePath}`;
  private readonly xlsxPopulateVendorPath =
    'assets/vendor/xlsx-populate.min.js';
  private persistence = inject(PersistenceService);
  private logger = new AppLoggerService();
  private styleCopyWarningLogged = false;

  private async fetchWithTimeout(
    url: string,
    timeout = 8000,
    retries = 1,
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
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
    throw new Error('Failed to fetch');
  }

  private resolveAssetUrl(relativePath: string): string {
    try {
      return new URL(relativePath, document.baseURI).toString();
    } catch {
      return relativePath;
    }
  }

  private toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
    if (data instanceof ArrayBuffer) return data;
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return copy.buffer;
  }

  private toArrayBufferAny(data: unknown): ArrayBuffer {
    if (data instanceof ArrayBuffer) return data;
    if (ArrayBuffer.isView(data)) {
      const view = data as ArrayBufferView;
      return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
    }
    if (typeof data === 'string') {
      const base64 = data.includes(',') ? data.split(',')[1] : data;
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    }
    throw new Error('Formato output xlsx-populate non supportato');
  }

  private async readTemplateFromElectron(): Promise<ArrayBuffer | null> {
    const readAssetFile = window.electronApi?.readAssetFile;
    if (!readAssetFile) return null;

    try {
      const raw = await readAssetFile(this.templateRelativePath);
      return this.toArrayBuffer(raw);
    } catch (err) {
      console.warn('Lettura template via Electron non riuscita:', err);
      return null;
    }
  }

  private async loadTemplateArrayBuffer(
    timeout = 8000,
    retries = 1,
  ): Promise<ArrayBuffer> {
    const electronData = await this.readTemplateFromElectron();
    if (electronData) return electronData;

    const response = await this.fetchWithTimeout(
      this.resolveAssetUrl(this.templateUrl),
      timeout,
      retries,
    );
    return response.arrayBuffer();
  }

  private async loadXlsxPopulate(): Promise<any> {
    if (window.XlsxPopulate) return window.XlsxPopulate;

    const scriptUrl = this.resolveAssetUrl(this.xlsxPopulateVendorPath);
    await this.loadScript(scriptUrl);
    if (window.XlsxPopulate) return window.XlsxPopulate;
    throw new Error('xlsx-populate global_not_available');
  }

  private loadScript(src: string): Promise<void> {
    const existing = document.querySelector(
      `script[src="${src}"]`,
    ) as HTMLScriptElement | null;
    if (existing?.dataset['loaded'] === 'true') return Promise.resolve();

    return new Promise((resolve, reject) => {
      const script = existing || document.createElement('script');
      const onLoad = () => {
        script.dataset['loaded'] = 'true';
        resolve();
      };
      const onError = () => {
        reject(new Error(`Impossibile caricare script: ${src}`));
      };

      script.addEventListener('load', onLoad, { once: true });
      script.addEventListener('error', onError, { once: true });

      if (!existing) {
        script.src = src;
        script.async = true;
        document.head.appendChild(script);
      }
    });
  }

  private toIsoDateLocal(date: Date): string {
    const yyyy = date.getFullYear().toString().padStart(4, '0');
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private formatIsoDate(iso: string): string {
    const [yyyy, mm, dd] = iso.split('-');
    if (!yyyy || !mm || !dd) return iso;
    return `${dd}/${mm}/${yyyy}`;
  }

  private getWorkdayIsoDates(month: Date, holidays: any[]): string[] {
    const holidaySet = new Set<string>();
    (holidays || []).forEach((h) => {
      const iso = (h?.date || '').toString().trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) holidaySet.add(iso);
    });

    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const cursor = new Date(year, monthIndex, 1);
    const result: string[] = [];

    while (cursor.getMonth() === monthIndex) {
      const dayOfWeek = cursor.getDay();
      const iso = this.toIsoDateLocal(cursor);
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = holidaySet.has(iso);
      if (!isWeekend && !isHoliday) result.push(iso);
      cursor.setDate(cursor.getDate() + 1);
    }

    return result;
  }

  private getEntryHours(day: any): number {
    if (Array.isArray(day?.tasks) && day.tasks.length > 0) {
      return day.tasks.reduce((sum: number, t: any) => {
        const h = typeof t?.hours === 'number' && isFinite(t.hours) ? t.hours : 0;
        return sum + h;
      }, 0);
    }
    return typeof day?.hours === 'number' && isFinite(day.hours) ? day.hours : 0;
  }

  private isOvertimeTask(task: any): boolean {
    const code = (task?.code || '').toString().trim().toUpperCase();
    const hours =
      typeof task?.hours === 'number' && isFinite(task.hours) ? task.hours : 0;
    return code === 'ST' && hours > 0;
  }

  private hasOvertimeInEntry(day: any): boolean {
    if (Array.isArray(day?.tasks) && day.tasks.length > 0) {
      return day.tasks.some((t: any) => this.isOvertimeTask(t));
    }
    return this.isOvertimeTask(day);
  }

  private hasInvalidDailyOverflow(hours: number, hasOvertime: boolean): boolean {
    if (hours <= this.REQUIRED_DAILY_HOURS + this.HOURS_EPSILON) return false;
    return !hasOvertime;
  }

  private assertCompleteWorkdayHours(data: ExportData): void {
    const requiredWorkdays = this.getWorkdayIsoDates(data.month, data.holidays);
    const dailyHours: { [iso: string]: number } = {};
    const dailyOvertime = new Set<string>();

    (data.days || []).forEach((day: any) => {
      if (!day?.date) return;
      const date = new Date(day.date);
      if (!isFinite(date.getTime())) return;
      const iso = this.toIsoDateLocal(date);
      dailyHours[iso] = (dailyHours[iso] || 0) + this.getEntryHours(day);
      if (this.hasOvertimeInEntry(day)) {
        dailyOvertime.add(iso);
      }
    });

    const invalidDates = requiredWorkdays.filter((iso) => {
      const hours = dailyHours[iso] || 0;
      if (hours + this.HOURS_EPSILON < this.REQUIRED_DAILY_HOURS) return true;
      return this.hasInvalidDailyOverflow(hours, dailyOvertime.has(iso));
    });

    if (invalidDates.length > 0) {
      const sample = invalidDates
        .slice(0, 8)
        .map((d) => this.formatIsoDate(d))
        .join(', ');
      const suffix = invalidDates.length > 8 ? ' ...' : '';
      throw new Error(
        `Export bloccato: ogni giorno lavorativo deve avere almeno 8 ore; oltre 8 ore solo con Straordinari (ST). Giorni non conformi: ${sample}${suffix}`,
      );
    }
  }

  async generateExcel(data: ExportData): Promise<void> {
    try {
      this.assertCompleteWorkdayHours(data);

      try {
        const XlsxPopulate = await this.loadXlsxPopulate();
        const arrayBuffer = await this.loadTemplateArrayBuffer(8000, 2);

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
              ? hoursToDaysRounded(data.totalDeclaredHours)
              : 0;
        sheet.cell('E22').value(declaredDays || 0);
        sheet.cell('E23').value(data.quadrature || 0);
        sheet.cell('E24').value(data.overtime || 0);

        this.updateActivityTotalsXp(sheet, data);
        const detailStartRow = this.updateExtractTotalsXp(sheet, data);
        this.insertDailyDataXp(sheet, data, detailStartRow);

        let out: unknown;
        try {
          out = await workbookXp.outputAsync({ type: 'arraybuffer' });
        } catch (err) {
          this.logger.warn(
            'ExcelExportService',
            'outputAsync(arraybuffer) non supportato, uso output default',
            err,
          );
          out = await workbookXp.outputAsync();
        }
        const buffer = this.toArrayBufferAny(out);
        await this.saveAsExcelFile(buffer, this.generateFileName(data));
        return;
      } catch (xpErr) {
        console.warn(
          'xlsx-populate not available or failed, falling back to xlsx:',
          xpErr,
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
      await this.saveAsExcelFile(buffer, this.generateFileName(data));
    } catch (error) {
      console.error('Errore nella generazione del Excel:', error);
      throw new Error(
        'Impossibile generare il file Excel: ' + (error as Error).message,
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
      const arrayBuffer = await this.loadTemplateArrayBuffer(10000, 2);
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
        error,
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
          `Template non accessibile e fallback non riuscito: ${innerErr}`,
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
      `MESE DI ${getMonthYearItalian(data.month)}`,
    );
    this.updateCellSafely(worksheet, 'B8', data.employeeName);
    this.updateCellSafely(worksheet, 'B9', data.adminEmail || '');

    this.updateCellSafely(worksheet, 'E21', data.totalWorkDays);
    const fallbackDeclaredDays =
      typeof data.totalDeclaredDays === 'number'
        ? data.totalDeclaredDays
        : typeof data.totalDeclaredHours === 'number'
          ? hoursToDaysRounded(data.totalDeclaredHours)
          : 0;
    this.updateCellSafely(worksheet, 'E22', fallbackDeclaredDays);
    this.updateCellSafely(worksheet, 'E23', data.quadrature);
    this.updateCellSafely(worksheet, 'E24', data.overtime);

    this.updateActivityTotals(worksheet, data);
    const detailStartRow = this.updateExtractTotals(worksheet, data);
    this.insertDailyData(worksheet, data, detailStartRow);

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
      // raw sono ore, arrotondo sempre a multipli di 0.125 giorni
      const days = hoursToDaysRounded(raw);
      sheet.cell(`G${row}`).value(days);
    });

    sheet
      .cell('G36')
      .value(
        typeof data.totalDeclaredDays === 'number'
          ? data.totalDeclaredDays
          : hoursToDaysRounded(data.totalDeclaredHours || 0),
      );
  }

  private getUsedExtractsForExport(data: ExportData): Array<{
    id: string;
    code: string;
    description: string;
    client: string;
    hours: number;
  }> {
    const knownExtracts = new Map<string, any>();
    (data.extracts || []).forEach((extract: any) => {
      const id = (extract?.id || '').toString().trim();
      if (id) knownExtracts.set(id, extract);
    });

    const totals = new Map<string, number>();
    const taskClientByExtract = new Map<string, string>();

    (data.days || []).forEach((day: any) => {
      const tasks =
        Array.isArray(day?.tasks) && day.tasks.length > 0
          ? day.tasks
          : [
              {
                extract: day?.extract,
                client: day?.client,
                hours: day?.hours,
              },
            ];

      tasks.forEach((task: any) => {
        const extractId = (task?.extract || '').toString().trim();
        if (!extractId) return;

        const numericHours =
          typeof task?.hours === 'number' ? task.hours : Number(task?.hours);
        const hours = Number.isFinite(numericHours) ? numericHours : 0;
        totals.set(extractId, (totals.get(extractId) || 0) + hours);

        const taskClient = (task?.client || '').toString().trim();
        if (taskClient && !taskClientByExtract.has(extractId)) {
          taskClientByExtract.set(extractId, taskClient);
        }
      });
    });

    const usedExtracts = Array.from(totals.entries())
      .filter(([, hours]) => hours > this.HOURS_EPSILON)
      .map(([id, hours]) => {
        const extract = knownExtracts.get(id);
        return {
          id,
          code: (extract?.code || '').toString().trim(),
          description: (extract?.description || '').toString().trim(),
          client: (extract?.client || taskClientByExtract.get(id) || '')
            .toString()
            .trim(),
          hours,
        };
      });

    usedExtracts.sort((a, b) => {
      const clientCompare = a.client.localeCompare(b.client, 'it', {
        sensitivity: 'base',
      });
      if (clientCompare !== 0) return clientCompare;
      return a.id.localeCompare(b.id, 'it', { sensitivity: 'base' });
    });

    return usedExtracts;
  }

  private getDetailDataStartRow(usedExtractsCount: number): number {
    const baseSlots =
      this.EXTRACT_SECTION_END_ROW - this.EXTRACT_SECTION_START_ROW + 1;
    const visibleRows = Math.max(baseSlots, usedExtractsCount);
    return this.EXTRACT_SECTION_START_ROW + visibleRows + 3;
  }

  private shouldClearOriginalDetailRow(
    row: number,
    extractRowsEnd: number,
    detailTitleRow: number,
    detailHeaderRow: number,
  ): boolean {
    if (row <= extractRowsEnd) return false;
    return row !== detailTitleRow && row !== detailHeaderRow;
  }

  private applyRowStyleXp(sheet: any, sourceRow: number, targetRow: number): void {
    if (sourceRow === targetRow) return;
    const styleKeys = [
      'fill',
      'bold',
      'italic',
      'underline',
      'strikethrough',
      'fontFamily',
      'fontName',
      'fontSize',
      'fontColor',
      'numberFormat',
      'border',
      'horizontalAlignment',
      'verticalAlignment',
      'wrapText',
      'textDirection',
      'textRotation',
      'indent',
      'shrinkToFit',
    ] as const;

    this.SECTION_COLUMNS.forEach((col) => {
      const source = sheet.cell(`${col}${sourceRow}`);
      const target = sheet.cell(`${col}${targetRow}`);
      styleKeys.forEach((key) => {
        try {
          target.style(key, source.style(key));
        } catch (err) {
          if (!this.styleCopyWarningLogged) {
            this.styleCopyWarningLogged = true;
            this.logger.debug(
              'ExcelExportService',
              'Alcuni stili non sono copiabili con xlsx-populate, si usa fallback parziale',
              err,
            );
          }
        }
      });
    });
  }

  private cloneStyle(style: any): any {
    try {
      return JSON.parse(JSON.stringify(style));
    } catch {
      return style;
    }
  }

  private applyRowStyle(worksheet: any, sourceRow: number, targetRow: number): void {
    if (sourceRow === targetRow) return;
    this.SECTION_COLUMNS.forEach((col) => {
      const sourceCell = worksheet[`${col}${sourceRow}`];
      if (!sourceCell || !sourceCell.s) return;
      const targetRef = `${col}${targetRow}`;
      if (!worksheet[targetRef]) worksheet[targetRef] = {};
      worksheet[targetRef].s = this.cloneStyle(sourceCell.s);
    });
  }

  private clearRowXp(sheet: any, row: number): void {
    this.SECTION_COLUMNS.forEach((col) => {
      sheet.cell(`${col}${row}`).value('');
    });
  }

  private clearRow(worksheet: any, row: number): void {
    this.SECTION_COLUMNS.forEach((col) => {
      this.updateCellWithValue(worksheet, `${col}${row}`, '');
    });
  }

  private updateExtractTotalsXp(sheet: any, data: ExportData): number {
    const usedExtracts = this.getUsedExtractsForExport(data);
    const detailStartRow = this.getDetailDataStartRow(usedExtracts.length);
    const detailTitleRow = detailStartRow - 2;
    const detailHeaderRow = detailStartRow - 1;
    const extractRowsEnd = Math.max(
      this.EXTRACT_SECTION_END_ROW,
      this.EXTRACT_SECTION_START_ROW + usedExtracts.length - 1,
    );

    // Copy detail styles before writing extract rows, because row 45/46 can be reused.
    this.applyRowStyleXp(sheet, this.DETAIL_TITLE_BASE_ROW, detailTitleRow);
    this.applyRowStyleXp(sheet, this.DETAIL_HEADER_BASE_ROW, detailHeaderRow);

    for (
      let row = this.EXTRACT_SECTION_START_ROW;
      row <= extractRowsEnd;
      row++
    ) {
      this.clearRowXp(sheet, row);
    }

    usedExtracts.forEach((extract, index) => {
      const row = this.EXTRACT_SECTION_START_ROW + index;
      this.applyRowStyleXp(sheet, this.EXTRACT_TEMPLATE_ROW, row);
      sheet.cell(`B${row}`).value(extract.id);
      sheet.cell(`C${row}`).value(extract.code || '');
      sheet.cell(`D${row}`).value(extract.description || '');
      sheet.cell(`E${row}`).value(extract.client || '');
      sheet.cell(`F${row}`).value('');
      sheet.cell(`G${row}`).value(hoursToDaysRounded(extract.hours));
      sheet.cell(`H${row}`).value('');
    });

    const originalDetailRows = [this.DETAIL_TITLE_BASE_ROW, this.DETAIL_HEADER_BASE_ROW];
    originalDetailRows.forEach((row) => {
      if (
        this.shouldClearOriginalDetailRow(
          row,
          extractRowsEnd,
          detailTitleRow,
          detailHeaderRow,
        )
      ) {
        this.clearRowXp(sheet, row);
      }
    });
    const separatorRow = detailTitleRow - 1;
    if (separatorRow > extractRowsEnd) {
      this.clearRowXp(sheet, separatorRow);
    }
    sheet.cell(`B${detailTitleRow}`).value('Dettaglio');
    sheet.cell(`B${detailHeaderRow}`).value('Data');
    sheet.cell(`C${detailHeaderRow}`).value('Codice');
    sheet.cell(`D${detailHeaderRow}`).value('Attività');
    sheet.cell(`E${detailHeaderRow}`).value('Estratto');
    sheet.cell(`F${detailHeaderRow}`).value('Cliente');
    sheet.cell(`G${detailHeaderRow}`).value('Ore');
    sheet.cell(`H${detailHeaderRow}`).value('Note');

    return detailStartRow;
  }

  private insertDailyDataXp(sheet: any, data: ExportData, startRow: number): void {
    for (let r = startRow; r < 247; r++) {
      this.clearRowXp(sheet, r);
    }

    let row = startRow;
    data.days.forEach((day) => {
      const tasks =
        Array.isArray(day.tasks) && day.tasks.length > 0
          ? day.tasks
          : [
              {
                code: day.code,
                activity: day.activity,
                extract: day.extract,
                client: day.client,
                hours: day.hours,
                notes: day.notes,
              },
            ];
      tasks.forEach((task: import('../models/day-entry.model').Task) => {
        sheet.cell(`B${row}`).value(formatExcelDate(new Date(day.date)));
        sheet.cell(`C${row}`).value(task.code || '');
        const activityDescription =
          data.activityCodes.find((ac) => ac.code === task.code)?.description ||
          '';
        sheet.cell(`D${row}`).value(activityDescription);
        sheet.cell(`E${row}`).value(task.extract || '');
        const extractInfo = data.extracts.find((e) => e.id === task.extract);
        sheet.cell(`F${row}`).value(extractInfo?.client || task.client || '');
        const taskHours = typeof task.hours === 'number' ? task.hours : 0;
        sheet.cell(`G${row}`).value(hoursToDaysRounded(taskHours));
        sheet.cell(`H${row}`).value(task.notes || '');
        row++;
      });
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
      this.updateCellWithValue(worksheet, `G${row}`, hoursToDaysRounded(hours));
    });

    this.updateCellWithValue(
      worksheet,
      'G36',
      typeof data.totalDeclaredDays === 'number'
        ? data.totalDeclaredDays
        : hoursToDaysRounded(data.totalDeclaredHours || 0),
    );
  }

  private updateExtractTotals(worksheet: any, data: ExportData): number {
    const usedExtracts = this.getUsedExtractsForExport(data);
    const detailStartRow = this.getDetailDataStartRow(usedExtracts.length);
    const detailTitleRow = detailStartRow - 2;
    const detailHeaderRow = detailStartRow - 1;
    const extractRowsEnd = Math.max(
      this.EXTRACT_SECTION_END_ROW,
      this.EXTRACT_SECTION_START_ROW + usedExtracts.length - 1,
    );

    // Copy detail styles before writing extract rows, because row 45/46 can be reused.
    this.applyRowStyle(worksheet, this.DETAIL_TITLE_BASE_ROW, detailTitleRow);
    this.applyRowStyle(worksheet, this.DETAIL_HEADER_BASE_ROW, detailHeaderRow);

    for (
      let row = this.EXTRACT_SECTION_START_ROW;
      row <= extractRowsEnd;
      row++
    ) {
      this.clearRow(worksheet, row);
    }

    usedExtracts.forEach((extract, index) => {
      const row = this.EXTRACT_SECTION_START_ROW + index;
      this.applyRowStyle(worksheet, this.EXTRACT_TEMPLATE_ROW, row);
      this.updateCellWithValue(worksheet, `B${row}`, extract.id);
      this.updateCellWithValue(worksheet, `C${row}`, extract.code || '');
      this.updateCellWithValue(worksheet, `D${row}`, extract.description || '');
      this.updateCellWithValue(worksheet, `E${row}`, extract.client || '');
      this.updateCellWithValue(worksheet, `F${row}`, '');
      this.updateCellWithValue(
        worksheet,
        `G${row}`,
        hoursToDaysRounded(extract.hours),
      );
      this.updateCellWithValue(worksheet, `H${row}`, '');
    });

    const originalDetailRows = [this.DETAIL_TITLE_BASE_ROW, this.DETAIL_HEADER_BASE_ROW];
    originalDetailRows.forEach((row) => {
      if (
        this.shouldClearOriginalDetailRow(
          row,
          extractRowsEnd,
          detailTitleRow,
          detailHeaderRow,
        )
      ) {
        this.clearRow(worksheet, row);
      }
    });
    const separatorRow = detailTitleRow - 1;
    if (separatorRow > extractRowsEnd) {
      this.clearRow(worksheet, separatorRow);
    }
    this.updateCellWithValue(worksheet, `B${detailTitleRow}`, 'Dettaglio');
    this.updateCellWithValue(worksheet, `B${detailHeaderRow}`, 'Data');
    this.updateCellWithValue(worksheet, `C${detailHeaderRow}`, 'Codice');
    this.updateCellWithValue(worksheet, `D${detailHeaderRow}`, 'Attività');
    this.updateCellWithValue(worksheet, `E${detailHeaderRow}`, 'Estratto');
    this.updateCellWithValue(worksheet, `F${detailHeaderRow}`, 'Cliente');
    this.updateCellWithValue(worksheet, `G${detailHeaderRow}`, 'Ore');
    this.updateCellWithValue(worksheet, `H${detailHeaderRow}`, 'Note');

    return detailStartRow;
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

  private insertDailyData(worksheet: any, data: ExportData, startRow: number): void {
    this.clearExistingData(worksheet, startRow);

    data.days.forEach((day, index) => {
      const row = startRow + index;
      this.updateCellSafely(
        worksheet,
        `B${row}`,
        formatExcelDate(new Date(day.date)),
      );
      this.updateCellSafely(worksheet, `C${row}`, day.code);

      const activityDescription =
        data.activityCodes.find((ac) => ac.code === day.code)?.description ||
        '';
      this.updateCellSafely(worksheet, `D${row}`, activityDescription);
      this.updateCellSafely(worksheet, `E${row}`, day.extract || '');

      const extractInfo = data.extracts.find((e) => e.id === day.extract);
      this.updateCellSafely(
        worksheet,
        `F${row}`,
        extractInfo?.client || day.client || '',
      );

      const dayHours = typeof day.hours === 'number' ? day.hours : 0;
      this.updateCellSafely(worksheet, `G${row}`, hoursToDaysRounded(dayHours));
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

  private async saveAsExcelFile(
    buffer: ArrayBuffer,
    fileName: string,
  ): Promise<void> {
    try {
      const now = new Date().toISOString();
      const sizeBytes = buffer.byteLength || 0;
      const checksum = await this.computeSha256(buffer);
      const fileSaver = window.electronApi?.saveExportFile;
      if (fileSaver) {
        const saved = await fileSaver(fileName, buffer);
        if (saved?.path && window.electronApi?.openExportFile) {
          try {
            const openResult = await window.electronApi.openExportFile(saved.path);
            if (!openResult?.ok) {
              this.logger.warn(
                'ExcelExportService',
                'Apertura automatica file Excel non riuscita',
                openResult?.error,
              );
            }
          } catch (err) {
            this.logger.warn(
              'ExcelExportService',
              'Apertura automatica file Excel non riuscita',
              err,
            );
          }
        }
        try {
          this.persistence.saveExportHistory({
            filename: fileName,
            date: now,
            filePath: saved?.path || null,
            sizeBytes,
            checksum,
            source: 'electron',
          });
        } catch (err) {
          this.logger.warn(
            'ExcelExportService',
            'Impossibile salvare metadati storico export (Electron)',
            err,
          );
        }
        return;
      }

      const data = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      // Use native browser API to download file
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      try {
        this.persistence.saveExportHistory({
          filename: fileName,
          date: now,
          sizeBytes,
          checksum,
          source: 'browser',
        });
      } catch (err) {
        this.logger.warn(
          'ExcelExportService',
          'Impossibile salvare metadati storico export (browser)',
          err,
        );
      }
    } catch (error) {
      console.error('Errore nel salvataggio del file:', error);
      throw new Error('Impossibile salvare il file Excel');
    }
  }

  private async computeSha256(buffer: ArrayBuffer): Promise<string | null> {
    try {
      if (typeof crypto === 'undefined' || !crypto.subtle) {
        return null;
      }
      const digest = await crypto.subtle.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(digest))
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('');
    } catch (error) {
      this.logger.warn(
        'ExcelExportService',
        'Calcolo checksum SHA-256 non riuscito',
        error,
      );
      return null;
    }
  }
}


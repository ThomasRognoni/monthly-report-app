import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

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

@Injectable({
  providedIn: 'root'
})
export class ExcelExportService {
  
  private templateUrl = 'assets/templates/10-ROGNONI-Rilevazione_estratti_template.xlsx';

  async generateExcel(data: ExportData): Promise<void> {
    try {
      console.log('Inizio generazione Excel...');
      
      const template = await this.loadTemplate();
      console.log('Template caricato con successo');
      
      const workbook = this.populateTemplateWithData(template, data);
      console.log('Template popolato con dati');
      
      const excelBuffer = XLSX.write(workbook, { 
        bookType: 'xlsx', 
        type: 'binary',
        bookSST: false 
      });
      
      const buffer = this.s2ab(excelBuffer);
      this.saveAsExcelFile(buffer, this.generateFileName(data));
      console.log('File Excel generato con successo');
      
    } catch (error) {
      console.error('Errore nella generazione del Excel:', error);
      throw new Error('Impossibile generare il file Excel: ' + (error as Error).message);
    }
  }

  private s2ab(s: string): ArrayBuffer {
    const buf = new ArrayBuffer(s.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < s.length; i++) {
      view[i] = s.charCodeAt(i) & 0xFF;
    }
    return buf;
  }

  private async loadTemplate(): Promise<XLSX.WorkBook> {
    try {
      console.log('Tentativo di caricamento template da:', this.templateUrl);
      
      const response = await fetch(this.templateUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      console.log('Template caricato, dimensione:', arrayBuffer.byteLength, 'bytes');
      
      return XLSX.read(arrayBuffer, { 
        type: 'array',
        cellDates: true,
        cellStyles: true,
        cellFormula: true,
        sheetStubs: true
      });
    } catch (error) {
      console.error('Errore nel caricamento del template:', error);
      throw new Error(`Template non trovato o non accessibile: ${this.templateUrl}`);
    }
  }

  private populateTemplateWithData(template: XLSX.WorkBook, data: ExportData): XLSX.WorkBook {
    const firstSheetName = template.SheetNames[0];
    const worksheet = template.Sheets[firstSheetName];

    this.updateCellSafely(worksheet, 'B7', `MESE DI ${this.getMonthYearItalian(data.month)}`);
    this.updateCellSafely(worksheet, 'B8', data.employeeName);
    
    this.updateCellSafely(worksheet, 'E21', data.totalWorkDays);
    this.updateCellSafely(worksheet, 'E22', data.totalDeclaredDays);
    this.updateCellSafely(worksheet, 'E23', data.quadrature);
    this.updateCellSafely(worksheet, 'E24', data.overtime);
    
    this.updateActivityTotals(worksheet, data);
    this.updateExtractTotals(worksheet, data);
    this.insertDailyData(worksheet, data);
    
    return template;
  }

  private updateActivityTotals(worksheet: XLSX.WorkSheet, data: ExportData): void {
  const activityRows: { [key: string]: number } = {
    'D': 28,
    'AA': 29,
    'ST': 30,
    'F': 31,
    'PE': 32,
    'MA': 33,
    'L104': 34
  };
  
  Object.entries(activityRows).forEach(([code, row]) => {
    const days = data.activityTotals[code] || 0;
    const roundedDays = Math.round(days * 100) / 100;
    
    this.updateCellWithValue(worksheet, `G${row}`, roundedDays);
  });

  const totalDeclaredDays = data.totalDeclaredHours / 8;
  const roundedTotalDays = Math.round(totalDeclaredDays * 100) / 100;
  
  this.updateCellWithValue(worksheet, 'G36', roundedTotalDays);
}

  private updateExtractTotals(worksheet: XLSX.WorkSheet, data: ExportData): void {
  const extractRows: { [key: string]: number } = {
    'ESA3582021': 39,
    'BD0002022S': 40,
    'ESA9992024S': 41,
    'ESAPAM2024S': 42,
    'ESA9982024S': 43
  };
  
  data.extracts.forEach(extract => {
    const row = extractRows[extract.id];
    if (row) {
      const hours = data.extractTotals[extract.id] || 0;
      const days = hours / 8;
      const roundedDays = Math.round(days * 100) / 100;
      
      this.updateCellWithValue(worksheet, `G${row}`, roundedDays);
      
      console.log(`  ${extract.id}: ${hours} ore = ${roundedDays} giorni (cella G${row})`);
    }
  });
}

private updateCellWithValue(worksheet: XLSX.WorkSheet, cell: string, value: any): void {
  if (!worksheet[cell]) {
    worksheet[cell] = {};
  }
  
  delete worksheet[cell].f;
  
  worksheet[cell].v = value;
  worksheet[cell].w = value?.toString() || '';
  
  if (typeof value === 'number') {
    worksheet[cell].t = 'n';
  } else if (value instanceof Date) {
    worksheet[cell].t = 'd';
  } else {
    worksheet[cell].t = 's';
  }
}

  private insertDailyData(worksheet: XLSX.WorkSheet, data: ExportData): void {
  console.log(`Inserimento ${data.days.length} giorni nel template`);
  
  this.clearExistingData(worksheet, 47);
  
  data.days.forEach((day, index) => {
    const row = 47 + index;
    
    this.updateCellSafely(worksheet, `B${row}`, this.formatExcelDate(day.date));
    this.updateCellSafely(worksheet, `C${row}`, day.code);
    
    const activityDescription = data.activityCodes.find(ac => ac.code === day.code)?.description || '';
    this.updateCellSafely(worksheet, `D${row}`, activityDescription);
    
    this.updateCellSafely(worksheet, `E${row}`, day.extract || '');
    
    const extractInfo = data.extracts.find(e => e.id === day.extract);
    this.updateCellSafely(worksheet, `F${row}`, extractInfo?.client || '');
    
    this.updateCellSafely(worksheet, `G${row}`, day.hours);
    
    this.updateCellSafely(worksheet, `H${row}`, day.notes || '');
  });
}

  private clearExistingData(worksheet: XLSX.WorkSheet, startRow: number): void {
    let row = startRow;
    const columns = ['B', 'C', 'D', 'E', 'F', 'G', 'H'];
    
    while (worksheet[`B${row}`] && row < 200) {
      columns.forEach(col => {
        const cell = `${col}${row}`;
        if (worksheet[cell]) {
          worksheet[cell].v = undefined;
          worksheet[cell].w = '';
        }
      });
      row++;
    }
  }

  private updateCellSafely(worksheet: XLSX.WorkSheet, cell: string, value: any): void {
  if (!worksheet[cell]) {
    worksheet[cell] = { t: 's', v: value, w: value?.toString() || '' };
  } else {
    delete worksheet[cell].f;
    
    worksheet[cell].v = value;
    worksheet[cell].w = value?.toString() || '';
    
    if (typeof value === 'number') {
      worksheet[cell].t = 'n';
    } else if (value instanceof Date) {
      worksheet[cell].t = 'd';
    } else {
      worksheet[cell].t = 's';
    }
  }
}

  private formatExcelDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

  private getMonthYearItalian(date: Date): string {
    const months = [
      'GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO',
      'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE'
    ];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  private generateFileName(data: ExportData): string {
    const month = (data.month.getMonth() + 1).toString().padStart(2, '0');
    const year = data.month.getFullYear();
    return `ROGNONI-Rilevazione_estratti_${month}-${year}.xlsx`;
  }

  private saveAsExcelFile(buffer: ArrayBuffer, fileName: string): void {
    try {
      const data: Blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      saveAs(data, fileName);
      console.log(`File salvato come: ${fileName}`);
    } catch (error) {
      console.error('Errore nel salvataggio del file:', error);
      throw new Error('Impossibile salvare il file Excel');
    }
  }
}
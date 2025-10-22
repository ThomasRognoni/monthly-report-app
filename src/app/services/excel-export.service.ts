import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import { DayEntry, Extract } from '../models/day-entry.model';

// Define interface for activity codes
interface ActivityCode {
  code: string;
  description: string;
}

@Injectable({
  providedIn: 'root',
})
export class ExcelExportService {
  
  generateExcel(data: {
    employeeName: string;
    month: Date;
    days: DayEntry[];
    extracts: Extract[];
    activityTotals: { [key: string]: number };
    extractTotals: { [key: string]: number };
    totalWorkDays: number;
    totalDeclaredDays: number;
    quadrature: number;
    overtime: number;
    activityCodes: ActivityCode[];
  }) {
    // Create a new workbook
    const workbook = XLSX.utils.book_new();

    // Add summary sheet
    this.addSummarySheet(workbook, data);

    // Add detailed entries sheet
    this.addEntriesSheet(workbook, data);

    // Add extracts summary sheet
    this.addExtractsSheet(workbook, data);

    // Generate Excel file and trigger download
    const monthName = data.month.toLocaleDateString('it-IT', {
      month: 'long',
      year: 'numeric',
    });
    const fileName = `Estrazione_${data.employeeName.replace(
      ' ',
      '_'
    )}_${monthName.replace(' ', '_')}.xlsx`;

    XLSX.writeFile(workbook, fileName);
  }

  private addSummarySheet(
    workbook: XLSX.WorkBook,
    data: {
      employeeName: string;
      month: Date;
      activityTotals: { [key: string]: number };
      totalWorkDays: number;
      totalDeclaredDays: number;
      quadrature: number;
      overtime: number;
      activityCodes: ActivityCode[];
    }
  ) {
    const summaryData = [
      ["ESTRATTO PERSONALE RIASSUNTIVO DELLE ATTIVITA'"],
      [
        `MESE DI ${data.month
          .toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
          .toUpperCase()}`,
      ],
      [data.employeeName],
      [''],
      ['QUADRATURA DEL MESE'],
      ['Totale giorni lavorativi del mese', data.totalWorkDays],
      ['Totale giorni dichiarati dal dipendente', data.totalDeclaredDays],
      ['Quadratura', data.quadrature],
      ['Straordinari', data.overtime],
      [''],
      ['THOMAS ROGNONI - Da compilare a cura del dipendente'],
      ...data.activityCodes.map((activity: ActivityCode) => [
        activity.description,
        activity.code,
        data.activityTotals[activity.code] || 0,
      ]),
      ['Totale giorni dichiarati', 'TT', data.totalDeclaredDays],
    ];

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Riepilogo');
  }

  private addEntriesSheet(workbook: XLSX.WorkBook, data: { days: DayEntry[] }) {
    const headers = [
      'Data',
      'Codice',
      'Attività',
      'Estratto',
      'Cliente',
      'Ore',
      'Note',
    ];

    const entriesData = [
      headers,
      ...data.days.map((day: DayEntry) => [
        this.formatDate(day.date),
        day.code,
        day.activity,
        day.extract || '',
        day.client || '',
        day.hours,
        day.notes || '',
      ]),
    ];

    const entriesSheet = XLSX.utils.aoa_to_sheet(entriesData);
    XLSX.utils.book_append_sheet(
      workbook,
      entriesSheet,
      'Dettaglio Giornaliero'
    );
  }

  private addExtractsSheet(
    workbook: XLSX.WorkBook,
    data: { extracts: Extract[]; extractTotals: { [key: string]: number } }
  ) {
    const headers = [
      'Estratto',
      'Codice',
      'Descrizione estratto',
      'Cliente',
      'Giorni',
    ];

    const extractsData = [
      headers,
      ...data.extracts.map((extract: Extract) => [
        extract.id,
        extract.code,
        extract.description,
        extract.client,
        data.extractTotals[extract.id] || 0,
      ]),
    ];

    const extractsSheet = XLSX.utils.aoa_to_sheet(extractsData);
    XLSX.utils.book_append_sheet(workbook, extractsSheet, 'Estratti');
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('it-IT');
  }
}

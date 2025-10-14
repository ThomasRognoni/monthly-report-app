import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DayEntry, Extract } from '../models/day-entry.model';
import { ReportSummaryComponent } from '../report-summary/report-summary.component';
import { ExtractListComponent } from '../extract-list/extract-list.component';
import { DayEntryComponent } from '../day-entry/day-entry.component';
import { ExcelExportService } from '../services/excel-export.service'; // Import the service

@Component({
  selector: 'app-monthly-report',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule,
    ReportSummaryComponent,
    ExtractListComponent,
    DayEntryComponent
  ],
  templateUrl: './monthly-report.component.html',
  styleUrls: ['./monthly-report.component.css']
})
export class MonthlyReportComponent {
  // Inject the ExcelExportService
  private excelExportService = inject(ExcelExportService);

  employeeName = signal('Thomas Rognoni');
  currentMonth = signal(new Date());
  
  activityCodes = signal([
    { code: 'D', description: 'Giorni Lavorativi Designer' },
    { code: 'AA', description: 'Altre attività' },
    { code: 'ST', description: 'Straordinari' },
    { code: 'F', description: 'Ferie' },
    { code: 'PE', description: 'Permessi/ex Festività' },
    { code: 'MA', description: 'Malattia' },
    { code: 'L104', description: 'Permessi retribuiti L.104' }
  ]);

  extracts = signal<Extract[]>([
    { id: 'ESA3582021', code: 'D', description: 'MONTE DEI PASCHI', client: 'MPS', totalDays: 0 },
    { id: 'BD0002022S', code: 'D', description: 'BANCO DI DESIO', client: 'BdD', totalDays: 0 },
    { id: 'ESA9992024S', code: 'D', description: 'BCC', client: 'BCC', totalDays: 0 },
    { id: 'ESAPAM2024S', code: 'D', description: 'PAM', client: 'PAM', totalDays: 0 },
    { id: 'ESA9982024S', code: 'D', description: 'FormIO', client: 'MEDIOLANUM', totalDays: 0 }
  ]);

  days = signal<DayEntry[]>([]);

  // Computed values (keep all your existing computed signals)
  totalDeclaredDays = computed(() => 
    this.days().reduce((sum, day) => sum + day.hours, 0)
  );

  totalWorkDays = computed(() => {
    const month = this.currentMonth();
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    let count = 0;
    const date = new Date(year, monthIndex, 1);
    
    while (date.getMonth() === monthIndex) {
      const dayOfWeek = date.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count++;
      }
      date.setDate(date.getDate() + 1);
    }
    return count;
  });

  quadrature = computed(() => this.totalWorkDays() - this.totalDeclaredDays());
  
  overtime = computed(() => {
    const overtimeDays = this.days().filter(day => day.code === 'ST');
    return overtimeDays.reduce((sum, day) => sum + day.hours, 0);
  });

  activityTotals = computed(() => {
    const totals: {[key: string]: number} = {};
    this.activityCodes().forEach(activity => {
      totals[activity.code] = this.days()
        .filter(day => day.code === activity.code)
        .reduce((sum, day) => sum + day.hours, 0);
    });
    return totals;
  });

  extractTotals = computed(() => {
    const totals: {[key: string]: number} = {};
    this.extracts().forEach(extract => {
      totals[extract.id] = this.days()
        .filter(day => day.extract === extract.id)
        .reduce((sum, day) => sum + day.hours, 0);
    });
    return totals;
  });

  // Helper method to get formatted month for input[type="month"]
  getFormattedMonth(): string {
    return this.currentMonth().toISOString().substring(0, 7);
  }

  // Handle month change
  onMonthChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const newDate = new Date(input.value + '-01');
    this.currentMonth.set(newDate);
  }

  addDayEntry() {
    const newEntry: DayEntry = {
      date: new Date(),
      code: 'D',
      activity: '',
      hours: 1,
      notes: ''
    };
    this.days.update(days => [...days, newEntry]);
  }

  updateDayEntry(event: {index: number, field: keyof DayEntry, value: any}) {
    this.days.update(days => 
      days.map((day, i) => 
        i === event.index ? { ...day, [event.field]: event.value } : day
      )
    );
  }

  removeDayEntry(index: number) {
    this.days.update(days => days.filter((_, i) => i !== index));
  }

  loadTemplate() {
    const month = this.currentMonth();
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const newDays: DayEntry[] = [];
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, monthIndex, day);
      const dayOfWeek = date.getDay();
      
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        newDays.push({
          date,
          code: 'D',
          activity: 'Accessibilità PAM',
          hours: 1,
          notes: ''
        });
      }
    }
    
    this.days.set(newDays);
  }

  // Updated exportToExcel function using the service
  exportToExcel() {
    if (this.days().length === 0) {
      alert('Non ci sono dati da esportare. Inserisci prima alcuni giorni.');
      return;
    }

    // Prepare the data for export
    const exportData = {
      employeeName: this.employeeName(),
      month: this.currentMonth(),
      days: this.days(),
      extracts: this.extracts(),
      activityTotals: this.activityTotals(),
      extractTotals: this.extractTotals(),
      totalWorkDays: this.totalWorkDays(),
      totalDeclaredDays: this.totalDeclaredDays(),
      quadrature: this.quadrature(),
      overtime: this.overtime(),
      activityCodes: this.activityCodes()
    };

    // Call the Excel export service
    this.excelExportService.generateExcel(exportData);
  }
}
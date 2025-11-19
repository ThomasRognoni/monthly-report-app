import {
  Component,
  ChangeDetectionStrategy,
  computed,
  signal,
  inject,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { DayEntry, Extract } from '../models/day-entry.model';
import { ReportSummaryComponent } from '../report-summary/report-summary.component';
import { ExtractListComponent } from '../extract-list/extract-list.component';
import { DayEntryComponent } from '../day-entry/day-entry.component';
import { ExcelExportService } from '../services/excel-export.service';
import { HolidayService } from '../services/holiday.service';
import { PersistenceService } from '../services/persistence.service';
import { toIsoDate } from '../utils';

interface ActivityCode {
  code: string;
  description: string;
}

interface DailyHours {
  [key: string]: number;
}

interface ActivityTotals {
  [key: string]: number;
}

@Component({
  selector: 'app-monthly-report',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    ReportSummaryComponent,
    ExtractListComponent,
    DayEntryComponent,
  ],
  templateUrl: './monthly-report.component.html',
  styleUrls: ['./monthly-report.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonthlyReportComponent implements OnInit, OnDestroy {
  private readonly excelExportService = inject(ExcelExportService);
  private readonly holidayService = inject(HolidayService);
  private readonly persistenceService = inject(PersistenceService);

  readonly employeeName = signal('Thomas Rognoni');
  readonly currentMonth = signal(new Date());

  readonly activityCodes = signal<ActivityCode[]>([
    { code: 'D', description: 'Giorni Lavorativi Designer' },
    { code: 'AA', description: 'Altre attività' },
    { code: 'ST', description: 'Straordinari' },
    { code: 'F', description: 'Ferie' },
    { code: 'PE', description: 'Permessi/ex Festività' },
    { code: 'MA', description: 'Malattia' },
    { code: 'L104', description: 'Permessi retribuiti L.104' },
  ]);

  readonly extracts = signal<Extract[]>([
    {
      id: 'ESA3582021',
      code: 'D',
      description: 'MONTE DEI PASCHI',
      client: 'MPS',
      totalDays: 0,
    },
    {
      id: 'BD0002022S',
      code: 'D',
      description: 'BANCO DI DESIO',
      client: 'BdD',
      totalDays: 0,
    },
    {
      id: 'ESA9992024S',
      code: 'D',
      description: 'BCC',
      client: 'BCC',
      totalDays: 0,
    },
    {
      id: 'ESAPAM2024S',
      code: 'D',
      description: 'PAM',
      client: 'PAM',
      totalDays: 0,
    },
    {
      id: 'ESA9982024S',
      code: 'D',
      description: 'FormIO',
      client: 'MEDIOLANUM',
      totalDays: 0,
    },
  ]);

  readonly days = signal<DayEntry[]>([]);

  readonly totalHours = computed(() =>
    this.days().reduce((sum, day) => {
      return sum + (day.prefilled ? 0 : day.hours);
    }, 0)
  );

  readonly dailyHours = computed((): DailyHours => {
    const dailyTotals: DailyHours = {};
    this.days().forEach((day) => {
      const dateKey = day.date.toDateString();
      dailyTotals[dateKey] = (dailyTotals[dateKey] || 0) + day.hours;
    });
    return dailyTotals;
  });

  readonly hasExceededDailyLimit = computed(() => {
    const exceeded = Object.values(this.dailyHours()).some(
      (hours) => hours > 8
    );
    return exceeded;
  });

  readonly totalWorkDays = computed(() => {
    const month = this.currentMonth();
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    let count = 0;

    const date = new Date(year, monthIndex, 1);

    while (date.getMonth() === monthIndex) {
      const dayOfWeek = date.getDay();
      const isoDate = toIsoDate(date);

      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = this.holidayService.isHoliday(isoDate);

      if (!isWeekend && !isHoliday) {
        count++;
      }

      date.setDate(date.getDate() + 1);
    }

    return count;
  });

  readonly totalDeclaredHours = computed(() =>
    this.days().reduce((sum, day) => {
      return sum + day.hours;
    }, 0)
  );

  readonly totalDeclaredDays = computed(() => {
    const uniqueDates = new Set(
      this.days().map((day) => day.date.toDateString())
    );
    return uniqueDates.size;
  });

  readonly quadrature = computed(
    () => this.totalWorkDays() - this.totalDeclaredDays()
  );

  readonly overtime = computed(() => {
    const overtimeDays = this.days().filter((day) => day.code === 'ST');
    return overtimeDays.reduce((sum, day) => sum + day.hours, 0);
  });

  readonly activityTotals = computed((): ActivityTotals => {
    const totals: ActivityTotals = {};
    this.activityCodes().forEach((activity) => {
      const totalHours = this.days()
        .filter((day) => day.code === activity.code)
        .reduce((sum, day) => sum + day.hours, 0);
      totals[activity.code] = totalHours / 8;
    });
    return totals;
  });

  readonly activityDays = computed((): ActivityTotals => {
    const daysMap: ActivityTotals = {};
    const totals = this.activityTotals();
    Object.keys(totals).forEach((code) => {
      daysMap[code] = totals[code];
    });
    return daysMap;
  });

  readonly extractTotals = computed((): ActivityTotals => {
    const totals: ActivityTotals = {};
    this.extracts().forEach((extract) => {
      const totalHours = this.days()
        .filter((day) => day.extract === extract.id)
        .reduce((sum, day) => sum + day.hours, 0);
      totals[extract.id] = totalHours;
    });
    return totals;
  });

  readonly isMonthFullyFilled = computed(() => {
    const month = this.currentMonth();
    const year = month.getFullYear();
    const monthIndex = month.getMonth();

    const workDateKeys: string[] = [];
    const cursor = new Date(year, monthIndex, 1);

    while (cursor.getMonth() === monthIndex) {
      const dayOfWeek = cursor.getDay();
      const isoDate = toIsoDate(cursor);
      if (
        dayOfWeek !== 0 &&
        dayOfWeek !== 6 &&
        !this.holidayService.isHoliday(isoDate)
      ) {
        workDateKeys.push(cursor.toDateString());
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    const dailyHours: DailyHours = {};
    this.days().forEach((entry) => {
      const normalizedDate = new Date(
        entry.date.getFullYear(),
        entry.date.getMonth(),
        entry.date.getDate()
      );
      const key = normalizedDate.toDateString();
      dailyHours[key] = (dailyHours[key] || 0) + entry.hours;
    });

    return workDateKeys.every((key) => (dailyHours[key] || 0) === 8);
  });

  readonly allDaysValid = computed(() => {
    const daysValid = this.days().every((day) => {
      const hasValidCode = day.code?.trim() && day.code.length > 0;
      const hasValidHours =
        !isNaN(day.hours) && day.hours >= 0 && day.hours <= 8;

      return hasValidCode && hasValidHours;
    });

    const noExceededLimit = !this.hasExceededDailyLimit();

    return daysValid && noExceededLimit;
  });

  readonly validationStatus = computed(() => {
    const invalidDays = this.days().filter((day) => {
      return (
        !day.code?.trim() || day.hours <= 0 || isNaN(day.hours) || day.hours > 8
      );
    });

    return {
      isValid: invalidDays.length === 0 && !this.hasExceededDailyLimit(),
      invalidDays: invalidDays,
      exceededDays: this.getExceededDays(),
    };
  });

  private getCurrentMonthKey(): string {
    const month = this.currentMonth();
    return `${month.getFullYear()}-${(month.getMonth() + 1)
      .toString()
      .padStart(2, '0')}`;
  }

  ngOnInit(): void {
    this.days.set([]);
    try {
      const saved = this.persistenceService.getEmployeeName();
      if (saved) this.employeeName.set(saved);
    } catch (e) {
    }
  }

  ngOnDestroy(): void {
    this.saveCurrentData();
  }

  private saveCurrentData(): void {
    const monthKey = this.getCurrentMonthKey();
    const currentData = this.days();

    if (currentData.length > 0) {
      this.persistenceService.saveMonthlyData(monthKey, currentData);
    } else {
      this.persistenceService.clearMonthlyData(monthKey);
    }
  }

  updateDayEntry(event: {
    index: number;
    field: keyof DayEntry;
    value: any;
  }): void {
    this.days.update((days) =>
      days.map((day, i) =>
        i === event.index ? { ...day, [event.field]: event.value } : day
      )
    );
    this.saveCurrentData();
  }

  removeDayEntry(index: number): void {
    this.days.update((days) => days.filter((_, i) => i !== index));
    this.saveCurrentData();
  }

  addDayEntry(): void {
    const newEntry: DayEntry = {
      date: new Date(),
      code: 'D',
      activity: '',
      hours: 1,
      notes: '',
    };
    this.days.update((days) => [...days, newEntry]);
    this.saveCurrentData();
  }

  onMonthChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.value) {
      this.saveCurrentData();

      const newDate = new Date(input.value + '-01');
      this.currentMonth.set(newDate);

      this.days.set([]);
    }
  }

  loadTemplate(): void {
    const selectedMonth = this.currentMonth();
    const year = selectedMonth.getFullYear();
    const monthIndex = selectedMonth.getMonth();
    const monthNumber = monthIndex + 1;

    const firstDay = new Date(year, monthIndex, 1);
    const lastDay = new Date(year, monthIndex + 1, 0);

    const daysInMonth = lastDay.getDate();

    const holidays = this.holidayService.getHolidaysForMonth(year, monthNumber);
    const holidayDates = new Set(holidays.map((h) => h.date));

    const workDays: DayEntry[] = [];
    let weekendCount = 0;
    let holidayCount = 0;
    let workdayCount = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));

      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      const isoDate = toIsoDate(date);

      const isHoliday = this.holidayService.isHoliday(isoDate);
      const holidayInfo = holidays.find((h) => h.date === isoDate);

      if (isWeekend || isHoliday) {
        if (isWeekend) {
          weekendCount++;
        } else {
          holidayCount++;
        }
        continue;
      }

      workDays.push({
        date: new Date(date),
        code: 'D',
        activity: '',
        hours: 8,
        notes: '',
        extract: '',
        client: '',
        prefilled: true,
      });
      workdayCount++;
    }

    workDays.sort((a, b) => a.date.getTime() - b.date.getTime());

    this.days.set(workDays);
    this.saveCurrentData();

    alert(`Template del mese caricato`);
  }

  private getDayName(dayOfWeek: number): string {
    const days = [
      'Domenica',
      'Lunedì',
      'Martedì',
      'Mercoledì',
      'Giovedì',
      'Venerdì',
      'Sabato',
    ];
    return days[dayOfWeek];
  }

  getFormattedMonth(): string {
    return this.currentMonth().toISOString().substring(0, 7);
  }

  getDailyHoursForDate(date: Date): number {
    return this.dailyHours()[date.toDateString()] || 0;
  }

  isHoliday(date: Date): boolean {
    return this.holidayService.isHoliday(toIsoDate(date));
  }

  getHolidayDescription(date: Date): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const isoDate = toIsoDate(date);

    const holidays = this.holidayService.getHolidaysForMonth(year, month);
    const holiday = holidays.find((h) => h.date === isoDate);

    return holiday?.reason || '';
  }

  getCurrentMonthHolidays(): any[] {
    const month = this.currentMonth();
    const year = month.getFullYear();
    const monthNumber = month.getMonth() + 1;

    return this.holidayService.getHolidaysForMonth(year, monthNumber);
  }

  formatHolidayDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  getExceededDays(): { date: string; hours: number }[] {
    const exceeded: { date: string; hours: number }[] = [];
    Object.entries(this.dailyHours()).forEach(([date, hours]) => {
      if (hours > 8) {
        exceeded.push({
          date: new Date(date).toLocaleDateString('it-IT'),
          hours: hours,
        });
      }
    });
    return exceeded;
  }

  exportToExcel(): void {
    const validation = this.validationStatus();

    if (!validation.isValid || !this.isMonthFullyFilled()) {
      this.showExportError();
      return;
    }

    const exportData = {
      employeeName: this.employeeName(),
      month: new Date(this.currentMonth()),
      days: this.days().map((day) => ({
        ...day,
        date: new Date(day.date),
      })),
      extracts: this.extracts(),
      activityTotals: this.activityTotals(),
      extractTotals: this.extractTotals(),
      totalWorkDays: this.totalWorkDays(),
      totalDeclaredDays: this.totalDeclaredDays(),
      totalDeclaredHours: this.totalDeclaredHours(),
      quadrature: this.quadrature(),
      overtime: this.overtime(),
      activityCodes: this.activityCodes(),
      holidays: this.getCurrentMonthHolidays(),
    };

    const exportButton = document.querySelector(
      '.btn-export'
    ) as HTMLButtonElement;
    const originalText = exportButton?.textContent || '🚀 Esporta in Excel';

    if (exportButton) {
      exportButton.textContent = '⏳ Generando Excel...';
      exportButton.disabled = true;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.excelExportService
          .generateExcel(exportData)
          .then(() => {
            alert('File Excel generato con successo!');
          })
          .catch((error) => {
            console.error("Errore nell'esportazione:", error);

            let errorMessage = 'Errore nella generazione del file Excel. ';

            if (error.message.includes('Template non trovato')) {
              errorMessage +=
                '\n\nIl file template non è stato trovato. Assicurati che il file esista nella cartella assets/templates/';
            } else {
              errorMessage += `\n\nDettaglio: ${error.message}`;
            }

            alert(errorMessage);
          })
          .finally(() => {
            if (exportButton) {
              exportButton.textContent = originalText;
              exportButton.disabled = false;
            }
          });
      });
    });
  }

  onEmployeeNameChange(value: string): void {
    this.employeeName.set(value || '');
    try {
      this.persistenceService.saveEmployeeName(value || '');
    } catch (e) {
    }
  }

  private showExportError(): void {
    const validation = this.validationStatus();

    let errorMessage = `Impossibile esportare. Ci sono ${validation.invalidDays.length} giorni non validi.\n\n`;
    errorMessage += `Assicurati che tutti i giorni abbiano:\n`;
    errorMessage += `• Codice attività selezionato\n`;
    errorMessage += `• Ore inserite (tra 0.125 e 8)\n`;

    if (validation.invalidDays.length > 0) {
      errorMessage += `\nGiorni non validi:\n`;
      validation.invalidDays.forEach((day) => {
        errorMessage += `  - ${day.date.toLocaleDateString('it-IT')}: ${
          day.code
        } - ${day.hours} ore\n`;
      });
    }

    if (this.hasExceededDailyLimit()) {
      errorMessage += `• Non più di 8 ore totali per giorno\n`;

      validation.exceededDays.forEach((day) => {
        errorMessage += `  - ${day.date}: ${day.hours} ore\n`;
      });
    }

    if (!this.isMonthFullyFilled()) {
      const month = this.currentMonth();
      const year = month.getFullYear();
      const monthNumber = month.getMonth() + 1;
      const holidays = this.holidayService.getHolidaysForMonth(
        year,
        monthNumber
      );

      errorMessage += `• Inserisci ore per tutti i giorni lavorativi del mese\n`;
      errorMessage += `  Giorni lavorativi totali: ${this.totalWorkDays()}\n`;
      errorMessage += `  Giorni dichiarati: ${this.totalDeclaredDays()}\n`;
      if (holidays.length > 0) {
        errorMessage += `  Festività considerate: ${holidays.length}\n`;
      }
    }

    alert(errorMessage);
  }

  debugValidation(): void {
    this.days().forEach((day, index) => {
      void day;
      void index;
    });
  }
}

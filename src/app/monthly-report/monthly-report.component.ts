import { Component, ChangeDetectionStrategy, computed, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { DayEntry, Extract } from '../models/day-entry.model';
import { ReportSummaryComponent } from '../report-summary/report-summary.component';
import { ExtractListComponent } from '../extract-list/extract-list.component';
import { DayEntryComponent } from '../day-entry/day-entry.component';
import { ExcelExportService } from '../services/excel-export.service';
import { HolidayService } from '../services/holiday.service';
import { PersistenceService } from '../services/persistence.service'; // AGGIUNTO

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
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MonthlyReportComponent implements OnInit, OnDestroy { // AGGIUNTO OnInit e OnDestroy
  private readonly excelExportService = inject(ExcelExportService);
  private readonly holidayService = inject(HolidayService);
  private readonly persistenceService = inject(PersistenceService); // AGGIUNTO

  // Signals
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

  // AGGIUNTO: Segnale per tracciare se i dati sono stati caricati
  private readonly dataLoaded = signal(false);

  // Computed signals
  readonly totalHours = computed(() =>
    this.days().reduce((sum, day) => {
      if (day.code === 'PE') {
        return sum;
      }
      return sum + (day.prefilled ? 0 : day.hours);
    }, 0)
  );

  readonly dailyHours = computed((): DailyHours => {
    const dailyTotals: DailyHours = {};
    this.days().forEach(day => {
      if (day.code === 'PE') return;
      const dateKey = day.date.toDateString();
      dailyTotals[dateKey] = (dailyTotals[dateKey] || 0) + day.hours;
    });
    return dailyTotals;
  });

  readonly hasExceededDailyLimit = computed(() =>
    Object.values(this.dailyHours()).some(hours => hours > 8)
  );

  readonly totalWorkDays = computed(() => {
    const month = this.currentMonth();
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    let count = 0;
    
    const date = new Date(year, monthIndex, 1);
    
    while (date.getMonth() === monthIndex) {
      const dayOfWeek = date.getDay();
      const isoDate = `${year}-${(monthIndex + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
      
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
      if (day.code === 'PE') {
        return sum;
      }
      return sum + day.hours;
    }, 0)
  );

  readonly totalDeclaredDays = computed(() => {
    const uniqueDates = new Set(
      this.days()
        .filter(day => day.code !== 'PE')
        .map(day => day.date.toDateString())
    );
    return uniqueDates.size;
  });

  readonly quadrature = computed(() => this.totalWorkDays() - this.totalDeclaredDays());

  readonly overtime = computed(() => {
    const overtimeDays = this.days().filter(day => day.code === 'ST');
    return overtimeDays.reduce((sum, day) => sum + day.hours, 0);
  });

  readonly activityTotals = computed((): ActivityTotals => {
    const totals: ActivityTotals = {};
    this.activityCodes().forEach(activity => {
      totals[activity.code] = this.days()
        .filter(day => day.code === activity.code)
        .reduce((sum, day) => sum + day.hours, 0);
    });
    return totals;
  });

  readonly activityDays = computed((): ActivityTotals => {
    const daysMap: ActivityTotals = {};
    const totals = this.activityTotals();
    Object.keys(totals).forEach(code => {
      daysMap[code] = totals[code] / 8;
    });
    return daysMap;
  });

  readonly extractTotals = computed((): ActivityTotals => {
    const totals: ActivityTotals = {};
    this.extracts().forEach(extract => {
      totals[extract.id] = this.days()
        .filter(day => day.extract === extract.id)
        .reduce((sum, day) => sum + day.hours, 0);
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
      const isoDate = `${year}-${(monthIndex + 1).toString().padStart(2, '0')}-${cursor.getDate().toString().padStart(2, '0')}`;
      
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !this.holidayService.isHoliday(isoDate)) {
        workDateKeys.push(cursor.toDateString());
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    const dailyHours: DailyHours = {};
    this.days().forEach(entry => {
      if (entry.code === 'PE') return;
      
      const normalizedDate = new Date(
        entry.date.getFullYear(),
        entry.date.getMonth(),
        entry.date.getDate()
      );
      const key = normalizedDate.toDateString();
      dailyHours[key] = (dailyHours[key] || 0) + entry.hours;
    });

    return workDateKeys.every(key => (dailyHours[key] || 0) === 8);
  });

  readonly allDaysValid = computed(() => {
    const daysValid = this.days().every(day => {
      if (day.code === 'PE') {
        return day.hours === 8;
      }
      
      return day.code?.trim() && 
             day.hours > 0 && 
             !isNaN(day.hours) &&
             day.hours <= 8;
    });
    
    return daysValid && !this.hasExceededDailyLimit();
  });

  // AGGIUNTO: Metodo per ottenere la chiave del mese corrente
  private getCurrentMonthKey(): string {
    const month = this.currentMonth();
    return `${month.getFullYear()}-${(month.getMonth() + 1).toString().padStart(2, '0')}`;
  }

  // AGGIUNTO: OnInit per caricare i dati salvati
  ngOnInit(): void {
    this.loadSavedData();
  }

  // AGGIUNTO: OnDestroy per salvare i dati quando si lascia la pagina
  ngOnDestroy(): void {
    this.saveCurrentData();
  }

  // AGGIUNTO: Carica i dati salvati per il mese corrente
  private loadSavedData(): void {
    const monthKey = this.getCurrentMonthKey();
    const savedData = this.persistenceService.getMonthlyData(monthKey);
    
    if (savedData.length > 0) {
      this.days.set(savedData);
      this.dataLoaded.set(true);
      console.log(`Dati caricati per il mese: ${monthKey}`, savedData);
    } else {
      this.dataLoaded.set(false);
    }
  }

  // AGGIUNTO: Salva i dati correnti
  private saveCurrentData(): void {
    const monthKey = this.getCurrentMonthKey();
    const currentData = this.days();
    
    if (currentData.length > 0) {
      this.persistenceService.saveMonthlyData(monthKey, currentData);
      console.log(`Dati salvati per il mese: ${monthKey}`, currentData);
    }
  }

  // MODIFICATO: Salva i dati quando si aggiunge/modifica/rimuove
  updateDayEntry(event: { index: number; field: keyof DayEntry; value: any }): void {
    this.days.update(days =>
      days.map((day, i) =>
        i === event.index ? { ...day, [event.field]: event.value } : day
      )
    );
    this.saveCurrentData(); // AGGIUNTO
  }

  removeDayEntry(index: number): void {
    this.days.update(days => days.filter((_, i) => i !== index));
    this.saveCurrentData(); // AGGIUNTO
  }

  addDayEntry(): void {
    const newEntry: DayEntry = {
      date: new Date(),
      code: 'D',
      activity: '',
      hours: 1,
      notes: '',
    };
    this.days.update(days => [...days, newEntry]);
    this.saveCurrentData(); // AGGIUNTO
  }

  // MODIFICATO: Quando cambia il mese, carica i dati per quel mese
  onMonthChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.value) {
      // Salva i dati del mese corrente prima di cambiare
      this.saveCurrentData();
      
      const newDate = new Date(input.value + '-01');
      this.currentMonth.set(newDate);
      
      // Carica i dati per il nuovo mese
      this.loadSavedData();
    }
  }

  // MODIFICATO: Quando si carica il template, sovrascrivi i dati esistenti
  loadTemplate(): void {
    const selectedMonth = this.currentMonth();
    const year = selectedMonth.getFullYear();
    const monthIndex = selectedMonth.getMonth();
    const monthNumber = monthIndex + 1;

    console.log(`Caricamento template per: ${selectedMonth.toLocaleDateString('it-IT', {
      month: 'long',
      year: 'numeric',
    })}`);

    const firstDay = new Date(year, monthIndex, 1);
    const lastDay = new Date(year, monthIndex + 1, 0);
    
    const daysInMonth = lastDay.getDate();
    
    const holidays = this.holidayService.getHolidaysForMonth(year, monthNumber);
    const holidayDates = new Set(holidays.map(h => h.date));
    
    const workDays: DayEntry[] = [];
    let weekendCount = 0;
    let holidayCount = 0;
    let workdayCount = 0;

    console.log(`Range del mese: ${firstDay.toLocaleDateString('it-IT')} - ${lastDay.toLocaleDateString('it-IT')}`);
    console.log(`Giorni totali nel mese: ${daysInMonth}`);
    console.log(`Festività trovate:`, holidays);

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));
      
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      const isoDate = `${year}-${monthNumber.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      
      const isHoliday = this.holidayService.isHoliday(isoDate);
      const holidayInfo = holidays.find(h => h.date === isoDate);

      if (isWeekend || isHoliday) {
        if (isWeekend) {
          console.log(`❌ Saltato WEEKEND: ${date.toLocaleDateString('it-IT')} (${this.getDayName(dayOfWeek)})`);
          weekendCount++;
        } else {
          console.log(`❌ Saltato FESTIVITÀ: ${date.toLocaleDateString('it-IT')} - ${holidayInfo?.reason || 'Festività'}`);
          holidayCount++;
        }
        continue;
      }

      workDays.push({
        date: new Date(date),
        code: 'D',
        activity: 'Accessibilità PAM',
        hours: 8,
        notes: '',
        extract: 'ESAPAM2024S',
        client: 'PAM',
        prefilled: true
      });
      workdayCount++;
      console.log(`✅ Aggiunto giorno LAVORATIVO: ${date.toLocaleDateString('it-IT')}`);
    }

    console.log(`📊 RISULTATO FINALE:
      - Giorni totali nel mese: ${daysInMonth}
      - Weekend esclusi: ${weekendCount}
      - Festività escluse: ${holidayCount}
      - Giorni lavorativi (D) inseriti: ${workdayCount}
      - Totale voci create: ${workDays.length}`);

    workDays.sort((a, b) => a.date.getTime() - b.date.getTime());
    
    // MODIFICATO: Aggiorna i giorni e salva automaticamente
    this.days.set(workDays);
    this.saveCurrentData();
    
    const monthName = selectedMonth.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
    
    const firstEntryDate = workDays[0]?.date.toLocaleDateString('it-IT') || 'Nessuna';
    const lastEntryDate = workDays[workDays.length - 1]?.date.toLocaleDateString('it-IT') || 'Nessuna';
    
    alert(`✅ TEMPLATE CARICATO: ${monthName}\n\n` +
          `📅 Periodo mese: ${firstDay.toLocaleDateString('it-IT')} - ${lastDay.toLocaleDateString('it-IT')}\n` +
          `📝 Giorni lavorativi inseriti: ${firstEntryDate} - ${lastEntryDate}\n` +
          `👨‍💻 Giorni lavorativi (D): ${workdayCount}\n` +
          `🎄 Festività escluse: ${holidayCount}\n` +
          `🏖️  Weekend esclusi: ${weekendCount}\n` +
          `📊 Totale giorni inseriti: ${workDays.length}`);
  }

  // Resto del codice rimane invariato...
  private getDayName(dayOfWeek: number): string {
    const days = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
    return days[dayOfWeek];
  }

  getFormattedMonth(): string {
    return this.currentMonth().toISOString().substring(0, 7);
  }

  getDailyHoursForDate(date: Date): number {
    return this.dailyHours()[date.toDateString()] || 0;
  }

  isHoliday(date: Date): boolean {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const isoDate = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    
    return this.holidayService.isHoliday(isoDate);
  }

  getHolidayDescription(date: Date): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const isoDate = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    
    const holidays = this.holidayService.getHolidaysForMonth(year, month);
    const holiday = holidays.find(h => h.date === isoDate);
    
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
      year: 'numeric'
    });
  }

  getExceededDays(): { date: string; hours: number }[] {
    const exceeded: { date: string; hours: number }[] = [];
    Object.entries(this.dailyHours()).forEach(([date, hours]) => {
      if (hours > 8) {
        exceeded.push({
          date: new Date(date).toLocaleDateString('it-IT'),
          hours: hours
        });
      }
    });
    return exceeded;
  }

  exportToExcel(): void {
    if (!this.allDaysValid() || !this.isMonthFullyFilled()) {
      this.showExportError();
      return;
    }

    if (this.days().length === 0) {
      alert('Non ci sono dati da esportare.');
      return;
    }

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
      activityCodes: this.activityCodes(),
      holidays: this.getCurrentMonthHolidays()
    };

    this.excelExportService.generateExcel(exportData);
  }

  private showExportError(): void {
    const invalidDays = this.days().filter(day => 
      !day.code?.trim() || day.hours <= 0 || isNaN(day.hours) || day.hours > 8
    );
    
    let errorMessage = `Impossibile esportare. Ci sono ${invalidDays.length} giorni non validi.\n\n`;
    errorMessage += `Assicurati che tutti i giorni abbiano:\n`;
    errorMessage += `• Codice attività selezionato\n`;
    errorMessage += `• Ore inserite (tra 1 e 8)\n`;
    
    if (this.hasExceededDailyLimit() || !this.isMonthFullyFilled()) {
      errorMessage += `• Non più di 8 ore totali per giorno\n`;
      
      Object.entries(this.dailyHours()).forEach(([date, hours]) => {
        if (hours > 8) {
          errorMessage += `  - ${new Date(date).toLocaleDateString('it-IT')}: ${hours} ore\n`;
        }
      });
    }

    if (!this.isMonthFullyFilled()) {
      const month = this.currentMonth();
      const year = month.getFullYear();
      const monthNumber = month.getMonth() + 1;
      const holidays = this.holidayService.getHolidaysForMonth(year, monthNumber);
      
      errorMessage += `• Inserisci 8 ore per tutti i giorni lavorativi del mese\n`;
      errorMessage += `  Giorni lavorativi totali: ${this.totalWorkDays()}\n`;
      errorMessage += `  Giorni dichiarati: ${this.totalDeclaredDays()}\n`;
      if (holidays.length > 0) {
        errorMessage += `  Festività considerate: ${holidays.length}\n`;
      }
    }
    
    alert(errorMessage);
  }
}
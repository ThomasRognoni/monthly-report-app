import {
  Component,
  ChangeDetectionStrategy,
  computed,
  signal,
  inject,
  OnInit,
  OnDestroy,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { DayEntry, Extract, Task } from '../models/day-entry.model';
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
    DayEntryComponent,
  ],
  templateUrl: './monthly-report.component.html',
  styleUrls: ['./monthly-report.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush as const,
})
export class MonthlyReportComponent implements OnInit, OnDestroy {
  private readonly excelExportService = inject(ExcelExportService);
  private readonly holidayService = inject(HolidayService);
  private readonly persistenceService = inject(PersistenceService);

  readonly employeeName = signal('Thomas Rognoni');
  readonly currentMonth = signal(new Date());
  readonly adminEmail = signal('amministrazione@beyondoc.net');
  readonly showExtractManager = signal(false);
  newExtractId = signal('');
  newExtractCode = signal('');
  newExtractDesc = signal('');
  newExtractClient = signal('');
  editingExtractId = signal<string | null>(null);

  readonly showHolidayManager = signal(false);

  lastActionMessage = signal('');
  holidayDateModel = signal('');
  holidayReasonModel = signal('');

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

  readonly sortedExtracts = computed(() => {
    return [...this.extracts()].sort((a, b) => {
      const ca = (a.client || '').toString();
      const cb = (b.client || '').toString();
      return ca.localeCompare(cb);
    });
  });

  readonly days = signal<DayEntry[]>([]);

  readonly totalHours = computed(() =>
    this.days().reduce((sum, day) => {
      return sum + (day.prefilled ? 0 : day.hours);
    }, 0),
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
      (hours) => hours > 8,
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
    this.days().reduce((sum, day) => sum + (day.hours || 0), 0),
  );

  readonly totalDeclaredDays = computed(() => {
    const uniqueDates = new Set(
      this.days().map((day) => day.date.toDateString()),
    );
    return uniqueDates.size;
  });

  readonly quadrature = computed(
    () => this.totalWorkDays() - this.totalDeclaredDays(),
  );

  readonly overtime = computed(() => {
    return this.days()
      .flatMap((d) => d.tasks || [])
      .filter((t) => t.code === 'ST')
      .reduce((s, t) => s + (t.hours || 0), 0);
  });

  readonly activityTotals = computed((): ActivityTotals => {
    const totals: ActivityTotals = {};
    this.activityCodes().forEach((activity) => {
      const totalHours = this.days()
        .flatMap((d) => d.tasks || [])
        .filter((t) => t.code === activity.code)
        .reduce((sum, t) => sum + (t.hours || 0), 0);
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

  readonly persistCurrentMonthEffect = effect(() => {
    const key = this.getCurrentMonthKey();
    try {
      this.persistenceService.saveCurrentMonthKey(key);
    } catch (e) {}
  });

  readonly persistDaysEffect = effect(() => {
    const d = this.days();
    const key = this.getCurrentMonthKey();
    if (d && key) {
      if (d.length > 0) {
        try {
          const existing = this.persistenceService.getMonthlyData(key) || [];
          if (!this.areDaysEqual(existing, d)) {
            this.persistenceService.saveMonthlyData(key, d);
          }
        } catch (e) {
          this.persistenceService.saveMonthlyData(key, d);
        }
      }
    }
  });

  // Persist simple UI state (e.g., holiday input values) on change
  readonly persistUiStateEffect = effect(() => {
    const hd = this.holidayDateModel();
    const hr = this.holidayReasonModel();
    try {
      this.persistenceService.saveUiState({
        holidayDateModel: hd || '',
        holidayReasonModel: hr || '',
      });
    } catch (e) {}
  });

  private areDaysEqual(
    a: DayEntry[] | null | undefined,
    b: DayEntry[] | null | undefined,
  ): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const da = a[i];
      const db = b[i];
      if (!da || !db) return false;
      if (
        (da.date?.getTime?.() || new Date(da.date).getTime()) !==
        (db.date?.getTime?.() || new Date(db.date).getTime())
      )
        return false;
      if ((da.hours || 0) !== (db.hours || 0)) return false;
      if ((da.code || '') !== (db.code || '')) return false;
      const ta = (da.tasks || []).map((t) => ({ ...t }));
      const tb = (db.tasks || []).map((t) => ({ ...t }));
      if (JSON.stringify(ta) !== JSON.stringify(tb)) return false;
    }
    return true;
  }

  readonly extractTotals = computed((): ActivityTotals => {
    const totals: ActivityTotals = {};
    this.extracts().forEach((extract) => {
      const totalHours = this.days()
        .flatMap((d) => d.tasks || [])
        .filter((t) => t.extract === extract.id)
        .reduce((sum, t) => sum + (t.hours || 0), 0);
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
        entry.date.getDate(),
      );
      const key = normalizedDate.toDateString();
      dailyHours[key] = (dailyHours[key] || 0) + entry.hours;
    });

    return workDateKeys.every((key) => (dailyHours[key] || 0) === 8);
  });

  readonly allDaysValid = computed(() => {
    const daysValid = this.days().every((day) => {
      const tasks = day.tasks || [
        {
          code: day.code,
          hours: day.hours,
        },
      ];

      const allTasksValid = tasks.every((t) => {
        const hasValidCode = !!t.code && t.code.trim().length > 0;
        const hasValidHours = !isNaN(t.hours) && t.hours >= 0 && t.hours <= 8;
        return hasValidCode && hasValidHours;
      });

      return allTasksValid;
    });

    const noExceededLimit = !this.hasExceededDailyLimit();

    return daysValid && noExceededLimit;
  });

  readonly validationStatus = computed(() => {
    const invalidDays = this.days().filter((day) => {
      const tasks = day.tasks || [{ code: day.code, hours: day.hours }];
      const hasInvalidTask = tasks.some(
        (t) => !t.code?.trim() || t.hours <= 0 || isNaN(t.hours) || t.hours > 8,
      );
      return hasInvalidTask;
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
    try {
      const savedKey = this.persistenceService.getCurrentMonthKey();
      console.debug('MonthlyReport.ngOnInit: persisted key=', savedKey);
      if (savedKey) {
        const parts = savedKey.split('-');
        if (parts.length === 2) {
          const yyyy = parseInt(parts[0], 10);
          const mm = parseInt(parts[1], 10) - 1;
          const restored = new Date(yyyy, mm, 1);
          this.currentMonth.set(restored);
        }
      } else {
        const today = new Date();
        const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        this.currentMonth.set(firstOfMonth);
        try {
          this.persistenceService.saveCurrentMonthKey(
            this.getCurrentMonthKey(),
          );
        } catch (e) {}
      }

      const saved = this.persistenceService.getMonthlyData(
        this.getCurrentMonthKey(),
      );
      console.debug(
        'MonthlyReport.ngOnInit: loaded saved days length=',
        saved?.length || 0,
      );
      try {
        if (saved && saved.length > 0)
          console.debug(
            'MonthlyReport.ngOnInit sample[0]=',
            JSON.stringify(saved[0]).slice(0, 1000),
          );
      } catch (e) {}

      const firstLoadFlag = sessionStorage.getItem('monthlyReportFirstLoad');
      if (!firstLoadFlag) {
        sessionStorage.setItem('monthlyReportFirstLoad', '1');
        this.days.set([]);
      } else {
        const saved = this.persistenceService.getMonthlyData(
          this.getCurrentMonthKey(),
        );
        if (saved && Array.isArray(saved) && saved.length > 0) {
          this.days.set(saved as DayEntry[]);
        } else {
          this.days.set([]);
        }
      }
    } catch (e) {
      console.debug('MonthlyReport.ngOnInit: error reading saved days', e);
      this.days.set([]);
    }

    try {
      const saved = this.persistenceService.getEmployeeName();
      if (saved) this.employeeName.set(saved);
      const savedExtracts = this.persistenceService.getExtracts();
      if (
        savedExtracts &&
        Array.isArray(savedExtracts) &&
        savedExtracts.length > 0
      ) {
        this.extracts.set(savedExtracts as Extract[]);
      }
      const savedEmail = this.persistenceService.getAdminEmail();
      if (savedEmail) this.adminEmail.set(savedEmail);
      // Restore small UI state (holiday inputs, etc.)
      try {
        const ui = this.persistenceService.getUiState() || {};
        if (ui) {
          this.holidayDateModel.set(ui.holidayDateModel || '');
          this.holidayReasonModel.set(ui.holidayReasonModel || '');
        }
      } catch (e) {}
    } catch (e) {}

    try {
      this.persistenceService.saveCurrentMonthKey(this.getCurrentMonthKey());
    } catch (e) {}

    try {
      this.persistenceService.changes.addEventListener('change', (e: any) => {
        try {
          if (e?.detail?.type === 'monthlyData') {
            const changedMonth = e.detail.month;
            const current = this.getCurrentMonthKey();
            console.debug(
              'MonthlyReport: persistence change',
              e.detail,
              'currentKey=',
              current,
            );
            if (changedMonth && current && changedMonth === current) {
              const saved = this.persistenceService.getMonthlyData(current);
              console.debug(
                'MonthlyReport: reloading days for',
                current,
                'len=',
                saved?.length || 0,
              );
              try {
                if (saved && saved.length > 0)
                  console.debug(
                    'MonthlyReport: reload sample[0]=',
                    JSON.stringify(saved[0]).slice(0, 1000),
                  );
              } catch (e) {}
              this.days.set(saved as DayEntry[]);
            }
          }
        } catch (err) {}
      });
    } catch (e) {}
  }

  trackByHoliday(index: number, item: any): string {
    return item?.date || index.toString();
  }

  ngOnDestroy(): void {
    this.saveCurrentData();
  }

  private saveCurrentData(): void {
    const monthKey = this.getCurrentMonthKey();
    const currentData = this.days();

    try {
      if (currentData.length > 0) {
        this.persistenceService.saveMonthlyData(monthKey, currentData);
        try {
          this.persistenceService.saveCurrentMonthKey(monthKey);
        } catch (e) {}
      }
    } catch (e) {}
  }

  updateDayEntry(event: {
    index: number;
    field: keyof DayEntry;
    value: any;
  }): void {
    this.days.update((days) =>
      days.map((day, i) => {
        if (i !== event.index) return day;

        if (event.field === 'tasks') {
          const tasks: Task[] = event.value || [];
          const totalHours = tasks.reduce(
            (s: number, t: Task) => s + (t.hours || 0),
            0,
          );
          return { ...day, tasks, hours: totalHours };
        }

        return { ...day, [event.field]: event.value };
      }),
    );
    this.saveCurrentData();
    try {
      const key = this.getCurrentMonthKey();
      if (key) this.persistenceService.saveMonthlyData(key, this.days());
    } catch (e) {}
  }

  removeDayEntry(index: number): void {
    this.days.update((days) => days.filter((_, i) => i !== index));
    this.saveCurrentData();
    try {
      const key = this.getCurrentMonthKey();
      if (key) this.persistenceService.saveMonthlyData(key, this.days());
    } catch (e) {}
  }

  addDayEntry(): void {
    const newEntry: DayEntry = {
      date: new Date(),
      code: 'D',
      activity: '',
      hours: 8,
      notes: '',
      tasks: [
        {
          code: 'D',
          activity: '',
          extract: '',
          client: '',
          hours: 8,
          notes: '',
        },
      ],
    };
    this.days.update((days) => [...days, newEntry]);
    this.saveCurrentData();
    try {
      const key = this.getCurrentMonthKey();
      if (key) this.persistenceService.saveMonthlyData(key, this.days());
    } catch (e) {}
  }

  onMonthChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.value) {
      this.saveCurrentData();

      const newDate = new Date(input.value + '-01');
      this.currentMonth.set(newDate);

      try {
        this.persistenceService.saveCurrentMonthKey(this.getCurrentMonthKey());
      } catch (e) {}

      try {
        const saved = this.persistenceService.getMonthlyData(
          this.getCurrentMonthKey(),
        );
        if (saved && Array.isArray(saved) && saved.length > 0) {
          this.days.set(saved as DayEntry[]);
        } else {
          this.days.set([]);
        }
      } catch (e) {
        this.days.set([]);
      }
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
        tasks: [
          {
            code: 'D',
            activity: '',
            extract: '',
            client: '',
            hours: 8,
            notes: '',
          },
        ],
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
    const m = this.currentMonth();
    const yyyy = m.getFullYear();
    const mm = (m.getMonth() + 1).toString().padStart(2, '0');
    return `${yyyy}-${mm}`;
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
      adminEmail: this.adminEmail(),
    };

    const exportButton = document.querySelector(
      '.btn-export',
    ) as HTMLButtonElement | null;
    const originalText =
      exportButton && exportButton.textContent
        ? exportButton.textContent
        : '🚀 Esporta in Excel';

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
            try {
              this.persistenceService.saveCurrentMonthKey('');
            } catch (e) {}
            try {
              this.days.set([]);
            } catch (e) {}
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

  addExtract(newExtract: Partial<Extract>): void {
    try {
      const id = (newExtract.id || '').toString().trim();
      const code = (newExtract.code || '').toString().trim();
      const description = (newExtract.description || '').toString().trim();
      const client = (newExtract.client || '').toString().trim();
      if (!id || !code) return;

      const editingId = this.editingExtractId();
      if (editingId) {
        this.extracts.update((list) => {
          const next = list.map((e) =>
            e.id === editingId ? { ...e, id, code, description, client } : e,
          );
          this.persistenceService.saveExtracts(next);
          return next;
        });
        this.lastActionMessage.set('Estratto aggiornato');
      } else {
        const extract: Extract = {
          id,
          code,
          description,
          client,
          totalDays: 0,
        };
        this.extracts.update((list) => {
          const next = [...list, extract];
          this.persistenceService.saveExtracts(next);
          return next;
        });
        this.lastActionMessage.set('Estratto aggiunto');
      }

      this.newExtractId.set('');
      this.newExtractCode.set('');
      this.newExtractDesc.set('');
      this.newExtractClient.set('');
      this.editingExtractId.set(null);
      setTimeout(() => {
        const el = document.getElementById(
          'new-extract-id',
        ) as HTMLInputElement | null;
        el?.focus();
      }, 50);
    } catch (e) {}
  }

  toggleExtractManager(): void {
    this.showExtractManager.update((v) => !v);
  }

  removeExtract(extractId: string): void {
    try {
      const ok = window.confirm("Confermi la rimozione dell'estratto?");
      if (!ok) return;
      this.extracts.update((list) => {
        const next = list.filter((e) => e.id !== extractId);
        this.persistenceService.saveExtracts(next);
        return next;
      });
      this.lastActionMessage.set('Estratto rimosso');
    } catch (e) {}
  }

  startEditExtract(ex: Extract): void {
    this.editingExtractId.set(ex.id);
    this.newExtractId.set(ex.id);
    this.newExtractCode.set(ex.code);
    this.newExtractDesc.set(ex.description || '');
    this.newExtractClient.set(ex.client || '');
    setTimeout(() => {
      const el = document.getElementById(
        'new-extract-id',
      ) as HTMLInputElement | null;
      el?.focus();
    }, 50);
  }

  cancelEditExtract(): void {
    this.editingExtractId.set(null);
    this.newExtractId.set('');
    this.newExtractCode.set('');
    this.newExtractDesc.set('');
    this.newExtractClient.set('');
    this.lastActionMessage.set('Modifica annullata');
  }

  toggleHolidayManager(): void {
    this.showHolidayManager.update((v) => !v);
    setTimeout(() => {
      const el = document.getElementById(
        'holiday-date',
      ) as HTMLInputElement | null;
      if (this.showHolidayManager()) el?.focus();
    }, 50);
  }

  saveAdminEmail(value: string): void {
    this.adminEmail.set(value || '');
    try {
      this.persistenceService.saveAdminEmail(this.adminEmail());
      this.lastActionMessage.set('Email amministrazione salvata');
    } catch (e) {}
  }

  addHoliday(dateIso: string, reason: string): void {
    if (!dateIso) return;
    const res = this.holidayService.addHoliday(
      dateIso,
      reason || 'Festività aziendale',
    );
    if (res.status === 'saved') {
    }
  }

  removeHoliday(dateIso: string): void {
    if (!dateIso) return;
    this.holidayService.removeHolidayByDate(dateIso);
  }

  applyCompanyClosures(year?: number): void {
    const y = year || this.currentMonth().getFullYear();
    this.holidayService.addHoliday(
      `${y}-08-15`,
      'Chiusura azienda - Ferragosto',
    );
    this.holidayService.addHoliday(`${y}-08-16`, 'Chiusura azienda');
    this.holidayService.addHoliday(
      `${y}-12-24`,
      'Chiusura azienda (mezza giornata)',
    );
  }

  onEmployeeNameChange(value: string): void {
    this.employeeName.set(value || '');
    try {
      this.persistenceService.saveEmployeeName(value || '');
    } catch (e) {}
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
        const dateLabel = day.date.toLocaleDateString('it-IT');
        if (day.tasks && day.tasks.length > 0) {
          errorMessage += `  - ${dateLabel}:\n`;
          day.tasks.forEach((t: any) => {
            errorMessage += `      • ${t.code || '(no code)'} - ${
              t.hours || 0
            } ore - ${t.activity || ''}\n`;
          });
        } else {
          errorMessage += `  - ${dateLabel}: ${day.code || ''} - ${
            day.hours
          } ore\n`;
        }
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
        monthNumber,
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

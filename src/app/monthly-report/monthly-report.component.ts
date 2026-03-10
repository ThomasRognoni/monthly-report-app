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
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { FileUploadModule } from 'primeng/fileupload';

import { DayEntry, Extract, Task } from '../models/day-entry.model';
import { ReportSummaryComponent } from '../report-summary/report-summary.component';
import { DayEntryComponent } from '../day-entry/day-entry.component';
import { ExcelExportService } from '../services/excel-export.service';
import { HolidayService } from '../services/holiday.service';
import { PersistenceService } from '../services/persistence.service';
import { AppLoggerService } from '../services/app-logger.service';
import { toIsoDate, hoursToDaysRounded } from '../utils';

interface ActivityCode {
  code: string;
  description: string;
}

type DayStateKey = 'completed' | 'in-progress' | 'not-started' | 'invalid';

interface DayStateLegendItem {
  key: DayStateKey;
  label: string;
  className: string;
  count: number;
}

interface DailyHours {
  [key: string]: number;
}

interface ActivityTotals {
  [key: string]: number;
}

type ActionButtonState = 'idle' | 'loading' | 'success' | 'error';

interface MonthBackupPayload {
  version: 1;
  exportedAt: string;
  monthKey: string;
  employeeName: string;
  adminEmail: string;
  extracts: Extract[];
  days: Array<{
    date: string;
    code?: string;
    activity?: string;
    extract?: string;
    client?: string;
    hours?: number;
    notes?: string;
    prefilled?: boolean;
    tasks?: Task[];
  }>;
  holidays: Array<{ date: string; reason?: string }>;
}

@Component({
  selector: 'app-monthly-report',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    ButtonModule,
    InputTextModule,
    DatePickerModule,
    FileUploadModule,
    ReportSummaryComponent,
    DayEntryComponent,
  ],
  templateUrl: './monthly-report.component.html',
  styleUrls: ['./monthly-report.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush as const,
})
export class MonthlyReportComponent implements OnInit, OnDestroy {
  private readonly REQUIRED_DAILY_HOURS = 8;
  private readonly HOURS_EPSILON = 1e-6;
  private readonly PERSIST_DEBOUNCE_MS = 120;
  private readonly localMonthlyDataWrites = new Set<string>();
  private loadTemplateFeedbackTimer?: ReturnType<typeof setTimeout>;
  private exportFeedbackTimer?: ReturnType<typeof setTimeout>;
  private pendingPersistTimer?: ReturnType<typeof setTimeout>;
  private pendingPersistPayload?: { monthKey: string; data: DayEntry[] };

  private readonly excelExportService = inject(ExcelExportService);
  private readonly holidayService = inject(HolidayService);
  private readonly persistenceService = inject(PersistenceService);
  private readonly logger = new AppLoggerService();
  private persistenceChangeHandler?: EventListener;

  readonly employeeName = signal('');
  readonly currentMonth = signal(new Date());
  readonly adminEmail = signal('amministrazione@beyondoc.net');
  readonly showExtractManager = signal(false);
  newExtractId = signal('');
  newExtractCode = signal('');
  newExtractDesc = signal('');
  newExtractClient = signal('');
  editingExtractId = signal<string | null>(null);

  readonly showHolidayManager = signal(false);
  readonly loadTemplateButtonState = signal<ActionButtonState>('idle');
  readonly exportButtonState = signal<ActionButtonState>('idle');
  readonly loadTemplateFeedback = signal('');
  readonly exportFeedback = signal('');

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
      const dateKey = toIsoDate(day.date);
      const dayHours = this.getDayTasks(day).reduce(
        (sum, task) => sum + (task.hours || 0),
        0,
      );
      dailyTotals[dateKey] = (dailyTotals[dateKey] || 0) + dayHours;
    });
    return dailyTotals;
  });

  readonly hasExceededDailyLimit = computed(() => {
    const exceeded = Object.entries(this.dailyHours()).some(
      ([isoDate, hours]) => this.hasInvalidDailyOverflow(isoDate, hours),
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
    if (!this.days() || this.days().length === 0) return 0;
    return this.roundDays(hoursToDaysRounded(this.totalDeclaredHours()));
  });

  readonly overtime = computed(() => {
    return this.days()
      .flatMap((d) => d.tasks || [])
      .filter((t) => (t.code || '').trim().toUpperCase() === 'ST')
      .reduce((s, t) => s + (t.hours || 0), 0);
  });

  readonly regularDeclaredHours = computed(() => {
    const regularHours = this.totalDeclaredHours() - this.overtime();
    return regularHours > 0 ? regularHours : 0;
  });

  readonly regularDeclaredDays = computed(() => {
    return this.roundDays(hoursToDaysRounded(this.regularDeclaredHours()));
  });

  readonly quadrature = computed(() => {
    if (!this.days() || this.days().length === 0) return 0;
    return this.roundDays(this.totalWorkDays() - this.regularDeclaredDays());
  });

  readonly activityTotals = computed((): ActivityTotals => {
    const totals: ActivityTotals = {};
    if (!this.days() || this.days().length === 0) {
      this.activityCodes().forEach((activity) => {
        totals[activity.code] = 0;
      });
      return totals;
    }
    this.activityCodes().forEach((activity) => {
      const activityHours = this.days().reduce((sum, day) => {
        const tasks = this.getDayTasks(day);
        return (
          sum +
          tasks
            .filter((t) => t.code === activity.code && (t.hours || 0) > 0)
            .reduce((taskSum, t) => taskSum + (t.hours || 0), 0)
        );
      }, 0);
      totals[activity.code] = activityHours > 0 ? activityHours : 0;
    });
    return totals;
  });

  readonly activityDays = computed((): ActivityTotals => {
    const daysMap: ActivityTotals = {};
    const totals = this.activityTotals();
    this.activityCodes().forEach((activity) => {
      const activityDays = this.roundDays(
        hoursToDaysRounded(totals[activity.code] || 0),
      );
      daysMap[activity.code] = activityDays > 0 ? activityDays : 0;
    });
    return daysMap;
  });

  readonly persistCurrentMonthEffect = effect(() => {
    const key = this.getCurrentMonthKey();
    try {
      this.persistenceService.saveCurrentMonthKey(key);
    } catch (e) { this.logNonBlockingError('Operazione non bloccante', e); }
  });

  readonly persistUiStateEffect = effect(() => {
    const hd = this.holidayDateModel();
    const hr = this.holidayReasonModel();
    try {
      this.persistenceService.saveUiState({
        holidayDateModel: hd || '',
        holidayReasonModel: hr || '',
      });
    } catch (e) { this.logNonBlockingError('Operazione non bloccante', e); }
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

  private getDayTasks(day: DayEntry): Task[] {
    if (day.tasks && day.tasks.length > 0) {
      return day.tasks;
    }
    return [
      {
        code: day.code || '',
        activity: day.activity || '',
        extract: day.extract || '',
        client: day.client || '',
        hours: day.hours || 0,
        notes: day.notes || '',
      },
    ];
  }

  private toHours(value: unknown): number {
    const hours = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(hours) ? hours : 0;
  }

  private isOvertimeTask(task: Task | null | undefined): boolean {
    if (!task) return false;
    const code = (task.code || '').trim().toUpperCase();
    return code === 'ST' && this.toHours(task.hours) > 0;
  }

  private hasOvertimeForDate(isoDate: string): boolean {
    return this.days().some((day) => {
      if (toIsoDate(day.date) !== isoDate) return false;
      return this.getDayTasks(day).some((task) => this.isOvertimeTask(task));
    });
  }

  private hasInvalidDailyOverflow(isoDate: string, hours: number): boolean {
    if (hours <= this.REQUIRED_DAILY_HOURS + this.HOURS_EPSILON) return false;
    return !this.hasOvertimeForDate(isoDate);
  }

  private roundDays(value: number): number {
    return Math.round(value * 10000) / 10000;
  }

  private saveMonthlyDataLocal(monthKey: string, data: DayEntry[]): void {
    if (!monthKey) return;

    this.localMonthlyDataWrites.add(monthKey);
    try {
      this.persistenceService.saveMonthlyData(monthKey, data);
    } finally {
      setTimeout(() => {
        this.localMonthlyDataWrites.delete(monthKey);
      }, 0);
    }
  }

  private hasFocusedEditableControl(): boolean {
    if (typeof document === 'undefined') return false;
    const active = document.activeElement as HTMLElement | null;
    if (!active) return false;

    const tag = active.tagName;
    return (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      active.isContentEditable
    );
  }

  readonly extractTotals = computed((): ActivityTotals => {
    const totals: ActivityTotals = {};
    this.extracts().forEach((extract) => {
      const totalHours = this.days()
        .flatMap((d) => this.getDayTasks(d))
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
        workDateKeys.push(isoDate);
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    const dailyHours = this.dailyHours();

    return workDateKeys.every((key) => {
      const hours = dailyHours[key] || 0;
      if (hours + this.HOURS_EPSILON < this.REQUIRED_DAILY_HOURS) return false;
      return !this.hasInvalidDailyOverflow(key, hours);
    });
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

  readonly visibleDayStates = computed<DayStateLegendItem[]>(() => {
    const counts: Record<DayStateKey, number> = {
      completed: 0,
      'in-progress': 0,
      'not-started': 0,
      invalid: 0,
    };

    for (const day of this.days()) {
      counts[this.getDayState(day)]++;
    }

    const states: DayStateLegendItem[] = [
      {
        key: 'completed',
        label: 'Compilato',
        className: 'is-complete',
        count: counts.completed,
      },
      {
        key: 'in-progress',
        label: 'In compilazione',
        className: 'is-progress',
        count: counts['in-progress'],
      },
      {
        key: 'not-started',
        label: 'Da compilare',
        className: 'is-empty',
        count: counts['not-started'],
      },
      {
        key: 'invalid',
        label: 'Errore',
        className: 'is-invalid',
        count: counts.invalid,
      },
    ];

    return states.filter((state) => state.count > 0);
  });

  isExportDisabled(): boolean {
    return (
      !this.allDaysValid() ||
      this.days().length === 0 ||
      !this.isMonthFullyFilled() ||
      this.exportButtonState() === 'loading'
    );
  }

  getExportDisabledReason(): string {
    if (this.exportButtonState() === 'loading') {
      return 'Esportazione in corso...';
    }
    if (this.days().length === 0) {
      return 'Inserisci almeno un giorno per il mese selezionato.';
    }
    if (!this.allDaysValid()) {
      return 'Completa tutti i campi obbligatori e correggi i giorni non validi.';
    }
    if (!this.isMonthFullyFilled()) {
      return 'Mese non completo: servono 8 ore ordinarie per ogni giorno lavorativo.';
    }
    return '';
  }

  private getDayState(day: DayEntry): DayStateKey {
    const tasks = this.getDayTasks(day);
    if (tasks.length === 0) return 'invalid';

    const totalHours = tasks.reduce((sum, task) => sum + this.toHours(task.hours), 0);
    const hasOvertime = tasks.some(
      (task) =>
        (task.code || '').trim().toUpperCase() === 'ST' &&
        this.toHours(task.hours) > 0,
    );

    const hasInvalidTask = tasks.some((task) => {
      const hasCode = !!task.code && task.code.trim().length > 0;
      const hours = this.toHours(task.hours);
      return !hasCode || hours <= 0 || hours > this.REQUIRED_DAILY_HOURS;
    });

    if (hasInvalidTask) return 'invalid';
    if (totalHours > this.REQUIRED_DAILY_HOURS + this.HOURS_EPSILON && !hasOvertime) {
      return 'invalid';
    }

    const isCompleted =
      totalHours + this.HOURS_EPSILON >= this.REQUIRED_DAILY_HOURS &&
      (totalHours <= this.REQUIRED_DAILY_HOURS + this.HOURS_EPSILON ||
        hasOvertime);
    if (isCompleted) return 'completed';

    const isStarted = tasks.some((task) => {
      const hasText = (value: unknown) =>
        typeof value === 'string' && value.trim().length > 0;
      return (
        hasText(task.code) ||
        this.toHours(task.hours) > 0 ||
        hasText(task.activity) ||
        hasText(task.extract) ||
        hasText(task.client) ||
        hasText(task.notes)
      );
    });

    return isStarted ? 'in-progress' : 'not-started';
  }

  private getCurrentMonthKey(): string {
    return this.toMonthKey(this.currentMonth());
  }

  private toMonthKey(date: Date): string {
    return `${date.getFullYear()}-${(date.getMonth() + 1)
      .toString()
      .padStart(2, '0')}`;
  }

  ngOnInit(): void {
    try {
      const savedKey = this.persistenceService.getCurrentMonthKey();
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
        } catch (e) { this.logNonBlockingError('Operazione non bloccante', e); }
      }

      const saved = this.persistenceService.getMonthlyData(
        this.getCurrentMonthKey(),
      );

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
      try {
        const ui = this.persistenceService.getUiState() || {};
        if (ui) {
          this.holidayDateModel.set(ui.holidayDateModel || '');
          this.holidayReasonModel.set(ui.holidayReasonModel || '');
        }
      } catch (e) { this.logNonBlockingError('Operazione non bloccante', e); }
    } catch (e) { this.logNonBlockingError('Operazione non bloccante', e); }

    try {
      this.persistenceService.saveCurrentMonthKey(this.getCurrentMonthKey());
    } catch (e) { this.logNonBlockingError('Operazione non bloccante', e); }

    try {
      this.persistenceChangeHandler = (e: Event) => {
        const change = e as CustomEvent<any>;
        try {
          if (change?.detail?.type === 'monthlyData') {
            const changedMonth = change.detail.month;
            const current = this.getCurrentMonthKey();

            if (changedMonth && this.localMonthlyDataWrites.has(changedMonth)) {
              return;
            }
            if (changedMonth && current && changedMonth === current) {
              if (this.hasFocusedEditableControl()) {
                return;
              }
              const saved = this.persistenceService.getMonthlyData(current);
              if (!this.areDaysEqual(saved as DayEntry[], this.days())) {
                this.days.set(saved as DayEntry[]);
              }
            }
          }
        } catch (err) { this.logNonBlockingError('Operazione non bloccante', err); }
      };
      this.persistenceService.changes.addEventListener(
        'change',
        this.persistenceChangeHandler,
      );
    } catch (e) { this.logNonBlockingError('Operazione non bloccante', e); }
  }

  trackByHoliday(index: number, item: any): string {
    return item?.date || index.toString();
  }

  ngOnDestroy(): void {
    if (this.loadTemplateFeedbackTimer) {
      clearTimeout(this.loadTemplateFeedbackTimer);
      this.loadTemplateFeedbackTimer = undefined;
    }
    if (this.exportFeedbackTimer) {
      clearTimeout(this.exportFeedbackTimer);
      this.exportFeedbackTimer = undefined;
    }
    this.cancelPendingPersist();

    if (this.persistenceChangeHandler) {
      try {
        this.persistenceService.changes.removeEventListener(
          'change',
          this.persistenceChangeHandler,
        );
      } catch (e) { this.logNonBlockingError('Operazione non bloccante', e); }
      this.persistenceChangeHandler = undefined;
    }
    this.commitEmployeeName();
    this.saveCurrentData(true);
  }

  private saveCurrentData(forceImmediate: boolean = false): void {
    const monthKey = this.getCurrentMonthKey();
    const currentData = this.days();

    if (!monthKey) return;

    if (forceImmediate) {
      this.cancelPendingPersist();
      this.persistCurrentData(monthKey, currentData);
      return;
    }

    this.pendingPersistPayload = { monthKey, data: currentData };
    if (this.pendingPersistTimer) {
      clearTimeout(this.pendingPersistTimer);
    }
    this.pendingPersistTimer = setTimeout(() => {
      const payload = this.pendingPersistPayload;
      this.pendingPersistPayload = undefined;
      this.pendingPersistTimer = undefined;
      if (!payload) return;
      this.persistCurrentData(payload.monthKey, payload.data);
    }, this.PERSIST_DEBOUNCE_MS);
  }

  private persistCurrentData(monthKey: string, currentData: DayEntry[]): void {
    try {
      this.saveMonthlyDataLocal(monthKey, currentData);
      try {
        this.persistenceService.saveCurrentMonthKey(monthKey);
      } catch (e) { this.logNonBlockingError('Operazione non bloccante', e); }
    } catch (e) { this.logNonBlockingError('Operazione non bloccante', e); }
  }

  private cancelPendingPersist(): void {
    if (this.pendingPersistTimer) {
      clearTimeout(this.pendingPersistTimer);
      this.pendingPersistTimer = undefined;
    }
    this.pendingPersistPayload = undefined;
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
  }

  removeDayEntry(index: number): void {
    this.days.update((days) => days.filter((_, i) => i !== index));
    this.saveCurrentData();
  }

  isOvertimeOnlyDay(index: number): boolean {
    return index >= this.totalWorkDays();
  }

  addDayEntry(): void {
    const isExtraDay = this.days().length >= this.totalWorkDays();
    const defaultCode = isExtraDay ? 'ST' : 'D';

    const newEntry: DayEntry = {
      date: new Date(),
      code: defaultCode,
      activity: '',
      hours: 8,
      notes: '',
      tasks: [
        {
          code: defaultCode,
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
  }

  onMonthPickerChange(value: Date | null): void {
    if (!value || !Number.isFinite(value.getTime())) return;

    this.saveCurrentData(true);

    const newDate = new Date(value.getFullYear(), value.getMonth(), 1);
    this.currentMonth.set(newDate);

    try {
      this.persistenceService.saveCurrentMonthKey(this.getCurrentMonthKey());
    } catch (e) { this.logNonBlockingError('Operazione non bloccante', e); }

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

  duplicatePreviousMonth(): void {
    try {
      const current = this.currentMonth();
      const previous = new Date(current.getFullYear(), current.getMonth() - 1, 1);
      const previousKey = this.toMonthKey(previous);
      const sourceDays = this.persistenceService.getMonthlyData(previousKey) || [];
      if (!Array.isArray(sourceDays) || sourceDays.length === 0) {
        this.setLoadTemplateButtonState(
          'error',
          'Nessun dato disponibile nel mese precedente',
          3200,
        );
        return;
      }

      const sourceSorted = [...sourceDays].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
      const targetWorkdays = this.buildWorkdaysForMonth(current);
      const duplicated = targetWorkdays.map((date, index) =>
        this.buildDayFromSourceForDate(date, sourceSorted[index]),
      );

      this.days.set(duplicated);
      this.saveCurrentData();
      this.setLoadTemplateButtonState(
        'success',
        'Mese precedente duplicato (solo giorni lavorativi)',
        3200,
      );
    } catch (error) {
      this.logger.error(
        'MonthlyReportComponent',
        'Duplicazione mese precedente non riuscita',
        error,
      );
      this.setLoadTemplateButtonState(
        'error',
        'Errore durante la duplicazione del mese precedente',
        3600,
      );
    }
  }

  exportMonthBackup(): void {
    try {
      const monthKey = this.getCurrentMonthKey();
      const payload: MonthBackupPayload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        monthKey,
        employeeName: this.employeeName() || '',
        adminEmail: this.adminEmail() || '',
        extracts: this.extracts().map((item) => ({ ...item })),
        days: this.days().map((day) => ({
          ...day,
          date: new Date(day.date).toISOString(),
          tasks: (day.tasks || []).map((task) => ({ ...task })),
        })),
        holidays: this.getCurrentMonthHolidays().map((holiday) => ({
          date: holiday?.date,
          reason: holiday?.reason,
        })),
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-${monthKey}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      this.setExportButtonState(
        'success',
        'Backup JSON del mese esportato',
        2600,
      );
    } catch (error) {
      this.logger.error(
        'MonthlyReportComponent',
        'Esportazione backup JSON non riuscita',
        error,
      );
      this.setExportButtonState(
        'error',
        'Errore durante esportazione backup JSON',
        3600,
      );
    }
  }

  async onBackupUpload(event: { files?: File[] }): Promise<void> {
    const file = Array.isArray(event?.files) ? event.files[0] : null;
    if (!file) return;
    await this.restoreBackupFile(file);
  }

  getHolidayDatePickerValue(): Date | null {
    const iso = (this.holidayDateModel() || '').trim();
    if (!iso) return null;
    const date = new Date(iso);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  onHolidayDatePickerChange(value: Date | null): void {
    if (!value || !Number.isFinite(value.getTime())) {
      this.holidayDateModel.set('');
      return;
    }
    this.holidayDateModel.set(toIsoDate(value));
  }

  private async restoreBackupFile(file: File): Promise<void> {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const payload = this.parseMonthBackup(parsed);
      if (!payload) {
        this.setExportButtonState(
          'error',
          'File backup non valido',
          3600,
        );
        return;
      }

      const targetMonth = new Date(
        this.currentMonth().getFullYear(),
        this.currentMonth().getMonth(),
        1,
      );
      this.applyMonthBackup(payload, targetMonth);
      const restoredMonthKey = this.getCurrentMonthKey();
      const restoredMessage =
        payload.monthKey !== restoredMonthKey
          ? `Backup ripristinato sul mese selezionato (${restoredMonthKey})`
          : 'Backup mese ripristinato';
      this.setExportButtonState(
        'success',
        restoredMessage,
        3200,
      );
    } catch (error) {
      this.logger.error(
        'MonthlyReportComponent',
        'Ripristino backup JSON non riuscito',
        error,
      );
      this.setExportButtonState('error', 'Errore nel ripristino backup', 4200);
    }
  }

  loadTemplate(): void {
    this.setLoadTemplateButtonState(
      'loading',
      'Caricamento template del mese in corso...',
    );

    try {
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
      this.setLoadTemplateButtonState(
        'success',
        'Template del mese caricato',
        2600,
      );
    } catch (error) {
      console.error('Errore nel caricamento del template:', error);
      this.setLoadTemplateButtonState(
        'error',
        'Errore durante il caricamento del template',
        3600,
      );
    }
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
    return this.dailyHours()[toIsoDate(date)] || 0;
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
      if (this.hasInvalidDailyOverflow(date, hours)) {
        const [yyyy, mm, dd] = date.split('-');
        exceeded.push({
          date: yyyy && mm && dd ? `${dd}/${mm}/${yyyy}` : date,
          hours: hours,
        });
      }
    });
    return exceeded;
  }

  private parseMonthBackup(input: unknown): MonthBackupPayload | null {
    const raw = input as Partial<MonthBackupPayload> | null | undefined;
    const monthKey = (raw?.monthKey || '').toString().trim();
    if (!/^\d{4}-\d{2}$/.test(monthKey)) return null;

    const [year, month] = monthKey.split('-').map((value) => Number(value));
    if (!Number.isFinite(year) || !Number.isFinite(month)) return null;

    const days = Array.isArray(raw?.days) ? raw?.days : [];
    const extracts = Array.isArray(raw?.extracts) ? raw?.extracts : [];
    const holidays = Array.isArray(raw?.holidays) ? raw?.holidays : [];

    return {
      version: 1,
      exportedAt: (raw?.exportedAt || new Date().toISOString()).toString(),
      monthKey,
      employeeName: (raw?.employeeName || '').toString(),
      adminEmail: (raw?.adminEmail || '').toString(),
      extracts: extracts.map((entry) => ({
        id: (entry as Extract)?.id || '',
        code: (entry as Extract)?.code || '',
        description: (entry as Extract)?.description || '',
        client: (entry as Extract)?.client || '',
        totalDays: Number((entry as Extract)?.totalDays) || 0,
      })),
      days: days.map((entry) => ({
        ...entry,
        date: new Date((entry as any)?.date).toISOString(),
      })),
      holidays: holidays
        .map((entry) => ({
          date: ((entry as any)?.date || '').toString(),
          reason: (entry as any)?.reason,
        }))
        .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.date)),
    };
  }

  private applyMonthBackup(payload: MonthBackupPayload, targetMonth?: Date): void {
    const sourceMonth = this.monthKeyToDate(payload.monthKey);
    const resolvedTargetMonth = targetMonth && Number.isFinite(targetMonth.getTime())
      ? new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1)
      : sourceMonth;
    const sourceKey = this.toMonthKey(sourceMonth);
    const targetKey = this.toMonthKey(resolvedTargetMonth);
    const shouldRemapMonth = sourceKey !== targetKey;

    this.currentMonth.set(resolvedTargetMonth);

    const normalizedBackupDays = this.normalizeBackupDays(payload.days || []);
    const restoredDays: DayEntry[] = shouldRemapMonth
      ? this.remapBackupDaysToMonth(normalizedBackupDays, resolvedTargetMonth)
      : normalizedBackupDays;

    const restoredHolidays = shouldRemapMonth
      ? this.remapBackupHolidaysToMonth(payload.holidays || [], resolvedTargetMonth)
      : payload.holidays || [];

    const restoredExtracts = (payload.extracts || []).filter(
      (entry) => !!entry?.id && !!entry?.code,
    );

    this.employeeName.set(payload.employeeName || '');
    this.adminEmail.set(payload.adminEmail || this.adminEmail());
    this.extracts.set(restoredExtracts);
    this.days.set(restoredDays);

    this.persistenceService.saveEmployeeName(this.employeeName());
    this.persistenceService.saveAdminEmail(this.adminEmail());
    this.persistenceService.saveExtracts(this.extracts());
    this.persistenceService.saveCurrentMonthKey(this.getCurrentMonthKey());
    this.saveMonthlyDataLocal(this.getCurrentMonthKey(), restoredDays);
    this.replaceCurrentMonthHolidays(restoredHolidays);
  }

  private monthKeyToDate(monthKey: string): Date {
    const [yearRaw, monthRaw] = monthKey.split('-');
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      const fallback = this.currentMonth();
      return new Date(fallback.getFullYear(), fallback.getMonth(), 1);
    }
    return new Date(year, month - 1, 1);
  }

  private normalizeBackupDays(
    days: MonthBackupPayload['days'],
  ): DayEntry[] {
    return (days || [])
      .map((day) => {
        const parsedDate = new Date(day.date);
        if (!Number.isFinite(parsedDate.getTime())) return null;

        const tasks = Array.isArray(day?.tasks)
          ? day.tasks.map((task) => ({
              ...task,
              hours: this.toHours(task?.hours),
              notes: (task?.notes || '').toString(),
            }))
          : [];

        const hours =
          tasks.length > 0
            ? tasks.reduce((sum, task) => sum + this.toHours(task.hours), 0)
            : this.toHours(day?.hours);

        return {
          date: parsedDate,
          code: (day.code || 'D').toString(),
          activity: (day.activity || '').toString(),
          extract: (day.extract || '').toString(),
          client: (day.client || '').toString(),
          hours,
          notes: (day.notes || '').toString(),
          prefilled: !!day.prefilled,
          tasks,
        } as DayEntry;
      })
      .filter((day): day is DayEntry => !!day)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  private remapBackupDaysToMonth(
    sourceDays: DayEntry[],
    targetMonth: Date,
  ): DayEntry[] {
    const targetWorkdays = this.buildWeekdaysForMonth(targetMonth);

    return targetWorkdays.map((date, index) => {
      const source = sourceDays[index];
      if (!source) {
        return {
          date: new Date(date),
          code: 'D',
          activity: '',
          extract: '',
          client: '',
          hours: 8,
          notes: '',
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
        };
      }

      const sourceTasks = this.getDayTasks(source).map((task) => ({
        ...task,
        hours: this.toHours(task.hours),
        notes: (task.notes || '').toString(),
      }));
      const remappedHours =
        sourceTasks.length > 0
          ? sourceTasks.reduce((sum, task) => sum + this.toHours(task.hours), 0)
          : this.toHours(source.hours);

      return {
        date: new Date(date),
        code: (source.code || sourceTasks[0]?.code || 'D').toString(),
        activity: (source.activity || '').toString(),
        extract: (source.extract || '').toString(),
        client: (source.client || '').toString(),
        hours: remappedHours,
        notes: (source.notes || '').toString(),
        prefilled: !!source.prefilled,
        tasks: sourceTasks,
      };
    });
  }

  private remapBackupHolidaysToMonth(
    holidays: Array<{ date: string; reason?: string }>,
    targetMonth: Date,
  ): Array<{ date: string; reason?: string }> {
    const targetYear = targetMonth.getFullYear();
    const targetMonthNumber = targetMonth.getMonth() + 1;
    const targetMonthPadded = targetMonthNumber.toString().padStart(2, '0');
    const maxDay = new Date(targetYear, targetMonthNumber, 0).getDate();
    const seenDates = new Set<string>();

    const remapped: Array<{ date: string; reason?: string }> = [];

    for (const holiday of holidays || []) {
      const dayRaw = holiday?.date?.split('-')?.[2];
      const day = Number(dayRaw);
      if (!Number.isFinite(day)) continue;

      const clampedDay = Math.min(Math.max(day, 1), maxDay);
      const dateIso = `${targetYear}-${targetMonthPadded}-${clampedDay
        .toString()
        .padStart(2, '0')}`;
      if (seenDates.has(dateIso)) continue;
      seenDates.add(dateIso);

      remapped.push({
        date: dateIso,
        reason: holiday?.reason,
      });
    }

    return remapped;
  }

  private buildWeekdaysForMonth(month: Date): Date[] {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const days: Date[] = [];
    const cursor = new Date(year, monthIndex, 1);

    while (cursor.getMonth() === monthIndex) {
      const isWeekend = cursor.getDay() === 0 || cursor.getDay() === 6;
      if (!isWeekend) {
        days.push(new Date(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return days;
  }

  private replaceCurrentMonthHolidays(
    holidays: Array<{ date: string; reason?: string }>,
  ): void {
    const existing = this.getCurrentMonthHolidays();
    existing.forEach((entry) => {
      this.holidayService.removeHolidayByDate(entry.date);
    });

    holidays.forEach((entry) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) return;
      this.holidayService.addHoliday(entry.date, entry.reason || 'Festività');
    });
  }

  private buildWorkdaysForMonth(month: Date): Date[] {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const days: Date[] = [];
    const cursor = new Date(year, monthIndex, 1);

    while (cursor.getMonth() === monthIndex) {
      const isoDate = toIsoDate(cursor);
      const isWeekend = cursor.getDay() === 0 || cursor.getDay() === 6;
      const isHoliday = this.holidayService.isHoliday(isoDate);
      if (!isWeekend && !isHoliday) {
        days.push(new Date(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }

  private buildDayFromSourceForDate(date: Date, source?: DayEntry): DayEntry {
    const src = source || null;
    const sourceTasks = src ? this.getDayTasks(src) : [];
    const clonedTasks: Task[] =
      sourceTasks.length > 0
        ? sourceTasks.map((task) => ({
            ...task,
            notes: '',
            hours: this.toHours(task.hours),
          }))
        : [
            {
              code: 'D',
              activity: '',
              extract: '',
              client: '',
              hours: 8,
              notes: '',
            },
          ];

    const totalHours = clonedTasks.reduce(
      (sum, task) => sum + this.toHours(task.hours),
      0,
    );

    return {
      date: new Date(date),
      code: (src?.code || clonedTasks[0]?.code || 'D').toString(),
      activity: (src?.activity || '').toString(),
      extract: (src?.extract || '').toString(),
      client: (src?.client || '').toString(),
      hours: totalHours > 0 ? totalHours : 8,
      notes: '',
      prefilled: true,
      tasks: clonedTasks,
    };
  }

  exportToExcel(): void {
    const validation = this.validationStatus();

    if (!validation.isValid || !this.isMonthFullyFilled()) {
      this.showExportError();
      return;
    }

    this.setExportButtonState(
      'loading',
      'Generazione file Excel in corso...',
    );

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

    setTimeout(() => {
      this.excelExportService
        .generateExcel(exportData)
        .then(() => {
          this.setExportButtonState(
            'success',
            'File Excel generato con successo',
            2600,
          );
          try {
            this.persistenceService.saveCurrentMonthKey('');
          } catch (e) { this.logNonBlockingError('Operazione non bloccante', e); }
          try {
            this.days.set([]);
          } catch (e) { this.logNonBlockingError('Operazione non bloccante', e); }
        })
        .catch((error) => {
          console.error("Errore nell'esportazione:", error);
          const message =
            error?.message && error.message.includes('Template non trovato')
              ? 'Template Excel non trovato in assets/templates'
              : 'Errore nella generazione del file Excel';
          this.setExportButtonState('error', message, 4200);
        });
    }, 0);
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
    } catch (e) { this.logNonBlockingError('Operazione non bloccante', e); }
  }

  toggleExtractManager(): void {
    this.showExtractManager.update((v) => !v);
  }

  removeExtract(extractId: string): void {
    try {
      this.extracts.update((list) => {
        const next = list.filter((e) => e.id !== extractId);
        this.persistenceService.saveExtracts(next);
        return next;
      });
      this.lastActionMessage.set('Estratto rimosso');
    } catch (e) { this.logNonBlockingError('Operazione non bloccante', e); }
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
    } catch (e) { this.logNonBlockingError('Operazione non bloccante', e); }
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

  onEmployeeNameInput(value: string): void {
    this.employeeName.set(value || '');
  }

  commitEmployeeName(): void {
    try {
      this.persistenceService.saveEmployeeName(this.employeeName() || '');
    } catch (e) { this.logNonBlockingError('Operazione non bloccante', e); }
  }

  private showExportError(): void {
    const validation = this.validationStatus();
    const issues: string[] = [];

    if (this.days().length === 0) {
      issues.push('nessun giorno inserito');
    }
    if (validation.invalidDays.length > 0) {
      issues.push(`${validation.invalidDays.length} giorno/i con campi invalidi`);
    }
    if (this.hasExceededDailyLimit()) {
      issues.push(
        `${validation.exceededDays.length} giorno/i oltre 8h senza Straordinari (ST)`,
      );
    }
    if (!this.isMonthFullyFilled()) {
      issues.push('mese non completo (8h per ogni giorno lavorativo)');
    }

    const message =
      issues.length > 0
        ? `Esportazione bloccata: ${issues.join(' • ')}`
        : 'Esportazione bloccata: verifica i dati inseriti';
    this.setExportButtonState('error', message, 5000);
    this.scrollToValidationIssue();
  }

  private scrollToValidationIssue(): void {
    if (typeof document === 'undefined') return;
    const target = document.querySelector(
      '.validation-warning, .alert-warning',
    ) as HTMLElement | null;
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  private setLoadTemplateButtonState(
    state: ActionButtonState,
    message: string,
    autoResetMs: number = 0,
  ): void {
    if (this.loadTemplateFeedbackTimer) {
      clearTimeout(this.loadTemplateFeedbackTimer);
      this.loadTemplateFeedbackTimer = undefined;
    }
    this.loadTemplateButtonState.set(state);
    this.loadTemplateFeedback.set(message);

    if (autoResetMs > 0 && state !== 'loading') {
      this.loadTemplateFeedbackTimer = setTimeout(() => {
        this.loadTemplateButtonState.set('idle');
        this.loadTemplateFeedback.set('');
        this.loadTemplateFeedbackTimer = undefined;
      }, autoResetMs);
    }
  }

  private setExportButtonState(
    state: ActionButtonState,
    message: string,
    autoResetMs: number = 0,
  ): void {
    if (this.exportFeedbackTimer) {
      clearTimeout(this.exportFeedbackTimer);
      this.exportFeedbackTimer = undefined;
    }
    this.exportButtonState.set(state);
    this.exportFeedback.set(message);

    if (autoResetMs > 0 && state !== 'loading') {
      this.exportFeedbackTimer = setTimeout(() => {
        this.exportButtonState.set('idle');
        this.exportFeedback.set('');
        this.exportFeedbackTimer = undefined;
      }, autoResetMs);
    }
  }

  getLoadTemplateButtonLabel(): string {
    switch (this.loadTemplateButtonState()) {
      case 'loading':
        return '⏳ Caricamento...';
      case 'success':
        return '✅ Template Caricato';
      case 'error':
        return '⚠️ Riprova';
      default:
        return 'Carica Template Mese';
    }
  }

  getExportButtonLabel(): string {
    switch (this.exportButtonState()) {
      case 'loading':
        return '⏳ Generando Excel...';
      case 'success':
        return '✅ Export Completato';
      case 'error':
        return '⚠️ Verifica Dati';
      default:
        return '🚀 Esporta in Excel';
    }
  }

  private logNonBlockingError(context: string, error: unknown): void {
    this.logger.warn('MonthlyReportComponent', context, error);
  }

  debugValidation(): void {
    this.days().forEach((day, index) => {
      void day;
      void index;
    });
  }
}



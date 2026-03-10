import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  OnDestroy,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DayEntry, Extract, Task } from '../models/day-entry.model';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';

interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

@Component({
  selector: 'app-day-entry',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    DatePickerModule,
    InputNumberModule,
  ],
  templateUrl: './day-entry.component.html',
  styleUrls: ['./day-entry.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush as const,
})
export class DayEntryComponent implements OnChanges, OnDestroy {
  private readonly REQUIRED_DAILY_HOURS = 8;
  private readonly HOURS_EPSILON = 1e-6;
  private readonly TASK_UPDATE_DEBOUNCE_MS = 90;
  private pendingTaskUpdateTimer?: ReturnType<typeof setTimeout>;

  @Input() day!: DayEntry;
  @Input() index!: number;
  @Input() overtimeOnly: boolean = false;
  @Input() activityCodes: any[] = [];
  @Input() extracts: Extract[] = [];
  @Input() dailyHours: number = 0;

  @Output() update = new EventEmitter<{
    index: number;
    field: keyof DayEntry;
    value: any;
  }>();
  @Output() remove = new EventEmitter<number>();

  localDay!: DayEntry;
  localTasks: Task[] = [];
  codeOptions: SelectOption[] = [];
  extractOptions: SelectOption[] = [];

  expanded: boolean = false;

  isCodeValid: boolean = true;
  isHoursValid: boolean = true;

  private _formattedDate: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['day'] || changes['overtimeOnly']) {
      this.localDay = { ...this.day };
      this._formattedDate = null;
      if (this.day.tasks && this.day.tasks.length > 0) {
        this.localTasks = this.day.tasks.map((t) => ({ ...t }));
      } else {
        this.localTasks = [
          {
            code: this.day.code || '',
            activity: this.day.activity || '',
            extract: this.day.extract || '',
            client: this.day.client || '',
            hours:
              typeof this.day.hours === 'number' && this.day.hours > 0
                ? this.day.hours
                : 8,
            notes: this.day.notes || '',
          },
        ];
      }
      this.codeOptions = this.activityCodes.map((activity) => ({
        label: `${activity.code} - ${activity.description}`,
        value: activity.code,
        disabled: this.overtimeOnly && activity.code !== 'ST',
      }));
    }

    if (changes['extracts']) {
      const extractItems = (this.extracts || []).map((extract) => ({
        label: `${extract.id} - ${extract.client}`,
        value: extract.id,
      }));
      this.extractOptions = [
        { label: '-- Nessun estratto --', value: '' },
        ...extractItems,
      ];
    }
  }

  ngOnDestroy(): void {
    if (this.pendingTaskUpdateTimer) {
      clearTimeout(this.pendingTaskUpdateTimer);
      this.pendingTaskUpdateTimer = undefined;
    }
  }

  onFieldChange(
    field: keyof DayEntry,
    event: Event,
    needsValidation: boolean = false
  ): void {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    let value: any = input.value;

    if (field === 'date') {
      value = new Date(input.value);
    } else if (field === 'hours') {
      value = +input.value;
    }

    this.localDay = { ...this.localDay, [field]: value };

    if (needsValidation) {
      this.validateField(field, value);
    }

    if (!needsValidation || this.isFieldValid(field)) {
      this.update.emit({ index: this.index, field, value });

      if (field === 'date') {
        this._formattedDate = null;
      }
    }
  }

  updateTask(taskIndex: number, field: keyof Task, value: any): void {
    this.onTaskFieldInput(taskIndex, field, value);
    this.commitTasksUpdate();
  }

  onDatePickerChange(value: Date | null): void {
    if (!value || !Number.isFinite(value.getTime())) return;
    const normalized = new Date(value);
    this.localDay = { ...this.localDay, date: normalized };
    this._formattedDate = null;
    this.update.emit({ index: this.index, field: 'date', value: normalized });
  }

  onTaskHoursChange(taskIndex: number, value: number | null): void {
    this.onTaskFieldInput(taskIndex, 'hours', value ?? 0.5);
    this.commitTasksUpdate();
  }

  onTaskFieldInput(taskIndex: number, field: keyof Task, value: any): void {
    let newValue: any = value;
    if (value && value.target) {
      const target = value.target as HTMLInputElement | HTMLSelectElement;
      newValue = target.type === 'number' ? +target.value : target.value;
    }
    if (field === 'hours') {
      newValue = this.normalizeTaskHours(newValue);
    }
    if (
      field === 'code' ||
      field === 'activity' ||
      field === 'extract' ||
      field === 'client' ||
      field === 'notes'
    ) {
      newValue = typeof newValue === 'string' ? newValue : '';
    }

    this.localTasks = this.localTasks.map((t, i) => {
      if (i !== taskIndex) return t;

      const updated: Task = { ...t, [field]: newValue };

      if (this.overtimeOnly) {
        updated.code = 'ST';
      }

      if (field === 'code' && this.isVacation(updated)) {
        updated.extract = '';
        updated.client = '';
      }

      if (field === 'extract') {
        if (this.isVacation(updated)) {
          updated.extract = '';
          updated.client = '';
          return updated;
        }
        const extractId = (updated.extract || '').toString().trim();
        if (!extractId) {
          updated.client = '';
        } else {
          const ex = this.extracts.find((e) => e.id === extractId);
          updated.client = ex?.client || '';
        }
      }

      return updated;
    });
  }

  commitTasksUpdate(): void {
    if (this.pendingTaskUpdateTimer) {
      clearTimeout(this.pendingTaskUpdateTimer);
    }

    this.pendingTaskUpdateTimer = setTimeout(() => {
      this.pendingTaskUpdateTimer = undefined;
      this.emitTasksUpdate();
    }, this.TASK_UPDATE_DEBOUNCE_MS);
  }

  addTask(): void {
    this.localTasks = [
      ...this.localTasks,
      {
        code: this.overtimeOnly ? 'ST' : '',
        activity: '',
        extract: '',
        client: '',
        hours: 8,
        notes: '',
      },
    ];
    this.emitTasksUpdate();
  }

  removeTask(taskIndex: number): void {
    this.localTasks = this.localTasks.filter((_, i) => i !== taskIndex);
    this.emitTasksUpdate();
  }

  private emitTasksUpdate(): void {
    if (this.pendingTaskUpdateTimer) {
      clearTimeout(this.pendingTaskUpdateTimer);
      this.pendingTaskUpdateTimer = undefined;
    }

    this.update.emit({
      index: this.index,
      field: 'tasks' as any,
      value: this.localTasks,
    });
  }

  private validateField(field: keyof DayEntry, value: any): void {
    switch (field) {
      case 'code':
        this.isCodeValid = value !== '' && value?.trim().length > 0;
        break;
      case 'hours':
        this.isHoursValid = !isNaN(value) && value >= 0 && value <= 8;
        break;
    }
  }

  isValid(): boolean {
    const tasks = this.localTasks || [];
    if (tasks.length === 0) return false;

    const hasValidTasks = tasks.every((task) => {
      const hasCode = this.hasText(task.code);
      const hours = this.toHours(task.hours);
      return hasCode && hours > 0 && hours <= this.REQUIRED_DAILY_HOURS;
    });
    if (!hasValidTasks) return false;

    const totalHours = this.getLocalTotalHours();
    if (totalHours > this.REQUIRED_DAILY_HOURS + this.HOURS_EPSILON) {
      return this.hasOvertimeInDay();
    }
    return true;
  }

  private isFieldValid(field: keyof DayEntry): boolean {
    switch (field) {
      case 'code':
        return this.isCodeValid;
      case 'hours':
        return this.isHoursValid;
      default:
        return true;
    }
  }

  getLocalTotalHours(): number {
    return this.localTasks.reduce(
      (s, t) => s + (typeof t.hours === 'number' ? t.hours : 0),
      0
    );
  }

  private toHours(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private normalizeTaskHours(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    const safe = Number.isFinite(parsed) ? parsed : 0.5;
    const roundedToHalf = Math.round(safe * 2) / 2;
    if (roundedToHalf < 0.5) return 0.5;
    if (roundedToHalf > 8) return 8;
    return roundedToHalf;
  }

  private hasText(value: unknown): boolean {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private isTaskCompleted(task: Task): boolean {
    const hasCode = this.hasText(task.code);
    const hours = this.toHours(task.hours);
    const hasValidHours = hours > 0 && hours <= this.REQUIRED_DAILY_HOURS;
    return hasCode && hasValidHours;
  }

  private isOvertimeTask(task: Task): boolean {
    const code = (task?.code || '').trim().toUpperCase();
    return code === 'ST' && this.toHours(task.hours) > 0;
  }

  private hasOvertimeInDay(): boolean {
    return this.localTasks.some((task) => this.isOvertimeTask(task));
  }

  isDayOverLimit(): boolean {
    const totalHours = this.getLocalTotalHours();
    if (totalHours <= this.REQUIRED_DAILY_HOURS + this.HOURS_EPSILON) {
      return false;
    }
    return !this.hasOvertimeInDay();
  }

  isDayCompleted(): boolean {
    if (!this.localTasks || this.localTasks.length === 0) return false;
    if (!this.localTasks.every((task) => this.isTaskCompleted(task))) {
      return false;
    }

    const totalHours = this.getLocalTotalHours();
    if (totalHours + this.HOURS_EPSILON < this.REQUIRED_DAILY_HOURS) {
      return false;
    }
    if (totalHours > this.REQUIRED_DAILY_HOURS + this.HOURS_EPSILON) {
      return this.hasOvertimeInDay();
    }
    return true;
  }

  isDayStarted(): boolean {
    return this.localTasks.some(
      (task) =>
        this.hasText(task.code) ||
        this.toHours(task.hours) > 0 ||
        this.hasText(task.activity) ||
        this.hasText(task.extract) ||
        this.hasText(task.client) ||
        this.hasText(task.notes)
    );
  }

  getDayStatusLabel(): string {
    if (this.isDayOverLimit()) return 'Supera 8h';
    if (this.isDayCompleted()) return 'Compilato';
    if (this.isDayStarted()) return 'In compilazione';
    return 'Da compilare';
  }

  getPreviewItems(): string[] {
    const filledTasks = this.localTasks.filter(
      (task) => this.hasText(task.code) || this.hasText(task.extract)
    );

    const previews = filledTasks.slice(0, 3).map((task) => {
      const code = this.hasText(task.code) ? task.code.trim() : '--';
      const extract =
        typeof task.extract === 'string' && task.extract.trim().length > 0
          ? task.extract.trim()
          : '';
      return extract ? `${code} • ${extract}` : code;
    });

    if (filledTasks.length > 3) {
      previews.push(`+${filledTasks.length - 3} lavorazioni`);
    }

    return previews;
  }

  onRemove(): void {
    this.remove.emit(this.index);
  }

  getFormattedDate(): string {
    if (!this._formattedDate) {
      const dateToUse = this.localDay?.date || this.day.date;
      const year = dateToUse.getFullYear();
      const month = (dateToUse.getMonth() + 1).toString().padStart(2, '0');
      const day = dateToUse.getDate().toString().padStart(2, '0');
      this._formattedDate = `${year}-${month}-${day}`;
    }
    return this._formattedDate;
  }

  shouldShowExtract(): boolean {
    return this.extracts && this.extracts.length > 0;
  }

  hasExtract(task: Task): boolean {
    return !!task?.extract && task.extract.trim().length > 0;
  }

  isVacation(task: Task): boolean {
    return (task?.code || '').trim() === 'F';
  }

  get displayDay(): DayEntry {
    return this.localDay || this.day;
  }
}

import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DayEntry, Extract, Task } from '../models/day-entry.model';

@Component({
  selector: 'app-day-entry',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './day-entry.component.html',
  styleUrls: ['./day-entry.component.css'],
})
export class DayEntryComponent implements OnChanges {
  @Input() day!: DayEntry;
  @Input() index!: number;
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

  expanded: boolean = false;

  isCodeValid: boolean = true;
  isHoursValid: boolean = true;

  private _formattedDate: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['day']) {
      this.localDay = { ...this.day };
      this._formattedDate = null;
      // Initialize tasks array from day or from legacy fields
      if (this.day.tasks && this.day.tasks.length > 0) {
        this.localTasks = this.day.tasks.map((t) => ({ ...t }));
      } else {
        this.localTasks = [
            {
              code: this.day.code || '',
              activity: this.day.activity || '',
              extract: this.day.extract || '',
              client: this.day.client || '',
              hours: typeof this.day.hours === 'number' && this.day.hours > 0 ? this.day.hours : 8,
              notes: this.day.notes || '',
            },
          ];
      }
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

  // Task-level operations
  updateTask(taskIndex: number, field: keyof Task, value: any): void {
    let newValue: any = value;
    // If an Event was passed from template, extract the target value
    if (value && value.target) {
      const target = value.target as HTMLInputElement | HTMLSelectElement;
      newValue = target.type === 'number' ? +target.value : target.value;
    }

    this.localTasks = this.localTasks.map((t, i) =>
      i === taskIndex ? { ...t, [field]: newValue } : t
    );
    this.emitTasksUpdate();
  }

  addTask(): void {
    this.localTasks = [
      ...this.localTasks,
      { code: '', activity: '', extract: '', client: '', hours: 8, notes: '' },
    ];
    this.emitTasksUpdate();
  }

  removeTask(taskIndex: number): void {
    this.localTasks = this.localTasks.filter((_, i) => i !== taskIndex);
    this.emitTasksUpdate();
  }

  private emitTasksUpdate(): void {
    this.update.emit({ index: this.index, field: 'tasks' as any, value: this.localTasks });
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
  const dayToCheck = this.localDay || this.day;
  
  return this.isCodeValid &&
         this.isHoursValid &&
         dayToCheck.code !== '' &&
         dayToCheck.code?.trim().length > 0 &&
         dayToCheck.hours >= 0 &&
         dayToCheck.hours <= 8;
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
    return this.localTasks.reduce((s, t) => s + (typeof t.hours === 'number' ? t.hours : 0), 0);
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

  get displayDay(): DayEntry {
    return this.localDay || this.day;
  }
}

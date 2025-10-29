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
import { DayEntry, Extract } from '../models/day-entry.model';

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

  isCodeValid: boolean = true;
  isHoursValid: boolean = true;

  private _formattedDate: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['day']) {
      this.localDay = { ...this.day };
      this._formattedDate = null;
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

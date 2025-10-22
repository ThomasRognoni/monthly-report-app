import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DayEntry, Extract } from '../models/day-entry.model';

// PrimeNG imports
import { CalendarModule } from 'primeng/calendar';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';

interface ActivityOption {
  label: string;
  value: string;
}

interface ExtractOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-day-entry',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule,
    CalendarModule,
    DropdownModule,
    InputTextModule,
    InputNumberModule,
    ButtonModule,
    MessageModule
  ],
  templateUrl: './day-entry.component.html',
  styleUrls: ['./day-entry.component.css']
})
export class DayEntryComponent implements OnChanges {
  @Input({ required: true }) day!: DayEntry;
  @Input({ required: true }) index!: number;
  @Input() activityCodes: any[] = [];
  @Input() extracts: Extract[] = [];
  @Input() dailyHours: number = 0;
  
  @Output() update = new EventEmitter<{index: number, field: keyof DayEntry, value: any}>();
  @Output() remove = new EventEmitter<number>();

  // Local copy for form controls
  localDay!: DayEntry;

  // PrimeNG dropdown options
  activityOptions: ActivityOption[] = [];
  extractOptions: ExtractOption[] = [];

  // Validation state properties
  isCodeValid: boolean = true;
  isHoursValid: boolean = true;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['day']) {
      this.localDay = { ...this.day };
    }
    
    if (changes['activityCodes'] && this.activityCodes) {
      this.activityOptions = [
        { label: 'Seleziona codice *', value: '' },
        ...this.activityCodes.map(activity => ({
          label: `${activity.code} - ${activity.description}`,
          value: activity.code
        }))
      ];
    }
    
    if (changes['extracts'] && this.extracts) {
      this.extractOptions = [
        { label: '-- Seleziona Estratto --', value: '' },
        ...this.extracts.map(extract => ({
          label: `${extract.id} - ${extract.client}`,
          value: extract.id
        }))
      ];
    }
  }

  onFieldChange(field: keyof DayEntry, value: any, needsValidation: boolean = false): void {
    // Update local copy
    this.localDay = { ...this.localDay, [field]: value };

    // Validation
    if (needsValidation) {
      this.validateField(field, value);
    }

    // Emit update if valid or if it's not a field that requires validation
    if (!needsValidation || this.isFieldValid(field)) {
      this.update.emit({ index: this.index, field, value });
    }
  }

  private validateField(field: keyof DayDayEntry, value: any): void {
    switch (field) {
      case 'code':
        this.isCodeValid = value !== null && value !== '';
        break;
      case 'hours':
        this.isHoursValid = !isNaN(value) && value >= 0.125 && value <= 8;
        break;
    }
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

  isValid(): boolean {
    const dayToCheck = this.localDay || this.day;
    return this.isCodeValid && this.isHoursValid && !!dayToCheck.code && dayToCheck.hours > 0;
  }

  shouldShowExtract(): boolean {
    return this.extracts && this.extracts.length > 0;
  }

  get displayDay(): DayEntry {
    return this.localDay || this.day;
  }
}
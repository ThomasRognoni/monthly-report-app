import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DayEntry, Extract } from '../models/day-entry.model';

@Component({
  selector: 'app-day-entry',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './day-entry.component.html',
  styleUrls: ['./day-entry.component.css']
})
export class DayEntryComponent {
  @Input() day!: DayEntry;
  @Input() index!: number;
  @Input() activityCodes: any[] = [];
  @Input() extracts: Extract[] = [];
  
  @Output() update = new EventEmitter<{index: number, field: keyof DayEntry, value: any}>();
  @Output() remove = new EventEmitter<number>();

  onDateChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const dateValue = new Date(input.value);
    this.update.emit({ index: this.index, field: 'date', value: dateValue });
  }

  onCodeChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.update.emit({ index: this.index, field: 'code', value: select.value });
  }

  onActivityChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.update.emit({ index: this.index, field: 'activity', value: input.value });
  }

  onExtractChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.update.emit({ index: this.index, field: 'extract', value: select.value });
  }

  onClientChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.update.emit({ index: this.index, field: 'client', value: input.value });
  }

  onHoursChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.update.emit({ index: this.index, field: 'hours', value: +input.value });
  }

  onNotesChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.update.emit({ index: this.index, field: 'notes', value: input.value });
  }

  onRemove() {
    this.remove.emit(this.index);
  }

  // Helper method to format date for input[type="date"]
  getFormattedDate(): string {
    return this.day.date.toISOString().split('T')[0];
  }
}
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DayEntryComponent } from '../../day-entry/day-entry.component';
import { inject } from '@angular/core';
import { PersistenceService } from '../../services/persistence.service';
import { DayEntry } from '../../models/day-entry.model';

@Component({
  selector: 'app-daily-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './daily-detail.component.html',
  styleUrls: ['./daily-detail.component.css'],
})
export class DailyDetailComponent {
  private persistence = inject(PersistenceService);

  days: DayEntry[] = [];

  constructor() {
    this.refresh();
    try {
      this.persistence.changes.addEventListener('change', (e: any) => {
        if (
          e?.detail?.type === 'monthlyData' ||
          e?.detail?.type === 'currentMonth'
        )
          this.refresh();
      });
    } catch (e) {}
  }

  private refresh() {
    try {
      const key = this.persistence.getCurrentMonthKey();
      if (key) this.days = this.persistence.getMonthlyData(key);
      else this.days = [];
    } catch (e) {
      this.days = [];
    }
  }

  addDay() {
    try {
      const key = this.persistence.getCurrentMonthKey();
      if (!key) return;
      const list = this.persistence.getMonthlyData(key) || [];
      const entry: DayEntry = {
        date: new Date(),
        code: 'D',
        activity: '',
        hours: 8,
        notes: '',
        tasks: [],
      };
      list.push(entry);
      this.persistence.saveMonthlyData(
        key,
        list.map((d: any) => ({
          ...d,
          date: typeof d.date === 'string' ? new Date(d.date) : d.date,
        })) as DayEntry[]
      );
      this.refresh();
    } catch (e) {}
  }

  removeDay(index: number) {
    try {
      const key = this.persistence.getCurrentMonthKey();
      if (!key) return;
      const list = this.persistence.getMonthlyData(key) || [];
      list.splice(index, 1);
      this.persistence.saveMonthlyData(
        key,
        list.map((d: any) => ({
          ...d,
          date: typeof d.date === 'string' ? new Date(d.date) : d.date,
        })) as DayEntry[]
      );
      this.refresh();
    } catch (e) {}
  }

  updateDay(index: number, field: keyof DayEntry, value: any) {
    try {
      const key = this.persistence.getCurrentMonthKey();
      if (!key) return;
      const list = this.persistence.getMonthlyData(key) || [];
      const item = list[index] as DayEntry | undefined;
      if (!item) return;
      if (field === 'hours') item.hours = Number(value) || 0;
      else (item as any)[field] = value;
      this.persistence.saveMonthlyData(
        key,
        list.map((d: any) => ({
          ...d,
          date: typeof d.date === 'string' ? new Date(d.date) : d.date,
        })) as DayEntry[]
      );
      this.refresh();
    } catch (e) {}
  }
}

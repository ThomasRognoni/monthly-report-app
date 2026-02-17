import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DayEntryComponent } from '../../day-entry/day-entry.component';
import { inject } from '@angular/core';
import { PersistenceService } from '../../services/persistence.service';
import { DayEntry, Extract } from '../../models/day-entry.model';

@Component({
  selector: 'app-daily-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './daily-detail.component.html',
  styleUrls: ['./daily-detail.component.css'],
})
export class DailyDetailComponent {
  private persistence = inject(PersistenceService);

  days: DayEntry[] = [];
  extracts: Extract[] = [];
  expandedIndex: number | null = null;

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

  trackByDay(index: number, item: DayEntry): string {
    try {
      return item?.date ? new Date(item.date).toISOString() : index.toString();
    } catch (e) {
      return index.toString();
    }
  }

  trackByExtract(index: number, item: Extract): string {
    return item?.id || index.toString();
  }

  private refresh() {
    try {
      const key = this.persistence.getCurrentMonthKey();
      if (key) this.days = this.persistence.getMonthlyData(key);
      else this.days = [];
      // load global extracts for selection
      try {
        this.extracts = this.persistence.getExtracts() || [];
      } catch (e) {
        this.extracts = [];
      }
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
        })) as DayEntry[],
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
        })) as DayEntry[],
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

      // if extract changed, sync client automatically
      if (field === 'extract') {
        const ex = this.extracts.find(
          (e) => e.id === value || e.code === value,
        );
        if (ex) item.client = ex.client || item.client;
      }
      this.persistence.saveMonthlyData(
        key,
        list.map((d: any) => ({
          ...d,
          date: typeof d.date === 'string' ? new Date(d.date) : d.date,
        })) as DayEntry[],
      );
      this.refresh();
    } catch (e) {}
  }

  editDay(index: number) {
    // toggle expanded index for future detailed editor
    this.expandedIndex = this.expandedIndex === index ? null : index;
  }

  getClientForExtract(id: string | undefined): string {
    if (!id) return '';
    const ex = this.extracts.find((e) => e.id === id || e.code === id);
    return ex?.client || '';
  }
}

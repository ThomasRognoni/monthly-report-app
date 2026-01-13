import { Injectable } from '@angular/core';
import { DayEntry } from '../models/day-entry.model';

interface MonthlyData {
  [key: string]: DayEntry[];
}

@Injectable({
  providedIn: 'root',
})
export class PersistenceService {
  private readonly STORAGE_KEY = 'monthly-report-data';
  private readonly NAME_KEY = 'monthly-report-employee-name';
  private readonly EXTRACTS_KEY = 'monthly-report-extracts-v1';
  private readonly ADMIN_EMAIL_KEY = 'monthly-report-admin-email';
  private readonly EXPORT_HISTORY_KEY = 'export-history';
  private readonly CURRENT_MONTH_KEY = 'current-month-key';

  public readonly changes = new EventTarget();

  constructor() {
    try {
      const current = localStorage.getItem(this.EXTRACTS_KEY);
      if (!current) {
        const legacyKeys = [
          'extracts',
          'monthly-report-extracts',
          'monthly-report-extracts-v0',
        ];
        for (const k of legacyKeys) {
          try {
            const raw = localStorage.getItem(k);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                localStorage.setItem(this.EXTRACTS_KEY, JSON.stringify(parsed));
                console.info(
                  `PersistenceService: migrated extracts from ${k} to ${this.EXTRACTS_KEY}`
                );
                break;
              }
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  saveMonthlyData(month: string, data: DayEntry[]): void {
    const allData = this.getAllMonthlyData();
    allData[month] = data.map((day) => this.serializeDate(day));
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allData));
    try {
      const ts = new Date().toISOString();
      const stack = new Error('stack').stack || '';
      console.debug(
        `PersistenceService.saveMonthlyData: ${ts} month=${month} entries=${data.length}`
      );
      try {
        const sample = data && data.length > 0 ? data[0] : null;
        console.debug(
          'PersistenceService.saveMonthlyData sample[0]=',
          sample ? JSON.stringify(sample).slice(0, 1000) : null
        );
      } catch (e) {}
      console.debug(stack.split('\n').slice(0, 4).join('\n'));
    } catch (e) {}
    try {
      this.changes.dispatchEvent(
        new CustomEvent('change', { detail: { type: 'monthlyData', month } })
      );
    } catch (e) {}
  }

  getMonthlyData(month: string): DayEntry[] {
    const allData = this.getAllMonthlyData();
    const data = allData[month];
    return data ? data.map((day) => this.deserializeDate(day)) : [];
  }

  clearMonthlyData(month: string): void {
    const allData = this.getAllMonthlyData();
    delete allData[month];
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allData));
    try {
      const ts = new Date().toISOString();
      const stack = new Error('stack').stack || '';
      console.debug(
        `PersistenceService.clearMonthlyData: ${ts} month=${month}`
      );
      console.debug(stack.split('\n').slice(0, 4).join('\n'));
    } catch (e) {}
    try {
      this.changes.dispatchEvent(
        new CustomEvent('change', { detail: { type: 'monthlyData', month } })
      );
    } catch (e) {}
  }

  private getAllMonthlyData(): MonthlyData {
    const data = localStorage.getItem(this.STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  }

  private serializeDate(day: DayEntry): any {
    return {
      ...day,
      date: day.date.toISOString(),
    };
  }

  private deserializeDate(day: any): DayEntry {
    return {
      ...day,
      date: new Date(day.date),
    };
  }

  saveEmployeeName(name: string): void {
    try {
      localStorage.setItem(this.NAME_KEY, name || '');
      try {
        this.changes.dispatchEvent(
          new CustomEvent('change', { detail: { type: 'employeeName' } })
        );
      } catch (e) {}
    } catch (e) {}
  }

  getEmployeeName(): string | null {
    try {
      const v = localStorage.getItem(this.NAME_KEY);
      return v && v.length > 0 ? v : null;
    } catch (e) {
      return null;
    }
  }

  saveExtracts(extracts: any[]): void {
    try {
      localStorage.setItem(this.EXTRACTS_KEY, JSON.stringify(extracts || []));
      try {
        this.changes.dispatchEvent(
          new CustomEvent('change', { detail: { type: 'extracts' } })
        );
      } catch (e) {}
    } catch (e) {}
  }

  getExtracts(): any[] {
    try {
      const raw = localStorage.getItem(this.EXTRACTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  saveAdminEmail(email: string): void {
    try {
      localStorage.setItem(this.ADMIN_EMAIL_KEY, email || '');
      try {
        this.changes.dispatchEvent(
          new CustomEvent('change', { detail: { type: 'adminEmail' } })
        );
      } catch (e) {}
    } catch (e) {}
  }

  saveExportHistory(item: {
    filename: string;
    date: string;
    dataUrl?: string | null;
  }): void {
    try {
      const raw = localStorage.getItem(this.EXPORT_HISTORY_KEY) || '[]';
      const hist = JSON.parse(raw);
      hist.unshift(item);
      localStorage.setItem(
        this.EXPORT_HISTORY_KEY,
        JSON.stringify(hist.slice(0, 50))
      );
      try {
        this.changes.dispatchEvent(
          new CustomEvent('change', { detail: { type: 'exportHistory' } })
        );
      } catch (e) {}
    } catch (e) {}
  }

  getExportHistory(): any[] {
    try {
      const raw = localStorage.getItem(this.EXPORT_HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  saveCurrentMonthKey(key: string): void {
    try {
      localStorage.setItem(this.CURRENT_MONTH_KEY, key || '');
      try {
        const ts = new Date().toISOString();
        const stack = new Error('stack').stack || '';
        console.debug(
          `PersistenceService.saveCurrentMonthKey: ${ts} key=${key}`
        );
        const stackLines = stack.split('\n').slice(0, 4).join('\n');
        console.debug(stackLines);
      } catch (e) {}
      try {
        this.changes.dispatchEvent(
          new CustomEvent('change', { detail: { type: 'currentMonth', key } })
        );
      } catch (e) {}
    } catch (e) {}
  }

  getCurrentMonthKey(): string | null {
    try {
      const v = localStorage.getItem(this.CURRENT_MONTH_KEY);
      return v && v.length > 0 ? v : null;
    } catch (e) {
      return null;
    }
  }

  getAdminEmail(): string | null {
    try {
      const v = localStorage.getItem(this.ADMIN_EMAIL_KEY);
      return v && v.length > 0 ? v : null;
    } catch (e) {
      return null;
    }
  }
}

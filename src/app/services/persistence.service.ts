import { Injectable } from '@angular/core';
import { DayEntry } from '../models/day-entry.model';
import { AppLoggerService } from './app-logger.service';
import {
  ExportHistoryItem,
  normalizeHistoryItem,
  normalizeHistoryList,
} from './export-history-utils';

interface MonthlyData {
  [key: string]: DayEntry[];
}

@Injectable({
  providedIn: 'root',
})
export class PersistenceService {
  private readonly logger = new AppLoggerService();

  private readonly SESSION_HAS_DAY_DATA_KEY = 'monthly-report-session-has-day-data';
  private readonly STORAGE_KEY = 'monthly-report-data';
  private readonly NAME_KEY = 'monthly-report-employee-name';
  private readonly EXTRACTS_KEY = 'monthly-report-extracts-v1';
  private readonly LEGACY_EXTRACTS_KEYS = [
    'extracts',
    'monthly-report-extracts',
    'monthly-report-extracts-v0',
  ];
  private readonly ADMIN_EMAIL_KEY = 'monthly-report-admin-email';
  private readonly EXPORT_HISTORY_KEY = 'export-history';
  private readonly CURRENT_MONTH_KEY = 'current-month-key';
  private readonly UI_STATE_KEY = 'monthly-report-ui-state';

  public readonly changes = new EventTarget();

  constructor() {
    this.migrateLegacyExtracts();
    this.ensureCurrentMonthKey();
    this.ensureDefaultExtracts();
    this.migrateExportHistory();
  }

  saveMonthlyData(month: string, data: DayEntry[]): void {
    const allData = this.getAllMonthlyData();
    allData[month] = data.map((day) => this.serializeDate(day));

    this.safeRun('saveMonthlyData.localStorage', () => {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allData));
    });

    this.safeRun('saveMonthlyData.sessionStorage', () => {
      sessionStorage.setItem(this.SESSION_HAS_DAY_DATA_KEY, '1');
    });

    this.emitChange({ type: 'monthlyData', month });
  }

  getMonthlyData(month: string): DayEntry[] {
    const allData = this.getAllMonthlyData();
    const data = allData[month];
    return data ? data.map((day) => this.deserializeDate(day)) : [];
  }

  hasSessionDayData(): boolean {
    return this.safeRead(
      'hasSessionDayData.sessionStorage',
      () => sessionStorage.getItem(this.SESSION_HAS_DAY_DATA_KEY) === '1',
      false,
    );
  }

  clearMonthlyData(month: string): void {
    const allData = this.getAllMonthlyData();
    delete allData[month];

    this.safeRun('clearMonthlyData.localStorage', () => {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allData));
    });

    this.emitChange({ type: 'monthlyData', month });
  }

  saveEmployeeName(name: string): void {
    this.safeRun('saveEmployeeName.localStorage', () => {
      localStorage.setItem(this.NAME_KEY, name || '');
    });
    this.emitChange({ type: 'employeeName' });
  }

  getEmployeeName(): string | null {
    return this.safeRead('getEmployeeName.localStorage', () => {
      const v = localStorage.getItem(this.NAME_KEY);
      return v && v.length > 0 ? v : null;
    }, null);
  }

  saveExtracts(extracts: unknown[]): void {
    this.safeRun('saveExtracts.localStorage', () => {
      localStorage.setItem(this.EXTRACTS_KEY, JSON.stringify(extracts || []));
    });
    this.emitChange({ type: 'extracts' });
  }

  getExtracts(): any[] {
    return this.safeRead('getExtracts.localStorage', () => {
      const raw = localStorage.getItem(this.EXTRACTS_KEY);
      return raw ? JSON.parse(raw) : [];
    }, []);
  }

  saveAdminEmail(email: string): void {
    this.safeRun('saveAdminEmail.localStorage', () => {
      localStorage.setItem(this.ADMIN_EMAIL_KEY, email || '');
    });
    this.emitChange({ type: 'adminEmail' });
  }

  getAdminEmail(): string | null {
    return this.safeRead('getAdminEmail.localStorage', () => {
      const v = localStorage.getItem(this.ADMIN_EMAIL_KEY);
      return v && v.length > 0 ? v : null;
    }, null);
  }

  saveExportHistory(item: {
    filename: string;
    date: string;
    dataUrl?: string | null;
    filePath?: string | null;
    sizeBytes?: number | null;
    checksum?: string | null;
    source?: 'electron' | 'browser';
  }): void {
    const hist = this.getExportHistory();
    const normalized = normalizeHistoryItem(item);
    hist.unshift(normalized);
    this.writeExportHistory(hist);
  }

  getExportHistory(): ExportHistoryItem[] {
    const parsed = this.safeRead<unknown[]>(
      'getExportHistory.localStorage',
      () => {
        const raw = localStorage.getItem(this.EXPORT_HISTORY_KEY) || '[]';
        const json = JSON.parse(raw);
        return Array.isArray(json) ? json : [];
      },
      [],
    );
    return normalizeHistoryList(parsed);
  }

  setExportHistory(items: unknown[]): void {
    const next = normalizeHistoryList(items);
    this.writeExportHistory(next);
  }

  removeExportHistoryItem(item: {
    filename?: string;
    date?: string;
    dataUrl?: string | null;
    filePath?: string | null;
    checksum?: string | null;
  }): void {
    const hist = this.getExportHistory();
    if (hist.length === 0) return;

    const target = normalizeHistoryItem({
      filename: item?.filename || '',
      date: item?.date || '',
      filePath: item?.filePath || null,
      checksum: item?.checksum || null,
    });

    const idx = hist.findIndex((entry) => {
      const sameFilename = entry.filename === target.filename;
      const sameDate = entry.date === target.date;
      const samePath = (entry.filePath || '') === (target.filePath || '');
      const sameChecksum = (entry.checksum || '') === (target.checksum || '');
      return sameFilename && sameDate && samePath && sameChecksum;
    });

    if (idx < 0) return;

    hist.splice(idx, 1);
    this.writeExportHistory(hist);
  }

  clearExportHistory(): void {
    this.writeExportHistory([]);
  }

  saveCurrentMonthKey(key: string): void {
    this.safeRun('saveCurrentMonthKey.localStorage', () => {
      localStorage.setItem(this.CURRENT_MONTH_KEY, key || '');
    });
    this.emitChange({ type: 'currentMonth', key });
  }

  getCurrentMonthKey(): string | null {
    return this.safeRead('getCurrentMonthKey.localStorage', () => {
      const v = localStorage.getItem(this.CURRENT_MONTH_KEY);
      return v && v.length > 0 ? v : null;
    }, null);
  }

  saveUiState(state: unknown): void {
    this.safeRun('saveUiState.localStorage', () => {
      localStorage.setItem(this.UI_STATE_KEY, JSON.stringify(state || {}));
    });
    this.emitChange({ type: 'uiState' });
  }

  getUiState(): any {
    return this.safeRead('getUiState.localStorage', () => {
      const raw = localStorage.getItem(this.UI_STATE_KEY);
      return raw ? JSON.parse(raw) : {};
    }, {});
  }

  private getCurrentMonthKeyValue(): string {
    const now = new Date();
    return `${now.getFullYear()}-${(now.getMonth() + 1)
      .toString()
      .padStart(2, '0')}`;
  }

  private migrateLegacyExtracts(): void {
    const current = this.safeRead(
      'migrateLegacyExtracts.readCurrent',
      () => localStorage.getItem(this.EXTRACTS_KEY),
      null,
    );
    if (current) return;

    for (const legacyKey of this.LEGACY_EXTRACTS_KEYS) {
      const migrated = this.safeRead<boolean>(
        `migrateLegacyExtracts.${legacyKey}`,
        () => {
          const raw = localStorage.getItem(legacyKey);
          if (!raw) return false;
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) return false;
          localStorage.setItem(this.EXTRACTS_KEY, JSON.stringify(parsed));
          return true;
        },
        false,
      );
      if (migrated) return;
    }
  }

  private ensureCurrentMonthKey(): void {
    const existing = this.safeRead(
      'ensureCurrentMonthKey.read',
      () => localStorage.getItem(this.CURRENT_MONTH_KEY),
      null,
    );
    if (existing) return;

    this.safeRun('ensureCurrentMonthKey.write', () => {
      localStorage.setItem(this.CURRENT_MONTH_KEY, this.getCurrentMonthKeyValue());
    });
  }

  private ensureDefaultExtracts(): void {
    const hasCustom = this.safeRead<boolean>(
      'ensureDefaultExtracts.read',
      () => {
        const raw = localStorage.getItem(this.EXTRACTS_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return Array.isArray(parsed) && parsed.length > 0;
      },
      false,
    );

    if (hasCustom) return;

    const defaults = [
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
    ];

    this.safeRun('ensureDefaultExtracts.write', () => {
      localStorage.setItem(this.EXTRACTS_KEY, JSON.stringify(defaults));
    });
  }

  private migrateExportHistory(): void {
    const normalized = this.getExportHistory();
    this.writeExportHistory(normalized, false);
  }

  private writeExportHistory(
    items: ExportHistoryItem[],
    emitChange: boolean = true,
  ): void {
    const normalized = normalizeHistoryList(items);
    this.safeRun('writeExportHistory.localStorage', () => {
      localStorage.setItem(this.EXPORT_HISTORY_KEY, JSON.stringify(normalized));
    });
    if (emitChange) this.emitChange({ type: 'exportHistory' });
  }

  private getAllMonthlyData(): MonthlyData {
    return this.safeRead('getAllMonthlyData.localStorage', () => {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? (JSON.parse(data) as MonthlyData) : {};
    }, {});
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

  private emitChange(detail: Record<string, unknown>): void {
    this.safeRun('emitChange.dispatchEvent', () => {
      this.changes.dispatchEvent(new CustomEvent('change', { detail }));
    });
  }

  private safeRun(context: string, action: () => void): void {
    try {
      action();
    } catch (error) {
      this.logger.warn('PersistenceService', context, error);
    }
  }

  private safeRead<T>(context: string, action: () => T, fallback: T): T {
    try {
      return action();
    } catch (error) {
      this.logger.warn('PersistenceService', context, error);
      return fallback;
    }
  }
}


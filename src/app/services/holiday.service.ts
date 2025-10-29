import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface Holiday {
  id: string;
  date: string;
  reason?: string;
}

type MonthKey = string;

interface HolidayState {
  [month: MonthKey]: Holiday[];
}

const STORAGE_KEY = 'app.holidays.v1';

const ITALIAN_HOLIDAYS = [
  { date: '01-01', reason: 'Capodanno' },
  { date: '01-06', reason: 'Epifania' },
  { date: '04-25', reason: 'Festa della Liberazione' },
  { date: '05-01', reason: 'Festa del Lavoro' },
  { date: '06-02', reason: 'Festa della Repubblica' },
  { date: '08-15', reason: 'Ferragosto' },
  { date: '11-01', reason: 'Ognissanti' },
  { date: '12-08', reason: 'Immacolata Concezione' },
  { date: '12-25', reason: 'Natale' },
  { date: '12-26', reason: 'Santo Stefano' }
];

function toMonthKey(dateIso: string): MonthKey {
  return dateIso.slice(0, 7);
}

function isWeekend(dateIso: string): boolean {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(y, (m - 1), d);
  const day = dt.getDay();
  return day === 0 || day === 6;
}

function generateId(dateIso: string): string {
  return `h-${dateIso}-${Math.random().toString(36).slice(2, 8)}`;
}

function calculateEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  
  return new Date(year, month - 1, day);
}

function calculateMovableHolidays(year: number): Holiday[] {
  const easter = calculateEaster(year);
  const holidays: Holiday[] = [];
  
  const easterMonday = new Date(easter);
  easterMonday.setDate(easter.getDate() + 1);
  
  holidays.push({
    id: `easter-monday-${year}`,
    date: formatDate(easterMonday),
    reason: 'Lunedì dell\'Angelo (Pasquetta)'
  });
  
  return holidays;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@Injectable({ providedIn: 'root' })
export class HolidayService {
  private state$ = new BehaviorSubject<HolidayState>(this.load());

  holidays$ = this.state$.asObservable();

  private load(): HolidayState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const savedState = raw ? (JSON.parse(raw) as HolidayState) : {};
      
      return this.initializeItalianHolidays(savedState);
    } catch {
      return this.initializeItalianHolidays({});
    }
  }

  private initializeItalianHolidays(savedState: HolidayState): HolidayState {
    const state = { ...savedState };
    const currentYear = new Date().getFullYear();
    
    for (let year = 2020; year <= 2030; year++) {
      ITALIAN_HOLIDAYS.forEach(fixedHoliday => {
        const dateIso = `${year}-${fixedHoliday.date}`;
        const monthKey = toMonthKey(dateIso);
        
        if (!state[monthKey]) {
          state[monthKey] = [];
        }
        
        const exists = state[monthKey].some(h => h.date === dateIso);
        
        if (!exists && !isWeekend(dateIso)) {
          state[monthKey].push({
            id: generateId(dateIso),
            date: dateIso,
            reason: fixedHoliday.reason
          });
        }
      });
      
      const movableHolidays = calculateMovableHolidays(year);
      movableHolidays.forEach(holiday => {
        const monthKey = toMonthKey(holiday.date);
        
        if (!state[monthKey]) {
          state[monthKey] = [];
        }
        
        const exists = state[monthKey].some(h => h.date === holiday.date);
        
        if (!exists && !isWeekend(holiday.date)) {
          state[monthKey].push(holiday);
        }
      });
    }
    
    return state;
  }

  private persist(state: HolidayState): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  getHolidaysForMonth(year: number, month1to12: number): Holiday[] {
    const monthKey = `${year.toString().padStart(4, '0')}-${month1to12.toString().padStart(2, '0')}`;
    const state = this.state$.value;
    return state[monthKey]?.slice().sort((a, b) => a.date.localeCompare(b.date)) ?? [];
  }

  getCompiledDaysForMonth(year: number, month1to12: number): Set<string> {
    return new Set(this.getHolidaysForMonth(year, month1to12).map(h => h.date));
  }

  isHoliday(dateIso: string): boolean {
    const key = toMonthKey(dateIso);
    const list = this.state$.value[key] ?? [];
    return list.some(h => h.date === dateIso);
  }

  addHoliday(dateIso: string, reason?: string):
    | { status: 'saved'; holiday: Holiday }
    | { status: 'ignored-weekend' }
    | { status: 'exists' } {
    if (!dateIso) {
      return { status: 'ignored-weekend' };
    }
    if (isWeekend(dateIso)) {
      return { status: 'ignored-weekend' };
    }

    const key = toMonthKey(dateIso);
    const state = { ...this.state$.value };
    const list = (state[key]?.slice() ?? []);

    if (list.some(h => h.date === dateIso)) {
      return { status: 'exists' };
    }

    const holiday: Holiday = {
      id: generateId(dateIso),
      date: dateIso,
      reason,
    };

    list.push(holiday);
    state[key] = list;
    this.state$.next(state);
    this.persist(state);

    return { status: 'saved', holiday };
  }

  removeHolidayByDate(dateIso: string): boolean {
    const key = toMonthKey(dateIso);
    const state = { ...this.state$.value };
    const list = state[key] ?? [];
    const next = list.filter(h => h.date !== dateIso);
    if (next.length === list.length) return false;
    state[key] = next;
    this.state$.next(state);
    this.persist(state);
    return true;
  }

  isItalianHoliday(dateIso: string): boolean {
    const [year, month, day] = dateIso.split('-').map(Number);
    const dateStr = `${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    
    const isFixedHoliday = ITALIAN_HOLIDAYS.some(h => h.date === dateStr);
    if (isFixedHoliday) return true;
    
    const movableHolidays = calculateMovableHolidays(year);
    return movableHolidays.some(h => h.date === dateIso);
  }

debugHolidayCheck(dateIso: string): void {
  const key = toMonthKey(dateIso);
  const state = this.state$.value;
  const list = state[key] ?? [];
  const isHoliday = list.some(h => h.date === dateIso);
  
  console.log(`🔍 DEBUG HOLIDAY CHECK:
    - Data: ${dateIso}
    - Chiave mese: ${key}
    - Festività nel mese:`, list);
  console.log(`   Risultato isHoliday(): ${isHoliday}`);
}
}
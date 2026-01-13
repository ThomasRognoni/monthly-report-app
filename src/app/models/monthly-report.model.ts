export interface DayEntry {
  date: Date;
  workHours?: number;
  notes?: string;
}

export interface MonthlyReport {
  employeeName: string;
  month: Date;
  days: DayEntry[];
  totalWorkDays: number;
}

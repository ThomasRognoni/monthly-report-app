export interface DayEntry {
  date: Date;
  code: string;
  activity: string;
  extract?: string;
  client?: string;
  hours: number;
  notes?: string;
}

export interface Extract {
  id: string;
  code: string;
  description: string;
  client: string;
  totalDays: number;
}

export interface MonthlyReport {
  employeeName: string;
  month: Date;
  days: DayEntry[];
  totalWorkDays: number;
}
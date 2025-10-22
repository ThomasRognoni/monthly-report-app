// services/persistence.service.ts
import { Injectable } from '@angular/core';
import { DayEntry } from '../models/day-entry.model';

interface MonthlyData {
  [key: string]: DayEntry[]; // key: 'YYYY-MM'
}

@Injectable({
  providedIn: 'root'
})
export class PersistenceService {
  private readonly STORAGE_KEY = 'monthly-report-data';

  saveMonthlyData(month: string, data: DayEntry[]): void {
    const allData = this.getAllMonthlyData();
    allData[month] = data.map(day => this.serializeDate(day));
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allData));
  }

  getMonthlyData(month: string): DayEntry[] {
    const allData = this.getAllMonthlyData();
    const data = allData[month];
    return data ? data.map(day => this.deserializeDate(day)) : [];
  }

  clearMonthlyData(month: string): void {
    const allData = this.getAllMonthlyData();
    delete allData[month];
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allData));
  }

  private getAllMonthlyData(): MonthlyData {
    const data = localStorage.getItem(this.STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  }

  private serializeDate(day: DayEntry): any {
    return {
      ...day,
      date: day.date.toISOString()
    };
  }

  private deserializeDate(day: any): DayEntry {
    return {
      ...day,
      date: new Date(day.date)
    };
  }
}
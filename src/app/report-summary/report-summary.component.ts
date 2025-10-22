import { Component, Input, ChangeDetectionStrategy, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HolidayService, Holiday } from '../services/holiday.service';

@Component({
  selector: 'app-report-summary',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './report-summary.component.html',
  styleUrls: ['./report-summary.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReportSummaryComponent implements OnInit, OnDestroy {
  @Input() employeeName: string = '';
  @Input() currentMonth: Date = new Date();
  @Input() totalWorkDays: number = 0;
  @Input() totalDeclaredDays: number = 0;
  @Input() quadrature: number = 0;
  @Input() overtime: number = 0;
  @Input() activityTotals: {[key: string]: number} = {};
  @Input() activityDays: {[key: string]: number} = {};
  @Input() activityCodes: any[] = [];

  private readonly holidayService = inject(HolidayService);
  private readonly componentName = 'ReportSummaryComponent';

  holidays: Holiday[] = [];
  compiledDays = new Set<string>();

  // Computed properties for better template usage
  get quadratureStatus(): string {
    if (this.quadrature < 0) return 'negative';
    if (this.quadrature > 0) return 'positive';
    return 'balanced';
  }

  get quadratureIcon(): string {
    if (this.quadrature < 0) return '⚠️';
    if (this.quadrature > 0) return 'ℹ️';
    return '✅';
  }

  get formattedMonthYear(): string {
    return this.currentMonth.toLocaleDateString('it-IT', {
      month: 'long',
      year: 'numeric'
    });
  }

  /**
   * Get activity code description by code
   */
  getActivityDescription(code: string): string {
    const activity = this.activityCodes.find(act => act.code === code);
    return activity?.description || code;
  }

  /**
   * Get sorted activity codes for consistent display
   */
  get sortedActivityCodes(): string[] {
    return Object.keys(this.activityTotals).sort();
  }

  ngOnInit(): void {
    console.log(`${this.componentName} initialized`);
    this.refresh();
  }

  ngOnDestroy(): void {
    console.log(`${this.componentName} destroyed`);
  }

  /**
   * Refresh holiday data for the current month
   */
  refresh(): void {
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth() + 1;

    this.holidays = this.holidayService.getHolidaysForMonth(year, month);
    this.compiledDays = this.holidayService.getCompiledDaysForMonth(year, month);
  }

  /**
   * Add a new holiday
   * @param dateIso - Date in ISO string format
   * @param reason - Optional reason for the holiday
   */
  addHoliday(dateIso: string, reason?: string): void {
    const result = this.holidayService.addHoliday(dateIso, reason);
    
    // Provide user feedback based on result status
    switch (result.status) {
      case 'ignored-weekend':
        console.warn('Holiday not added: date falls on weekend');
        break;
      case 'exists':
        console.warn('Holiday already exists for this date');
        break;
      case 'saved':
        console.log('Holiday added successfully');
        break;
    }
    
    this.refresh();
  }

  /**
   * Remove holiday by date
   * @param dateIso - Date in ISO string format
   */
  removeHoliday(dateIso: string): void {
    this.holidayService.removeHolidayByDate(dateIso);
    this.refresh();
  }

  /**
   * Check if a date is compiled
   * @param dateIso - Date in ISO string format
   * @returns boolean indicating if date is compiled
   */
  isCompiled(dateIso: string): boolean {
    return this.compiledDays.has(dateIso);
  }

  /**
   * Calculate percentage for progress indicators
   */
  getPercentage(value: number, total: number): number {
    if (total === 0) return 0;
    return (value / total) * 100;
  }

  /**
   * Format number with Italian locale
   */
  formatNumber(value: number): string {
    return value.toLocaleString('it-IT', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  /**
   * Handle month change from parent component
   */
  onMonthChange(newMonth: Date): void {
    this.currentMonth = newMonth;
    this.refresh();
  }
}
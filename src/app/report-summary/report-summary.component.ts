import {
  Component,
  Input,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HolidayService, Holiday } from '../services/holiday.service';

@Component({
  selector: 'app-report-summary',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './report-summary.component.html',
  styleUrls: ['./report-summary.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportSummaryComponent implements OnInit, OnDestroy {
  @Input() employeeName: string = '';
  @Input() currentMonth: Date = new Date();
  @Input() totalWorkDays: number = 0;
  @Input() totalDeclaredDays: number = 0;
  @Input() quadrature: number = 0;
  @Input() overtime: number = 0;
  @Input() activityTotals: { [key: string]: number } = {};
  @Input() activityDays: { [key: string]: number } = {};
  @Input() activityCodes: any[] = [];

  private readonly holidayService = inject(HolidayService);
  private readonly componentName = 'ReportSummaryComponent';

  holidays: Holiday[] = [];
  compiledDays = new Set<string>();

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
      year: 'numeric',
    });
  }

  getActivityDescription(code: string): string {
    const activity = this.activityCodes.find((act) => act.code === code);
    return activity?.description || code;
  }

  get sortedActivityCodes(): string[] {
    return Object.keys(this.activityTotals).sort();
  }

  ngOnInit(): void {
    this.refresh();
  }

  ngOnDestroy(): void {}

  refresh(): void {
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth() + 1;

    this.holidays = this.holidayService.getHolidaysForMonth(year, month);
    this.compiledDays = this.holidayService.getCompiledDaysForMonth(
      year,
      month
    );
  }

  addHoliday(dateIso: string, reason?: string): void {
    const result = this.holidayService.addHoliday(dateIso, reason);

    switch (result.status) {
      case 'ignored-weekend':
        console.warn('Holiday not added: date falls on weekend');
        break;
      case 'exists':
        console.warn('Holiday already exists for this date');
        break;
      case 'saved':
        break;
    }

    this.refresh();
  }

  removeHoliday(dateIso: string): void {
    this.holidayService.removeHolidayByDate(dateIso);
    this.refresh();
  }

  isCompiled(dateIso: string): boolean {
    return this.compiledDays.has(dateIso);
  }

  getPercentage(value: number, total: number): number {
    if (total === 0 || !Number.isFinite(value) || !Number.isFinite(total)) {
      return 0;
    }
    return (value / total) * 100;
  }

  formatNumber(value: number): string {
    return value.toLocaleString('it-IT', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  onMonthChange(newMonth: Date): void {
    this.currentMonth = newMonth;
    this.refresh();
  }

  debugActivityData(): void {
    void this.activityTotals;
    void this.activityDays;
    void this.totalDeclaredDays;
    this.sortedActivityCodes.forEach((code) => {
      void code;
    });
  }
}

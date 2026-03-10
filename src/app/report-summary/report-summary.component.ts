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
import { hoursToDaysRounded } from '../utils';

@Component({
  selector: 'app-report-summary',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './report-summary.component.html',
  styleUrls: ['./report-summary.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportSummaryComponent implements OnInit, OnDestroy {
  private readonly REQUIRED_DAILY_HOURS = 8;
  private readonly HOURS_EPSILON = 1e-6;
  private readonly OVERTIME_CODE = 'ST';

  @Input() employeeName: string = '';
  @Input() currentMonth: Date = new Date();
  @Input() totalWorkDays: number = 0;
  @Input() totalDeclaredHours: number = 0;
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

  get requiredRegularHours(): number {
    return this.totalWorkDays * this.REQUIRED_DAILY_HOURS;
  }

  get regularDeclaredHours(): number {
    const regularHours = this.totalDeclaredHours - this.overtime;
    return regularHours > 0 ? regularHours : 0;
  }

  get regularDeclaredDays(): number {
    return hoursToDaysRounded(this.regularDeclaredHours);
  }

  get displayedQuadrature(): number {
    return this.totalWorkDays - this.regularDeclaredDays;
  }

  get isRegularCoverageComplete(): boolean {
    return (
      this.regularDeclaredHours + this.HOURS_EPSILON >= this.requiredRegularHours
    );
  }

  get quadratureSummary(): string {
    if (this.isRegularCoverageComplete) {
      if (this.overtime > this.HOURS_EPSILON) {
        return `Compilazione completa + ${this.formatHours(this.overtime)} di straordinario`;
      }
      return 'Compilazione completa';
    }
    const missingHours = Math.max(
      0,
      this.requiredRegularHours - this.regularDeclaredHours,
    );
    return `Mancano ${this.formatHours(missingHours)} ordinarie`;
  }

  get quadratureStatus(): string {
    if (this.displayedQuadrature < -this.HOURS_EPSILON) return 'negative';
    if (this.displayedQuadrature > this.HOURS_EPSILON) return 'positive';
    return 'balanced';
  }

  get quadratureIcon(): string {
    if (this.displayedQuadrature < -this.HOURS_EPSILON) return '⚠️';
    if (this.displayedQuadrature > this.HOURS_EPSILON) return 'ℹ️';
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
    // Mostra tutte le attività, anche se il valore è zero
    return this.activityCodes.map((a: any) => a.code).sort();
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
      month,
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

  getBoundedPercentage(value: number, total: number): number {
    const percentage = this.getPercentage(value, total);
    return Math.min(Math.max(percentage, 0), 100);
  }

  formatNumber(value: number): string {
    if (!value) return '0';
    return value.toLocaleString('it-IT', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
  }

  formatHours(value: number): string {
    if (!value) return '0 h';
    return `${value.toLocaleString('it-IT', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} h`;
  }

  private normalizeCode(code: string): string {
    return (code || '').trim().toUpperCase();
  }

  private isOvertimeCode(code: string): boolean {
    return this.normalizeCode(code) === this.OVERTIME_CODE;
  }

  private getActivityHours(code: string): number {
    const hours = this.activityTotals?.[code] || 0;
    return Number.isFinite(hours) ? hours : 0;
  }

  getActivityPercentage(code: string): number {
    const activityHours = this.getActivityHours(code);
    if (activityHours <= 0) return 0;

    const baseHours = this.isOvertimeCode(code)
      ? this.requiredRegularHours
      : this.regularDeclaredHours;

    return this.getBoundedPercentage(activityHours, baseHours);
  }

  getTotalCoveragePercentage(): number {
    return this.getBoundedPercentage(
      this.regularDeclaredHours,
      this.requiredRegularHours,
    );
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

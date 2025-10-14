import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-report-summary',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './report-summary.component.html',
  styleUrls: ['./report-summary.component.css']
})
export class ReportSummaryComponent {
  @Input() employeeName: string = '';
  @Input() currentMonth: Date = new Date();
  @Input() totalWorkDays: number = 0;
  @Input() totalDeclaredDays: number = 0;
  @Input() quadrature: number = 0;
  @Input() overtime: number = 0;
  @Input() activityTotals: {[key: string]: number} = {};
  @Input() activityCodes: any[] = [];
}
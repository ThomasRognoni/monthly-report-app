import { Component } from '@angular/core';
import { MonthlyReportComponent } from './monthly-report/monthly-report.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MonthlyReportComponent],
  template: '<app-monthly-report />'
})
export class AppComponent {
  title = 'Monthly Report App';
}
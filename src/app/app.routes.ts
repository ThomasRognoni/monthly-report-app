import { Routes } from '@angular/router';
import { MonthlyReportComponent } from './monthly-report/monthly-report.component';

export const routes: Routes = [
  { path: 'monthly-report', component: MonthlyReportComponent },
  { path: '**', redirectTo: '/monthly-report' }
];
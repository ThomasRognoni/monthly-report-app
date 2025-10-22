import { Routes } from '@angular/router';
import { MonthlyReportComponent } from './monthly-report/monthly-report.component';
import { HomeComponent } from './homePage/home.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'monthly-report', component: MonthlyReportComponent },
  { path: '**', redirectTo: '' }
];
import { Routes } from '@angular/router';
import { MonthlyReportComponent } from './monthly-report/monthly-report.component';
import { HomeComponent } from './home/home.component';
import { ExtractsPageComponent } from './pages/extracts-page/extracts-page.component';
import { ExportHistoryComponent } from './pages/export-history/export-history.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'monthly-report', component: MonthlyReportComponent },
  { path: 'extracts', component: ExtractsPageComponent },

  { path: 'export-history', component: ExportHistoryComponent },
  { path: '**', redirectTo: '/' },
];

import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'monthly-report',
    loadComponent: () =>
      import('./monthly-report/monthly-report.component').then(
        (m) => m.MonthlyReportComponent
      ),
  },
  {
    path: 'extracts',
    loadComponent: () =>
      import('./pages/extracts-page/extracts-page.component').then(
        (m) => m.ExtractsPageComponent
      ),
  },
  {
    path: 'export-history',
    loadComponent: () =>
      import('./pages/export-history/export-history.component').then(
        (m) => m.ExportHistoryComponent
      ),
  },
  { path: '**', redirectTo: '/' },
];

import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExtractListComponent } from '../../extract-list/extract-list.component';
import { PersistenceService } from '../../services/persistence.service';

@Component({
  selector: 'app-extracts-page',
  standalone: true,
  imports: [CommonModule, ExtractListComponent],
  templateUrl: './extracts-page.component.html',
  styleUrls: ['./extracts-page.component.css'],
})
export class ExtractsPageComponent {
  private persistence = inject(PersistenceService);

  extracts = [] as any[];
  extractTotals = {} as { [key: string]: number };
  totalDeclaredDays: number = 0;
  currentMonthKey: string | null = null;
  showManager = false;
  newExtractId = '';
  newExtractCode = '';
  newExtractDesc = '';
  newExtractClient = '';
  editingExtractId: string | null = null;

  constructor() {
    this.refresh();
    try {
      this.persistence.changes.addEventListener('change', (e: any) => {
        // refresh on extracts, monthlyData and currentMonth so the view
        // immediately reflects the selected month and its data
        if (
          e?.detail?.type === 'extracts' ||
          e?.detail?.type === 'monthlyData' ||
          e?.detail?.type === 'currentMonth'
        )
          this.refresh();
      });
    } catch (e) {}
  }

  private refresh() {
    try {
      // clear previous values immediately so UI shows cleared cards while we
      // recompute for the selected month
      this.extracts = this.persistence.getExtracts();
      this.extractTotals = {};
      this.totalDeclaredDays = 0;
      // compute totals for current month if available
      const monthKey = this.persistence.getCurrentMonthKey();
      this.currentMonthKey = monthKey;
      if (monthKey) {
        const days = this.persistence.getMonthlyData(monthKey);
        const totals: { [key: string]: number } = {};
        days.forEach((d: any) => {
          // count top-level extract on the day (legacy) if present
          const dayExtract = d.extract;
          if (dayExtract) {
            totals[dayExtract] = (totals[dayExtract] || 0) + (d.hours || 0);
          }
          // also count per-task extracts (current model)
          const tasks = d.tasks || [];
          tasks.forEach((t: any) => {
            const tExt = t.extract;
            if (!tExt) return;
            totals[tExt] = (totals[tExt] || 0) + (t.hours || 0);
          });
        });
        this.extractTotals = totals;
        // compute declared unique days for the month (based on day.date)
        const uniqueDates = new Set<string>();
        days.forEach((d: any) => {
          try {
            const date = new Date(d.date);
            uniqueDates.add(date.toDateString());
          } catch (e) {}
        });
        this.totalDeclaredDays = uniqueDates.size;
      } else {
        this.extractTotals = {};
        this.totalDeclaredDays = 0;
      }
    } catch (e) {
      this.extracts = [];
      this.extractTotals = {};
      this.totalDeclaredDays = 0;
    }
  }

  onAddExtract(payload: Partial<any>) {
    try {
      const list = this.persistence.getExtracts() || [];
      // if editing (id exists), replace
      if (payload && payload['id']) {
        const exists = list.find((x: any) => x['id'] === payload['id']);
        if (exists) {
          const next = list.map((x: any) =>
            x['id'] === payload['id'] ? { ...x, ...payload } : x
          );
          this.persistence.saveExtracts(next);
        } else {
          const next = [...list, { ...payload }];
          this.persistence.saveExtracts(next);
        }
      }
      // reset manager state
      this.editingExtractId = null;
      this.newExtractId = '';
      this.newExtractCode = '';
      this.newExtractDesc = '';
      this.newExtractClient = '';
      this.showManager = false;
      this.refresh();
    } catch (e) {}
  }

  onRemove(id: string) {
    try {
      const list = this.persistence.getExtracts() || [];
      const next = list.filter((x: any) => x['id'] !== id);
      this.persistence.saveExtracts(next);
      this.refresh();
    } catch (e) {}
  }

  onStartEdit(ex: any) {
    // populate manager fields and open manager for editing
    this.editingExtractId = ex?.id || null;
    this.newExtractId = ex?.id || '';
    this.newExtractCode = ex?.code || '';
    this.newExtractDesc = ex?.description || '';
    this.newExtractClient = ex?.client || '';
    this.showManager = true;
  }

  onCancelEdit() {
    this.editingExtractId = null;
    this.newExtractId = '';
    this.newExtractCode = '';
    this.newExtractDesc = '';
    this.newExtractClient = '';
    this.showManager = false;
    this.refresh();
  }
}

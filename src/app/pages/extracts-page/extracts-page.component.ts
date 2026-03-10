import { Component, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExtractListComponent } from '../../extract-list/extract-list.component';
import { PersistenceService } from '../../services/persistence.service';
import { hoursToDaysRounded } from '../../utils';
import { AppLoggerService } from '../../services/app-logger.service';

@Component({
  selector: 'app-extracts-page',
  standalone: true,
  imports: [CommonModule, ExtractListComponent],
  templateUrl: './extracts-page.component.html',
  styleUrls: ['./extracts-page.component.css'],
})
export class ExtractsPageComponent implements OnDestroy {
  private persistence = inject(PersistenceService);
  private logger = new AppLoggerService();
  private persistenceChangeHandler?: EventListener;

  extracts = [] as any[];
  extractTotals = {} as { [key: string]: number };
  totalDeclaredHours: number = 0;
  totalDeclaredDays: number = 0;
  currentMonthKey: string | null = null;
  showManager = false;
  newExtractId = '';
  newExtractCode = '';
  newExtractDesc = '';
  newExtractClient = '';
  editingExtractId: string | null = null;
  lastActionMessage = '';
  private actionMessageTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.refresh();
    try {
      const ui = this.persistence.getUiState() || {};
      if (ui) {
        this.newExtractId = ui.newExtractId || this.newExtractId;
        this.newExtractCode = ui.newExtractCode || this.newExtractCode;
        this.newExtractDesc = ui.newExtractDesc || this.newExtractDesc;
        this.newExtractClient = ui.newExtractClient || this.newExtractClient;
        this.editingExtractId = ui.editingExtractId || this.editingExtractId;
        this.showManager = ui.showManager || this.showManager;
      }
    } catch (e) {
      this.logger.warn(
        'ExtractsPageComponent',
        'Ripristino stato UI estratti non riuscito',
        e,
      );
    }
    try {
      this.persistenceChangeHandler = (e: Event) => {
        const change = e as CustomEvent<any>;
        if (
          change?.detail?.type === 'extracts' ||
          change?.detail?.type === 'monthlyData' ||
          change?.detail?.type === 'currentMonth'
        )
          this.refresh();
      };
      this.persistence.changes.addEventListener(
        'change',
        this.persistenceChangeHandler,
      );
    } catch (e) {
      this.logger.warn(
        'ExtractsPageComponent',
        'Registrazione listener persistence-change non riuscita',
        e,
      );
    }
  }

  private persistUiForm() {
    try {
      this.persistence.saveUiState({
        newExtractId: this.newExtractId,
        newExtractCode: this.newExtractCode,
        newExtractDesc: this.newExtractDesc,
        newExtractClient: this.newExtractClient,
        editingExtractId: this.editingExtractId,
        showManager: this.showManager,
      });
    } catch (e) {
      this.logger.warn(
        'ExtractsPageComponent',
        'Persistenza stato UI estratti non riuscita',
        e,
      );
    }
  }

  onNewExtractIdChange(v: string) {
    this.newExtractId = v || '';
    this.persistUiForm();
  }

  onNewExtractCodeChange(v: string) {
    this.newExtractCode = v || '';
    this.persistUiForm();
  }

  onNewExtractDescChange(v: string) {
    this.newExtractDesc = v || '';
    this.persistUiForm();
  }

  onNewExtractClientChange(v: string) {
    this.newExtractClient = v || '';
    this.persistUiForm();
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private hoursToDays(hours: number): number {
    return hoursToDaysRounded(this.toNumber(hours));
  }

  private refresh() {
    try {
      this.extracts = this.persistence.getExtracts();
      this.extractTotals = {};
      this.totalDeclaredHours = 0;
      this.totalDeclaredDays = 0;
      if (!this.persistence.hasSessionDayData()) {
        this.currentMonthKey = null;
        return;
      }
      const monthKey = this.persistence.getCurrentMonthKey();
      this.currentMonthKey = monthKey;
      if (monthKey) {
        const days = this.persistence.getMonthlyData(monthKey);
        const totals: { [key: string]: number } = {};
        let monthHours = 0;
        days.forEach((d: any) => {
          const tasks =
            Array.isArray(d.tasks) && d.tasks.length > 0
              ? d.tasks
              : [{ extract: d.extract, hours: this.toNumber(d.hours) }];
          let dayHours = 0;
          tasks.forEach((t: any) => {
            const tExt = t.extract;
            const taskHours = this.toNumber(t?.hours);
            dayHours += taskHours;
            if (!tExt) return;
            totals[tExt] = (totals[tExt] || 0) + taskHours;
          });
          monthHours += dayHours;
        });
        this.extractTotals = totals;
        this.totalDeclaredHours = monthHours;
        this.totalDeclaredDays = this.hoursToDays(monthHours);
      } else {
        this.extractTotals = {};
        this.totalDeclaredHours = 0;
        this.totalDeclaredDays = 0;
      }
    } catch (e) {
      this.logger.warn(
        'ExtractsPageComponent',
        'Refresh pagina estratti non riuscito',
        e,
      );
      this.extracts = [];
      this.extractTotals = {};
      this.totalDeclaredHours = 0;
      this.totalDeclaredDays = 0;
    }
  }

  onAddExtract(payload: Partial<any>) {
    try {
      const list = this.persistence.getExtracts() || [];
      if (payload && payload['id']) {
        const normalizeId = (v: unknown) =>
          (v || '').toString().trim().toUpperCase();

        const id = (payload['id'] || '').toString().trim();
        const code = (payload['code'] || '').toString().trim();
        const description = (payload['description'] || '').toString().trim();
        const client = (payload['client'] || '').toString().trim();

        if (!id || !code) return;

        const normalizedId = normalizeId(id);
        const editingNormalizedId = normalizeId(this.editingExtractId);

        const duplicate = list.find((x: any) => {
          const currentId = normalizeId(x?.id);
          if (!currentId || currentId !== normalizedId) return false;
          if (!this.editingExtractId) return true;
          return currentId !== editingNormalizedId;
        });

        if (duplicate) {
          this.setActionMessage(`L'estratto ${id} esiste gia.`);
          return;
        }

        const normalizedPayload = {
          ...payload,
          id,
          code,
          description,
          client,
        };

        if (this.editingExtractId) {
          const next = list.map((x: any) =>
            normalizeId(x?.id) === editingNormalizedId
              ? { ...x, ...normalizedPayload }
              : x,
          );
          this.persistence.saveExtracts(next);
          this.setActionMessage('Estratto aggiornato');
        } else {
          const next = [...list, normalizedPayload];
          this.persistence.saveExtracts(next);
          this.setActionMessage('Estratto aggiunto');
        }
      }
      this.editingExtractId = null;
      this.newExtractId = '';
      this.newExtractCode = '';
      this.newExtractDesc = '';
      this.newExtractClient = '';
      this.showManager = false;
      this.refresh();
    } catch (e) {
      this.logger.warn('ExtractsPageComponent', 'Salvataggio estratto fallito', e);
    }
  }

  onRemove(id: string) {
    try {
      const list = this.persistence.getExtracts() || [];
      const next = list.filter((x: any) => x['id'] !== id);
      this.persistence.saveExtracts(next);
      this.refresh();
      this.setActionMessage(`Estratto ${id} rimosso`);
    } catch (e) {
      this.logger.warn('ExtractsPageComponent', 'Rimozione estratto fallita', e);
    }
  }

  onStartEdit(ex: any) {
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

  private setActionMessage(message: string, clearAfterMs: number = 3200): void {
    if (this.actionMessageTimer) {
      clearTimeout(this.actionMessageTimer);
      this.actionMessageTimer = undefined;
    }
    this.lastActionMessage = message;
    this.actionMessageTimer = setTimeout(() => {
      this.lastActionMessage = '';
      this.actionMessageTimer = undefined;
    }, clearAfterMs);
  }

  ngOnDestroy(): void {
    if (this.persistenceChangeHandler) {
      try {
        this.persistence.changes.removeEventListener(
          'change',
          this.persistenceChangeHandler,
        );
      } catch (e) {
        this.logger.warn(
          'ExtractsPageComponent',
          'Rimozione listener persistence-change non riuscita',
          e,
        );
      }
      this.persistenceChangeHandler = undefined;
    }

    if (this.actionMessageTimer) {
      clearTimeout(this.actionMessageTimer);
      this.actionMessageTimer = undefined;
    }
  }
}


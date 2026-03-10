import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PersistenceService } from '../../services/persistence.service';
import { ButtonModule } from 'primeng/button';
import { AppLoggerService } from '../../services/app-logger.service';

interface ExportHistoryItem {
  filename: string;
  date: string;
  dataUrl?: string | null;
  filePath?: string | null;
  sizeBytes?: number | null;
  checksum?: string | null;
  source?: 'electron' | 'browser';
}

@Component({
  selector: 'app-export-history',
  standalone: true,
  imports: [CommonModule, ButtonModule],
  templateUrl: './export-history.component.html',
  styleUrls: ['./export-history.component.css'],
})
export class ExportHistoryComponent implements OnDestroy {
  private persistence = inject(PersistenceService);
  private logger = new AppLoggerService();
  private feedbackTimer?: ReturnType<typeof setTimeout>;
  private persistenceChangeHandler?: EventListener;
  private undoTimer?: ReturnType<typeof setTimeout>;
  private undoSnapshot: ExportHistoryItem[] | null = null;

  history = [] as ExportHistoryItem[];
  feedbackMessage = '';
  feedbackKind: 'success' | 'error' = 'success';
  undoItem: ExportHistoryItem | null = null;

  constructor() {
    this.refresh();
    try {
      this.persistenceChangeHandler = (e: Event) => {
        const change = e as CustomEvent<any>;
        if (change?.detail?.type === 'exportHistory') this.refresh();
      };
      this.persistence.changes.addEventListener(
        'change',
        this.persistenceChangeHandler,
      );
    } catch (e) {
      this.logger.warn(
        'ExportHistoryComponent',
        'Registrazione listener persistence-change non riuscita',
        e,
      );
    }
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
          'ExportHistoryComponent',
          'Rimozione listener persistence-change non riuscita',
          e,
        );
      }
      this.persistenceChangeHandler = undefined;
    }

    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = undefined;
    }

    this.clearUndoWindow();
  }

  async download(item: ExportHistoryItem): Promise<void> {
    if (item?.filePath && window.electronApi?.openExportFile) {
      try {
        const result = await window.electronApi.openExportFile(item.filePath);
        if (!result?.ok) {
          this.setFeedback(
            "Impossibile aprire il file dallo storico: file non disponibile.",
            'error',
            4200,
          );
        }
      } catch (error) {
        this.logger.warn(
          'ExportHistoryComponent',
          'Apertura file storico in Electron non riuscita',
          error,
        );
        this.setFeedback(
          'Impossibile aprire il file selezionato.',
          'error',
          4200,
        );
      }
      return;
    }

    if (item?.dataUrl) {
      const a = document.createElement('a');
      a.href = item.dataUrl;
      a.download = item.filename || 'export.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }

    this.setFeedback(
      'Download non disponibile per questa voce storica.',
      'error',
      3600,
    );
  }

  remove(item: ExportHistoryItem): void {
    const snapshot = this.history.map((entry) => ({ ...entry }));
    this.persistence.removeExportHistoryItem(item);
    this.armUndoWindow(item, snapshot);
    this.setFeedback(
      'Voce rimossa dallo storico. Puoi annullare entro 5 secondi.',
      'success',
      5000,
    );
  }

  clearHistory(): void {
    this.clearUndoWindow();
    this.persistence.clearExportHistory();
    this.setFeedback('Storico esportazioni svuotato', 'success');
  }

  undoRemove(): void {
    if (!this.undoSnapshot) return;
    this.persistence.setExportHistory(this.undoSnapshot);
    this.setFeedback('Eliminazione annullata', 'success');
    this.clearUndoWindow();
  }

  get canClearHistory(): boolean {
    return this.history.length > 0;
  }

  canDownload(item: ExportHistoryItem): boolean {
    return !!item?.dataUrl || !!item?.filePath;
  }

  formatFileSize(value: number | null | undefined): string {
    const size = Number(value);
    if (!Number.isFinite(size) || size <= 0) return '-';
    if (size < 1024) return `${Math.round(size)} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }

  formatChecksum(value: string | null | undefined): string {
    const checksum = (value || '').trim().toLowerCase();
    if (!checksum) return '-';
    if (checksum.length <= 16) return checksum;
    return `${checksum.slice(0, 8)}...${checksum.slice(-8)}`;
  }

  getSourceLabel(item: ExportHistoryItem): string {
    if (item?.source === 'electron') return 'Locale (Electron)';
    if (item?.source === 'browser') return 'Browser';
    return item?.filePath ? 'Locale (Electron)' : 'Browser';
  }

  get formattedCount(): string {
    const count = this.history.length;
    return `${count} ${count === 1 ? 'esportazione' : 'esportazioni'}`;
  }

  formatDate(value: string): string {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return value || '-';
    return d.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  trackByHistory(index: number, item: ExportHistoryItem): string {
    try {
      return (
        (item?.date || '') +
        '|' +
        (item?.filename || index.toString()) +
        '|' +
        (item?.dataUrl || '') +
        '|' +
        (item?.filePath || '')
      );
    } catch (e) {
      this.logger.warn(
        'ExportHistoryComponent',
        'trackBy fallback per voce storico export',
        e,
      );
      return index.toString();
    }
  }

  private setFeedback(
    message: string,
    kind: 'success' | 'error' = 'success',
    autoResetMs: number = 2600,
  ): void {
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = undefined;
    }
    this.feedbackMessage = message;
    this.feedbackKind = kind;
    this.feedbackTimer = setTimeout(() => {
      this.feedbackMessage = '';
      this.feedbackTimer = undefined;
    }, autoResetMs);
  }

  private refresh(): void {
    try {
      const hist = this.persistence.getExportHistory();
      this.history = Array.isArray(hist) ? (hist as ExportHistoryItem[]) : [];
    } catch (e) {
      this.logger.warn(
        'ExportHistoryComponent',
        'Caricamento storico export non riuscito',
        e,
      );
      this.history = [];
    }
  }

  private armUndoWindow(
    removedItem: ExportHistoryItem,
    snapshot: ExportHistoryItem[],
  ): void {
    this.clearUndoWindow();
    this.undoItem = { ...removedItem };
    this.undoSnapshot = snapshot.map((entry) => ({ ...entry }));
    this.undoTimer = setTimeout(() => {
      this.clearUndoWindow();
    }, 5000);
  }

  private clearUndoWindow(): void {
    if (this.undoTimer) {
      clearTimeout(this.undoTimer);
      this.undoTimer = undefined;
    }
    this.undoItem = null;
    this.undoSnapshot = null;
  }
}


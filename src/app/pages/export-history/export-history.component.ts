import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PersistenceService } from '../../services/persistence.service';

@Component({
  selector: 'app-export-history',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './export-history.component.html',
  styleUrls: ['./export-history.component.css'],
})
export class ExportHistoryComponent {
  private persistence = inject(PersistenceService);

  history = [] as any[];

  constructor() {
    this.refresh();
    // listen for changes
    try {
      this.persistence.changes.addEventListener('change', (e: any) => {
        if (e?.detail?.type === 'exportHistory') this.refresh();
      });
    } catch (e) {}
  }

  download(item: any) {
    // item should include a data URL and filename
    if (!item?.dataUrl) return;
    const a = document.createElement('a');
    a.href = item.dataUrl;
    a.download = item.filename || 'export.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  private refresh() {
    try {
      this.history = this.persistence.getExportHistory();
    } catch (e) {
      this.history = [];
    }
  }
}

import { Component, Input, computed, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Extract } from '../models/day-entry.model';

@Component({
  selector: 'app-extract-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './extract-list.component.html',
  styleUrls: ['./extract-list.component.css']
})
export class ExtractListComponent {
  @Output() manage = new EventEmitter<void>();
  @Input() showManager = false;

  @Input() newExtractId: string = '';
  @Input() newExtractCode: string = '';
  @Input() newExtractDesc: string = '';
  @Input() newExtractClient: string = '';
  @Input() editingExtractId: string | null = null;
  @Input() lastActionMessage: string = '';

  @Output() newExtractIdChange = new EventEmitter<string>();
  @Output() newExtractCodeChange = new EventEmitter<string>();
  @Output() newExtractDescChange = new EventEmitter<string>();
  @Output() newExtractClientChange = new EventEmitter<string>();

  @Output() addExtract = new EventEmitter<Partial<Extract>>();
  @Output() cancelEdit = new EventEmitter<void>();
  @Output() startEdit = new EventEmitter<Extract>();
  @Output() remove = new EventEmitter<string>();
  @Input() extracts: Extract[] = [];
  @Input() extractTotals: { [key: string]: number } = {};
  
  @Input() totalDeclaredDays: number | null = null;

  private readonly HOURS_PER_DAY = 8;

  readonly totalExtractDays = computed(() => 
    Object.values(this.extractTotals).reduce((sum, hours) => sum + this.hoursToDays(hours), 0)
  );

  private hoursToDays(hours: number): number {
    return hours / this.HOURS_PER_DAY;
  }

  getDaysFromHours(hours: number): number {
    return this.hoursToDays(hours);
  }

  getProgressWidth(extractId: string, hours: number): number {
    const extract = this.extracts.find(e => e.id === extractId);
    if (!extract) return 0;

    const actualDays = this.hoursToDays(hours);
    
    const expectedDays = extract.expectedDays || this.calculateDefaultExpectedDays(extract);
    
    if (expectedDays <= 0) return 0;
    
    const percentage = (actualDays / expectedDays) * 100;
    return Math.min(Math.max(percentage, 0), 100);
  }

  private calculateDefaultExpectedDays(extract: Extract): number {
    if (extract.id === 'ESAPAM2024S') {
      return 22;
    }
    
    return 20;
  }

  getTotalExtractDays(): number {
    return this.totalExtractDays();
  }

  get hasExtracts(): boolean {
    return this.extracts.length > 0;
  }

  get hasExtractTotals(): boolean {
    return Object.keys(this.extractTotals).length > 0;
  }

  get sortedExtracts(): Extract[] {
    return [...this.extracts].sort((a, b) => {
      const totalA = this.extractTotals[a.id] || 0;
      const totalB = this.extractTotals[b.id] || 0;
      const daysA = this.hoursToDays(totalA);
      const daysB = this.hoursToDays(totalB);
      return daysB - daysA;
    });
  }

  onManage(): void {
    this.manage.emit();
  }

  onAddExtract(): void {
    if (!this.newExtractId || !this.newExtractCode) return;
    this.addExtract.emit({ id: this.newExtractId || '', code: this.newExtractCode || '', description: this.newExtractDesc || '', client: this.newExtractClient || '' });
  }

  onCancelEdit(): void {
    this.cancelEdit.emit();
  }

  onStartEdit(ex: Extract): void {
    this.startEdit.emit(ex);
  }

  onRemove(id: string): void {
    this.remove.emit(id);
  }
}
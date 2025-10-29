import { Component, Input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Extract } from '../models/day-entry.model';

@Component({
  selector: 'app-extract-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './extract-list.component.html',
  styleUrls: ['./extract-list.component.css']
})
export class ExtractListComponent {
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
}
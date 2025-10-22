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
  
  // Totale giorni dichiarati (date uniche) passato dal parent
  @Input() totalDeclaredDays: number | null = null;

  // Maximum expected days for progress calculation
  private readonly MAX_EXPECTED_DAYS = 20;

  // Computed property for total extract days
  readonly totalExtractDays = computed(() => 
    Object.values(this.extractTotals).reduce((sum, days) => sum + days, 0)
  );

  /**
   * Calculate progress width percentage for visual indicator
   * @param totalDays - Number of days for the extract
   * @returns Percentage value between 0 and 100
   */
  getProgressWidth(totalDays: number): number {
    const percentage = (totalDays / this.MAX_EXPECTED_DAYS) * 100;
    return Math.min(Math.max(percentage, 0), 100); // Clamp between 0 and 100
  }

  /**
   * Get the total number of extract days across all extracts
   * @deprecated Use totalExtractDays computed property instead
   * @returns Total number of extract days
   */
  getTotalExtractDays(): number {
    return this.totalExtractDays();
  }

  /**
   * Check if there are any extracts to display
   */
  get hasExtracts(): boolean {
    return this.extracts.length > 0;
  }

  /**
   * Check if there are any extract totals to display
   */
  get hasExtractTotals(): boolean {
    return Object.keys(this.extractTotals).length > 0;
  }

  /**
   * Get extracts sorted by their total days (descending)
   */
  get sortedExtracts(): Extract[] {
    return [...this.extracts].sort((a, b) => {
      const totalA = this.extractTotals[a.id] || 0;
      const totalB = this.extractTotals[b.id] || 0;
      return totalB - totalA;
    });
  }
}
import { Component, Input } from '@angular/core';
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
  @Input() extractTotals: {[key: string]: number} = {};
}
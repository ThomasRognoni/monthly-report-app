import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterModule, CommonModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
})

export class AppComponent implements OnInit, OnDestroy {
  readonly currentYear = new Date().getFullYear();

  private readonly router = inject(Router);
  private routerSubscription?: Subscription;

  currentRoute: string = '';
  isInitialized = false;

  ngOnInit(): void {
    this.initializeRouterTracking();
    this.isInitialized = true;
  }

  ngOnDestroy(): void {
    this.cleanupSubscriptions();
  }

  private initializeRouterTracking(): void {
    this.routerSubscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.currentRoute = event.urlAfterRedirects;
        this.onRouteChange(this.currentRoute);
      });
  }

  onRouteChange(route: string): void {
    console.log(`Navigated to: ${route}`);
  }

  private cleanupSubscriptions(): void {
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
  }

  get isMonthlyReportRoute(): boolean {
    return this.currentRoute.includes('/monthly-report');
  }

  get isHolidayManagementRoute(): boolean {
    return this.currentRoute.includes('/holiday-management');
  }

  onGlobalError(error: any): void {
    console.error('Global error caught:', error);
  }

  refreshApp(): void {
    console.log('Refreshing application state...');
  }
}
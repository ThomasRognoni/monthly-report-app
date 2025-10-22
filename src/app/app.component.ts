import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterModule, CommonModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.css']
})
export class AppComponent implements OnInit, OnDestroy {
  readonly title = 'Monthly Report App';
  readonly currentYear = new Date().getFullYear();
  
  private readonly router = inject(Router);
  private routerSubscription?: Subscription;
  
  currentRoute: string = '';
  isInitialized = false;

  /**
   * Component initialization
   */
  ngOnInit(): void {
    this.initializeRouterTracking();
    this.isInitialized = true;
    
    console.log(`${this.title} initialized`);
  }

  /**
   * Component cleanup
   */
  ngOnDestroy(): void {
    this.cleanupSubscriptions();
    console.log(`${this.title} destroyed`);
  }

  /**
   * Track route changes for potential analytics or UI updates
   */
  private initializeRouterTracking(): void {
    this.routerSubscription = this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd)
      )
      .subscribe((event: NavigationEnd) => {
        this.currentRoute = event.urlAfterRedirects;
        this.onRouteChange(this.currentRoute);
      });
  }

  /**
   * Handle route changes
   * @param route - The new route path
   */
  onRouteChange(route: string): void {
    console.log(`Navigated to: ${route}`);
    
    // Potential use cases:
    // - Track analytics
    // - Update page title
    // - Handle authentication checks
    // - Manage loading states
  }

  /**
   * Clean up subscriptions to prevent memory leaks
   */
  private cleanupSubscriptions(): void {
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
  }

  /**
   * Get current route for conditional styling or logic
   */
  get isHomeRoute(): boolean {
    return this.currentRoute === '/';
  }

  /**
   * Get current route for conditional styling or logic
   */
  get isMonthlyReportRoute(): boolean {
    return this.currentRoute.includes('/monthly-report');
  }

  /**
   * Get current route for conditional styling or logic
   */
  get isHolidayManagementRoute(): boolean {
    return this.currentRoute.includes('/holiday-management');
  }

  /**
   * Example method for handling global events
   */
  onGlobalError(error: any): void {
    console.error('Global error caught:', error);
    // Potential global error handling:
    // - Show error notifications
    // - Log to error reporting service
    // - Handle specific error types
  }

  /**
   * Example method for app-level functionality
   */
  refreshApp(): void {
    console.log('Refreshing application state...');
    // Potential use cases:
    // - Reload user data
    // - Clear caches
    // - Reset application state
  }

  /**
   * Get application version or build info
   */
  get appInfo(): { version: string; environment: string } {
    return {
      version: '1.0.0', // This could come from environment variables
      environment: 'production' // This could come from environment variables
    };
  }
}
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpClientModule, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

interface Event {
  eventId: number;
  id?: number;
  name: string;
  category: string;
  location: string;
  date: string;
  organizerId: number;
  ticketCount: number;
  ticketPrice: number;
  // Computed properties for display
  description?: string;
  time?: string;
  venue?: string;
  availableSeats?: number;
  imageUrl?: string;
}

@Component({
  selector: 'app-event-list',
  standalone: true,
  imports: [CommonModule, RouterLink, HttpClientModule, FormsModule],
  templateUrl: './event-list.component.html',
  styleUrl: './event-list.component.css'
})
export class EventListComponent implements OnInit, OnDestroy {
  // State management
  allEvents: Event[] = []; // Store all events from API
  filteredEvents: Event[] = []; // Store filtered results
  isLoading = false;
  errorMessage = '';
  isLoggedIn = false;
  
  // Filter properties
  searchTerm = '';
  selectedCategory = '';
  selectedLocation = '';
  selectedDateRange = '';
  
  // Internal filter tracking
  private appliedFilters = {
    search: '',
    category: '',
    location: '',
    dateRange: ''
  };
  
  // Pagination
  currentPage = 1;
  readonly itemsPerPage = 9;
  totalPages = 0;
  
  // Search debouncing
  private searchSubject = new Subject<string>();
  private filterSubject = new Subject<void>();
  private destroy$ = new Subject<void>();
  
  // Constants
  private readonly baseApiUrl = 'http://localhost:9090/event';
  
  readonly categories = [
    'sports',
    'entertainment', 
    'business',
    'education',
    'technology',
    'arts',
    'food'
  ] as const;
  
  readonly locations = [
    'Chennai',
    'Mumbai', 
    'Bangalore',
    'Hyderabad',
    'Delhi',
    'Pune',
    'Kolkata'
  ] as const;

  constructor(
    private readonly http: HttpClient,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {
    this.setupSearchDebounce();
    this.setupFilterDebounce();
  }

  ngOnInit(): void {
    this.checkLoginStatus();
    this.setupStorageListener();
    this.handleRouteParams();
    this.loadAllEvents(); // Load all events initially
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Setup methods
  private setupSearchDebounce(): void {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(searchTerm => {
      this.searchTerm = searchTerm.trim();
      this.applyAllFilters();
    });
  }

  private setupFilterDebounce(): void {
    this.filterSubject.pipe(
      debounceTime(100),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.performFiltering();
    });
  }

  private setupStorageListener(): void {
    window.addEventListener('storage', () => {
      this.checkLoginStatus();
    });
  }

  private handleRouteParams(): void {
    this.route.queryParams.pipe(
      takeUntil(this.destroy$)
    ).subscribe(params => {
      if (params['search']) {
        this.searchTerm = params['search'];
      }
      if (params['category']) {
        this.selectedCategory = params['category'];
      }
      if (params['location']) {
        this.selectedLocation = params['location'];
      }
      if (params['dateRange']) {
        this.selectedDateRange = params['dateRange'];
      }
      
      // Apply filters after route params are loaded
      setTimeout(() => this.applyAllFilters(), 100);
    });
  }

  // Authentication methods
  checkLoginStatus(): void {
    const token = this.getJwtToken();
    this.isLoggedIn = !!token && this.isTokenValid(token);
  }

  private getJwtToken(): string | null {
    return localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken');
  }

  private isTokenValid(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp > Math.floor(Date.now() / 1000);
    } catch {
      return false;
    }
  }

  // Fixed: Unified API method to load all events
  loadAllEvents(): void {
    if (this.isLoading) return;
    
    this.isLoading = true;
    this.errorMessage = '';
    
    console.log('Loading all events from API...');
    
    this.http.get<Event[]>(`${this.baseApiUrl}/getAllEvents`).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        console.log('API Response:', response);
        this.allEvents = this.enhanceEventData(response);
        console.log('Enhanced events:', this.allEvents);
        this.applyAllFilters(); // Apply any existing filters
        this.isLoading = false;
      },
      error: (error) => {
        console.error('API Error:', error);
        this.handleApiError(error);
      }
    });
  }

  // Fixed: Unified filter application method
  applyAllFilters(): void {
    console.log('Applying filters:', {
      search: this.searchTerm,
      category: this.selectedCategory,
      location: this.selectedLocation,
      dateRange: this.selectedDateRange
    });
    
    // Update applied filters
    this.appliedFilters = {
      search: this.searchTerm,
      category: this.selectedCategory,
      location: this.selectedLocation,
      dateRange: this.selectedDateRange
    };
    
    // Trigger filtering with debounce
    this.filterSubject.next();
  }

  // Fixed: Comprehensive filtering logic
  private performFiltering(): void {
    let filtered = [...this.allEvents];
    
    // Apply search filter
    if (this.appliedFilters.search) {
      const searchLower = this.appliedFilters.search.toLowerCase();
      filtered = filtered.filter(event => 
        event.name.toLowerCase().includes(searchLower) ||
        event.category.toLowerCase().includes(searchLower) ||
        event.location.toLowerCase().includes(searchLower) ||
        (event.description && event.description.toLowerCase().includes(searchLower)) ||
        (event.venue && event.venue.toLowerCase().includes(searchLower))
      );
      console.log(`After search filter (${this.appliedFilters.search}):`, filtered.length);
    }
    
    // Apply category filter
    if (this.appliedFilters.category) {
      filtered = filtered.filter(event => 
        event.category.toLowerCase() === this.appliedFilters.category.toLowerCase()
      );
      console.log(`After category filter (${this.appliedFilters.category}):`, filtered.length);
    }
    
    // Apply location filter
    if (this.appliedFilters.location) {
      filtered = filtered.filter(event => 
        event.location.toLowerCase() === this.appliedFilters.location.toLowerCase()
      );
      console.log(`After location filter (${this.appliedFilters.location}):`, filtered.length);
    }
    
    // Apply date range filter
    if (this.appliedFilters.dateRange) {
      filtered = filtered.filter(event => this.matchesDateRange(event.date, this.appliedFilters.dateRange));
      console.log(`After date filter (${this.appliedFilters.dateRange}):`, filtered.length);
    }
    
    // Always filter out past events
    filtered = filtered.filter(event => this.isUpcomingEvent(event.date));
    console.log('After upcoming filter:', filtered.length);
    
    // Update filtered events and reset pagination
    this.filteredEvents = filtered;
    this.currentPage = 1;
    this.calculatePagination();
    
    console.log('Final filtered events:', this.filteredEvents.length);
  }

  // Fixed: Date range matching
  private matchesDateRange(eventDate: string, dateRange: string): boolean {
    if (!dateRange) return true;
    
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const eventDateObj = new Date(eventDate);
      eventDateObj.setHours(0, 0, 0, 0);
      
      const diffTime = eventDateObj.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      switch (dateRange) {
        case 'today':
          return diffDays === 0;
        case 'week':
          return diffDays >= 0 && diffDays <= 7;
        case 'month':
          return diffDays >= 0 && diffDays <= 30;
        case 'upcoming':
          return diffDays > 0;
        default:
          return true;
      }
    } catch (error) {
      console.error('Date matching error:', error);
      return true;
    }
  }

  private isUpcomingEvent(eventDate: string): boolean {
    try {
      const eventDateTime = new Date(eventDate);
      const now = new Date();
      return eventDateTime >= now;
    } catch {
      return false;
    }
  }

  // Fixed: Event handlers
  onSearchInput(value: string): void {
    this.searchSubject.next(value);
  }

  onCategoryChange(): void {
    console.log('Category changed to:', this.selectedCategory);
    this.applyAllFilters();
  }

  onLocationChange(): void {
    console.log('Location changed to:', this.selectedLocation);
    this.applyAllFilters();
  }

  onDateRangeChange(): void {
    console.log('Date range changed to:', this.selectedDateRange);
    this.applyAllFilters();
  }

  // Fixed: Clear filters method
  clearFilters(): void {
    console.log('Clearing all filters');
    this.searchTerm = '';
    this.selectedCategory = '';
    this.selectedLocation = '';
    this.selectedDateRange = '';
    this.currentPage = 1;
    
    // Update URL to remove query params
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
      replaceUrl: true
    });
    
    this.applyAllFilters();
  }

  // Fixed: Manual filter application
  applyFilters(): void {
    console.log('Manual filter application triggered');
    this.applyAllFilters();
  }

  private handleApiError(error: HttpErrorResponse): void {
    this.isLoading = false;
    this.errorMessage = this.getErrorMessage(error);
    this.allEvents = [];
    this.filteredEvents = [];
    this.calculatePagination();
  }

  private getErrorMessage(error: HttpErrorResponse): string {
    switch (error.status) {
      case 0:
        return 'Network error. Please check your connection and try again.';
      case 404:
        return 'No events found. Check back later for new events!';
      case 500:
        return 'Server error. Please try again later.';
      case 503:
        return 'Service temporarily unavailable. Please try again later.';
      default:
        return `Failed to load events (Error ${error.status}). Please try again later.`;
    }
  }

  // Data enhancement methods (keep existing ones but add debugging)
  enhanceEventData(events: Event[]): Event[] {
    console.log('Enhancing event data for', events.length, 'events');
    return events.map(event => {
      const enhanced = {
        ...event,
        eventId: event.eventId || event.id || 0,
        ticketPrice: event.ticketPrice || 100,
        description: this.generateDescription(event),
        time: this.extractTime(event.date),
        venue: this.generateVenue(event),
        availableSeats: this.calculateAvailableSeats(event.ticketCount),
        imageUrl: this.getEventImage(event.category)
      };
      
      console.log('Enhanced event:', enhanced.name, 'Price:', enhanced.ticketPrice);
      return enhanced;
    });
  }

  private generateDescription(event: Event): string {
    const descriptions = {
      sports: `Join us for an exciting ${event.name} in ${event.location}. Experience sports at its finest with thrilling action and competitive spirit.`,
      entertainment: `Don't miss ${event.name} in ${event.location}. An unforgettable entertainment experience awaits with amazing performances.`,
      business: `Network and learn at ${event.name} in ${event.location}. Connect with industry professionals and expand your business horizons.`,
      education: `Expand your knowledge at ${event.name} in ${event.location}. Learn from experts and enhance your skills.`,
      technology: `Discover the latest tech trends at ${event.name} in ${event.location}. Innovation and technology converge here.`,
      arts: `Immerse yourself in creativity at ${event.name} in ${event.location}. Experience art in its most beautiful form.`,
      food: `Savor delicious experiences at ${event.name} in ${event.location}. A culinary journey awaits food enthusiasts.`
    };
    
    return descriptions[event.category as keyof typeof descriptions] || 
           `Join us for an exciting ${event.name} in ${event.location}. An amazing event experience awaits!`;
  }

  private extractTime(dateString: string): string {
    try {
      return new Date(dateString).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
    } catch {
      return 'Time TBA';
    }
  }

  private generateVenue(event: Event): string {
    const venueTypes = {
      sports: 'Stadium',
      entertainment: 'Entertainment Center',
      business: 'Convention Center',
      education: 'Conference Hall',
      technology: 'Tech Center',
      arts: 'Arts Center',
      food: 'Culinary Center'
    };
    
    const venueType = venueTypes[event.category as keyof typeof venueTypes] || 'Event Center';
    return `${event.location} ${venueType}`;
  }

  private calculateAvailableSeats(totalSeats: number): number {
    // Simulate realistic seat availability (70-95% available)
    const availabilityRate = 0.7 + (Math.random() * 0.25);
    return Math.floor(totalSeats * availabilityRate);
  }

  private getEventImage(category: string): string {
    const images = {
      sports: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=400&h=250&fit=crop',
      entertainment: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=250&fit=crop',
      business: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=400&h=250&fit=crop',
      education: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=400&h=250&fit=crop',
      technology: 'https://images.unsplash.com/photo-1518474227162-6b2223824b72?w=400&h=250&fit=crop',
      arts: 'https://images.unsplash.com/photo-1482160549825-59d1b23cb208?w=400&h=250&fit=crop',
      food: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=250&fit=crop'
    };
    
    return images[category as keyof typeof images] || images.entertainment;
  }

  // Utility methods (keep existing ones)
  formatPrice(price: number): string {
    if (!price || price <= 0) {
      return 'FREE';
    }
    return `₹${price.toLocaleString('en-IN', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })}`;
  }

  getPriceClass(price: number): string {
    if (!price || price <= 0) return 'price-free';
    if (price < 500) return 'price-low';
    if (price < 1500) return 'price-medium';
    return 'price-high';
  }

  formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      const isTomorrow = date.toDateString() === new Date(now.getTime() + 24 * 60 * 60 * 1000).toDateString();
      
      if (isToday) return 'Today';
      if (isTomorrow) return 'Tomorrow';
      
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    } catch {
      return 'Date TBA';
    }
  }

  getEventTimeStatus(eventDate: string): string {
    try {
      const eventDateTime = new Date(eventDate);
      const now = new Date();
      const diffTime = eventDateTime.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));
      
      if (diffTime < 0) return 'Event Over';
      if (diffHours < 1) return 'Starting Soon';
      if (diffHours < 24) return `${diffHours}h left`;
      if (diffDays === 1) return 'Tomorrow';
      if (diffDays <= 7) return `${diffDays} days`;
      
      return eventDateTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return 'Soon';
    }
  }

  // Pagination methods
  calculatePagination(): void {
    this.totalPages = Math.ceil(this.filteredEvents.length / this.itemsPerPage);
    if (this.currentPage > this.totalPages && this.totalPages > 0) {
      this.currentPage = 1;
    }
  }

  getPaginatedEvents(): Event[] {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    return this.filteredEvents.slice(startIndex, startIndex + this.itemsPerPage);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      // Scroll to top when changing pages
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  getPaginationArray(): number[] {
    const maxVisible = 5;
    const total = this.totalPages;
    const current = this.currentPage;
    
    if (total <= maxVisible) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    
    const start = Math.max(1, current - Math.floor(maxVisible / 2));
    const end = Math.min(total, start + maxVisible - 1);
    
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  // Navigation methods
  handleBooking(event: Event): void {
    if (!this.isLoggedIn) {
      this.promptLogin(event);
      return;
    }

    if (event.availableSeats === 0) {
      alert('Sorry, this event is sold out!');
      return;
    }

    console.log('Navigating to booking for event:', event.eventId);
    this.router.navigate(['/booking', event.eventId]);
  }

  private promptLogin(event: Event): void {
    const shouldRedirect = confirm(
      `Please login to book tickets for "${event.name}". Would you like to go to the login page?`
    );
    if (shouldRedirect) {
      this.router.navigate(['/login'], { 
        queryParams: { returnUrl: `/booking/${event.eventId}` } 
      });
    }
  }

  goToLogin(): void {
    this.router.navigate(['/login'], {
      queryParams: { returnUrl: this.router.url }
    });
  }

  refreshEvents(): void {
    console.log('Refreshing events...');
    this.loadAllEvents();
  }

  handleImageError(event: Event): void {
    console.log('Image error for event:', event.name);
    // Fallback to a default image
    event.imageUrl = 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=250&fit=crop';
  }

  // Debug method for development
  debugFilters(): void {
    console.log('Current filter state:', {
      searchTerm: this.searchTerm,
      selectedCategory: this.selectedCategory,
      selectedLocation: this.selectedLocation,
      selectedDateRange: this.selectedDateRange,
      appliedFilters: this.appliedFilters,
      allEventsCount: this.allEvents.length,
      filteredEventsCount: this.filteredEvents.length,
      currentPage: this.currentPage,
      totalPages: this.totalPages
    });
  }

  // Added methods
  hasActiveFilters(): boolean {
    return !!(this.searchTerm || this.selectedCategory || this.selectedLocation || this.selectedDateRange);
  }

  getActiveFiltersCount(): number {
    let count = 0;
    if (this.searchTerm) count++;
    if (this.selectedCategory) count++;
    if (this.selectedLocation) count++;
    if (this.selectedDateRange) count++;
    return count;
  }

  getDateRangeLabel(dateRange: string): string {
    const labels = {
      'today': 'Today',
      'week': 'This Week',
      'month': 'This Month',
      'upcoming': 'Upcoming'
    };
    return labels[dateRange as keyof typeof labels] || dateRange;
  }
}

import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClientModule } from '@angular/common/http';
import { Subject, takeUntil, forkJoin } from 'rxjs';
import { FeedbackService, Feedback, EventFeedbackSummary } from '../../services/feedback.service';
import { UserService, User } from '../../services/user.service';
import { EventService, Event } from '../../services/event.service';

@Component({
  selector: 'app-feedback-list',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './feedback-list.component.html',
  styleUrl: './feedback-list.component.css'
})
export class FeedbackListComponent implements OnInit, OnDestroy {
  // Data properties
  feedbacks: Feedback[] = [];
  filteredFeedbacks: Feedback[] = [];
  eventFeedbackSummary: EventFeedbackSummary | null = null;
  users: Map<number, User> = new Map(); // Store user details by userId
  events: Map<number, Event> = new Map(); // Store event details by eventId
  currentUser: User | null = null; // Current logged-in user
  
  // Component state
  isLoading = false;
  errorMessage = '';
  successMessage = '';
  
  // View mode - 'event' for specific event, 'organizer' for all organizer events, 'user' for user feedbacks
  viewMode: 'event' | 'organizer' | 'user' = 'user';
  
  // IDs for filtering
  eventId: number = 0;
  userId: number = 0;
  organizerId: number = 0;
  currentUserId: number = 0;
  
  // Event info
  eventName: string = '';
  
  // User info
  isOrganizer = false;
  isAuthenticated = false;
  
  // Filtering and sorting
  searchQuery = '';
  selectedRating: number | null = null;
  sortBy: 'date' | 'rating' | 'name' | 'user' | 'event' = 'date';
  sortOrder: 'asc' | 'desc' = 'desc';
  
  // Pagination
  currentPage = 1;
  itemsPerPage = 10;
  totalPages = 0;
  
  // Statistics
  averageRating = 0;
  totalFeedbacks = 0;
  ratingDistribution: { [key: number]: number } = {};
  
  // RxJS
  private destroy$ = new Subject<void>();

  // Expose Math object for template
  Math = Math;

  constructor(
    private feedbackService: FeedbackService,
    private userService: UserService,
    private eventService: EventService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.checkAuthentication();
    this.getRouteParams();
    if (this.isAuthenticated) {
      this.loadCurrentUser();
      this.loadFeedbacks();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkAuthentication(): void {
    this.isAuthenticated = this.userService.isAuthenticated();
    
    if (!this.isAuthenticated) {
      this.router.navigate(['/login'], {
        queryParams: { returnUrl: this.router.url }
      });
      return;
    }

    this.currentUserId = this.userService.getCurrentUserId();
    this.organizerId = this.currentUserId; // Assuming user ID is same as organizer ID
    this.isOrganizer = this.userService.isOrganizer();
    
    console.log('Authentication check:', {
      userId: this.currentUserId,
      organizerId: this.organizerId,
      isOrganizer: this.isOrganizer,
      isAuthenticated: this.isAuthenticated
    });
  }

  // Load current user details
  private loadCurrentUser(): void {
    if (!this.currentUserId) return;

    this.userService.getUserById(this.currentUserId).subscribe({
      next: (user) => {
        this.currentUser = user;
        this.users.set(this.currentUserId, user);
        console.log('Current user loaded:', user);
      },
      error: (error) => {
        console.warn('Failed to load current user details:', error);
      }
    });
  }

  private getRouteParams(): void {
    // Get route parameters
    this.route.params.subscribe(params => {
      console.log('Route params:', params);
      
      // Check for eventId in route params
      if (params['eventId']) {
        this.eventId = +params['eventId'];
        this.viewMode = 'event';
        console.log('Event ID from route params:', this.eventId);
      }
      
      // Check for organizerId in route params
      if (params['organizerId']) {
        this.organizerId = +params['organizerId'];
        this.viewMode = 'organizer';
        console.log('Organizer ID from route params:', this.organizerId);
      }
      
      // Check for userId in route params
      if (params['userId']) {
        this.userId = +params['userId'];
        this.viewMode = 'user';
        console.log('User ID from route params:', this.userId);
      }
    });

    // Get query parameters for additional context
    this.route.queryParams.subscribe(params => {
      console.log('Query params:', params);
      
      // Get event name if provided
      if (params['eventName']) {
        this.eventName = params['eventName'];
      }
      
      // Get view mode override from query params
      if (params['viewMode']) {
        this.viewMode = params['viewMode'] as 'event' | 'organizer' | 'user';
      }
      
      // Get IDs from query params if not in route params
      if (params['eventId'] && !this.eventId) {
        this.eventId = +params['eventId'];
        this.viewMode = 'event';
      }
      
      if (params['organizerId'] && !this.organizerId) {
        this.organizerId = +params['organizerId'];
        if (this.viewMode !== 'event') {
          this.viewMode = 'organizer';
        }
      }
      
      if (params['userId'] && !this.userId) {
        this.userId = +params['userId'];
        if (this.viewMode !== 'event' && this.viewMode !== 'organizer') {
          this.viewMode = 'user';
        }
      }
      
      // Set defaults based on authentication status
      if (!this.eventId && !this.organizerId && !this.userId) {
        if (this.isOrganizer) {
          this.viewMode = 'organizer';
          this.organizerId = this.currentUserId;
        } else {
          this.viewMode = 'user';
          this.userId = this.currentUserId;
        }
      }
      
      console.log('Final route params processed:', {
        viewMode: this.viewMode,
        eventId: this.eventId,
        organizerId: this.organizerId,
        userId: this.userId,
        eventName: this.eventName
      });
    });
  }

  private loadFeedbacks(): void {
    this.isLoading = true;
    this.clearMessages();
    
    console.log(`Loading feedbacks - Mode: ${this.viewMode}, EventID: ${this.eventId}, OrganizerID: ${this.organizerId}, UserID: ${this.userId}`);

    let feedbackObservable;
    
    if (this.viewMode === 'event' && this.eventId) {
      // Load feedbacks for specific event using the correct API
      if (!this.isOrganizer) {
        this.showError('You do not have permission to view event feedbacks.');
        this.isLoading = false;
        return;
      }
      
      // Use the event feedback summary to get both feedbacks and statistics
      feedbackObservable = this.feedbackService.getEventFeedbackSummary(this.eventId);
      
      feedbackObservable
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (summary: EventFeedbackSummary) => {
            console.log('Event feedback summary loaded:', summary);
            this.eventFeedbackSummary = summary;
            this.feedbacks = summary.feedbacks || [];
            this.eventName = summary.eventName;
            this.averageRating = summary.averageRating;
            this.totalFeedbacks = summary.totalFeedbacks;
            this.ratingDistribution = summary.ratingDistribution;
            
            // Load user and event details
            this.loadRelatedDetails();
          },
          error: (error) => {
            console.error('Error loading event feedback summary:', error);
            this.isLoading = false;
            this.handleLoadError(error);
          }
        });
      
      return;
    } else if (this.viewMode === 'organizer' && this.organizerId) {
      // Load feedbacks for all events hosted by organizer
      if (!this.isOrganizer || this.organizerId !== this.currentUserId) {
        this.showError('You can only view feedbacks for your own events.');
        this.isLoading = false;
        return;
      }
      feedbackObservable = this.feedbackService.getFeedbacksByOrganizer(this.organizerId);
    } else if (this.viewMode === 'user' && this.userId) {
      // Load feedbacks by user
      if (this.userId !== this.currentUserId && !this.isOrganizer) {
        this.showError('You can only view your own feedbacks.');
        this.isLoading = false;
        return;
      }
      feedbackObservable = this.feedbackService.getAllFeedbacksByUser(this.userId);
    } else {
      this.showError('Invalid parameters for loading feedbacks.');
      this.isLoading = false;
      return;
    }

    feedbackObservable
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (feedbacks: Feedback[]) => {
          console.log('Feedbacks loaded:', feedbacks);
          this.feedbacks = feedbacks || [];
          
          // Load user and event details
          this.loadRelatedDetails();
        },
        error: (error) => {
          console.error('Error loading feedbacks:', error);
          this.isLoading = false;
          this.handleLoadError(error);
        }
      });
  }

  // Load user and event details for feedbacks
  private loadRelatedDetails(): void {
    // Get unique user IDs and event IDs
    const userIds = [...new Set(this.feedbacks
      .filter(feedback => feedback.userId)
      .map(feedback => feedback.userId!))];
    
    const eventIds = [...new Set(this.feedbacks
      .filter(feedback => feedback.eventId)
      .map(feedback => feedback.eventId!))];

    console.log('Loading details for users:', userIds, 'and events:', eventIds);

    // Create arrays of API calls
    const userCalls = userIds.map(userId => 
      this.userService.getUserById(userId)
    );
    
    const eventCalls = eventIds.map(eventId => 
      this.eventService.getEventById(eventId)
    );

    // Combine all API calls
    const allCalls = [...userCalls, ...eventCalls];

    if (allCalls.length === 0) {
      this.processFeedbacks();
      return;
    }

    // Execute all API calls in parallel
    forkJoin(allCalls).subscribe({
      next: (results) => {
        // Separate users and events from results
        const users = results.slice(0, userCalls.length) as User[];
        const events = results.slice(userCalls.length) as Event[];

        // Store users in map for quick lookup
        users.forEach(user => {
          if (user && user.userId) {
            this.users.set(user.userId, user);
          }
        });

        // Store events in map for quick lookup
        events.forEach(event => {
          if (event && event.eventId) {
            this.events.set(event.eventId, event);
          }
        });

        // Update feedbacks with user and event names
        this.feedbacks = this.feedbacks.map(feedback => ({
          ...feedback,
          userName: this.getUserName(feedback.userId),
          userEmail: this.getUserEmail(feedback.userId),
          eventName: this.getEventName(feedback.eventId)
        }));

        console.log('Users loaded:', this.users);
        console.log('Events loaded:', this.events);
        
        this.processFeedbacks();
      },
      error: (error) => {
        console.warn('Some details could not be loaded:', error);
        // Continue with feedbacks even if some details fail
        this.processFeedbacks();
      }
    });
  }

  // Get user name by ID
  getUserName(userId?: number): string {
    if (!userId) return 'Unknown User';
    const user = this.users.get(userId);
    return user?.name || 'Unknown User';
  }

  // Get user email by ID
  getUserEmail(userId?: number): string {
    if (!userId) return 'Unknown Email';
    const user = this.users.get(userId);
    return user?.email || 'Unknown Email';
  }

  // Get user contact by ID
  getUserContact(userId?: number): string {
    if (!userId) return 'Unknown Contact';
    const user = this.users.get(userId);
    return user?.contactNumber ? user.contactNumber.toString() : 'Unknown Contact';
  }

  // Get user role by ID
  getUserRole(userId?: number): string {
    if (!userId) return 'User';
    const user = this.users.get(userId);
    return user?.roles || 'User';
  }

  // Get user details by ID
  getUserDetails(userId?: number): User | null {
    if (!userId) return null;
    return this.users.get(userId) || null;
  }

  // Get event name by ID
  getEventName(eventId?: number): string {
    if (!eventId) return 'Unknown Event';
    const event = this.events.get(eventId);
    return event?.name || 'Unknown Event';
  }

  // Get event details by ID
  getEventDetails(eventId?: number): Event | null {
    if (!eventId) return null;
    return this.events.get(eventId) || null;
  }

  // Get user avatar initials
  getUserInitials(userId?: number): string {
    const userName = this.getUserName(userId);
    if (userName === 'Unknown User') return 'UU';
    
    return userName
      .split(' ')
      .map(name => name.charAt(0).toUpperCase())
      .join('')
      .substring(0, 2);
  }

  // Get current user initials
  getCurrentUserInitials(): string {
    if (!this.currentUser) return 'U';
    
    return this.currentUser.name
      .split(' ')
      .map(name => name.charAt(0).toUpperCase())
      .join('')
      .substring(0, 2);
  }

  // Format contact number
  formatContactNumber(contactNumber: number): string {
    const numStr = contactNumber.toString();
    if (numStr.length === 10) {
      return `+91 ${numStr.substring(0, 5)} ${numStr.substring(5)}`;
    }
    return numStr;
  }

  // Get role badge color
  getRoleBadgeColor(role: string): string {
    switch (role.toLowerCase()) {
      case 'admin': return 'danger';
      case 'organizer': return 'warning';
      case 'user': return 'primary';
      default: return 'secondary';
    }
  }

  // Get role icon
  getRoleIcon(role: string): string {
    switch (role.toLowerCase()) {
      case 'admin': return 'bi-shield-check';
      case 'organizer': return 'bi-person-gear';
      case 'user': return 'bi-person';
      default: return 'bi-person';
    }
  }

  private processFeedbacks(): void {
    // Calculate statistics if not already calculated (for non-event views)
    if (!this.eventFeedbackSummary) {
      this.totalFeedbacks = this.feedbacks.length;
      
      if (this.totalFeedbacks > 0) {
        // Calculate average rating
        const totalRating = this.feedbacks.reduce((sum, feedback) => sum + feedback.rating, 0);
        this.averageRating = Math.round((totalRating / this.totalFeedbacks) * 10) / 10;
        
        // Calculate rating distribution
        this.ratingDistribution = {};
        for (let i = 1; i <= 5; i++) {
          this.ratingDistribution[i] = this.feedbacks.filter(f => f.rating === i).length;
        }
      } else {
        this.averageRating = 0;
        this.ratingDistribution = {};
      }
    }
    
    // Apply filters and sorting
    this.applyFiltersAndSorting();
    this.isLoading = false;
  }

  private applyFiltersAndSorting(): void {
    let filtered = [...this.feedbacks];
    
    // Apply search filter - now includes user details
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(feedback => 
        (feedback.comments && feedback.comments.toLowerCase().includes(query)) ||
        (this.getUserName(feedback.userId).toLowerCase().includes(query)) ||
        (this.getUserEmail(feedback.userId).toLowerCase().includes(query)) ||
        (this.getEventName(feedback.eventId).toLowerCase().includes(query))
      );
    }
    
    // Apply rating filter
    if (this.selectedRating !== null) {
      filtered = filtered.filter(feedback => feedback.rating === this.selectedRating);
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (this.sortBy) {
        case 'date':
          const dateA = new Date(a.feedbackDate || a.createdDate || 0);
          const dateB = new Date(b.feedbackDate || b.createdDate || 0);
          comparison = dateA.getTime() - dateB.getTime();
          break;
        case 'rating':
          comparison = a.rating - b.rating;
          break;
        case 'name':
        case 'user':
          const nameA = this.getUserName(a.userId).toLowerCase();
          const nameB = this.getUserName(b.userId).toLowerCase();
          comparison = nameA.localeCompare(nameB);
          break;
        case 'event':
          const eventA = this.getEventName(a.eventId).toLowerCase();
          const eventB = this.getEventName(b.eventId).toLowerCase();
          comparison = eventA.localeCompare(eventB);
          break;
      }
      
      return this.sortOrder === 'asc' ? comparison : -comparison;
    });
    
    this.filteredFeedbacks = filtered;
    
    // Update pagination
    this.totalPages = Math.ceil(this.filteredFeedbacks.length / this.itemsPerPage);
    this.currentPage = Math.min(this.currentPage, Math.max(1, this.totalPages));
  }

  // Load individual event feedbacks (called from manage events)
  loadEventFeedbacks(eventId: number): void {
    this.eventId = eventId;
    this.viewMode = 'event';
    this.loadFeedbacks();
  }

  // Refresh current view
  refreshFeedbacks(): void {
    this.loadFeedbacks();
  }

  // Navigation methods
  goBack(): void {
    if (this.viewMode === 'event') {
      this.router.navigate(['/my-events']);
    } else if (this.viewMode === 'organizer') {
      this.router.navigate(['/my-events']);
    } else {
      this.router.navigate(['/profile']);
    }
  }

  goToEvent(eventId: number): void {
    if (eventId) {
      this.router.navigate(['/events', eventId]);
    }
  }

  // Get page title based on view mode
  getPageTitle(): string {
    switch (this.viewMode) {
      case 'event':
        return `Feedbacks for ${this.eventName || 'Event'}`;
      case 'organizer':
        return 'All Event Feedbacks';
      case 'user':
        return 'My Feedbacks';
      default:
        return 'Feedbacks';
    }
  }

  // Get page subtitle
  getPageSubtitle(): string {
    switch (this.viewMode) {
      case 'event':
        return 'View and manage feedbacks for this event';
      case 'organizer':
        return 'Manage feedbacks for all your events';
      case 'user':
        return 'View your submitted feedbacks';
      default:
        return 'Feedback management';
    }
  }

  // Get paginated feedbacks
  getPaginatedFeedbacks(): Feedback[] {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    return this.filteredFeedbacks.slice(startIndex, endIndex);
  }

  // Filter and sort methods
  onSearchChange(): void {
    this.currentPage = 1;
    this.applyFiltersAndSorting();
  }

  onRatingFilterChange(): void {
    this.currentPage = 1;
    this.applyFiltersAndSorting();
  }

  onSortChange(): void {
    this.applyFiltersAndSorting();
  }

  toggleSortOrder(): void {
    this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    this.applyFiltersAndSorting();
  }

  // Pagination methods
  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
    }
  }

  // Get page numbers for pagination
  getPageNumbers(): number[] {
    const pages = [];
    const maxVisiblePages = 5;
    const startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
    const endPage = Math.min(this.totalPages, startPage + maxVisiblePages - 1);
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    
    return pages;
  }

  // Helper methods for template
  getFloorValue(value: number): number {
    return Math.floor(value);
  }

  getMinValue(a: number, b: number): number {
    return Math.min(a, b);
  }

  getMaxValue(a: number, b: number): number {
    return Math.max(a, b);
  }

  // Utility methods
  formatDate(dateString: string): string {
    try {
      if (!dateString) return 'N/A';
      
      const date = new Date(dateString);
      return date.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Invalid date';
    }
  }

  getRatingStars(rating: number): string[] {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      if (i <= rating) {
        stars.push('filled');
      } else {
        stars.push('empty');
      }
    }
    return stars;
  }

  getRatingColor(rating: number): string {
    if (rating >= 4) return 'success';
    if (rating >= 3) return 'warning';
    return 'danger';
  }

  getRatingPercentage(rating: number): number {
    if (this.totalFeedbacks === 0) return 0;
    return Math.round((this.ratingDistribution[rating] / this.totalFeedbacks) * 100);
  }

  // Get average rating stars for display
  getAverageRatingStars(): string[] {
    return this.getRatingStars(this.getFloorValue(this.averageRating));
  }

  // Get pagination info text
  getPaginationStart(): number {
    return (this.currentPage - 1) * this.itemsPerPage + 1;
  }

  getPaginationEnd(): number {
    return this.getMinValue(this.currentPage * this.itemsPerPage, this.filteredFeedbacks.length);
  }

  // Export feedbacks (for organizers)
  exportFeedbacks(): void {
    if (!this.isOrganizer) {
      this.showError('Only organizers can export feedbacks.');
      return;
    }

    try {
      const csvContent = this.generateCSV();
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `feedbacks_${this.viewMode}_${this.eventId || this.organizerId}_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
      
      this.showSuccess('Feedbacks exported successfully!');
    } catch (error) {
      console.error('Export error:', error);
      this.showError('Failed to export feedbacks.');
    }
  }

  private generateCSV(): string {
    const headers = ['Feedback ID', 'User Name', 'User Email', 'User Contact', 'User Role', 'Event Name', 'Rating', 'Comments', 'Date'];
    const rows = this.filteredFeedbacks.map(feedback => [
      feedback.feedbackId || '',
      this.getUserName(feedback.userId) || '',
      this.getUserEmail(feedback.userId) || '',
      this.getUserContact(feedback.userId) || '',
      this.getUserRole(feedback.userId) || '',
      this.getEventName(feedback.eventId) || '',
      feedback.rating || '',
      `"${(feedback.comments || '').replace(/"/g, '""')}"`, // Escape quotes in comments
      this.formatDate(feedback.feedbackDate || feedback.createdDate || '')
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  // Error handling
  private handleLoadError(error: any): void {
    let errorMessage = 'Failed to load feedbacks';

    const errorStr = error.message || error.toString();
    
    if (errorStr.includes('401') || errorStr.includes('Unauthorized')) {
      errorMessage = 'Session expired. Please login again.';
      this.router.navigate(['/login']);
      return;
    } else if (errorStr.includes('403') || errorStr.includes('Forbidden')) {
      errorMessage = 'You do not have permission to view these feedbacks.';
    } else if (errorStr.includes('404') || errorStr.includes('Not Found')) {
      errorMessage = 'No feedbacks found.';
    } else if (errorStr.includes('0') || errorStr.includes('Network')) {
      errorMessage = 'Network error. Please check your connection.';
    } else if (errorStr.includes('500') || errorStr.includes('Internal Server Error')) {
      errorMessage = 'Server error. Please try again later.';
    }

    this.showError(errorMessage);
  }

  // Message handling
  private showSuccess(message: string): void {
    this.successMessage = message;
    this.errorMessage = '';
    
    setTimeout(() => {
      this.successMessage = '';
    }, 5000);
  }

  private showError(message: string): void {
    this.errorMessage = message;
    this.successMessage = '';
  }

  private clearMessages(): void {
    this.successMessage = '';
    this.errorMessage = '';
  }
}

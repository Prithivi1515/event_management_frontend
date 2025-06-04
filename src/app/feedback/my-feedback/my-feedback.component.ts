import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { FeedbackService, Feedback } from '../../services/feedback.service';
import { EventService, Event } from '../../services/event.service';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-my-feedback',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './my-feedback.component.html',
  styleUrl: './my-feedback.component.css'
})
export class MyFeedbackComponent implements OnInit {
  feedbacks: Feedback[] = [];
  filteredFeedbacks: Feedback[] = [];
  events: Map<number, Event> = new Map(); // Store event details by eventId
  isLoading = false;
  errorMessage = '';
  successMessage = '';
  
  // Pagination
  currentPage = 1;
  itemsPerPage = 6;
  totalPages = 0;
  
  // Filtering and sorting
  searchQuery = '';
  selectedRating: number | null = null;
  sortBy = 'date';
  sortOrder = 'desc';
  
  // Edit modal
  showEditModal = false;
  editingFeedback: Feedback | null = null;
  editForm = {
    rating: 0,
    comments: ''
  };
  isUpdating = false;
  
  // Delete confirmation
  showDeleteModal = false;
  deletingFeedback: Feedback | null = null;
  isDeleting = false;

  constructor(
    private feedbackService: FeedbackService,
    private eventService: EventService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadMyFeedbacks();
  }

  // Load user's feedbacks and event details
  loadMyFeedbacks(): void {
    this.isLoading = true;
    this.errorMessage = '';
    
    const userId = this.getCurrentUserId();
    if (!userId) {
      this.errorMessage = 'Please login to view your feedbacks.';
      this.isLoading = false;
      return;
    }

    console.log('Loading feedbacks for user ID:', userId);

    this.feedbackService.getAllFeedbacksByUser(userId).subscribe({
      next: (feedbacks) => {
        console.log('Received feedbacks:', feedbacks);
        this.feedbacks = feedbacks;
        
        // Load event details for each feedback
        this.loadEventDetails(feedbacks);
      },
      error: (error) => {
        console.error('Error loading feedbacks:', error);
        this.errorMessage = error.message || 'Failed to load feedbacks.';
        this.isLoading = false;
      }
    });
  }

  // Load event details for feedbacks
  loadEventDetails(feedbacks: Feedback[]): void {
    // Get unique event IDs
    const eventIds = [...new Set(feedbacks
      .filter(feedback => feedback.eventId)
      .map(feedback => feedback.eventId!))];

    if (eventIds.length === 0) {
      this.applyFilters();
      this.isLoading = false;
      return;
    }

    console.log('Loading event details for IDs:', eventIds);

    // Create array of event API calls
    const eventCalls = eventIds.map(eventId => 
      this.eventService.getEventById(eventId)
    );

    // Execute all API calls in parallel
    forkJoin(eventCalls).subscribe({
      next: (events) => {
        // Store events in map for quick lookup
        events.forEach(event => {
          if (event && event.eventId) {
            this.events.set(event.eventId, event);
          }
        });

        // Update feedbacks with event names
        this.feedbacks = this.feedbacks.map(feedback => ({
          ...feedback,
          eventName: this.getEventName(feedback.eventId)
        }));

        console.log('Events loaded:', this.events);
        this.applyFilters();
        this.isLoading = false;
      },
      error: (error) => {
        console.warn('Some event details could not be loaded:', error);
        // Continue with feedbacks even if event details fail
        this.applyFilters();
        this.isLoading = false;
      }
    });
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

  // Get event location by ID
  getEventLocation(eventId?: number): string {
    if (!eventId) return 'Unknown Location';
    const event = this.events.get(eventId);
    return event?.location || 'Unknown Location';
  }

  // Get event date by ID
  getEventDate(eventId?: number): string {
    if (!eventId) return 'Unknown Date';
    const event = this.events.get(eventId);
    if (!event?.date) return 'Unknown Date';
    
    try {
      return new Date(event.date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return 'Unknown Date';
    }
  }

  // Get event category by ID
  getEventCategory(eventId?: number): string {
    if (!eventId) return 'Unknown Category';
    const event = this.events.get(eventId);
    return event?.category || 'Unknown Category';
  }

  // Get current user ID from token
  getCurrentUserId(): number | null {
    try {
      const token = localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken');
      if (!token) return null;
      
      const payload = JSON.parse(atob(token.split('.')[1]));
      
      // Your JWT token uses 'userid' (lowercase)
      return payload.userid ? parseInt(payload.userid) : null;
    } catch (error) {
      console.error('Error parsing JWT token:', error);
      return null;
    }
  }

  // Apply filters and sorting
  applyFilters(): void {
    let filtered = [...this.feedbacks];
    
    // Search filter - now includes event details
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(feedback => {
        const eventName = this.getEventName(feedback.eventId).toLowerCase();
        const eventLocation = this.getEventLocation(feedback.eventId).toLowerCase();
        const eventCategory = this.getEventCategory(feedback.eventId).toLowerCase();
        const comments = (feedback.comments || '').toLowerCase();
        
        return eventName.includes(query) ||
               eventLocation.includes(query) ||
               eventCategory.includes(query) ||
               comments.includes(query);
      });
    }
    
    // Rating filter
    if (this.selectedRating !== null) {
      filtered = filtered.filter(feedback => feedback.rating === this.selectedRating);
    }
    
    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (this.sortBy) {
        case 'date':
          const dateA = new Date(a.feedbackDate || a.createdDate || '');
          const dateB = new Date(b.feedbackDate || b.createdDate || '');
          comparison = dateA.getTime() - dateB.getTime();
          break;
        case 'rating':
          comparison = a.rating - b.rating;
          break;
        case 'event':
          const eventNameA = this.getEventName(a.eventId);
          const eventNameB = this.getEventName(b.eventId);
          comparison = eventNameA.localeCompare(eventNameB);
          break;
      }
      
      return this.sortOrder === 'desc' ? -comparison : comparison;
    });
    
    this.filteredFeedbacks = filtered;
    this.calculatePagination();
  }

  // Calculate pagination
  calculatePagination(): void {
    this.totalPages = Math.ceil(this.filteredFeedbacks.length / this.itemsPerPage);
    if (this.currentPage > this.totalPages) {
      this.currentPage = 1;
    }
  }

  // Get paginated feedbacks
  getPaginatedFeedbacks(): Feedback[] {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    return this.filteredFeedbacks.slice(startIndex, endIndex);
  }

  // Event handlers
  onSearchChange(): void {
    this.currentPage = 1;
    this.applyFilters();
  }

  onRatingFilterChange(): void {
    this.currentPage = 1;
    this.applyFilters();
  }

  onSortChange(): void {
    this.applyFilters();
  }

  toggleSortOrder(): void {
    this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc';
    this.applyFilters();
  }

  // Clear all filters
  clearFilters(): void {
    this.searchQuery = '';
    this.selectedRating = null;
    this.sortBy = 'date';
    this.sortOrder = 'desc';
    this.currentPage = 1;
    this.applyFilters();
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

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxVisiblePages = 5;
    const startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
    const endPage = Math.min(this.totalPages, startPage + maxVisiblePages - 1);
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  }

  // Edit feedback
  openEditModal(feedback: Feedback): void {
    this.editingFeedback = feedback;
    this.editForm = {
      rating: feedback.rating,
      comments: feedback.comments || ''
    };
    this.showEditModal = true;
    this.errorMessage = '';
    this.successMessage = '';
  }

  closeEditModal(): void {
    this.showEditModal = false;
    this.editingFeedback = null;
    this.isUpdating = false;
  }

  updateFeedback(): void {
    if (!this.editingFeedback || !this.isEditFormValid()) {
      return;
    }

    this.isUpdating = true;
    this.errorMessage = '';

    const updateData = {
      rating: this.editForm.rating,
      comments: this.editForm.comments.trim()
    };

    this.feedbackService.updateFeedback(this.editingFeedback.feedbackId, updateData).subscribe({
      next: (response) => {
        this.successMessage = 'Feedback updated successfully!';
        this.closeEditModal();
        this.loadMyFeedbacks();
        this.clearMessagesAfterDelay();
      },
      error: (error) => {
        this.errorMessage = error.message || 'Failed to update feedback.';
        this.isUpdating = false;
      }
    });
  }

  // Delete feedback
  openDeleteModal(feedback: Feedback): void {
    this.deletingFeedback = feedback;
    this.showDeleteModal = true;
    this.errorMessage = '';
    this.successMessage = '';
  }

  closeDeleteModal(): void {
    this.showDeleteModal = false;
    this.deletingFeedback = null;
    this.isDeleting = false;
  }

  deleteFeedback(): void {
    if (!this.deletingFeedback) return;

    this.isDeleting = true;
    this.errorMessage = '';

    this.feedbackService.deleteFeedback(this.deletingFeedback.feedbackId).subscribe({
      next: (response) => {
        this.successMessage = 'Feedback deleted successfully!';
        this.closeDeleteModal();
        this.loadMyFeedbacks();
        this.clearMessagesAfterDelay();
      },
      error: (error) => {
        this.errorMessage = error.message || 'Failed to delete feedback.';
        this.isDeleting = false;
      }
    });
  }

  // Validation
  isEditFormValid(): boolean {
    return this.editForm.rating > 0 && 
           this.editForm.rating <= 5 && 
           this.editForm.comments.trim().length > 0;
  }

  // Utility methods
  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getRatingStars(rating: number): string[] {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(i <= rating ? 'filled' : 'empty');
    }
    return stars;
  }

  getRatingText(rating: number): string {
    const texts = {
      1: 'Poor',
      2: 'Fair', 
      3: 'Good',
      4: 'Very Good',
      5: 'Excellent'
    };
    return texts[rating as keyof typeof texts] || 'Unknown';
  }

  getCharacterCount(): string {
    return `${this.editForm.comments.length}/500`;
  }

  isCharacterLimitReached(): boolean {
    return this.editForm.comments.length >= 450;
  }

  clearMessagesAfterDelay(): void {
    setTimeout(() => {
      this.successMessage = '';
      this.errorMessage = '';
    }, 5000);
  }

  // Navigation
  goToEvent(eventId: number): void {
    this.router.navigate(['/events', eventId]);
  }

  goBack(): void {
    this.router.navigate(['/profile']);
  }

  goToEvents(): void {
    this.router.navigate(['/events']);
  }

  refreshFeedbacks(): void {
    this.loadMyFeedbacks();
  }


  // Get event available seats
  getEventAvailableSeats(eventId?: number): string {
    if (!eventId) return 'Unknown';
    const event = this.events.get(eventId);
    if (!event) return 'Unknown';
    return event.availableSeats !== undefined ? event.availableSeats.toString() : 'Unknown';
  }
}

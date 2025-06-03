import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient, HttpClientModule, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Subject, takeUntil } from 'rxjs';

interface Feedback {
  feedbackId?: number;
  userId: number;
  eventId: number;
  comments: string;
  rating: number;
  createdDate?: string;
  updatedDate?: string;
}

interface Event {
  eventId: number;
  name: string;
  category: string;
  location: string;
  date: string;
}

interface FeedbackResponse {
  message?: string;
  status?: string;
  data?: any;
}

@Component({
  selector: 'app-feedback',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, HttpClientModule],
  templateUrl: './feedback.component.html',
  styleUrl: './feedback.component.css'
})
export class FeedbackComponent implements OnInit, OnDestroy {
  // Form data
  feedback: Feedback = {
    userId: 0,
    eventId: 0,
    comments: '',
    rating: 0
  };

  // Component state
  isSubmitting = false;
  isLoading = false;
  errorMessage = '';
  successMessage = '';
  isEditMode = false;
  existingFeedbackId: number | null = null;

  // Event information
  eventInfo: Event | null = null;
  
  // Route parameters
  ticketId: string | null = null;
  eventId: string | null = null;
  eventName: string | null = null;
  ticketStatus: string | null = null;
  returnUrl: string = '/ticket-history';

  // User authentication
  currentUserId: number = 0;
  isLoggedIn = false;

  // API URLs
  private readonly feedbackApiUrl = 'http://localhost:9090/feedback';
  private readonly eventApiUrl = 'http://localhost:9090/event';

  // RxJS
  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.checkAuthentication();
    if (this.isLoggedIn) {
      this.loadRouteParameters();
      this.initializeFeedback();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkAuthentication(): void {
    const token = this.getJwtToken();
    this.isLoggedIn = !!token && this.isTokenValid(token);
    
    if (!this.isLoggedIn) {
      console.log('User not authenticated, redirecting to login');
      this.router.navigate(['/login'], {
        queryParams: { returnUrl: this.router.url }
      });
      return;
    }

    this.currentUserId = this.getCurrentUserId();
    if (this.currentUserId === 0) {
      this.showError('Unable to identify user. Please login again.');
      this.router.navigate(['/login']);
    }
  }

  private loadRouteParameters(): void {
    this.route.queryParams.pipe(
      takeUntil(this.destroy$)
    ).subscribe(params => {
      console.log('Route parameters:', params);
      
      this.ticketId = params['ticketId'] || null;
      this.eventId = params['eventId'] || null;
      this.eventName = params['eventName'] || null;
      this.ticketStatus = params['ticketStatus'] || null;
      this.returnUrl = params['returnUrl'] || '/ticket-history';

      // Set eventId in feedback object if provided
      if (this.eventId) {
        const parsedEventId = parseInt(this.eventId, 10);
        if (!isNaN(parsedEventId) && parsedEventId > 0) {
          this.feedback.eventId = parsedEventId;
          this.loadEventDetails();
          this.checkExistingFeedback();
        } else {
          this.showError('Invalid event ID provided');
        }
      } else {
        this.showError('Event ID is required to submit feedback');
      }
    });
  }

  private initializeFeedback(): void {
    this.feedback = {
      userId: this.currentUserId,
      eventId: this.feedback.eventId || 0,
      comments: '',
      rating: 0
    };

    this.isEditMode = false;
    this.existingFeedbackId = null;
    this.clearMessages();
  }

  private getJwtToken(): string | null {
    return localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken') || null;
  }

  private isTokenValid(token: string): boolean {
    try {
      const payload = this.decodeJwtToken(token);
      const currentTime = Math.floor(Date.now() / 1000);
      return payload.exp ? payload.exp > currentTime : false;
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  }

  private getCurrentUserId(): number {
    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) {
      const parsedId = parseInt(storedUserId, 10);
      if (!isNaN(parsedId) && parsedId > 0) {
        return parsedId;
      }
    }

    const token = this.getJwtToken();
    if (!token) return 0;

    try {
      const payload = this.decodeJwtToken(token);
      const userIdFields = ['userid', 'userId', 'id', 'sub'];
      
      for (const field of userIdFields) {
        const value = payload[field];
        if (value) {
          const parsedValue = typeof value === 'string' ? parseInt(value, 10) : value;
          if (!isNaN(parsedValue) && parsedValue > 0) {
            return parsedValue;
          }
        }
      }
    } catch (error) {
      console.error('Error extracting user ID from JWT:', error);
    }

    return 0;
  }

  private decodeJwtToken(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT structure');
      }
      
      let payload = parts[1];
      payload = payload.replace(/-/g, '+').replace(/_/g, '/');
      
      switch (payload.length % 4) {
        case 2: payload += '=='; break;
        case 3: payload += '='; break;
        case 0: break;
        default: throw new Error('Invalid base64 string');
      }
      
      const decoded = atob(payload);
      return JSON.parse(decoded);
    } catch (error) {
      console.error('JWT decode error:', error);
      throw new Error('Failed to decode JWT token');
    }
  }

  private getAuthHeaders(): HttpHeaders {
    const token = this.getJwtToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });
  }

  private loadEventDetails(): void {
    if (!this.feedback.eventId) {
      console.warn('No event ID to load details for');
      return;
    }

    this.isLoading = true;
    this.clearMessages();

    try {
      const headers = this.getAuthHeaders();
      
      this.http.get<Event>(`${this.eventApiUrl}/getEventById/${this.feedback.eventId}`, { headers })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (event: Event) => {
            console.log('Event details loaded:', event);
            this.eventInfo = event;
            this.isLoading = false;
            
            if (!this.eventName && event?.name) {
              this.eventName = event.name;
            }
          },
          error: (error: HttpErrorResponse) => {
            console.error('Error loading event details:', error);
            this.isLoading = false;
            this.handleEventLoadError(error);
          }
        });
    } catch (error) {
      console.error('Error preparing event request:', error);
      this.isLoading = false;
      this.showError('Authentication error. Please login again.');
    }
  }

  private handleEventLoadError(error: HttpErrorResponse): void {
    let errorMessage = 'Failed to load event details';

    switch (error.status) {
      case 404:
        errorMessage = 'Event not found';
        break;
      case 401:
        errorMessage = 'Session expired. Please login again.';
        this.router.navigate(['/login']);
        return;
      case 403:
        errorMessage = 'You do not have permission to view this event';
        break;
      case 0:
        errorMessage = 'Network error. Please check your connection.';
        break;
      case 500:
        errorMessage = 'Server error. Please try again later.';
        break;
    }

    this.showError(errorMessage);
  }

  private checkExistingFeedback(): void {
    if (!this.feedback.eventId || !this.currentUserId) {
      return;
    }

    try {
      const headers = this.getAuthHeaders();
      
      this.http.get<Feedback[]>(`${this.feedbackApiUrl}/user/${this.currentUserId}`, { headers })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (feedbacks: Feedback[]) => {
            const existingFeedback = feedbacks.find(f => f.eventId === this.feedback.eventId);
            
            if (existingFeedback) {
              console.log('Found existing feedback:', existingFeedback);
              this.loadExistingFeedback(existingFeedback);
            }
          },
          error: (error: HttpErrorResponse) => {
            console.warn('Could not check for existing feedback:', error);
          }
        });
    } catch (error) {
      console.warn('Error checking existing feedback:', error);
    }
  }

  private loadExistingFeedback(existingFeedback: Feedback): void {
    this.isEditMode = true;
    this.existingFeedbackId = existingFeedback.feedbackId || null;
    
    this.feedback = {
      ...existingFeedback,
      userId: this.currentUserId,
      eventId: this.feedback.eventId
    };

    this.showSuccess('Found your existing feedback for this event. You can update it below.');
  }

  isFormValid(): boolean {
    return this.feedback.rating > 0 && 
           this.feedback.comments.trim().length > 0 && 
           this.feedback.comments.trim().length <= 500;
  }

  setRating(rating: number): void {
    if (rating >= 1 && rating <= 5) {
      this.feedback.rating = rating;
      this.clearMessages();
    }
  }

  getRatingStars(): number[] {
    return [1, 2, 3, 4, 5];
  }

  getRatingText(rating: number): string {
    const ratingTexts = {
      1: 'Poor',
      2: 'Fair', 
      3: 'Good',
      4: 'Very Good',
      5: 'Excellent'
    };
    return ratingTexts[rating as keyof typeof ratingTexts] || 'Not Rated';
  }

  getCharacterCount(): string {
    const count = this.feedback.comments.length;
    return `${count}/500`;
  }

  isCharacterLimitReached(): boolean {
    return this.feedback.comments.length >= 450;
  }

  submitFeedback(): void {
    console.log('Submitting feedback...');
    
    if (!this.isFormValid()) {
      this.showError('Please provide both rating and comments before submitting.');
      return;
    }

    if (this.isSubmitting) {
      console.log('Already submitting, ignoring duplicate request');
      return;
    }

    this.isSubmitting = true;
    this.clearMessages();

    const feedbackData: Feedback = {
      userId: this.currentUserId,
      eventId: this.feedback.eventId,
      comments: this.feedback.comments.trim(),
      rating: this.feedback.rating
    };

    if (this.isEditMode && this.existingFeedbackId) {
      feedbackData.feedbackId = this.existingFeedbackId;
    }

    console.log('Feedback data:', feedbackData);

    if (this.isEditMode) {
      this.updateFeedback(feedbackData);
    } else {
      this.createFeedback(feedbackData);
    }
  }

  private createFeedback(feedbackData: Feedback): void {
    try {
      const headers = this.getAuthHeaders();
      
      this.http.post<any>(`${this.feedbackApiUrl}/save`, feedbackData, { headers })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response: any) => {
            console.log('Feedback created successfully:', response);
            this.isSubmitting = false;
            this.handleSubmissionSuccess(response, 'Feedback submitted successfully!');
          },
          error: (error: HttpErrorResponse) => {
            console.error('Error creating feedback:', error);
            this.isSubmitting = false;
            this.handleSubmissionError(error);
          }
        });
    } catch (error) {
      console.error('Error preparing feedback request:', error);
      this.isSubmitting = false;
      this.showError('Authentication error. Please login again.');
    }
  }

  private updateFeedback(feedbackData: Feedback): void {
    if (!this.existingFeedbackId) {
      this.showError('Cannot update feedback: Missing feedback ID');
      this.isSubmitting = false;
      return;
    }

    try {
      const headers = this.getAuthHeaders();
      
      this.http.put<any>(`${this.feedbackApiUrl}/update/${this.existingFeedbackId}`, feedbackData, { headers })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response: any) => {
            console.log('Feedback updated successfully:', response);
            this.isSubmitting = false;
            this.handleSubmissionSuccess(response, 'Feedback updated successfully!');
          },
          error: (error: HttpErrorResponse) => {
            console.error('Error updating feedback:', error);
            this.isSubmitting = false;
            this.handleSubmissionError(error);
          }
        });
    } catch (error) {
      console.error('Error preparing update request:', error);
      this.isSubmitting = false;
      this.showError('Authentication error. Please login again.');
    }
  }

  private handleSubmissionSuccess(response: any, defaultMessage: string): void {
    const successMessage = response?.message || defaultMessage;
    this.showSuccess(successMessage);
    
    setTimeout(() => {
      this.goBack();
    }, 2000);
  }

  private handleSubmissionError(error: HttpErrorResponse): void {
    let errorMessage = 'Failed to submit feedback. Please try again.';

    switch (error.status) {
      case 400:
        errorMessage = error.error?.message || 'Invalid feedback data. Please check your inputs.';
        break;
      case 401:
        errorMessage = 'Session expired. Please login again.';
        this.router.navigate(['/login']);
        return;
      case 403:
        errorMessage = 'You do not have permission to submit feedback for this event.';
        break;
      case 404:
        errorMessage = 'Event not found or no longer available.';
        break;
      case 409:
        errorMessage = 'You have already submitted feedback for this event.';
        break;
      case 422:
        errorMessage = 'Invalid feedback data. Please check your rating and comments.';
        break;
      case 500:
        errorMessage = 'Server error. Please try again later.';
        break;
      case 0:
        errorMessage = 'Network error. Please check your connection.';
        break;
      default:
        errorMessage = error.error?.message || 'Unknown error occurred while submitting feedback.';
    }

    this.showError(errorMessage);
  }

  deleteFeedback(): void {
    if (!this.existingFeedbackId) {
      this.showError('No feedback to delete');
      return;
    }

    const confirmMessage = `Are you sure you want to delete your feedback for "${this.eventName || 'this event'}"?\n\nThis action cannot be undone.`;
    
    if (!confirm(confirmMessage)) {
      return;
    }

    this.isSubmitting = true;
    this.clearMessages();

    try {
      const headers = this.getAuthHeaders();
      
      this.http.delete<any>(`${this.feedbackApiUrl}/delete/${this.existingFeedbackId}`, { headers })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response: any) => {
            console.log('Feedback deleted successfully:', response);
            this.isSubmitting = false;
            const successMessage = response?.message || 'Feedback deleted successfully!';
            this.showSuccess(successMessage);
            
            setTimeout(() => {
              this.goBack();
            }, 2000);
          },
          error: (error: HttpErrorResponse) => {
            console.error('Error deleting feedback:', error);
            this.isSubmitting = false;
            this.handleDeleteError(error);
          }
        });
    } catch (error) {
      console.error('Error preparing delete request:', error);
      this.isSubmitting = false;
      this.showError('Authentication error. Please login again.');
    }
  }

  private handleDeleteError(error: HttpErrorResponse): void {
    let errorMessage = 'Failed to delete feedback. Please try again.';

    switch (error.status) {
      case 401:
        errorMessage = 'Session expired. Please login again.';
        this.router.navigate(['/login']);
        return;
      case 403:
        errorMessage = 'You do not have permission to delete this feedback.';
        break;
      case 404:
        errorMessage = 'Feedback not found or already deleted.';
        break;
      case 500:
        errorMessage = 'Server error. Please try again later.';
        break;
      default:
        errorMessage = error.error?.message || 'Unknown error occurred while deleting feedback.';
    }

    this.showError(errorMessage);
  }

  resetForm(): void {
    if (this.isEditMode && this.existingFeedbackId) {
      this.checkExistingFeedback();
    } else {
      this.feedback.rating = 0;
      this.feedback.comments = '';
    }
    
    this.clearMessages();
  }

  goBack(): void {
    if (this.returnUrl && this.returnUrl !== '/feedback') {
      this.router.navigate([this.returnUrl]);
    } else {
      this.router.navigate(['/ticket-history']);
    }
  }

  goToEventDetails(): void {
    if (this.feedback.eventId) {
      this.router.navigate(['/events', this.feedback.eventId]);
    }
  }

  formatDate(dateString: string | undefined | null): string {
    try {
      if (!dateString) {
        return 'Date TBA';
      }

      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Invalid Date';
      }

      return date.toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid Date';
    }
  }

  private showSuccess(message: string): void {
    this.successMessage = message;
    this.errorMessage = '';
    console.log('Success:', message);
  }

  private showError(message: string): void {
    this.errorMessage = message;
    this.successMessage = '';
    console.error('Error:', message);
  }

  private clearMessages(): void {
    this.successMessage = '';
    this.errorMessage = '';
  }
}

import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { HttpClient, HttpClientModule, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';

// Import the TicketService types
import { TicketService, BookingRequest, Event } from '../services/ticket.service';

@Component({
  selector: 'app-ticket-booking',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, HttpClientModule, RouterLink],
  templateUrl: './ticket-booking.component.html',
  styleUrl: './ticket-booking.component.css'
})
export class TicketBookingComponent implements OnInit, OnDestroy {
  bookingForm!: FormGroup;
  event: Event | null = null;
  loading = false;
  submitting = false;
  eventId: number = 0;
  currentUserId: number = 0;
  currentUsername: string = '';
  currentUserEmail: string = '';
  isLoggedIn = false;

  Math = Math;

  private subscriptions: Subscription[] = [];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private http: HttpClient,
    private ticketService: TicketService // Inject the TicketService
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    const routeSubscription = this.route.params.subscribe(params => {
      this.eventId = +params['eventId'] || +params['id'];
      console.log('Event ID from route:', this.eventId);
      
      if (!this.eventId || this.eventId <= 0) {
        console.error('Invalid event ID:', this.eventId);
        this.showErrorMessage('Invalid event ID');
        this.router.navigate(['/events']);
        return;
      }

      this.checkAuthentication();
      
      if (this.isLoggedIn) {
        this.loadEventDetails();
      }
    });

    this.subscriptions.push(routeSubscription);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => {
      if (sub && !sub.closed) {
        sub.unsubscribe();
      }
    });
    this.subscriptions = [];
  }

  private checkAuthentication(): void {
    const token = this.getJwtToken();
    this.isLoggedIn = !!token;
    
    if (!this.isLoggedIn) {
      console.log('User not authenticated, redirecting to login');
      this.redirectToLogin();
      return;
    }

    this.currentUserId = this.getCurrentUserId();
    this.currentUsername = localStorage.getItem('username') || '';
    this.currentUserEmail = localStorage.getItem('userEmail') || '';

    console.log('Authentication check:', {
      userId: this.currentUserId,
      username: this.currentUsername,
      email: this.currentUserEmail
    });

    if (this.currentUserId === 0) {
      console.error('Unable to identify user ID');
      this.showErrorMessage('Unable to identify user. Please login again.');
      this.redirectToLogin();
      return;
    }

    this.bookingForm.patchValue({
      customerDetails: {
        name: this.currentUsername,
        email: this.currentUserEmail,
        phone: ''
      }
    });
  }

  private redirectToLogin(): void {
    this.router.navigate(['/login'], {
      queryParams: { returnUrl: `/booking/${this.eventId}` }
    });
  }

  private getJwtToken(): string | null {
    return localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken') || null;
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
      console.log('JWT Payload for user ID extraction:', payload);

      const userIdFields = ['userid', 'userId', 'organizerId', 'id', 'sub'];
      
      for (const field of userIdFields) {
        const value = payload[field];
        if (value) {
          const parsedValue = typeof value === 'string' ? parseInt(value, 10) : value;
          if (!isNaN(parsedValue) && parsedValue > 0) {
            console.log(`Found user ID in field '${field}':`, parsedValue);
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
      if (!token || typeof token !== 'string') {
        throw new Error('Invalid token format');
      }

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

  private initializeForm(): void {
    this.bookingForm = this.fb.group({
      numberOfTickets: [1, [
        Validators.required, 
        Validators.min(1), 
        Validators.max(10),
        this.ticketAvailabilityValidator.bind(this)
      ]],
      customerDetails: this.fb.group({
        name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
        email: ['', [Validators.required, Validators.email]],
        phone: ['', [Validators.required, Validators.pattern(/^[6-9]\d{9}$/)]]
      }),
      agreeToTerms: [false, Validators.requiredTrue]
    });
  }

  private ticketAvailabilityValidator(control: AbstractControl): ValidationErrors | null {
    if (!control.value || !this.event) return null;

    const requestedTickets = control.value;
    const availableSeats = this.event.availableSeats || 0;

    if (requestedTickets > availableSeats) {
      return { 
        exceedsAvailable: { 
          requested: requestedTickets, 
          available: availableSeats 
        } 
      };
    }

    return null;
  }

  private loadEventDetails(): void {
    console.log(`Loading event details for ID: ${this.eventId}`);
    
    // Use TicketService to load event details
    const eventSubscription = this.ticketService.loadEventForBooking(this.eventId).subscribe({
      next: (event: Event) => {
        console.log('Event details loaded:', event);
        this.event = event;
        this.loading = false;
        
        // Update form validator with new event data
        this.bookingForm.get('numberOfTickets')?.updateValueAndValidity();
      },
      error: (error: HttpErrorResponse) => {
        console.error('Error loading event:', error);
        this.loading = false;
        this.handleEventLoadError(error);
      }
    });

    this.subscriptions.push(eventSubscription);
  }

  private handleEventLoadError(error: HttpErrorResponse): void {
    let errorMessage = 'Failed to load event details';

    switch (error.status) {
      case 404:
        errorMessage = 'Event not found';
        break;
      case 401:
        errorMessage = 'Please login to view event details';
        this.redirectToLogin();
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

    this.showErrorMessage(errorMessage);
    this.router.navigate(['/events']);
  }

  onSubmit(): void {
    console.log('Form submission started');
    console.log('Form valid:', this.bookingForm.valid);
    console.log('Form value:', this.bookingForm.value);

    if (!this.bookingForm.valid || !this.event) {
      console.log('Form invalid or no event data');
      this.markFormGroupTouched();
      this.showErrorMessage('Please fill all required fields correctly');
      return;
    }

    if (this.submitting) {
      console.log('Already submitting, ignoring duplicate request');
      return;
    }

    this.submitting = true;

    // Get the quantity from the form
    const quantity = this.bookingForm.get('numberOfTickets')?.value || 1;
    
    // Create booking request with quantity
    const bookingRequest: BookingRequest = {
      eventId: this.event.eventId || this.event.id || this.eventId,
      userId: this.currentUserId,
      quantity: quantity // Include quantity in the request
    };

    console.log('Submitting booking request with quantity:', bookingRequest);

    // Use TicketService to book the ticket
    const bookingSubscription = this.ticketService.bookTicket(bookingRequest).subscribe({
      next: (response) => {
        console.log('Booking successful:', response);
        this.submitting = false;
        this.handleBookingSuccess(response.message);
      },
      error: (error: HttpErrorResponse) => {
        console.error('Booking failed:', error);
        this.submitting = false;
        this.handleBookingError(error);
      }
    });

    this.subscriptions.push(bookingSubscription);
  }

  private handleBookingSuccess(message: string): void {
    const successMessage = message || 'Ticket booked successfully!';
    this.showSuccessMessage(successMessage);
    
    setTimeout(() => {
      this.router.navigate(['/events '], {
        queryParams: { 
          message: 'Ticket booked successfully!'
        }
      });
    }, 2000);
  }

  private handleBookingError(error: HttpErrorResponse): void {
    console.log('Booking error details:', {
      status: error.status,
      statusText: error.statusText,
      error: error.error,
      message: error.message
    });

    let errorMessage = 'Booking failed. Please try again.';

    switch (error.status) {
      case 400:
        const badRequestMsg = error.error?.message || error.error || 'Invalid booking request';
        errorMessage = `Bad request: ${badRequestMsg}`;
        break;
      case 401:
        errorMessage = 'Session expired. Please login again.';
        this.redirectToLogin();
        return;
      case 403:
        errorMessage = 'You do not have permission to book this ticket.';
        break;
      case 404:
        errorMessage = 'Event not found or no longer available.';
        break;
      case 409:
        errorMessage = 'Event is sold out or insufficient tickets available.';
        break;
      case 422:
        errorMessage = 'Invalid booking data. Please check your information.';
        break;
      case 500:
        errorMessage = 'Server error. Please try again later.';
        break;
      case 0:
        errorMessage = 'Network error. Please check your connection and try again.';
        break;
      default:
        const defaultMsg = error.error?.message || error.message || 'Unknown error';
        errorMessage = `Booking failed: ${defaultMsg}`;
    }

    this.showErrorMessage(errorMessage);
  }

  goBack(): void {
    this.router.navigate(['/events']);
  }

  isFieldInvalid(fieldPath: string): boolean {
    const field = this.getFieldByPath(fieldPath);
    return !!(field?.invalid && (field.dirty || field.touched));
  }

  getFieldError(fieldPath: string): string {
    const field = this.getFieldByPath(fieldPath);
    if (!field?.errors) return '';

    const errors = field.errors;
    const fieldName = this.getFieldDisplayName(fieldPath);

    if (errors['required']) return `${fieldName} is required`;
    if (errors['email']) return 'Please enter a valid email address';
    if (errors['minlength']) return `${fieldName} must be at least ${errors['minlength'].requiredLength} characters`;
    if (errors['maxlength']) return `${fieldName} cannot exceed ${errors['maxlength'].requiredLength} characters`;
    if (errors['pattern']) return 'Please enter a valid 10-digit phone number starting with 6-9';
    if (errors['min']) return `Minimum ${errors['min'].min} ticket required`;
    if (errors['max']) return `Maximum ${errors['max'].max} tickets allowed`;
    if (errors['exceedsAvailable']) {
      const { requested, available } = errors['exceedsAvailable'];
      return `Only ${available} tickets available, but ${requested} requested`;
    }

    return 'Invalid input';
  }

  private getFieldByPath(path: string): any {
    return path.split('.').reduce<AbstractControl | null>((form, field) => {
      if (form) {
        return form.get(field);
      }
      return null;
    }, this.bookingForm);
  }

  private getFieldDisplayName(fieldPath: string): string {
    const displayNames: Record<string, string> = {
      'numberOfTickets': 'Number of tickets',
      'customerDetails.name': 'Full name',
      'customerDetails.email': 'Email address',
      'customerDetails.phone': 'Phone number',
      'agreeToTerms': 'Terms and conditions'
    };
    return displayNames[fieldPath] || fieldPath.split('.').pop() || fieldPath;
  }

  private markFormGroupTouched(): void {
    Object.keys(this.bookingForm.controls).forEach(key => {
      const control = this.bookingForm.get(key);
      control?.markAsTouched();
      
      if (control instanceof FormGroup) {
        Object.keys(control.controls).forEach(nestedKey => {
          control.get(nestedKey)?.markAsTouched();
        });
      }
    });
  }

  private showSuccessMessage(message: string): void {
    console.log('Success:', message);
    alert('✅ ' + message);
  }

  private showErrorMessage(message: string): void {
    console.error('Error:', message);
    alert('❌ ' + message);
  }

  formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Date TBA';
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
      return 'Date TBA';
    }
  }

  formatPrice(amount: number): string {
    if (!amount || amount <= 0) {
      return '₹1.00'; // Show minimum price instead of free since backend requires > 0
    }
    
    try {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    } catch (error) {
      console.error('Error formatting price:', error);
      return `₹${amount.toFixed(2)}`;
    }
  }

  getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      entertainment: 'bi-music-note-beamed',
      sports: 'bi-trophy',
      business: 'bi-briefcase',
      education: 'bi-mortarboard',
      technology: 'bi-laptop',
      arts: 'bi-palette',
      food: 'bi-cup-straw',
      health: 'bi-heart-pulse'
    };
    return icons[category?.toLowerCase()] || 'bi-calendar-event';
  }

  getTotalAmount(): number {
    const numberOfTickets = this.bookingForm.get('numberOfTickets')?.value || 1;
    return (this.event?.ticketPrice || 1) * numberOfTickets;
  }

  getMaxTickets(): number {
    return Math.min(10, this.event?.availableSeats || 10);
  }

  getAvailableSeats(): number {
    return this.event?.availableSeats || 0;
  }

  hasAvailableSeats(): boolean {
    return (this.event?.availableSeats || 0) > 0;
  }

  getPriceClass(price: number): string {
    if (!price || price <= 1) return 'price-minimum';
    if (price < 500) return 'price-low';
    if (price < 1500) return 'price-medium';
    return 'price-high';
  }

  extractTime(dateString: string): string {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Time TBA';
      }
      
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
    } catch (error) {
      console.error('Error extracting time:', error);
      return 'Time TBA';
    }
  }
}

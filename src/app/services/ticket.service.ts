import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError, map, catchError } from 'rxjs';

export interface Ticket {
  ticketId: number;
  bookingId?: number;
  userId: number;
  eventId: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  quantity: number;
  totalAmount: number;
  bookingDate: string;
  status: 'BOOKED' | 'CANCELLED' | 'PENDING'; // Changed CONFIRMED to BOOKED
  event?: Event;
  cancellable?: boolean;
}

export interface Event {
  id: number;
  eventId: number;
  name: string;
  category: string;
  location: string;
  date: string;
  venue?: string;
  description?: string;
  organizerId: number;
  ticketCount: number;
  ticketPrice: number;
  availableSeats?: number;
  imageUrl?: string;
}

export interface BookingRequest {
  eventId: number;
  userId: number;
  quantity: number; // Added quantity field
  customerDetails?: {
    name: string;
    email: string;
    phone: string;
  };
}

export interface BookingResponse {
  bookingId?: number;
  ticketId?: number;
  message: string;
  status: string;
  ticketDetails?: any;
}

export interface CancelResponse {
  message: string;
  status: string;
  ticketId?: number;
}

@Injectable({
  providedIn: 'root'
})
export class TicketService {
  private readonly ticketApiUrl = 'http://localhost:9090/ticket';
  private readonly eventApiUrl = 'http://localhost:9090/event';

  // State management
  private ticketsSubject = new BehaviorSubject<Ticket[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new BehaviorSubject<string>('');

  // Public observables
  public readonly tickets$ = this.ticketsSubject.asObservable();
  public readonly loading$ = this.loadingSubject.asObservable();
  public readonly error$ = this.errorSubject.asObservable();

  constructor(private http: HttpClient) {}

  // Get current tickets
  getCurrentTickets(): Ticket[] {
    return this.ticketsSubject.value;
  }

  // Load tickets for a user
  loadUserTickets(userId: number): Observable<Ticket[]> {
    this.loadingSubject.next(true);
    this.errorSubject.next('');

    return this.http.get<Ticket[]>(`${this.ticketApiUrl}/getTicketByUserId/${userId}`, {
      headers: this.getAuthHeaders()
    }).pipe(
      map(tickets => this.processTickets(tickets)),
      catchError(error => {
        this.handleError(error, 'Failed to load tickets');
        return throwError(() => error);
      }),
      map(tickets => {
        this.ticketsSubject.next(tickets);
        this.loadingSubject.next(false);
        return tickets;
      })
    );
  }

  // Book a ticket with quantity
  bookTicket(bookingRequest: BookingRequest): Observable<BookingResponse> {
    this.loadingSubject.next(true);

    console.log('Booking ticket with request:', bookingRequest);

    return this.http.post(this.ticketApiUrl + '/book', bookingRequest, {
      headers: this.getAuthHeaders(),
      responseType: 'text'
    }).pipe(
      map(response => ({
        message: response,
        status: 'SUCCESS'
      } as BookingResponse)),
      catchError(error => {
        this.handleError(error, 'Booking failed');
        return throwError(() => error);
      }),
      map(response => {
        this.loadingSubject.next(false);
        return response;
      })
    );
  }

  // Cancel a ticket
  cancelTicket(ticketId: number): Observable<CancelResponse> {
    return this.http.delete(`${this.ticketApiUrl}/cancel/${ticketId}`, {
      headers: this.getAuthHeaders(),
      responseType: 'text'
    }).pipe(
      map(response => ({
        message: response || 'Ticket cancelled successfully',
        status: 'SUCCESS',
        ticketId
      } as CancelResponse)),
      catchError(error => {
        // Handle the case where status is 200 but treated as error due to response type
        if (error.status === 200) {
          const message = error.error || 'Ticket cancelled successfully';
          return this.handleCancelSuccess(ticketId, message);
        }
        this.handleError(error, 'Failed to cancel ticket');
        return throwError(() => error);
      }),
      map(response => {
        // Update local state
        this.updateTicketStatus(ticketId, 'CANCELLED');
        return response;
      })
    );
  }

  // Load event details for tickets
  loadEventDetailsForTickets(): void {
    const tickets = this.getCurrentTickets();
    const eventIds = [...new Set(tickets.map(ticket => ticket.eventId))];
    
    eventIds.forEach(eventId => {
      this.loadEventDetails(eventId).subscribe({
        next: (event) => {
          this.updateTicketsWithEvent(eventId, event);
        },
        error: (error) => {
          console.warn(`Could not load event details for event ID ${eventId}:`, error);
          this.setFallbackEventData(eventId);
        }
      });
    });
  }

  // Load single event details
  loadEventDetails(eventId: number): Observable<Event> {
    return this.http.get<Event>(`${this.eventApiUrl}/getEventById/${eventId}`, {
      headers: this.getAuthHeaders()
    }).pipe(
      catchError(error => {
        console.warn(`Failed to load event ${eventId}:`, error);
        return throwError(() => error);
      })
    );
  }

  // Enhanced event data for booking
  loadEventForBooking(eventId: number): Observable<Event> {
    this.loadingSubject.next(true);
    this.errorSubject.next('');

    return this.http.get<Event>(`${this.eventApiUrl}/getEventById/${eventId}`, {
      headers: this.getAuthHeaders()
    }).pipe(
      map(event => this.enhanceEventData(event)),
      catchError(error => {
        this.handleError(error, 'Failed to load event details');
        return throwError(() => error);
      }),
      map(event => {
        this.loadingSubject.next(false);
        return event;
      })
    );
  }

  // Utility methods
  isTicketCancellable(ticket: Ticket): boolean {
    if (ticket.status === 'CANCELLED') {
      return false;
    }

    if (ticket.event?.date) {
      try {
        const eventDate = new Date(ticket.event.date);
        const now = new Date();
        return eventDate > now;
      } catch {
        return false;
      }
    }

    return true; // Default to cancellable if no event details
  }

  canShowFeedbackButton(ticket: Ticket): boolean {
    if (!ticket.event?.date) {
      return false;
    }

    try {
      const eventDate = new Date(ticket.event.date);
      const now = new Date();
      
      if (ticket.status === 'BOOKED') { // Changed from CONFIRMED to BOOKED
        return eventDate < now; // Event has passed
      }
      
      if (ticket.status === 'CANCELLED') {
        return true; // Allow feedback on cancellation experience
      }
      
      return false;
    } catch {
      return false;
    }
  }

  hasEventEnded(ticket: Ticket): boolean {
    if (!ticket.event?.date) {
      return false;
    }

    try {
      const eventDate = new Date(ticket.event.date);
      const now = new Date();
      return eventDate < now;
    } catch {
      return false;
    }
  }

  getEventStatus(ticket: Ticket): { status: string; message: string; class: string } {
    if (!ticket.event?.date) {
      return { status: 'unknown', message: 'Event date unavailable', class: 'text-muted' };
    }

    try {
      const eventDate = new Date(ticket.event.date);
      const now = new Date();
      const diffMs = eventDate.getTime() - now.getTime();
      const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (ticket.status === 'CANCELLED') {
        return { status: 'cancelled', message: 'Ticket cancelled', class: 'text-danger' };
      }

      if (diffMs < 0) {
        // Event has ended
        return { status: 'ended', message: 'Event completed', class: 'text-success' };
      } else if (diffHours <= 2) {
        // Event starting soon (within 2 hours)
        return { status: 'starting', message: 'Event starting soon', class: 'text-warning' };
      } else if (diffDays <= 1) {
        // Event is today or tomorrow
        return { status: 'upcoming', message: 'Event is today', class: 'text-info' };
      } else if (diffDays <= 7) {
        // Event within a week
        return { status: 'upcoming', message: `Event in ${diffDays} days`, class: 'text-info' };
      } else {
        // Event is far in the future
        return { status: 'future', message: 'Event scheduled', class: 'text-muted' };
      }
    } catch {
      return { status: 'error', message: 'Invalid event date', class: 'text-danger' };
    }
  }

  isAttendedEvent(ticket: Ticket): boolean {
    return ticket.status === 'BOOKED' && this.hasEventEnded(ticket); // Changed from CONFIRMED to BOOKED
  }

  // Statistics methods
  getBookedTicketsCount(): number { // Renamed from getConfirmedTicketsCount
    return this.getCurrentTickets().filter(ticket => ticket.status === 'BOOKED').length;
  }

  getCancelledTicketsCount(): number {
    return this.getCurrentTickets().filter(ticket => ticket.status === 'CANCELLED').length;
  }

  getTotalAmount(): number {
    return this.getCurrentTickets()
      .filter(ticket => ticket.status === 'BOOKED') // Changed from CONFIRMED to BOOKED
      .reduce((total, ticket) => total + ticket.totalAmount, 0);
  }

  getAttendedEventsCount(): number {
    return this.getCurrentTickets().filter(ticket => {
      if (ticket.status !== 'BOOKED' || !ticket.event?.date) { // Changed from CONFIRMED to BOOKED
        return false;
      }
      
      try {
        const eventDate = new Date(ticket.event.date);
        const now = new Date();
        return eventDate < now;
      } catch {
        return false;
      }
    }).length;
  }

  // Private helper methods
  private processTickets(tickets: Ticket[]): Ticket[] {
    return tickets.map(ticket => ({
      ...ticket,
      cancellable: this.isTicketCancellable(ticket)
    })).sort((a, b) => new Date(b.bookingDate).getTime() - new Date(a.bookingDate).getTime());
  }

  private updateTicketStatus(ticketId: number, status: Ticket['status']): void {
    const tickets = this.getCurrentTickets();
    const ticketIndex = tickets.findIndex(t => t.ticketId === ticketId);
    
    if (ticketIndex !== -1) {
      tickets[ticketIndex].status = status;
      tickets[ticketIndex].cancellable = this.isTicketCancellable(tickets[ticketIndex]);
      this.ticketsSubject.next([...tickets]);
    }
  }

  private updateTicketsWithEvent(eventId: number, event: Event): void {
    const tickets = this.getCurrentTickets();
    tickets.forEach(ticket => {
      if (ticket.eventId === eventId) {
        ticket.event = event;
        ticket.cancellable = this.isTicketCancellable(ticket);
      }
    });
    
    this.ticketsSubject.next([...tickets]);
  }

  private setFallbackEventData(eventId: number): void {
    const tickets = this.getCurrentTickets();
    tickets.forEach(ticket => {
      if (ticket.eventId === eventId && !ticket.event) {
        ticket.event = {
          id: eventId,
          eventId: eventId,
          name: 'Event Details Unavailable',
          category: 'unknown',
          location: 'Location Unavailable',
          date: new Date().toISOString(),
          venue: 'Venue Unavailable',
          description: 'Event details could not be loaded',
          organizerId: 0,
          ticketCount: 0,
          ticketPrice: 0
        };
        ticket.cancellable = this.isTicketCancellable(ticket);
      }
    });
    
    this.ticketsSubject.next([...tickets]);
  }

  private enhanceEventData(event: Event): Event {
    return {
      ...event,
      eventId: event.eventId || event.id || 0,
      ticketPrice: event.ticketPrice || 1,
      description: this.generateDescription(event),
      venue: this.generateVenue(event),
      availableSeats: this.calculateAvailableSeats(event.ticketCount),
      imageUrl: this.getEventImage(event.category)
    };
  }

  private generateDescription(event: Event): string {
    const descriptions: Record<string, string> = {
      sports: `Join us for an exciting ${event.name} in ${event.location}. Experience sports at its finest with thrilling action and competitive spirit.`,
      entertainment: `Don't miss ${event.name} in ${event.location}. An unforgettable entertainment experience awaits with amazing performances.`,
      business: `Network and learn at ${event.name} in ${event.location}. Connect with industry professionals and expand your business horizons.`,
      education: `Expand your knowledge at ${event.name} in ${event.location}. Learn from experts and enhance your skills.`,
      technology: `Discover the latest tech trends at ${event.name} in ${event.location}. Innovation and technology converge here.`,
      arts: `Immerse yourself in creativity at ${event.name} in ${event.location}. Experience art in its most beautiful form.`,
      food: `Savor delicious experiences at ${event.name} in ${event.location}. A culinary journey awaits food enthusiasts.`
    };
    
    return descriptions[event.category] || 
           `Join us for an exciting ${event.name} in ${event.location}. An amazing event experience awaits!`;
  }

  private generateVenue(event: Event): string {
    const venueTypes: Record<string, string> = {
      sports: 'Stadium',
      entertainment: 'Entertainment Center',
      business: 'Convention Center',
      education: 'Conference Hall',
      technology: 'Tech Center',
      arts: 'Arts Center',
      food: 'Culinary Center'
    };
    
    const venueType = venueTypes[event.category] || 'Event Center';
    return `${event.location} ${venueType}`;
  }

  private calculateAvailableSeats(totalSeats: number): number {
    // Simulate realistic seat availability (70-95% available)
    const availabilityRate = 0.7 + (Math.random() * 0.25);
    return Math.floor(totalSeats * availabilityRate);
  }

  private getEventImage(category: string): string {
    const images: Record<string, string> = {
      sports: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=400&h=250&fit=crop',
      entertainment: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=250&fit=crop',
      business: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=400&h=250&fit=crop',
      education: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=400&h=250&fit=crop',
      technology: 'https://images.unsplash.com/photo-1518474227162-6b2223824b72?w=400&h=250&fit=crop',
      arts: 'https://images.unsplash.com/photo-1482160549825-59d1b23cb208?w=400&h=250&fit=crop',
      food: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=250&fit=crop'
    };
    
    return images[category] || images['entertainment'];
  }

  private handleCancelSuccess(ticketId: number, message: string): Observable<CancelResponse> {
    return new Observable(observer => {
      observer.next({
        message,
        status: 'SUCCESS',
        ticketId
      });
      observer.complete();
    });
  }

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken');
    if (!token) {
      throw new Error('No authentication token available');
    }

    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });
  }

  private handleError(error: HttpErrorResponse, defaultMessage: string): void {
    this.loadingSubject.next(false);
    
    let errorMessage = defaultMessage;
    
    switch (error.status) {
      case 0:
        errorMessage = 'Network error. Please check your connection.';
        break;
      case 401:
        errorMessage = 'Session expired. Please login again.';
        break;
      case 403:
        errorMessage = 'You do not have permission to perform this action.';
        break;
      case 404:
        errorMessage = 'Resource not found.';
        break;
      case 409:
        errorMessage = 'Conflict: The operation cannot be completed.';
        break;
      case 500:
        errorMessage = 'Server error. Please try again later.';
        break;
      default:
        errorMessage = error.error?.message || error.message || defaultMessage;
    }
    
    this.errorSubject.next(errorMessage);
    console.error('Ticket Service Error:', error);
  }
}

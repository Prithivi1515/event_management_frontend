import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient, HttpClientModule, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

interface Event {
  id: number;
  eventId: number;
  name: string;
  category: string;
  location: string;
  date: string;
  venue?: string;
  description?: string;
}

interface Ticket {
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
  status: 'BOOKED' | 'CANCELLED' | 'PENDING'; // Updated to match service
  event?: Event;
  cancellable?: boolean;
}

interface CancelResponse {
  message: string;
  status: string;
  ticketId?: number;
}

@Component({
  selector: 'app-ticket-history',
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  templateUrl: './ticket-history.component.html',
  styleUrl: './ticket-history.component.css'
})
export class TicketHistoryComponent implements OnInit, OnDestroy {
  tickets: Ticket[] = [];
  loading = false;
  error = '';
  currentUserId: number = 0;
  isLoggedIn = false;
  cancellingTicketId: number | null = null;

  private subscriptions: Subscription[] = [];
  private ticketApiUrl = 'http://localhost:9090/ticket';
  private eventApiUrl = 'http://localhost:9090/event';

  constructor(
    private http: HttpClient,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkAuthentication();
    if (this.isLoggedIn) {
      this.loadTicketHistory();
    }
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
      this.router.navigate(['/login'], {
        queryParams: { returnUrl: '/ticket-history' }
      });
      return;
    }

    this.currentUserId = this.getCurrentUserId();
    
    if (this.currentUserId === 0) {
      console.error('Unable to identify user ID');
      this.showError('Unable to identify user. Please login again.');
      this.router.navigate(['/login']);
      return;
    }

    console.log('Current user ID:', this.currentUserId);
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

  private loadTicketHistory(): void {
    this.loading = true;
    this.error = '';
    
    console.log(`Loading tickets for user ID: ${this.currentUserId}`);
    
    try {
      const headers = this.getAuthHeaders();
      
      const ticketSubscription = this.http.get<Ticket[]>(
        `${this.ticketApiUrl}/getTicketByUserId/${this.currentUserId}`, 
        { headers }
      ).subscribe({
        next: (tickets: Ticket[]) => {
          console.log('Tickets loaded:', tickets);
          this.tickets = this.processTickets(tickets);
          this.loading = false;
          
          this.loadEventDetailsForTickets();
        },
        error: (error: HttpErrorResponse) => {
          console.error('Error loading tickets:', error);
          this.loading = false;
          this.handleTicketLoadError(error);
        }
      });

      this.subscriptions.push(ticketSubscription);
    } catch (error) {
      console.error('Error preparing request:', error);
      this.loading = false;
      this.showError('Authentication error. Please login again.');
    }
  }

  private processTickets(tickets: Ticket[]): Ticket[] {
    return tickets.map(ticket => ({
      ...ticket,
      cancellable: this.isTicketCancellable(ticket)
    })).sort((a, b) => new Date(b.bookingDate).getTime() - new Date(a.bookingDate).getTime());
  }

  private isTicketCancellable(ticket: Ticket): boolean {
    if (ticket.status === 'CANCELLED') {
      return false;
    }

    if (ticket.event?.date) {
      const eventDate = new Date(ticket.event.date);
      const now = new Date();
      
      return eventDate > now;
    }

    return true;
  }

  canCancelTicket(ticket: Ticket): boolean {
    if (ticket.status === 'CANCELLED') {
      return false;
    }

    if (ticket.event?.date) {
      try {
        const eventDate = new Date(ticket.event.date);
        const now = new Date();
        
        if (isNaN(eventDate.getTime()) || isNaN(now.getTime())) {
          console.warn('Invalid date detected for ticket:', ticket.ticketId);
          return false;
        }
        
        return eventDate > now;
      } catch (error) {
        console.error('Error checking cancellation eligibility:', error);
        return false;
      }
    }

    return true;
  }

  private loadEventDetailsForTickets(): void {
    const eventIds = [...new Set(this.tickets.map(ticket => ticket.eventId))];
    
    eventIds.forEach(eventId => {
      this.loadEventDetails(eventId);
    });
  }

  private loadEventDetails(eventId: number): void {
    try {
      const headers = this.getAuthHeaders();
      
      const eventSubscription = this.http.get<Event>(
        `${this.eventApiUrl}/getEventById/${eventId}`,
        { headers }
      ).subscribe({
        next: (event: Event) => {
          this.tickets.forEach(ticket => {
            if (ticket.eventId === eventId) {
              ticket.event = event;
              ticket.cancellable = this.isTicketCancellable(ticket);
            }
          });
          
          this.tickets.sort((a, b) => new Date(b.bookingDate).getTime() - new Date(a.bookingDate).getTime());
        },
        error: (error: HttpErrorResponse) => {
          console.warn(`Could not load event details for event ID ${eventId}:`, error);
          this.tickets.forEach(ticket => {
            if (ticket.eventId === eventId && !ticket.event) {
              ticket.event = {
                id: eventId,
                eventId: eventId,
                name: 'Event Details Unavailable',
                category: 'unknown',
                location: 'Location Unavailable',
                date: new Date().toISOString(),
                venue: 'Venue Unavailable',
                description: 'Event details could not be loaded'
              };
              ticket.cancellable = this.isTicketCancellable(ticket);
            }
          });
        }
      });

      this.subscriptions.push(eventSubscription);
    } catch (error) {
      console.warn(`Error loading event ${eventId}:`, error);
    }
  }

  private handleTicketLoadError(error: HttpErrorResponse): void {
    let errorMessage = 'Failed to load ticket history';

    switch (error.status) {
      case 401:
        errorMessage = 'Session expired. Please login again.';
        this.router.navigate(['/login']);
        return;
      case 403:
        errorMessage = 'You do not have permission to view ticket history.';
        break;
      case 404:
        errorMessage = 'No tickets found for this user.';
        this.tickets = [];
        return;
      case 0:
        errorMessage = 'Network error. Please check your connection.';
        break;
      case 500:
        errorMessage = 'Server error. Please try again later.';
        break;
      default:
        errorMessage = error.error?.message || 'Unknown error occurred';
    }

    this.showError(errorMessage);
  }

  cancelTicket(ticket: Ticket): void {
    if (!this.canCancelTicket(ticket) || this.cancellingTicketId === ticket.ticketId) {
      return;
    }

    const eventName = ticket.event?.name || 'the event';
    const eventDate = ticket.event?.date ? this.formatDate(ticket.event.date) : 'TBA';
    const ticketQuantity = ticket.quantity;
    const totalAmount = this.formatPrice(ticket.totalAmount);

    let confirmMessage = `Are you sure you want to cancel this ticket?\n\n` +
      `Event: ${eventName}\n` +
      `Event Date: ${eventDate}\n` +
      `Ticket Status: ${ticket.status}\n` +
      `Quantity: ${ticketQuantity} ticket(s)\n` +
      `Amount: ${totalAmount}\n\n`;

    if (ticket.status === 'PENDING') {
      confirmMessage += `Note: This ticket is still pending confirmation, but you can cancel it now.\n\n`;
    } else if (ticket.status === 'BOOKED') {
      confirmMessage += `Note: This booked ticket will be cancelled and refund policies may apply.\n\n`;
    }

    confirmMessage += `This action cannot be undone.`;
    
    if (!confirm(confirmMessage)) {
      return;
    }

    this.performTicketCancellation(ticket);
  }

  private performTicketCancellation(ticket: Ticket): void {
    this.cancellingTicketId = ticket.ticketId;
    
    console.log(`Cancelling ticket ID: ${ticket.ticketId} with status: ${ticket.status}`);
    
    try {
      const headers = this.getAuthHeaders();
      
      const cancelSubscription = this.http.delete(
        `${this.ticketApiUrl}/cancel/${ticket.ticketId}`,
        { 
          headers,
          responseType: 'text'
        }
      ).subscribe({
        next: (response: string) => {
          console.log('Ticket cancelled successfully - Response:', response);
          
          const cancelResponse: CancelResponse = {
            message: response || 'Ticket cancelled successfully',
            status: 'SUCCESS',
            ticketId: ticket.ticketId
          };
          
          this.handleCancelSuccess(ticket, cancelResponse);
        },
        error: (error: HttpErrorResponse) => {
          console.error('Error cancelling ticket:', error);
          console.log('Error details:', {
            status: error.status,
            statusText: error.statusText,
            message: error.message,
            error: error.error
          });
          
          if (error.status === 200) {
            console.log('Status 200 received but treated as error - handling as success');
            
            let message = 'Ticket cancelled successfully';
            if (error.error && typeof error.error === 'string') {
              message = error.error;
            }
            
            const successResponse: CancelResponse = {
              message: message,
              status: 'SUCCESS',
              ticketId: ticket.ticketId
            };
            
            this.handleCancelSuccess(ticket, successResponse);
          } else {
            this.handleCancelError(error);
          }
        },
        complete: () => {
          this.cancellingTicketId = null;
        }
      });

      this.subscriptions.push(cancelSubscription);
    } catch (error) {
      console.error('Error preparing cancel request:', error);
      this.cancellingTicketId = null;
      this.showError('Authentication error. Please login again.');
    }
  }

  private handleCancelSuccess(ticket: Ticket, response: CancelResponse): void {
    console.log('Processing cancel success:', response);
    
    const successMessage = response.message || 'Ticket cancelled successfully!';
    
    const ticketIndex = this.tickets.findIndex(t => t.ticketId === ticket.ticketId);
    if (ticketIndex !== -1) {
      this.tickets[ticketIndex].status = 'CANCELLED';
      this.tickets[ticketIndex].cancellable = false;
      
      console.log(`Updated ticket ${ticket.ticketId} status to CANCELLED`);
    }

    this.showSuccess(`${successMessage}\n\nTicket #${ticket.ticketId} has been cancelled successfully.`);
    
    this.error = '';
    
    setTimeout(() => {
      console.log('Auto-refreshing tickets after cancellation');
      this.refreshTickets();
    }, 2000);
  }

  private handleCancelError(error: HttpErrorResponse): void {
    console.log('Processing cancel error:', error);
    
    let errorMessage = 'Failed to cancel ticket. Please try again.';

    switch (error.status) {
      case 0:
        errorMessage = 'Network error. Please check your internet connection and try again.';
        break;
      case 400:
        errorMessage = error.error?.message || 'Cannot cancel this ticket. It may already be cancelled or the event has started.';
        break;
      case 401:
        errorMessage = 'Session expired. Please login again.';
        this.router.navigate(['/login']);
        return;
      case 403:
        errorMessage = 'You do not have permission to cancel this ticket.';
        break;
      case 404:
        errorMessage = 'Ticket not found or already cancelled.';
        this.refreshTickets();
        break;
      case 409:
        errorMessage = 'Cannot cancel ticket. The event may have already started.';
        break;
      case 500:
        errorMessage = 'Server error. Please try again later.';
        break;
      default:
        if (error.error) {
          if (typeof error.error === 'string') {
            errorMessage = error.error;
          } else if (error.error.message) {
            errorMessage = error.error.message;
          }
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        if (!errorMessage || errorMessage === 'Unknown error occurred') {
          errorMessage = `HTTP ${error.status}: ${error.statusText || 'Unknown error'}`;
        }
    }

    this.showError(errorMessage);
  }

  getBookedTicketsCount(): number {
    return this.tickets.filter(ticket => ticket.status === 'BOOKED').length;
  }

  getCancelledTicketsCount(): number {
    return this.tickets.filter(ticket => ticket.status === 'CANCELLED').length;
  }

  getTotalAmount(): number {
    return this.tickets
      .filter(ticket => ticket.status === 'BOOKED')
      .reduce((total, ticket) => total + ticket.totalAmount, 0);
  }

  getAttendedEventsCount(): number {
    return this.tickets.filter(ticket => {
      if (ticket.status !== 'BOOKED' || !ticket.event?.date) {
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

  getFeedbackEligibleTicketsCount(): number {
    return this.tickets.filter(ticket => this.canShowFeedbackButton(ticket)).length;
  }

  getRecentlyAttendedTickets(): Ticket[] {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    return this.tickets.filter(ticket => {
      if (!this.canShowFeedbackButton(ticket) || !ticket.event?.date) {
        return false;
      }

      try {
        const eventDate = new Date(ticket.event.date);
        const now = new Date();
        
        return ticket.status === 'BOOKED' &&
               eventDate < now && 
               eventDate > sevenDaysAgo;
      } catch {
        return false;
      }
    });
  }

  trackByTicketId(index: number, ticket: Ticket): number {
    return ticket.ticketId;
  }

  formatDate(dateString: string): string {
    try {
      if (!dateString) {
        return 'Date TBA';
      }

      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Invalid Date';
      }

      return date.toLocaleDateString('en-IN', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
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

  formatPrice(amount: number): string {
    try {
      if (isNaN(amount) || amount < 0) {
        return '₹0';
      }

      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(amount);
    } catch (error) {
      console.error('Error formatting price:', error);
      return `₹${amount}`;
    }
  }

  getStatusClass(status: string): string {
    switch (status.toUpperCase()) {
      case 'BOOKED':
        return 'bg-success';
      case 'CANCELLED':
        return 'bg-danger';
      case 'PENDING':
        return 'bg-warning';
      default:
        return 'bg-secondary';
    }
  }

  getCategoryIcon(category: string | undefined): string {
    if (!category) {
      return 'bi-calendar-event';
    }

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
    return icons[category.toLowerCase()] || 'bi-calendar-event';
  }

  getEventStatus(ticket: Ticket): { status: string; message: string; class: string; icon: string } {
    if (!ticket.event?.date) {
      return { 
        status: 'unknown', 
        message: 'Event date unavailable', 
        class: 'text-muted',
        icon: 'bi-question-circle'
      };
    }

    try {
      const eventDate = new Date(ticket.event.date);
      const now = new Date();
      const diffMs = eventDate.getTime() - now.getTime();
      const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (ticket.status === 'CANCELLED') {
        return { 
          status: 'cancelled', 
          message: 'Ticket cancelled', 
          class: 'text-danger',
          icon: 'bi-x-circle-fill'
        };
      }

      if (diffMs < 0) {
        const hoursSinceEnd = Math.abs(diffHours);
        if (hoursSinceEnd < 24) {
          return { 
            status: 'just-ended', 
            message: 'Event just completed', 
            class: 'text-success',
            icon: 'bi-check-circle-fill'
          };
        } else {
          return { 
            status: 'ended', 
            message: 'Event completed', 
            class: 'text-success',
            icon: 'bi-check-circle-fill'
          };
        }
      } else if (diffHours <= 2) {
        return { 
          status: 'starting', 
          message: 'Event starting soon', 
          class: 'text-warning',
          icon: 'bi-clock-fill'
        };
      } else if (diffDays <= 1) {
        return { 
          status: 'today', 
          message: 'Event starting soon', 
          class: 'text-info',
          icon: 'bi-calendar-check'
        };
      } else if (diffDays <= 7) {
        return { 
          status: 'upcoming', 
          message: `Event in ${diffDays} days`, 
          class: 'text-info',
          icon: 'bi-calendar-event'
        };
      } else {
        return { 
          status: 'future', 
          message: 'Event scheduled', 
          class: 'text-muted',
          icon: 'bi-calendar'
        };
      }
    } catch {
      return { 
        status: 'error', 
        message: 'Invalid event date', 
        class: 'text-danger',
        icon: 'bi-exclamation-triangle'
      };
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

  refreshTickets(): void {
    this.error = '';
    this.loadTicketHistory();
  }

  goToEvents(): void {
    this.router.navigate(['/events']);
  }

  goToFeedback(ticket: Ticket): void {
    const queryParams = {
      ticketId: ticket.ticketId,
      eventId: ticket.eventId,
      eventName: ticket.event?.name || 'Unknown Event',
      ticketStatus: ticket.status,
      returnUrl: '/ticket-history'
    };

    this.router.navigate(['/feedback'], { queryParams });
  }

  goToGeneralFeedback(): void {
    this.router.navigate(['/feedback'], { 
      queryParams: { 
        source: 'ticket-history',
        returnUrl: '/ticket-history'
      } 
    });
  }

  canShowFeedbackButton(ticket: Ticket): boolean {
    if (!ticket.event?.date) {
      return false;
    }

    try {
      const eventDate = new Date(ticket.event.date);
      const now = new Date();
      
      if (ticket.status === 'BOOKED') {
        return eventDate < now;
      }
      
      if (ticket.status === 'CANCELLED') {
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error determining feedback eligibility:', error);
      return false;
    }
  }

  private showSuccess(message: string): void {
    console.log('Success:', message);
    
    alert('✅ Success!\n\n' + message);
  }

  private showError(message: string): void {
    console.error('Error:', message);
    this.error = message;
    
    alert('❌ Error!\n\n' + message);
    
    setTimeout(() => {
      if (this.error === message) {
        this.error = '';
      }
    }, 10000);
  }
}

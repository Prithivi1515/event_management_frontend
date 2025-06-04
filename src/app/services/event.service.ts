import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, map, retry } from 'rxjs/operators';

export interface Event {
  eventId: number;
  id?: number;
  name: string;
  category: string;
  location: string;
  date: string;
  organizerId: number;
  ticketCount: number;
  price: number;              
  description?: string;
  time?: string;
  venue?: string;
  availableSeats?: number;
  imageUrl?: string;
}

export interface ApiResponse<T> {
  data?: T;
  message?: string;
  status?: string;
  success?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class EventService {
  private readonly baseUrl = 'http://localhost:9090/event';
  private eventsSubject = new BehaviorSubject<Event[]>([]);
  public events$ = this.eventsSubject.asObservable();

  constructor(private http: HttpClient) {}

  // Get all events
  getAllEvents(): Observable<Event[]> {
    return this.http.get<Event[]>(`${this.baseUrl}/getAllEvents`)
      .pipe(
        retry(2),
        map(this.normalizeEventData),
        catchError(this.handleError)
      );
  }

  // Search events
  searchEvents(keyword: string): Observable<Event[]> {
    const encodedKeyword = encodeURIComponent(keyword);
    return this.http.get<Event[]>(`${this.baseUrl}/search?keyword=${encodedKeyword}`)
      .pipe(
        retry(2),
        map(this.normalizeEventData),
        catchError(this.handleError)
      );
  }

  // Filter by category
  filterByCategory(category: string): Observable<Event[]> {
    const encodedCategory = encodeURIComponent(category);
    return this.http.get<Event[]>(`${this.baseUrl}/filterByCategory/${encodedCategory}`)
      .pipe(
        retry(2),
        map(this.normalizeEventData),
        catchError(this.handleError)
      );
  }

  // Filter by location
  filterByLocation(location: string): Observable<Event[]> {
    const encodedLocation = encodeURIComponent(location);
    return this.http.get<Event[]>(`${this.baseUrl}/filterByLocation/${encodedLocation}`)
      .pipe(
        retry(2),
        map(this.normalizeEventData),
        catchError(this.handleError)
      );
  }

  // Get event by ID
  getEventById(eventId: number): Observable<Event> {
    return this.http.get<Event>(`${this.baseUrl}/getEventById/${eventId}`)
      .pipe(
        retry(2),
        map(event => this.normalizeEventData([event])[0]),
        catchError(this.handleError)
      );
  }

  // Create event (requires auth)
  createEvent(eventData: Partial<Event>): Observable<string> {
    const headers = this.getAuthHeaders();
    return this.http.post(`${this.baseUrl}/create`, eventData, { 
      headers, 
      responseType: 'text' 
    }).pipe(
      catchError(this.handleError)
    );
  }

  // Update event (requires auth)
  updateEvent(eventId: number, eventData: Partial<Event>): Observable<string> {
    const headers = this.getAuthHeaders();
    return this.http.put(`${this.baseUrl}/updateEventById/${eventId}`, eventData, { 
      headers, 
      responseType: 'text' 
    }).pipe(
      catchError(this.handleError)
    );
  }

  // Delete event (requires auth)
  deleteEvent(eventId: number): Observable<string> {
    const headers = this.getAuthHeaders();
    return this.http.delete(`${this.baseUrl}/deleteEventById/${eventId}`, { 
      headers, 
      responseType: 'text' 
    }).pipe(
      catchError(this.handleError)
    );
  }

  // Get events by organizer (requires auth)
  getEventsByOrganizer(organizerId: number): Observable<Event[]> {
    const headers = this.getAuthHeaders();
    return this.http.get<Event[]>(`${this.baseUrl}/organizer/${organizerId}`, { headers })
      .pipe(
        retry(2),
        map(this.normalizeEventData),
        catchError(this.handleError)
      );
  }

  // Private methods
  private normalizeEventData(events: Event[]): Event[] {
    return events.map(event => ({
      ...event,
      eventId: event.eventId || event.id || 0,
      date: this.normalizeDate(event.date),
      price: event.price || 0  // Ensure price has a default value
    }));
  }

  private normalizeDate(date: string): string {
    try {
      return new Date(date).toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken');
    
    if (!token) {
      throw new Error('Authentication token not found');
    }

    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An unknown error occurred';

    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Error: ${error.error.message}`;
    } else {
      // Server-side error
      switch (error.status) {
        case 0:
          errorMessage = 'Network error. Please check your connection.';
          break;
        case 400:
          errorMessage = 'Bad request. Please check your input.';
          break;
        case 401:
          errorMessage = 'Unauthorized. Please login again.';
          break;
        case 403:
          errorMessage = 'Forbidden. You do not have permission.';
          break;
        case 404:
          errorMessage = 'Resource not found.';
          break;
        case 500:
          errorMessage = 'Server error. Please try again later.';
          break;
        default:
          errorMessage = `Server returned code: ${error.status}, error message: ${error.message}`;
      }
    }

    console.error('EventService Error:', errorMessage, error);
    return throwError(() => new Error(errorMessage));
  }

  // Update local state
  updateEventsState(events: Event[]): void {
    this.eventsSubject.next(events);
  }

  // Get current events
  getCurrentEvents(): Event[] {
    return this.eventsSubject.value;
  }
}
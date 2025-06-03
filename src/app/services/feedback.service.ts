import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface Feedback {
  feedbackId: number;
  userId: number;
  eventId: number;
  rating: number;
  comments: string;
  feedbackDate?: string;
  createdDate?: string;
  userName?: string;
  userEmail?: string;
  eventName?: string;
}

export interface EventFeedbackSummary {
  eventId: number;
  eventName: string;
  totalFeedbacks: number;
  averageRating: number;
  ratingDistribution: { [key: number]: number };
  feedbacks: Feedback[];
}

@Injectable({
  providedIn: 'root'
})
export class FeedbackService {
  private readonly baseUrl = 'http://localhost:9090/feedback';

  constructor(private http: HttpClient) {}

  // Get all feedbacks for a specific event (for organizers)
  getAllFeedbacksByEvent(eventId: number): Observable<Feedback[]> {
    const headers = this.getAuthHeaders();
    return this.http.get<Feedback[]>(`${this.baseUrl}/getAllFeedbacksByEvent/${eventId}`, { headers })
      .pipe(catchError(this.handleError));
  }

  // Get average rating for a specific event
  getAverageRatingByEvent(eventId: number): Observable<number> {
    const headers = this.getAuthHeaders();
    return this.http.get<number>(`${this.baseUrl}/getAverageRatingByEvent/${eventId}`, { headers })
      .pipe(catchError(this.handleError));
  }

  // Get feedbacks for all events hosted by organizer
  getFeedbacksByOrganizer(organizerId: number): Observable<Feedback[]> {
    const headers = this.getAuthHeaders();
    return this.http.get<Feedback[]>(`${this.baseUrl}/organizer/${organizerId}`, { headers })
      .pipe(catchError(this.handleError));
  }

  // Get feedbacks by user
  getAllFeedbacksByUser(userId: number): Observable<Feedback[]> {
    const headers = this.getAuthHeaders();
    return this.http.get<Feedback[]>(`${this.baseUrl}/user/${userId}`, { headers })
      .pipe(catchError(this.handleError));
  }

  // Get comprehensive feedback summary for an event
  getEventFeedbackSummary(eventId: number): Observable<EventFeedbackSummary> {
    const headers = this.getAuthHeaders();
    
    // Combine both API calls
    const feedbacks$ = this.getAllFeedbacksByEvent(eventId);
    const avgRating$ = this.getAverageRatingByEvent(eventId);
    
    return feedbacks$.pipe(
      map(feedbacks => {
        const summary: EventFeedbackSummary = {
          eventId,
          eventName: feedbacks.length > 0 ? feedbacks[0].eventName || `Event ${eventId}` : `Event ${eventId}`,
          totalFeedbacks: feedbacks.length,
          averageRating: 0,
          ratingDistribution: {},
          feedbacks
        };

        // Calculate statistics
        if (feedbacks.length > 0) {
          const totalRating = feedbacks.reduce((sum, f) => sum + f.rating, 0);
          summary.averageRating = Math.round((totalRating / feedbacks.length) * 10) / 10;
          
          // Calculate rating distribution
          for (let i = 1; i <= 5; i++) {
            summary.ratingDistribution[i] = feedbacks.filter(f => f.rating === i).length;
          }
        }

        return summary;
      }),
      catchError(this.handleError)
    );
  }

  // Submit new feedback
  submitFeedback(feedback: Partial<Feedback>): Observable<string> {
    const headers = this.getAuthHeaders();
    return this.http.post(`${this.baseUrl}/submit`, feedback, { 
      headers, 
      responseType: 'text' 
    }).pipe(catchError(this.handleError));
  }

  // Update existing feedback
  updateFeedback(feedbackId: number, feedback: Partial<Feedback>): Observable<string> {
    const headers = this.getAuthHeaders();
    return this.http.put(`${this.baseUrl}/update/${feedbackId}`, feedback, { 
      headers, 
      responseType: 'text' 
    }).pipe(catchError(this.handleError));
  }

  // Delete feedback
  deleteFeedback(feedbackId: number): Observable<string> {
    const headers = this.getAuthHeaders();
    return this.http.delete(`${this.baseUrl}/delete/${feedbackId}`, { 
      headers, 
      responseType: 'text' 
    }).pipe(catchError(this.handleError));
  }

  // Helper methods
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

  private getJwtToken(): string | null {
    return localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken');
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An unknown error occurred';
    
    if (error.error instanceof ErrorEvent) {
      errorMessage = `Error: ${error.error.message}`;
    } else {
      switch (error.status) {
        case 400:
          errorMessage = error.error?.message || 'Invalid request';
          break;
        case 401:
          errorMessage = 'Session expired. Please login again.';
          break;
        case 403:
          errorMessage = 'You do not have permission to access this resource.';
          break;
        case 404:
          errorMessage = 'Resource not found.';
          break;
        case 500:
          errorMessage = 'Server error. Please try again later.';
          break;
        default:
          errorMessage = error.error?.message || `Error Code: ${error.status}`;
      }
    }
    
    console.error('FeedbackService Error:', errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

// User interfaces defined in service
export interface User {
  userId?: number;
  name: string;
  email: string;
  password?: string;
  contactNumber: number;
  roles?: string; // Added roles field
  createdDate?: string;
  updatedDate?: string;
}

export interface UserUpdateRequest {
  name: string;
  email: string;
  password: string;
  contactNumber: number;
  roles: string; // Required by backend - lowercase values
}

export interface UserResponse {
  message?: string;
  status?: string;
  data?: User;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private readonly apiUrl = 'http://localhost:9090/user';

  constructor(private http: HttpClient) {}

  // Get user by ID
  getUserById(userId: number): Observable<User> {
    const headers = this.getAuthHeaders();
    return this.http.get<User>(`${this.apiUrl}/getUserById/${userId}`, { headers })
      .pipe(catchError(this.handleError));
  }

  // Update user profile
  updateUser(userId: number, userData: UserUpdateRequest): Observable<any> {
    const headers = this.getAuthHeaders();
    // Ensure roles are lowercase for backend validation
    const updateData = {
      ...userData,
      roles: userData.roles.toLowerCase()
    };
    
    return this.http.put(`${this.apiUrl}/update/${userId}`, updateData, { 
      headers,
      responseType: 'text' // Expect text response from backend
    }).pipe(
      map(response => {
        // Since backend returns a string, just return it as is
        console.log('Raw backend response:', response);
        return response;
      }),
      catchError(this.handleError)
    );
  }

  // Get authentication headers
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

  // Get JWT token from storage
  private getJwtToken(): string | null {
    return localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken');
  }

  // Extract current user ID from token or localStorage
  getCurrentUserId(): number {
    // Try localStorage first
    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) {
      const parsedId = parseInt(storedUserId, 10);
      if (!isNaN(parsedId) && parsedId > 0) {
        return parsedId;
      }
    }

    // Try extracting from JWT token
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

  // Store roles when user logs in
  setUserRoles(roles: string): void {
    localStorage.setItem('userRoles', roles.toLowerCase());
  }

  // Get current user roles with better fallback logic
  getCurrentUserRoles(): string {
    // Try localStorage first
    const storedRoles = localStorage.getItem('userRoles') || localStorage.getItem('userRole');
    if (storedRoles) {
      return storedRoles.toLowerCase();
    }

    // Try extracting from JWT token
    const token = this.getJwtToken();
    if (!token) return 'user'; // Default role

    try {
      const payload = this.decodeJwtToken(token);
      
      // Try different role field names
      const roleFields = ['roles', 'role', 'authorities', 'scope', 'userRole'];
      
      for (const field of roleFields) {
        const value = payload[field];
        if (value) {
          let roles = '';
          
          // Handle array of roles
          if (Array.isArray(value)) {
            roles = value.map(r => {
              if (typeof r === 'string') {
                return r.startsWith('ROLE_') ? r.substring(5) : r;
              }
              return r.authority ? r.authority.replace('ROLE_', '') : r;
            }).join(',').toLowerCase();
          } 
          // Handle string roles
          else if (typeof value === 'string') {
            roles = value.startsWith('ROLE_') ? value.substring(5).toLowerCase() : value.toLowerCase();
          }
          // Handle object with authority
          else if (value.authority) {
            roles = value.authority.startsWith('ROLE_') ? 
                    value.authority.substring(5).toLowerCase() : 
                    value.authority.toLowerCase();
          }

          if (roles) {
            // Store for future use
            localStorage.setItem('userRoles', roles);
            return roles;
          }
        }
      }
    } catch (error) {
      console.error('Error extracting roles from JWT:', error);
    }

    return 'user'; // Default role
  }

  // Check if user is an organizer or admin
  isOrganizer(): boolean {
    const roles = this.getCurrentUserRoles().toLowerCase();
    return roles.includes('organizer') || roles.includes('admin');
  }

  // Check if user is regular user (not organizer)
  isRegularUser(): boolean {
    const roles = this.getCurrentUserRoles().toLowerCase();
    return roles.includes('user') && !this.isOrganizer();
  }

  // Check if user should see bookings
  canViewBookings(): boolean {
    return this.isAuthenticated() && !this.isOrganizer();
  }

  // Check if user should see events management
  canManageEvents(): boolean {
    return this.isAuthenticated() && this.isOrganizer();
  }

  // Check if user is admin
  isAdmin(): boolean {
    const roles = this.getCurrentUserRoles().toLowerCase();
    return roles.includes('admin');
  }

  // Decode JWT token
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

  // Check if user is authenticated
  isAuthenticated(): boolean {
    const token = this.getJwtToken();
    if (!token) return false;

    try {
      const payload = this.decodeJwtToken(token);
      const currentTime = Math.floor(Date.now() / 1000);
      return payload.exp ? payload.exp > currentTime : false;
    } catch {
      return false;
    }
  }

  // Error handler
  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An unknown error occurred';
    
    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Error: ${error.error.message}`;
    } else {
      // Server-side error
      // Check if the error is actually a success response (status 200) with text content
      if (error.status === 200 && typeof error.error === 'string' && error.error.includes('updated successfully')) {
        // This is actually a successful response, don't treat it as an error
        console.log('Success response received:', error.error);
        return throwError(() => new Error(error.error)); // Pass the success message
      }
      
      errorMessage = error.error?.message || `Error Code: ${error.status}\nMessage: ${error.message}`;
    }
    
    console.error('UserService Error:', errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { catchError, tap } from 'rxjs/operators';

export interface JWTPayload {
  sub: string;
  userId?: number;
  organizerId?: number;
  userid?: number;
  email?: string;
  name?: string;
  roles?: string[];
  iat?: number;
  exp?: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user?: {
    id: number;
    username: string;
    email: string;
    roles: string[];
  };
}

export interface UserInfo {
  id: number;
  username: string;
  email: string;
  roles: string[];
  isLoggedIn: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly baseUrl = 'http://localhost:9090/auth';
  private readonly TOKEN_KEY = 'jwtToken';
  private readonly USERNAME_KEY = 'username';
  private readonly USER_EMAIL_KEY = 'userEmail';
  private readonly USER_ID_KEY = 'userId';
  private readonly IS_LOGGED_IN_KEY = 'isLoggedIn';
  private readonly REMEMBER_ME_KEY = 'rememberMe';

  // Reactive state management
  private isLoggedInSubject = new BehaviorSubject<boolean>(false);
  private currentUserSubject = new BehaviorSubject<UserInfo | null>(null);

  public isLoggedIn$ = this.isLoggedInSubject.asObservable();
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    this.initializeAuthState();
  }

  /**
   * Initialize authentication state on service creation
   */
  private initializeAuthState(): void {
    const token = this.getToken();
    if (token && this.isTokenValid(token)) {
      const userInfo = this.extractUserInfoFromToken(token);
      this.setAuthState(true, userInfo);
    } else {
      this.clearAuthState();
    }
  }

  /**
   * Login user with username and password
   */
  login(loginData: LoginRequest, rememberMe: boolean = false): Observable<string> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    return this.http.post(`${this.baseUrl}/authenticate`, loginData, { 
      headers,
      responseType: 'text' 
    }).pipe(
      tap((token: string) => {
        if (token && token.length > 0) {
          this.handleSuccessfulLogin(token, loginData.username, rememberMe);
        }
      }),
      catchError(this.handleLoginError.bind(this))
    );
  }

  /**
   * Handle successful login
   */
  private handleSuccessfulLogin(token: string, username: string, rememberMe: boolean): void {
    // Store authentication data
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USERNAME_KEY, username);
    localStorage.setItem(this.IS_LOGGED_IN_KEY, 'true');
    
    if (rememberMe) {
      localStorage.setItem(this.REMEMBER_ME_KEY, 'true');
    }

    // Extract user info from token
    const userInfo = this.extractUserInfoFromToken(token);
    
    // Store additional user data
    if (userInfo.email) {
      localStorage.setItem(this.USER_EMAIL_KEY, userInfo.email);
    }
    if (userInfo.id) {
      localStorage.setItem(this.USER_ID_KEY, userInfo.id.toString());
    }

    // Update reactive state
    this.setAuthState(true, userInfo);

    // Notify other components
    this.notifyAuthStateChange();

    console.log('Login successful, user info:', userInfo);
  }

  /**
   * Handle login errors
   */
  private handleLoginError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = '';

    switch (error.status) {
      case 401:
        errorMessage = 'Invalid username or password!';
        break;
      case 403:
        errorMessage = 'Access denied. Please check your credentials.';
        break;
      case 500:
        errorMessage = 'Server error. Please try again later.';
        break;
      case 0:
        errorMessage = 'Network error. Please check if the server is running.';
        break;
      default:
        errorMessage = 'Login failed. Please try again.';
    }

    console.error('Login error:', error);
    return throwError(() => ({ ...error, friendlyMessage: errorMessage }));
  }

  /**
   * Logout user and clear all auth data
   */
  logout(): void {
    // Clear all authentication data
    const keysToRemove = [
      this.TOKEN_KEY, this.USERNAME_KEY, this.USER_EMAIL_KEY,
      this.USER_ID_KEY, this.IS_LOGGED_IN_KEY, this.REMEMBER_ME_KEY
    ];
    
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key); // Also clear session storage
    });

    // Update reactive state
    this.clearAuthState();

    // Notify other components
    this.notifyAuthStateChange();

    console.log('User logged out successfully');
  }

  /**
   * Check if user is currently authenticated
   */
  isAuthenticated(): boolean {
    const token = this.getToken();
    return token !== null && this.isTokenValid(token);
  }

  /**
   * Get current JWT token
   */
  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY) || sessionStorage.getItem(this.TOKEN_KEY);
  }

  /**
   * Get current user ID
   */
  getCurrentUserId(): number {
    const token = this.getToken();
    if (!token) return 0;
    
    try {
      const payload = this.decodeToken(token);
      return this.extractUserIdFromPayload(payload);
    } catch (error) {
      console.error('Error getting current user ID:', error);
      return 0;
    }
  }

  /**
   * Get current user info
   */
  getCurrentUser(): UserInfo | null {
    return this.currentUserSubject.value;
  }

  /**
   * Get current username
   */
  getCurrentUsername(): string {
    return localStorage.getItem(this.USERNAME_KEY) || '';
  }

  /**
   * Get current user email
   */
  getCurrentUserEmail(): string {
    return localStorage.getItem(this.USER_EMAIL_KEY) || '';
  }

  /**
   * Check if token is valid (not expired)
   */
  private isTokenValid(token: string): boolean {
    try {
      const payload = this.decodeToken(token);
      const currentTime = Math.floor(Date.now() / 1000);
      return payload.exp ? payload.exp > currentTime : false;
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  }

  /**
   * Decode JWT token
   */
  private decodeToken(token: string): JWTPayload {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }
      
      let payload = parts[1];
      // Add padding if needed
      payload = payload.replace(/-/g, '+').replace(/_/g, '/');
      
      switch (payload.length % 4) {
        case 2: payload += '=='; break;
        case 3: payload += '='; break;
      }
      
      const decoded = JSON.parse(atob(payload));
      console.log('Decoded JWT payload:', decoded);
      return decoded;
    } catch (error) {
      console.error('Error decoding JWT token:', error);
      throw new Error('Failed to decode JWT token');
    }
  }

  /**
   * Extract user ID from JWT payload
   */
  private extractUserIdFromPayload(payload: JWTPayload): number {
    // Try different possible ID field names
    const possibleIds = [
      payload.userid, 
      payload.userId, 
      payload.organizerId
    ];
    
    for (const id of possibleIds) {
      if (id && id > 0) {
        return id;
      }
    }
    
    // Try parsing 'sub' field as ID
    if (payload.sub) {
      const parsedSub = parseInt(payload.sub, 10);
      if (!isNaN(parsedSub) && parsedSub > 0) {
        return parsedSub;
      }
    }
    
    // Fallback to stored user ID
    const storedUserId = localStorage.getItem(this.USER_ID_KEY);
    if (storedUserId) {
      const parsedStoredId = parseInt(storedUserId, 10);
      if (!isNaN(parsedStoredId) && parsedStoredId > 0) {
        return parsedStoredId;
      }
    }
    
    return 0;
  }

  /**
   * Extract user info from JWT token
   */
  private extractUserInfoFromToken(token: string): UserInfo {
    try {
      const payload = this.decodeToken(token);
      const userId = this.extractUserIdFromPayload(payload);
      
      return {
        id: userId,
        username: localStorage.getItem(this.USERNAME_KEY) || payload.sub || '',
        email: payload.email || localStorage.getItem(this.USER_EMAIL_KEY) || '',
        roles: payload.roles || [],
        isLoggedIn: true
      };
    } catch (error) {
      console.error('Error extracting user info from token:', error);
      return {
        id: 0,
        username: '',
        email: '',
        roles: [],
        isLoggedIn: false
      };
    }
  }

  /**
   * Set authentication state
   */
  private setAuthState(isLoggedIn: boolean, userInfo: UserInfo | null): void {
    this.isLoggedInSubject.next(isLoggedIn);
    this.currentUserSubject.next(userInfo);
  }

  /**
   * Clear authentication state
   */
  private clearAuthState(): void {
    this.setAuthState(false, null);
  }

  /**
   * Notify other components of auth state change
   */
  private notifyAuthStateChange(): void {
    window.dispatchEvent(new Event('storage'));
  }

  /**
   * Get HTTP headers with authentication
   */
  getAuthHeaders(): HttpHeaders {
    const token = this.getToken();
    
    if (token) {
      return new HttpHeaders({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      });
    }
    
    return new HttpHeaders({
      'Content-Type': 'application/json'
    });
  }

  /**
   * Check authentication and redirect if needed
   */
  checkAuthenticationWithRedirect(redirectUrl: string = '/login'): boolean {
    if (!this.isAuthenticated()) {
      this.router.navigate([redirectUrl], {
        queryParams: { returnUrl: this.router.url }
      });
      return false;
    }
    return true;
  }

  /**
   * Handle authentication errors (token expired, etc.)
   */
  handleAuthError(error: HttpErrorResponse, action: string = ''): void {
    if (error.status === 401) {
      console.log('Authentication error, logging out user');
      this.logout();
      this.router.navigate(['/login'], {
        queryParams: { 
          returnUrl: this.router.url,
          message: 'Session expired. Please login again.'
        }
      });
    }
  }

  /**
   * Refresh token (if your backend supports it)
   */
  refreshToken(): Observable<string> {
    const token = this.getToken();
    if (!token) {
      return throwError(() => new Error('No token available for refresh'));
    }

    return this.http.post(`${this.baseUrl}/refresh`, {}, {
      headers: this.getAuthHeaders(),
      responseType: 'text'
    }).pipe(
      tap((newToken: string) => {
        if (newToken && newToken.length > 0) {
          localStorage.setItem(this.TOKEN_KEY, newToken);
          console.log('Token refreshed successfully');
        }
      }),
      catchError((error) => {
        console.error('Token refresh failed:', error);
        this.logout();
        return throwError(() => error);
      })
    );
  }
}

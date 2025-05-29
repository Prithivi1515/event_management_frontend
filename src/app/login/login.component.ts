import { Component } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'login',
  standalone: true,
  imports: [FormsModule, RouterLink, HttpClientModule, CommonModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  username: string = '';
  password: string = '';
  rememberMe: boolean = false;
  loginFailed: boolean = false;
  isLoading: boolean = false;
  errorMessage: string = '';

  private apiUrl = 'http://localhost:9090/auth/authenticate';

  constructor(private router: Router, private http: HttpClient) {}

  validate(form: NgForm) {
    if (form.valid) {
      this.isLoading = true;
      this.loginFailed = false;
      this.errorMessage = '';

      const loginData = {
        username: this.username,
        password: this.password
      };

      console.log('Sending login data:', loginData); // Debug log

      // Add responseType: 'text' to handle plain token response
      this.http.post(this.apiUrl, loginData, { responseType: 'text' }).subscribe({
        next: (response: string) => {
          console.log('Login response:', response); // Debug log
          this.isLoading = false;
          
          // Response is the JWT token string directly
          if (response && response.length > 0) {
            // Store JWT token
            localStorage.setItem('jwtToken', response);
            localStorage.setItem('username', this.username);
            localStorage.setItem('isLoggedIn', 'true');
            
            // Optional: Store remember me preference
            if (this.rememberMe) {
              localStorage.setItem('rememberMe', 'true');
            }
            
            // Notify other components of login state change
            window.dispatchEvent(new Event('storage'));
            
            console.log('Login successful, token stored:', response);
            
            // Redirect to landing page
            this.router.navigate(['/']);
          } else {
            this.loginFailed = true;
            this.errorMessage = 'Invalid response from server';
          }
        },
        error: (error) => {
          console.log('Login error:', error); // Debug log
          this.isLoading = false;
          this.loginFailed = true;
          
          if (error.status === 401) {
            this.errorMessage = 'Invalid username or password!';
          } else if (error.status === 403) {
            this.errorMessage = 'Access denied. Please check your credentials.';
          } else if (error.status === 500) {
            this.errorMessage = 'Server error. Please try again later.';
          } else if (error.status === 0) {
            this.errorMessage = 'Network error. Please check if the server is running.';
          } else {
            this.errorMessage = 'Login failed. Please try again.';
          }
          console.error('Login error:', error);
        }
      });
    } else {
      this.loginFailed = true;
      this.errorMessage = 'Please fill in all required fields.';
    }
  }

  // Method to get JWT token (useful for other components)
  getJwtToken(): string | null {
    return localStorage.getItem('jwtToken');
  }

  // Method to check if user is logged in
  isLoggedIn(): boolean {
    const token = this.getJwtToken();
    return !!token; // Returns true if token exists
  }

  // Method to logout (clear tokens)
  logout(): void {
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('username');
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('rememberMe');
    this.router.navigate(['/login']);
  }
}

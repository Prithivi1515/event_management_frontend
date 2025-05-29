import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClient, HttpClientModule } from '@angular/common/http';

@Component({
  selector: 'registration',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, RouterLink, HttpClientModule],
  templateUrl: './registration.component.html',
  styleUrls: ['./registration.component.css']
})
export class RegistrationComponent implements OnInit {
  registrationForm!: FormGroup;
  isLoading = false;
  errorMessage = '';
  successMessage = '';

  private apiUrl = 'http://localhost:9090/auth/new'; // Update with your backend URL

  constructor(
    private fb: FormBuilder, 
    private router: Router,
    private http: HttpClient
  ) { }

  ngOnInit(): void {
    this.registrationForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required],
      phone: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
      roles: ['', Validators.required] // Changed from 'role' to 'roles'
    }, { validator: this.passwordMatchValidator.bind(this) });
  }

  passwordMatchValidator(form: FormGroup) {
    const password = form.get('password')?.value;
    const confirmPassword = form.get('confirmPassword')?.value;
    return password === confirmPassword ? null : { mismatch: true };
  }

  onSubmit(): void {
    if (this.registrationForm.valid) {
      this.isLoading = true;
      this.errorMessage = '';
      this.successMessage = '';

      const formData = {
        name: this.registrationForm.value.name,
        email: this.registrationForm.value.email,
        password: this.registrationForm.value.password,
        phone: this.registrationForm.value.phone,
        roles: this.registrationForm.value.roles
      };

      console.log('Sending data:', formData); // Debug log

      this.http.post(this.apiUrl, formData, { responseType: 'text' }).subscribe({
        next: (response: any) => {
          console.log('Success response:', response); // Debug log
          this.isLoading = false;
          
          // Check if response contains "Registration successful"
          if (response && response.includes('Registration successful')) {
            this.successMessage = 'Registration successful! Redirecting to login...';
          } else {
            this.successMessage = response || 'Registration completed successfully!';
          }
          
          // Store user data locally
          localStorage.setItem('username', formData.name);
          
          // Redirect to login after 2 seconds
          setTimeout(() => {
            this.router.navigate(['/login']);
          }, 2000);
        },
        error: (error) => {
          console.log('Error response:', error); // Debug log
          this.isLoading = false;
          
          if (error.status === 409) {
            this.errorMessage = 'User already exists with this email.';
          } else if (error.status === 400) {
            this.errorMessage = 'Invalid data provided. Please check your inputs.';
          } else if (error.status === 0) {
            this.errorMessage = 'Network error. Please check if the server is running.';
          } else {
            this.errorMessage = `Registration failed. Error: ${error.error || error.message || 'Please try again later.'}`;
          }
          console.error('Registration error:', error);
        }
      });
    } else {
      this.markFormGroupTouched();
    }
  }

  onReset(): void {
    this.registrationForm.reset();
    this.errorMessage = '';
    this.successMessage = '';
  }

  private markFormGroupTouched(): void {
    Object.keys(this.registrationForm.controls).forEach(key => {
      const control = this.registrationForm.get(key);
      control?.markAsTouched();
    });
  }
}

import { Component } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'login',
  imports: [FormsModule,RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  username: string = '';
  password: string = '';
  rememberMe: boolean = false;
  loginFailed: boolean = false; 

  constructor(private router: Router) {}

  validate(form: NgForm) {
    const enteredUsername = form.value.username;
    const enteredPassword = form.value.password;
    const storedUsername = localStorage.getItem('username');
    const storedPassword = localStorage.getItem('password');
    
    if (enteredUsername === storedUsername && enteredPassword === storedPassword) {
      this.loginFailed = false;
      // Optionally, set a flag in localStorage for login state
      localStorage.setItem('isLoggedIn', 'true');
      window.dispatchEvent(new Event('storage')); // Notify other tabs/components
      this.router.navigate(['/']); // Redirect to landing page
    } else {
      this.loginFailed = true;
    }
  }
}

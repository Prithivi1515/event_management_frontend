import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIf } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { UserService } from '../services/user.service';

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [RouterLink, NgIf],
  templateUrl: './landing-page.component.html',
  styleUrl: './landing-page.component.css'
})
export class LandingPageComponent implements OnInit, OnDestroy {
  isLoggedIn = false;
  username = '';
  userRole = '';
  
  private destroy$ = new Subject<void>();

  constructor(private userService: UserService) {}

  ngOnInit(): void {
    this.checkAuthenticationStatus();
    this.setupStorageListener();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkAuthenticationStatus(): void {
    this.isLoggedIn = this.userService.isAuthenticated();
    
    if (this.isLoggedIn) {
      this.username = localStorage.getItem('username') || '';
      this.userRole = this.userService.getCurrentUserRoles();
    } else {
      this.username = '';
      this.userRole = '';
    }

    console.log('Landing page - Auth status:', {
      isLoggedIn: this.isLoggedIn,
      username: this.username,
      userRole: this.userRole
    });
  }

  private setupStorageListener(): void {
    // Listen for storage changes (login/logout from other tabs)
    window.addEventListener('storage', () => {
      this.checkAuthenticationStatus();
    });
  }

  // Get display name for logged in user
  getDisplayName(): string {
    if (this.username) {
      const firstName = this.username.split(' ')[0];
      return firstName.length > 15 ? firstName.substring(0, 15) + '...' : firstName;
    }
    return 'User';
  }

  // Get role display name
  getRoleDisplayName(): string {
    if (this.userService.isOrganizer()) {
      return 'Event Organizer';
    } else if (this.userService.isRegularUser()) {
      return 'Event Attendee';
    }
    return 'User';
  }

  // Check if user is organizer
  isOrganizer(): boolean {
    return this.userService.isOrganizer();
  }

  // Check if user is regular user
  isRegularUser(): boolean {
    return this.userService.isRegularUser();
  }
}

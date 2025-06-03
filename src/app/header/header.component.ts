import { Component, OnInit, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { NgIf, TitleCasePipe } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UserService } from '../services/user.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [NgIf, RouterLink, RouterLinkActive, FormsModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent implements OnInit {
  isLoggedIn = false;
  username = '';
  userEmail = '';
  userRole = '';
  searchTerm = '';
  selectedLocation = '';
  isSearching = false;

  constructor(
    private router: Router,
    private userService: UserService
  ) {}

  ngOnInit() {
    this.checkLogin();
    window.addEventListener('storage', () => this.checkLogin());
  }

  checkLogin() {
    // Use UserService to check authentication
    this.isLoggedIn = this.userService.isAuthenticated();
    
    if (this.isLoggedIn) {
      // Get user data from localStorage and JWT
      this.username = localStorage.getItem('username') || '';
      this.userEmail = localStorage.getItem('userEmail') || '';
      
      // Use UserService to get roles
      this.userRole = this.userService.getCurrentUserRoles();
      
      // Store role in localStorage for consistency
      if (this.userRole) {
        localStorage.setItem('userRole', this.userRole);
      }
    } else {
      // Clear user data if not authenticated
      this.username = '';
      this.userEmail = '';
      this.userRole = '';
    }

    console.log('Header - User role:', this.userRole);
    console.log('Header - isOrganizer():', this.isOrganizer());
    
    // Debug info for troubleshooting
    if (this.isLoggedIn) {
      this.debugUserRole();
    }
  }

  // Check if user is an organizer using UserService
  isOrganizer(): boolean {
    return this.userService.isOrganizer();
  }

  // Check if user is a regular user (not organizer)
  isUser(): boolean {
    return this.isLoggedIn && !this.isOrganizer();
  }

  // Show My Bookings only for regular users (not organizers)
  shouldShowBookings(): boolean {
    return this.isLoggedIn && this.isUser();
  }

  // Show My Events only for organizers
  shouldShowMyEvents(): boolean {
    return this.isLoggedIn && this.isOrganizer();
  }

  // Get role display name
  getRoleDisplayName(): string {
    if (this.isOrganizer()) {
      return 'Event Organizer';
    } else if (this.isUser()) {
      return 'Event Attendee';
    }
    return 'User';
  }

  logout(event: Event) {
    event.preventDefault();
    
    // Clear all authentication data
    localStorage.removeItem('jwtToken');
    sessionStorage.removeItem('jwtToken');
    localStorage.removeItem('username');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userId');
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userRoles'); // Clear roles from UserService
    
    // Update component state
    this.isLoggedIn = false;
    this.username = '';
    this.userEmail = '';
    this.userRole = '';
    
    // Notify other components
    window.dispatchEvent(new Event('storage'));
    
    // Redirect to home with success message
    this.router.navigate(['/'], { 
      queryParams: { message: 'Successfully logged out' } 
    });
  }

  getDisplayName(): string {
    if (this.username) {
      const firstName = this.username.split(' ')[0];
      return firstName.length > 10 ? firstName.substring(0, 10) + '...' : firstName;
    }
    return 'User';
  }

  handleSearch(event: Event): void {
    event.preventDefault();
    
    if (!this.searchTerm.trim()) {
      return;
    }

    this.isSearching = true;
    
    setTimeout(() => {
      this.router.navigate(['/events'], { 
        queryParams: { search: this.searchTerm.trim() } 
      }).finally(() => {
        this.isSearching = false;
      });
    }, 300);
  }

  handleLocationFilter(event: Event): void {
    if (!this.selectedLocation) {
      this.router.navigate(['/events']);
      return;
    }

    this.router.navigate(['/events'], { 
      queryParams: { location: this.selectedLocation } 
    });
  }

  clearLocationFilter(): void {
    this.selectedLocation = '';
    this.router.navigate(['/events']);
  }

  @HostListener('window:scroll', ['$event'])
  onWindowScroll(): void {
    const navbar = document.querySelector('.navbar-enhanced');
    if (window.pageYOffset > 50) {
      navbar?.classList.add('scrolled');
    } else {
      navbar?.classList.remove('scrolled');
    }
  }

  // Navigation helpers
  navigateToProfile(): void {
    this.router.navigate(['/profile']);
  }

  navigateToMyEvents(): void {
    if (this.shouldShowMyEvents()) {
      this.router.navigate(['/my-events']);
    }
  }

  navigateToMyBookings(): void {
    if (this.shouldShowBookings()) {
      this.router.navigate(['/ticket-history']);
    }
  }

  // Debug method for troubleshooting
  debugUserRole(): void {
    console.log('=== USER ROLE DEBUG ===');
    console.log('isLoggedIn:', this.isLoggedIn);
    console.log('userRole (component):', this.userRole);
    console.log('userRole (localStorage):', localStorage.getItem('userRole'));
    console.log('userRoles (UserService):', this.userService.getCurrentUserRoles());
    console.log('isOrganizer (UserService):', this.userService.isOrganizer());
    console.log('isOrganizer (component):', this.isOrganizer());
    console.log('shouldShowBookings():', this.shouldShowBookings());
    console.log('shouldShowMyEvents():', this.shouldShowMyEvents());
    console.log('isUser():', this.isUser());
    
    const token = localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken');
    if (token) {
      try {
        const payload = this.decodeJwtForDebug(token);
        console.log('JWT payload roles-related fields:', {
          role: payload.role,
          roles: payload.roles,
          authorities: payload.authorities,
          scope: payload.scope
        });
      } catch (error) {
        console.error('Error decoding token:', error);
      }
    }
    console.log('=== END DEBUG ===');
  }

  private decodeJwtForDebug(token: string): any {
    const parts = token.split('.');
    let payload = parts[1];
    payload = payload.replace(/-/g, '+').replace(/_/g, '/');
    
    switch (payload.length % 4) {
      case 2: payload += '=='; break;
      case 3: payload += '='; break;
    }
    
    return JSON.parse(atob(payload));
  }
}

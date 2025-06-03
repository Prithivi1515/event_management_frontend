import { Component, OnInit, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { NgIf, TitleCasePipe } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';

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
  userRole = ''; // Added user role property
  searchTerm = '';
  selectedLocation = '';
  isSearching = false;

  constructor(private router: Router) {}

  ngOnInit() {
    this.checkLogin();
    window.addEventListener('storage', () => this.checkLogin());
  }

  checkLogin() {
    const token = localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken');
    const storedUsername = localStorage.getItem('username');
    const storedEmail = localStorage.getItem('userEmail');
    const storedRole = localStorage.getItem('userRole');
    
    this.isLoggedIn = !!token;
    this.username = storedUsername || '';
    this.userEmail = storedEmail || '';
    this.userRole = storedRole || '';

    // If role is not in localStorage, try to decode from JWT token
    if (!this.userRole && token) {
      this.userRole = this.extractRoleFromToken(token);
      // Save extracted role to localStorage for future use
      if (this.userRole) {
        localStorage.setItem('userRole', this.userRole);
      }
    }

    console.log('Header - User role:', this.userRole);
    console.log('Header - isOrganizer():', this.isOrganizer());
    
    // Call debug method (remove after fixing)
    if (this.isLoggedIn) {
      this.debugUserRole();
    }
  }

  // Method to extract role from JWT token
  private extractRoleFromToken(token: string): string {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return '';
      }
      
      let payload = parts[1];
      payload = payload.replace(/-/g, '+').replace(/_/g, '/');
      
      switch (payload.length % 4) {
        case 2: payload += '=='; break;
        case 3: payload += '='; break;
      }
      
      const decoded = JSON.parse(atob(payload));
      console.log('Decoded JWT payload:', decoded);
      
      // Try different possible role fields in order of preference
      const roleFields = ['role', 'userRole', 'authorities', 'scope', 'roles', 'authority'];
      
      for (const field of roleFields) {
        if (decoded[field]) {
          let role = decoded[field];
          console.log(`Found role in field '${field}':`, role);
          
          // Handle array of roles
          if (Array.isArray(role)) {
            role = role[0];
            console.log('Extracted first role from array:', role);
          }
          
          // Handle object with role property
          if (typeof role === 'object' && role.authority) {
            role = role.authority;
          }
          
          // Extract role from authority format (e.g., "ROLE_ORGANIZER" -> "organizer")
          if (typeof role === 'string') {
            if (role.startsWith('ROLE_')) {
              role = role.substring(5).toLowerCase();
            } else {
              role = role.toLowerCase();
            }
            console.log('Final processed role:', role);
            return role;
          }
        }
      }
      
      console.log('No role found in token');
      return '';
    } catch (error) {
      console.error('Error extracting role from token:', error);
      return '';
    }
  }

  // Method to check if user is an organizer
  isOrganizer(): boolean {
    return this.userRole.toLowerCase() === 'organizer';
  }

  // Method to check if user is a regular user
  isUser(): boolean {
    return this.userRole.toLowerCase() === 'user';
  }

  logout(event: Event) {
    event.preventDefault();
    
    // Clear all authentication data
    localStorage.removeItem('jwtToken');
    sessionStorage.removeItem('jwtToken');
    localStorage.removeItem('username');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userRole'); // Clear user role
    localStorage.removeItem('userId');
    localStorage.removeItem('isLoggedIn');
    
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

  // Add this method for debugging (remove after fixing)
  debugUserRole(): void {
    console.log('=== DEBUGGING USER ROLE ===');
    console.log('userRole from component:', this.userRole);
    console.log('userRole from localStorage:', localStorage.getItem('userRole'));
    console.log('isOrganizer():', this.isOrganizer());
    console.log('isUser():', this.isUser());
    
    const token = localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken');
    if (token) {
      console.log('JWT Token exists');
      try {
        const payload = this.decodeJwtForDebug(token);
        console.log('Full JWT payload:', payload);
        console.log('Role extraction result:', this.extractRoleFromToken(token));
      } catch (error) {
        console.error('Error decoding token:', error);
      }
    } else {
      console.log('No JWT token found');
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

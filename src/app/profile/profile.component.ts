import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClientModule } from '@angular/common/http';
import { Subject, takeUntil } from 'rxjs';
import { UserService, User, UserUpdateRequest } from '../services/user.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, HttpClientModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css'
})
export class ProfileComponent implements OnInit, OnDestroy {
  // User data
  user: User = {
    name: '',
    email: '',
    contactNumber: 0,
    roles: 'user'
  };

  // Form data for updates
  userForm: UserUpdateRequest = {
    name: '',
    email: '',
    password: '',
    contactNumber: 0,
    roles: 'user'
  };

  // Component state
  isLoading = false;
  isUpdating = false;
  showPasswordField = false;
  isEditMode = false;
  errorMessage = '';
  successMessage = '';

  // Current user info
  currentUserId = 0;
  isLoggedIn = false;

  // Password validation
  confirmPassword = '';
  showPassword = false;
  showConfirmPassword = false;

  // Role management
  canChangeRole = false;
  originalUserRole = '';
  originalUserData: User = {
    name: '',
    email: '',
    contactNumber: 0,
    roles: 'user'
  };

  // RxJS
  private destroy$ = new Subject<void>();

  constructor(
    private userService: UserService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkAuthentication();
    if (this.isLoggedIn) {
      this.loadUserProfile();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkAuthentication(): void {
    try {
      this.isLoggedIn = this.userService.isAuthenticated();
      
      if (!this.isLoggedIn) {
        console.log('User not authenticated, redirecting to login');
        this.router.navigate(['/login'], {
          queryParams: { returnUrl: '/profile' }
        });
        return;
      }

      this.currentUserId = this.userService.getCurrentUserId();
      if (this.currentUserId === 0) {
        this.showError('Unable to identify user. Please login again.');
        this.router.navigate(['/login']);
        return;
      }

      // Check if user can change roles (only admins can change roles)
      this.canChangeRole = this.userService.isAdmin();
      
      console.log('Authentication check:', {
        userId: this.currentUserId,
        canChangeRole: this.canChangeRole,
        isAuthenticated: this.isLoggedIn
      });
    } catch (error) {
      console.error('Authentication check failed:', error);
      this.showError('Authentication error. Please login again.');
      this.router.navigate(['/login']);
    }
  }

  private loadUserProfile(): void {
    this.isLoading = true;
    this.clearMessages();

    console.log(`Loading profile for user ID: ${this.currentUserId}`);

    this.userService.getUserById(this.currentUserId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (user: User) => {
          console.log('User profile loaded:', user);
          this.user = { ...user };
          this.originalUserData = { ...user }; // Store original data for reset
          this.originalUserRole = user.roles || 'user';
          this.populateForm();
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading user profile:', error);
          this.isLoading = false;
          this.handleLoadError(error);
        }
      });
  }

  private populateForm(): void {
    // Fixed: Ensure all fields are properly populated
    this.userForm = {
      name: this.user.name || '',
      email: this.user.email || '',
      password: '', // Always start with empty password
      contactNumber: this.user.contactNumber || 0,
      roles: (this.user.roles || this.userService.getCurrentUserRoles() || 'user').toLowerCase()
    };

    // Reset password fields
    this.confirmPassword = '';
    this.showPasswordField = false;
    this.showPassword = false;
    this.showConfirmPassword = false;
  }

  private handleLoadError(error: any): void {
    let errorMessage = 'Failed to load user profile';

    // Check error message content for specific errors
    const errorStr = error.message || error.toString();
    
    if (errorStr.includes('401') || errorStr.includes('Unauthorized')) {
      errorMessage = 'Session expired. Please login again.';
      this.router.navigate(['/login']);
      return;
    } else if (errorStr.includes('403') || errorStr.includes('Forbidden')) {
      errorMessage = 'You do not have permission to view this profile.';
    } else if (errorStr.includes('404') || errorStr.includes('Not Found')) {
      errorMessage = 'User profile not found.';
    } else if (errorStr.includes('0') || errorStr.includes('Network')) {
      errorMessage = 'Network error. Please check your connection.';
    } else if (errorStr.includes('500') || errorStr.includes('Internal Server Error')) {
      errorMessage = 'Server error. Please try again later.';
    } else {
      errorMessage = errorStr.includes('Error:') ? errorStr : `Error: ${errorStr}`;
    }

    this.showError(errorMessage);
  }

  // Toggle edit mode
  toggleEditMode(): void {
    if (this.isEditMode) {
      // Cancel editing - reset form to original values
      this.user = { ...this.originalUserData };
      this.populateForm();
    }
    
    this.isEditMode = !this.isEditMode;
    this.clearMessages();
    
    console.log('Edit mode toggled:', this.isEditMode);
  }

  // Toggle password field visibility
  togglePasswordField(): void {
    this.showPasswordField = !this.showPasswordField;
    if (!this.showPasswordField) {
      this.userForm.password = '';
      this.confirmPassword = '';
      this.showPassword = false;
      this.showConfirmPassword = false;
    }
    console.log('Password field visibility:', this.showPasswordField);
  }

  // Toggle password visibility
  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  // Fixed: Enhanced form validation
  isFormValid(): boolean {
    // Basic validation
    if (!this.userForm.name.trim()) {
      return false;
    }
    
    if (!this.userForm.email.trim()) {
      return false;
    }
    
    if (!this.userForm.contactNumber) {
      return false;
    }

    if (!this.userForm.roles.trim()) {
      return false;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.userForm.email.trim())) {
      return false;
    }

    // Fixed: Contact number validation for Indian phone numbers
    const contactStr = this.userForm.contactNumber.toString();
    if (!/^[6-9]\d{9}$/.test(contactStr)) {
      return false;
    }

    // Role validation
    const allowedRoles = ['user', 'organizer', 'admin'];
    if (!allowedRoles.includes(this.userForm.roles.toLowerCase().trim())) {
      return false;
    }

    // Password validation if password field is shown
    if (this.showPasswordField) {
      if (!this.userForm.password || this.userForm.password.length < 6) {
        return false;
      }
      
      if (this.userForm.password !== this.confirmPassword) {
        return false;
      }

      // Additional password strength validation
      if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(this.userForm.password)) {
        return false; // Password must contain at least one letter and one number
      }
    }

    return true;
  }

  // Fixed: Enhanced validation error messages
  getValidationError(): string {
    if (!this.userForm.name.trim()) {
      return 'Name is required and cannot be empty';
    }
    
    if (this.userForm.name.trim().length < 2) {
      return 'Name must be at least 2 characters long';
    }
    
    if (!this.userForm.email.trim()) {
      return 'Email is required';
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.userForm.email.trim())) {
      return 'Please enter a valid email address (e.g., user@example.com)';
    }
    
    if (!this.userForm.contactNumber) {
      return 'Contact number is required';
    }
    
    const contactStr = this.userForm.contactNumber.toString();
    if (!/^[6-9]\d{9}$/.test(contactStr)) {
      return 'Contact number must be a valid 10-digit Indian phone number starting with 6, 7, 8, or 9';
    }

    if (!this.userForm.roles.trim()) {
      return 'User role is required';
    }

    const allowedRoles = ['user', 'organizer', 'admin'];
    if (!allowedRoles.includes(this.userForm.roles.toLowerCase().trim())) {
      return 'Invalid role selected. Must be one of: user, organizer, admin';
    }
    
    if (this.showPasswordField) {
      if (!this.userForm.password) {
        return 'Password is required when updating password';
      }
      
      if (this.userForm.password.length < 6) {
        return 'Password must be at least 6 characters long';
      }

      if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(this.userForm.password)) {
        return 'Password must contain at least one letter and one number';
      }
      
      if (this.userForm.password !== this.confirmPassword) {
        return 'Password and confirm password do not match';
      }
    }
    
    return '';
  }

  // Fixed: Enhanced update profile method
  updateProfile(form: NgForm): void {
    console.log('Update profile called');
    
    if (!this.isFormValid()) {
      const errorMsg = this.getValidationError();
      console.log('Form validation failed:', errorMsg);
      this.showError(errorMsg);
      return;
    }

    if (this.isUpdating) {
      console.log('Already updating, ignoring duplicate request');
      return;
    }

    // If user cannot change role, keep the original role
    let finalRole = this.userForm.roles.toLowerCase().trim();
    if (!this.canChangeRole) {
      finalRole = this.originalUserRole.toLowerCase();
      console.log('User cannot change role, using original:', finalRole);
    }

    this.isUpdating = true;
    this.clearMessages();

    // Fixed: Prepare update data with proper password handling
    const updateData: UserUpdateRequest = {
      name: this.userForm.name.trim(),
      email: this.userForm.email.trim().toLowerCase(),
      password: this.showPasswordField && this.userForm.password ? 
                this.userForm.password : 
                (this.originalUserData.password || 'keep_existing'), // Don't change password if not updating
      contactNumber: this.userForm.contactNumber,
      roles: finalRole
    };

    console.log('Updating user profile:', { 
      ...updateData, 
      password: this.showPasswordField ? '[UPDATED]' : '[UNCHANGED]' 
    });

    this.userService.updateUser(this.currentUserId, updateData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          console.log('Profile updated successfully:', response);
          this.handleUpdateSuccess(response, updateData);
        },
        error: (error) => {
          console.error('Error updating profile:', error);
          this.isUpdating = false;
          this.handleUpdateError(error);
        }
      });
  }

  // Fixed: Complete the handleUpdateSuccess method
  private handleUpdateSuccess(response: any, updateData: UserUpdateRequest): void {
    this.isUpdating = false;
    this.isEditMode = false;
    this.showPasswordField = false;
    this.confirmPassword = '';
    this.showPassword = false;
    this.showConfirmPassword = false;
    
    // Handle different response types
    let successMessage = 'Profile updated successfully!';
    
    try {
      if (typeof response === 'string') {
        // Backend returns a string response
        successMessage = response.includes('successfully') ? response : 'Profile updated successfully!';
      } else if (response && response.message) {
        // Backend returns an object with message property
        successMessage = response.message;
      } else if (response && response.data) {
        // Backend returns an object with data property
        successMessage = 'Profile updated successfully!';
        // Update local user data if response contains updated user info
        if (response.data.name) {
          this.user = { ...this.user, ...response.data };
          this.originalUserData = { ...this.user };
        }
      }
    } catch (error) {
      console.warn('Error parsing success response:', error);
      successMessage = 'Profile updated successfully!';
    }
    
    // Update local user data with the form data
    this.user = {
      ...this.user,
      name: updateData.name,
      email: updateData.email,
      contactNumber: updateData.contactNumber,
      roles: updateData.roles
    };
    this.originalUserData = { ...this.user };
    
    // Update stored user data in localStorage if roles changed
    if (this.canChangeRole && updateData.roles) {
      try {
        localStorage.setItem('userRoles', updateData.roles);
        console.log('Updated stored user roles:', updateData.roles);
      } catch (error) {
        console.warn('Could not update localStorage:', error);
      }
    }

    // Update stored user name and email
    try {
      localStorage.setItem('username', updateData.name);
      localStorage.setItem('userEmail', updateData.email);
      console.log('Updated stored user info');
    } catch (error) {
      console.warn('Could not update user info in localStorage:', error);
    }
    
    this.showSuccess(successMessage);
    
    // Repopulate form with updated data
    this.populateForm();
  }

  private handleUpdateError(error: any): void {
    let errorMessage = 'Failed to update profile. Please try again.';

    try {
      const errorStr = error.message || error.toString();
      
      if (errorStr.includes('updated successfully')) {
        // This is actually a success response that was mishandled
        console.log('Success response detected in error handler:', errorStr);
        this.handleUpdateSuccess(errorStr, this.userForm);
        return;
      }
      
      if (errorStr.includes('401') || errorStr.includes('Unauthorized')) {
        errorMessage = 'Session expired. Please login again.';
        this.router.navigate(['/login']);
        return;
      } else if (errorStr.includes('403') || errorStr.includes('Forbidden')) {
        errorMessage = 'You do not have permission to update this profile.';
      } else if (errorStr.includes('400') || errorStr.includes('Bad Request')) {
        errorMessage = 'Invalid profile data. Please check your inputs and try again.';
      } else if (errorStr.includes('409') || errorStr.includes('Conflict')) {
        errorMessage = 'Email address is already in use. Please choose a different email.';
      } else if (errorStr.includes('422') || errorStr.includes('Unprocessable Entity')) {
        errorMessage = 'Invalid data format. Please check your inputs.';
      } else if (errorStr.includes('0') || errorStr.includes('Network')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (errorStr.includes('500') || errorStr.includes('Internal Server Error')) {
        errorMessage = 'Server error. Please try again later.';
      } else {
        // Extract more specific error message if available
        errorMessage = errorStr.includes('Error:') ? errorStr : `Update failed: ${errorStr}`;
      }
    } catch (parseError) {
      console.error('Error parsing error response:', parseError);
      errorMessage = 'An unexpected error occurred. Please try again.';
    }

    this.showError(errorMessage);
  }

  // Reset form to original values
  resetForm(): void {
    this.user = { ...this.originalUserData };
    this.populateForm();
    this.clearMessages();
    console.log('Form reset to original values');
  }

  // Navigation methods
  goToTicketHistory(): void {
    this.router.navigate(['/ticket-history']);
  }

  goToEvents(): void {
    this.router.navigate(['/events']);
  }

  logout(): void {
    // Clear localStorage
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userRoles');
    
    // Clear sessionStorage
    sessionStorage.removeItem('jwtToken');
    sessionStorage.removeItem('userId');
    
    console.log('User logged out');
    this.router.navigate(['/login']);
  }

  // Utility methods
  formatContactNumber(contactNumber: number): string {
    if (!contactNumber) return '';
    
    const numStr = contactNumber.toString();
    if (numStr.length === 10) {
      return `+91 ${numStr.substring(0, 5)} ${numStr.substring(5)}`;
    }
    return numStr;
  }

  formatRole(role: string): string {
    if (!role) return 'User';
    
    return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
  }

  getAvatarInitials(): string {
    if (this.user.name) {
      const names = this.user.name.trim().split(' ');
      if (names.length >= 2) {
        return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
      } else if (names.length === 1) {
        return names[0].charAt(0).toUpperCase();
      }
    }
    return 'U';
  }

  getRoleColor(role: string): string {
    switch (role.toLowerCase()) {
      case 'admin':
        return 'danger';
      case 'organizer':
        return 'warning';
      case 'user':
      default:
        return 'primary';
    }
  }

  getRoleIcon(role: string): string {
    switch (role.toLowerCase()) {
      case 'admin':
        return 'bi-shield-check';
      case 'organizer':
        return 'bi-person-gear';
      case 'user':
      default:
        return 'bi-person';
    }
  }

  // Message handling methods
  private showSuccess(message: string): void {
    this.successMessage = message;
    this.errorMessage = '';
    console.log('Success:', message);
    
    // Auto-clear success message after 5 seconds
    setTimeout(() => {
      if (this.successMessage === message) {
        this.successMessage = '';
      }
    }, 5000);
  }

  private showError(message: string): void {
    this.errorMessage = message;
    this.successMessage = '';
    console.error('Error:', message);
  }

  private clearMessages(): void {
    this.successMessage = '';
    this.errorMessage = '';
  }

  // Check if form has changes
  hasFormChanges(): boolean {
    if (!this.originalUserData) return false;
    
    return (
      this.userForm.name.trim() !== (this.originalUserData.name || '').trim() ||
      this.userForm.email.trim().toLowerCase() !== (this.originalUserData.email || '').toLowerCase() ||
      this.userForm.contactNumber !== (this.originalUserData.contactNumber || 0) ||
      (this.canChangeRole && this.userForm.roles.toLowerCase() !== (this.originalUserData.roles || 'user').toLowerCase()) ||
      (this.showPasswordField && this.userForm.password.trim() !== '')
    );
  }

  // Get change summary for confirmation
  getChangeSummary(): string[] {
    const changes: string[] = [];
    
    if (!this.originalUserData) return changes;
    
    if (this.userForm.name.trim() !== (this.originalUserData.name || '').trim()) {
      changes.push(`Name: "${this.originalUserData.name}" → "${this.userForm.name.trim()}"`);
    }
    
    if (this.userForm.email.trim().toLowerCase() !== (this.originalUserData.email || '').toLowerCase()) {
      changes.push(`Email: "${this.originalUserData.email}" → "${this.userForm.email.trim().toLowerCase()}"`);
    }
    
    if (this.userForm.contactNumber !== (this.originalUserData.contactNumber || 0)) {
      changes.push(`Contact: "${this.originalUserData.contactNumber}" → "${this.userForm.contactNumber}"`);
    }
    
    if (this.canChangeRole && this.userForm.roles.toLowerCase() !== (this.originalUserData.roles || 'user').toLowerCase()) {
      changes.push(`Role: "${this.formatRole(this.originalUserData.roles || 'user')}" → "${this.formatRole(this.userForm.roles)}"`);
    }
    
    if (this.showPasswordField && this.userForm.password.trim() !== '') {
      changes.push('Password: [Updated]');
    }
    
    return changes;
  }
}

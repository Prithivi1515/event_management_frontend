import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { RouterModule, Router } from '@angular/router';
import { Subscription } from 'rxjs';

interface Event {
  id?: number;           
  eventId?: number;      
  event_id?: number;     
  event_Id?: number;     
  Event_Id?: number;     
  name: string;
  category: string;
  location: string;
  date: string;
  organizerId: number;
  ticketCount: number;
  ticketPrice: number;   
  createdAt?: string;
  updatedAt?: string;
}

interface BackendEventResponse {
  eventId?: number;
  event_Id?: number;
  event_id?: number;
  name: string;
  category: string;
  location: string;
  date: string;
  organizerId: number;
  ticketCount: number;
  ticketPrice: number;   
  createdAt?: string;
  updatedAt?: string;
}

interface JWTPayload {
  authorities: any;
  sub: string;
  userId?: number;
  organizerId?: number;
  email?: string;
  name?: string;
  userid?: number;
  roles?: string;
  userRoles?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

@Component({
  selector: 'app-manage-events',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
  templateUrl: './manage-events.component.html',
  styleUrl: './manage-events.component.css'
})
export class ManageEventsComponent implements OnInit, OnDestroy {
  events: Event[] = [];
  eventForm!: FormGroup;
  isEditing = false;
  editingEventId: number | null = null;
  showForm = false;
  loading = false;
  searchTerm = '';
  selectedCategory = '';
  selectedLocation = '';
  currentUserId: number = 0;
  userEmail: string = '';
  userName: string = '';
  
  isOrganizer = false;
  userRoles: string = '';
  isAdmin = false;

  private baseUrl = 'http://localhost:9090/event';
  private subscriptions: Subscription[] = [];

  categories = [
    'entertainment',
    'sports',
    'business',
    'education',
    'technology',
    'arts',
    'food',
    'health'
  ];

  locations = [
    'Chennai',
    'Mumbai',
    'Bangalore',
    'Hyderabad',
    'Delhi',
    'Pune',
    'Kolkata',
    'Ahmedabad'
  ];

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private router: Router
  ) {
    this.initializeForm();
  }

  ngOnInit() {
    if (this.checkAuthentication()) {
      this.extractUserFromJWT();
      this.checkOrganizerStatus();
      this.loadEvents();
    }
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => {
      if (sub && !sub.closed) {
        sub.unsubscribe();
      }
    });
    this.subscriptions = [];
  }

  private initializeForm() {
    this.eventForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
      category: ['', Validators.required],
      location: ['', Validators.required],
      date: ['', [Validators.required, this.futureDateValidator.bind(this)]],
      ticketCount: [1, [Validators.required, Validators.min(1), Validators.max(10000)]],
      ticketPrice: [1, [Validators.required, Validators.min(1), Validators.max(999999)]]
    });
  }

  private futureDateValidator(control: AbstractControl): ValidationErrors | null {
    if (!control.value) return null;

    try {
      const selectedDate = new Date(control.value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      selectedDate.setHours(0, 0, 0, 0);

      if (isNaN(selectedDate.getTime())) {
        return { invalidDate: true };
      }

      return selectedDate >= today ? null : { pastDate: true };
    } catch (error) {
      console.error('Date validation error:', error);
      return { invalidDate: true };
    }
  }

  private extractUserFromJWT(): void {
    const token = localStorage.getItem('jwtToken');
    if (!token) {
      console.error('No JWT token found');
      this.handleAuthenticationError('No authentication token found. Please login again.');
      return;
    }

    try {
      const payload = this.decodeJWT(token);
      console.log('JWT Payload:', payload);

      this.currentUserId = this.extractUserIdFromPayload(payload);
      this.userEmail = payload.email || payload.sub || '';
      this.userName = payload.name || payload.sub || '';
      
      this.userRoles = this.extractRolesFromPayload(payload);
      
      console.log('Extracted User Info:', {
        userId: this.currentUserId,
        email: this.userEmail,
        name: this.userName,
        roles: this.userRoles
      });

      if (this.currentUserId === 0) {
        this.handleAuthenticationError('Unable to identify user. Please login again.');
      }
    } catch (error) {
      console.error('Error decoding JWT token:', error);
      this.handleAuthenticationError('Invalid session. Please login again.');
    }
  }

  private extractRolesFromPayload(payload: JWTPayload): string {
    const possibleRoleFields = [
      payload.roles,
      payload.userRoles,
      payload.role,
      payload.authorities,
      (payload as any).authorities,
      (payload as any).scope
    ];

    for (const roleField of possibleRoleFields) {
      if (roleField) {
        if (typeof roleField === 'string') {
          return roleField.toLowerCase();
        } else if (Array.isArray(roleField)) {
          return roleField.join(',').toLowerCase();
        }
      }
    }

    const storedRoles = localStorage.getItem('userRoles') || localStorage.getItem('roles');
    if (storedRoles) {
      return storedRoles.toLowerCase();
    }

    return 'user';
  }

  private checkOrganizerStatus(): void {
    try {
      const roles = this.userRoles.toLowerCase();
      this.isOrganizer = roles.includes('organizer') || roles.includes('admin');
      this.isAdmin = roles.includes('admin');

      console.log('Organizer Status Check:', {
        userRoles: this.userRoles,
        isOrganizer: this.isOrganizer,
        isAdmin: this.isAdmin
      });

      if (!this.isOrganizer) {
        const storedRoles = localStorage.getItem('userRoles') || '';
        const storedIsOrganizer = localStorage.getItem('isOrganizer');
        
        if (storedRoles.toLowerCase().includes('organizer') || 
            storedRoles.toLowerCase().includes('admin') ||
            storedIsOrganizer === 'true') {
          this.isOrganizer = true;
          console.log('Organizer status determined from localStorage');
        }
      }

      if (!this.isOrganizer) {
        console.warn('User accessing manage-events without organizer role - granting temporary access');
        this.isOrganizer = true;
      }

    } catch (error) {
      console.error('Error checking organizer status:', error);
      this.isOrganizer = false;
      this.isAdmin = false;
    }
  }

  private extractUserIdFromPayload(payload: JWTPayload): number {
    let userId = 0;

    if (payload.userid && payload.userid > 0) {
      userId = payload.userid;
    } else if (payload.userId && payload.userId > 0) {
      userId = payload.userId;
    } else if (payload.organizerId && payload.organizerId > 0) {
      userId = payload.organizerId;
    }

    if (userId === 0 && payload.sub) {
      const parsedSub = parseInt(payload.sub, 10);
      if (!isNaN(parsedSub) && parsedSub > 0) {
        userId = parsedSub;
      }
    }

    if (userId === 0) {
      const storedUserId = localStorage.getItem('userId');
      if (storedUserId) {
        const parsedStoredId = parseInt(storedUserId, 10);
        if (!isNaN(parsedStoredId) && parsedStoredId > 0) {
          userId = parsedStoredId;
          console.log('Using stored user ID as fallback:', userId);
        }
      }
    }

    return userId;
  }

  private handleAuthenticationError(message: string): void {
    this.showErrorMessage(message);
    this.logout();
    this.router.navigate(['/login'], {
      queryParams: { returnUrl: '/my-events', message }
    });
  }

  private decodeJWT(token: string): JWTPayload {
    try {
      if (!token || typeof token !== 'string') {
        throw new Error('Invalid token provided');
      }

      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT token format');
      }

      let payload = parts[1];

      switch (payload.length % 4) {
        case 0:
          break;
        case 2:
          payload += '==';
          break;
        case 3:
          payload += '=';
          break;
        default:
          throw new Error('Invalid base64 string');
      }

      payload = payload.replace(/-/g, '+').replace(/_/g, '/');

      const decoded = atob(payload);
      const parsed = JSON.parse(decoded);

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid JWT payload structure');
      }

      return parsed;
    } catch (error) {
      console.error('Error decoding JWT:', error);
      throw new Error(`Failed to decode JWT token: ${error}`);
    }
  }

  private checkAuthentication(): boolean {
    const token = localStorage.getItem('jwtToken');
    if (!token) {
      console.log('No authentication token found, redirecting to login');
      this.router.navigate(['/login'], {
        queryParams: { returnUrl: '/my-events' }
      });
      return false;
    }

    try {
      const payload = this.decodeJWT(token);
      const currentTime = Math.floor(Date.now() / 1000);

      if (payload.exp && payload.exp < currentTime) {
        console.log('JWT token has expired, redirecting to login');
        this.logout();
        this.router.navigate(['/login'], {
          queryParams: { returnUrl: '/my-events', message: 'Session expired. Please login again.' }
        });
        return false;
      }
    } catch (error) {
      console.error('Invalid JWT token, redirecting to login');
      this.logout();
      this.router.navigate(['/login'], {
        queryParams: { returnUrl: '/my-events' }
      });
      return false;
    }

    console.log('User authenticated, proceeding with component initialization');
    return true;
  }

  loadEvents() {
    if (this.currentUserId === 0) {
      console.error('Cannot load events: user ID is 0');
      this.showErrorMessage('User ID not found. Please login again.');
      return;
    }

    this.loading = true;

    const headers = this.getAuthHeaders();
    console.log(`Loading events for organizer ${this.currentUserId}`);

    const subscription = this.http.get<any[]>(`${this.baseUrl}/organizer/${this.currentUserId}`, { headers }).subscribe({
      next: (response: any[]) => {
        console.log('Events loaded successfully, raw response:', response);
        
        if (Array.isArray(response) && response.length > 0) {
          console.log('First event structure:', response[0]);
          console.log('All properties of first event:', Object.keys(response[0]));
          
          const firstEvent = response[0];
          console.log('ID fields check:', {
            id: firstEvent.id,
            eventId: firstEvent.eventId,
            event_id: firstEvent.event_id,
            event_Id: firstEvent.event_Id,
            Event_Id: firstEvent.Event_Id
          });
        }
        
        this.events = Array.isArray(response) ? response.map(event => {
          const eventId = this.extractEventId(event);
          
          console.log(`Mapping event "${event.name}" - Original ID fields:`, {
            id: event.id,
            eventId: event.eventId,
            event_id: event.event_id,
            event_Id: event.event_Id,
            Event_Id: event.Event_Id,
            'Mapped to': eventId
          });
          
          return {
            id: eventId,
            name: event.name,
            category: event.category,
            location: event.location,
            date: event.date,
            organizerId: event.organizerId,
            ticketCount: event.ticketCount,
            ticketPrice: event.ticketPrice || event.price || 1,
            createdAt: event.createdAt,
            updatedAt: event.updatedAt
          } as Event;
        }) : [];
        
        this.loading = false;
        
        console.log('Mapped events with IDs and ticket prices:', this.events.map(e => ({ 
          name: e.name, 
          id: e.id, 
          ticketPrice: e.ticketPrice 
        })));

        if (this.events.length === 0) {
          console.log('No events found for this organizer');
        }
      },
      error: (error: HttpErrorResponse) => {
        console.error('Error loading events:', error);
        this.loading = false;
        this.handleHttpError(error, 'load events');

        if (error.status === 0 || error.status >= 500) {
          console.log('Using mock data as fallback due to server issues');
          this.events = this.getMockEvents();
        } else if (error.status === 404) {
          this.events = [];
        }
      }
    });

    this.subscriptions.push(subscription);
  }

  private getAuthHeaders(): HttpHeaders {
    try {
      const token = localStorage.getItem('jwtToken');
      if (!token) {
        throw new Error('No authentication token available');
      }
      
      return new HttpHeaders({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      });
    } catch (error) {
      console.error('Error getting auth headers:', error);
      return new HttpHeaders({
        'Content-Type': 'application/json'
      });
    }
  }

  private handleHttpError(error: HttpErrorResponse, action: string) {
    console.log('HTTP Error Details:', {
      status: error.status,
      statusText: error.statusText,
      url: error.url,
      error: error.error,
      message: error.message
    });

    let errorMessage = '';

    switch (error.status) {
      case 401:
        errorMessage = 'Session expired. Please login again.';
        this.logout();
        this.router.navigate(['/login'], {
          queryParams: { returnUrl: '/my-events', message: errorMessage }
        });
        break;
      case 403:
        errorMessage = `You do not have permission to ${action}.`;
        break;
      case 404:
        if (action.includes('load')) {
          console.log('No events found - this is normal for new organizers');
          this.events = [];
          return;
        } else {
          errorMessage = 'The requested resource was not found.';
        }
        break;
      case 400:
        const badRequestMsg = error.error?.message || error.error?.error || 'Invalid data provided';
        errorMessage = `Bad request: ${badRequestMsg}`;
        break;
      case 0:
        errorMessage = 'Network error. Please check if the server is running on http://localhost:9090';
        break;
      case 500:
      case 502:
      case 503:
      case 504:
        errorMessage = 'Server error. Please try again later.';
        break;
      default:
        const defaultMsg = error.error?.message || error.message || 'Unknown error occurred';
        errorMessage = `Failed to ${action}: ${defaultMsg}`;
    }

    if (errorMessage) {
      this.showErrorMessage(errorMessage);
    }
  }

  getMockEvents(): Event[] {
    return [
      {
        id: 1,
        name: 'Tech Conference 2024',
        category: 'technology',
        location: 'Bangalore',
        date: '2024-06-15T10:00:00',
        organizerId: this.currentUserId,
        ticketCount: 500,
        ticketPrice: 1500,
        createdAt: '2024-01-15'
      },
      {
        id: 2,
        name: 'Music Festival',
        category: 'entertainment',
        location: 'Mumbai',
        date: '2024-07-20T18:00:00',
        organizerId: this.currentUserId,
        ticketCount: 1000,
        ticketPrice: 2500,
        createdAt: '2024-02-01'
      },
      {
        id: 3,
        name: 'Business Summit',
        category: 'business',
        location: 'Delhi',
        date: '2024-08-10T09:00:00',
        organizerId: this.currentUserId,
        ticketCount: 300,
        ticketPrice: 100,
        createdAt: '2024-03-01'
      }
    ];
  }

  showCreateForm() {
    if (this.currentUserId === 0) {
      this.showErrorMessage('Unable to create event. Please login again.');
      return;
    }

    console.log('Showing create form');
    this.showForm = true;
    this.isEditing = false;
    this.editingEventId = null;
    this.loading = false;

    this.eventForm.reset({
      name: '',
      category: '',
      location: '',
      date: '',
      ticketCount: 1,
      ticketPrice: 1
    });

    this.eventForm.markAsUntouched();
    this.eventForm.markAsPristine();
    Object.keys(this.eventForm.controls).forEach(key => {
      this.eventForm.get(key)?.setErrors(null);
    });
  }

  editEvent(event: Event) {
    console.log('Editing event:', event);
    
    const eventId = this.extractEventId(event);
    
    if (!eventId || eventId === 0) {
      console.error('Event ID is missing or invalid:', {
        event: event,
        extractedId: eventId,
        allIdFields: {
          id: event.id,
          eventId: event.eventId,
          event_id: event.event_id,
          event_Id: event.event_Id
        }
      });
      this.showErrorMessage('Event ID is missing. Cannot edit this event.');
      return;
    }

    this.showForm = true;
    this.isEditing = true;
    this.editingEventId = eventId;

    const formattedDate = this.formatDateForInput(new Date(event.date));

    if (!formattedDate) {
      this.showErrorMessage('Invalid event date. Cannot edit this event.');
      return;
    }

    this.eventForm.patchValue({
      name: event.name,
      category: event.category,
      location: event.location,
      date: formattedDate,
      ticketCount: event.ticketCount,
      ticketPrice: event.ticketPrice || 1
    });

    this.eventForm.markAsPristine();
    console.log('Form value after patch:', this.eventForm.value);
    console.log('Editing event with ID:', this.editingEventId);
  }

  private formatDateForInput(date: Date): string {
    try {
      if (!date) {
        console.error('No date provided');
        return '';
      }

      const dateObj = date instanceof Date ? date : new Date(date);

      if (isNaN(dateObj.getTime())) {
        console.error('Invalid date provided:', date);
        return '';
      }

      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      const hours = String(dateObj.getHours()).padStart(2, '0');
      const minutes = String(dateObj.getMinutes()).padStart(2, '0');

      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  }

  cancelEdit() {
    console.log('Cancelling edit/create form');
    this.showForm = false;
    this.isEditing = false;
    this.editingEventId = null;
    this.loading = false;

    this.eventForm.reset({
      name: '',
      category: '',
      location: '',
      date: '',
      ticketCount: 1,
      ticketPrice: 1
    });

    this.eventForm.markAsUntouched();
    this.eventForm.markAsPristine();

    Object.keys(this.eventForm.controls).forEach(key => {
      this.eventForm.get(key)?.setErrors(null);
    });
  }

  saveEvent() {    
    console.log('saveEvent called - checking if already processing...');
    
    if (this.loading) {
      console.log('Already processing, ignoring duplicate call');
      return;
    }

    console.log('Form valid:', this.eventForm.valid);
    console.log('Form value:', this.eventForm.value);
    console.log('Form errors:', this.getFormErrors());

    if (!this.eventForm.valid) {
      this.markFormGroupTouched(this.eventForm);
      const errors = this.getFormErrors();
      const errorFields = Object.keys(errors);
      this.showErrorMessage(`Please fix the following fields: ${errorFields.join(', ')}`);
      return;
    }

    if (this.currentUserId === 0) {
      this.showErrorMessage('Unable to save event. Please login again.');
      return;
    }

    this.loading = true;
    console.log('Setting loading to true, processing event...');

    try {
      const formData = this.eventForm.value;

      const eventData = {
        name: (formData.name || '').trim(),
        category: formData.category || '',
        location: formData.location || '',
        date: this.formatDateForAPI(formData.date),
        organizerId: this.currentUserId,
        ticketCount: parseInt(formData.ticketCount, 10) || 1,
        ticketPrice: parseFloat(formData.ticketPrice) || 1
      };

      if (!eventData.name || !eventData.category || !eventData.location || !eventData.date) {
        this.loading = false;
        this.showErrorMessage('All fields are required. Please check your inputs.');
        return;
      }

      console.log('Saving event with data:', eventData);

      if (this.isEditing && this.editingEventId) {
        console.log('Updating event ID:', this.editingEventId);
        this.updateEvent(this.editingEventId, eventData);
      } else {
        console.log('Creating new event');
        this.createEvent(eventData);
      }
    } catch (error) {
      console.error('Error preparing event data:', error);
      this.loading = false;
      this.showErrorMessage('Error preparing event data. Please check your inputs.');
    }
  }

  private formatDateForAPI(dateString: string): string {
    if (!dateString) {
      throw new Error('No date provided');
    }

    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date');
    }

    return date.toISOString();
  }

  private getFormErrors(): any {
    const formErrors: any = {};
    Object.keys(this.eventForm.controls).forEach(key => {
      const control = this.eventForm.get(key);
      if (control && !control.valid && (control.dirty || control.touched)) {
        formErrors[key] = control.errors;
      }
    });
    return formErrors;
  }

  createEvent(eventData: any) {
    try {
      const headers = this.getAuthHeaders();
      console.log('Creating event with headers:', headers);
      console.log('Event data:', eventData);

      const subscription = this.http.post(`${this.baseUrl}/create`, eventData, { 
        headers,
        responseType: 'text'
      }).subscribe({
        next: (response: string) => {
          console.log('Event created successfully, backend response:', response);
          this.loading = false;
          this.cancelEdit();
          this.showSuccessMessage('Event created successfully!');
          
          setTimeout(() => {
            this.loadEvents();
          }, 500);
        },
        error: (error: HttpErrorResponse) => {
          console.error('Error creating event:', error);
          this.loading = false;
          
          if (error.status === 200 || error.status === 201) {
            console.log('Create successful despite parsing error');
            this.showSuccessMessage('Event created successfully!');
            this.cancelEdit();
            setTimeout(() => {
              this.loadEvents();
            }, 500);
          } else if (error.message && error.message.includes('Http failure during parsing')) {
            console.log('Parsing error detected during create, reloading events...');
            this.showSuccessMessage('Event created successfully!');
            this.cancelEdit();
            setTimeout(() => {
              this.loadEvents();
            }, 500);
          } else {
            this.handleHttpError(error, 'create event');
          }
        }
      });

      this.subscriptions.push(subscription);
    } catch (error) {
      console.error('Error preparing create request:', error);
      this.loading = false;
      this.showErrorMessage('Failed to create event. Please try logging in again.');
    }
  }

  updateEvent(eventId: number, eventData: any) {
    try {
      const headers = this.getAuthHeaders();
      console.log(`Updating event: ${this.baseUrl}/update/${eventId}`);
      console.log('Update data:', eventData);

      const subscription = this.http.put(`${this.baseUrl}/update/${eventId}`, eventData, { 
        headers,
        responseType: 'text'
      }).subscribe({
        next: (response: string) => {
          console.log('Event updated successfully, backend response:', response);
          this.loading = false;
          this.cancelEdit();
          this.showSuccessMessage('Event updated successfully!');
          
          setTimeout(() => {
            this.loadEvents();
          }, 500);
        },
        error: (error: HttpErrorResponse) => {
          console.error('Error updating event:', error);
          this.loading = false;
          
          if (error.status === 200 || error.status === 204) {
            console.log('Update successful despite parsing error');
            this.showSuccessMessage('Event updated successfully!');
            this.cancelEdit();
            setTimeout(() => {
              this.loadEvents();
            }, 500);
          } else if (error.message && error.message.includes('Http failure during parsing')) {
            console.log('Parsing error detected during update, reloading events...');
            this.showSuccessMessage('Event updated successfully!');
            this.cancelEdit();
            setTimeout(() => {
              this.loadEvents();
            }, 500);
          } else {
            this.handleHttpError(error, 'update event');
          }
        }
      });

      this.subscriptions.push(subscription);
    } catch (error) {
      console.error('Error preparing update request:', error);
      this.loading = false;
      this.showErrorMessage('Failed to update event. Please try logging in again.');
    }
  }

  deleteEvent(eventId: number) {
    console.log('deleteEvent called with ID:', eventId);
    
    if (!eventId || eventId === 0) {
      console.error('Invalid event ID provided:', eventId);
      this.showErrorMessage('Invalid event ID. Cannot delete this event.');
      return;
    }

    if (this.loading) {
      console.log('Already processing, ignoring delete call');
      return;
    }

    const eventToDelete = this.events.find(e => e.id === eventId);
    console.log('Event to delete:', eventToDelete);

    const confirmDelete = confirm('Are you sure you want to delete this event? This action cannot be undone.');
    if (!confirmDelete) {
      console.log('Delete cancelled by user');
      return;
    }

    this.loading = true;
    console.log('Starting delete process for event:', eventId);

    try {
      const headers = this.getAuthHeaders();
      
      console.log(`Deleting event: ${this.baseUrl}/deleteEventById/${eventId}`);

      const subscription = this.http.delete(`${this.baseUrl}/deleteEventById/${eventId}`, { 
        headers,
        responseType: 'text'
      }).subscribe({
        next: (response: string) => {
          console.log('Event deleted successfully, backend response:', response);
          this.loading = false;
          this.showSuccessMessage('Event deleted successfully!');

          this.events = this.events.filter(e => e.id !== eventId);
          console.log('Updated events array:', this.events);
        },
        error: (error: HttpErrorResponse) => {
          console.error('Error deleting event:', error);
          this.loading = false;
          
          if (error.status === 200 || error.status === 204) {
            console.log('Delete successful despite error - treating as success');
            this.showSuccessMessage('Event deleted successfully!');
            this.events = this.events.filter(e => e.id !== eventId);
          } else if (error.status === 404) {
            this.showSuccessMessage('Event was already deleted.');
            this.events = this.events.filter(e => e.id !== eventId);
          } else {
            this.handleHttpError(error, 'delete event');
          }
        }
      });

      this.subscriptions.push(subscription);
    } catch (error) {
      console.error('Error preparing delete request:', error);
      this.loading = false;
      this.showErrorMessage('Failed to delete event. Please try logging in again.');
    }
  }

  getFilteredEvents(): Event[] {
    if (!Array.isArray(this.events)) {
      return [];
    }

    return this.events.filter(event => {
      const matchesSearch = !this.searchTerm ||
        event.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        event.location.toLowerCase().includes(this.searchTerm.toLowerCase());
      const matchesCategory = !this.selectedCategory || event.category === this.selectedCategory;
      const matchesLocation = !this.selectedLocation || event.location === this.selectedLocation;

      return matchesSearch && matchesCategory && matchesLocation;
    });
  }

  clearFilters() {
    this.searchTerm = '';
    this.selectedCategory = '';
    this.selectedLocation = '';
  }

  getCategoryIcon(category: string): string {
    const icons: { [key: string]: string } = {
      'entertainment': 'bi-music-note-beamed',
      'sports': 'bi-trophy',
      'business': 'bi-briefcase',
      'education': 'bi-mortarboard',
      'technology': 'bi-laptop',
      'arts': 'bi-palette',
      'food': 'bi-cup-straw',
      'health': 'bi-heart-pulse'
    };
    return icons[category] || 'bi-calendar-event';
  }

  formatDate(dateString: string): string {
    try {
      if (!dateString) {
        return 'No date provided';
      }

      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Invalid Date';
      }

      return date.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid Date';
    }
  }

  formatPrice(ticketPrice: number): string {
    if (!ticketPrice || ticketPrice <= 0) {
      return '₹1.00';
    }
    return `₹${ticketPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  trackByEventId(index: number, event: Event): number {
    return event.id || index;
  }

  private showSuccessMessage(message: string) {
    console.log('Success:', message);
  }

  private showErrorMessage(message: string) {
    console.error('Error:', message);
  }

  private logout() {
    const keysToRemove = [
      'jwtToken',
      'userId',
      'username',
      'userEmail',
      'userRoles',
      'isLoggedIn',
      'isOrganizer',
      'rememberMe',
      'savedEmail'
    ];

    keysToRemove.forEach(key => localStorage.removeItem(key));
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.eventForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  getFieldError(fieldName: string): string {
    const field = this.eventForm.get(fieldName);
    if (field?.errors) {
      if (field.errors['required']) return `${this.getFieldDisplayName(fieldName)} is required`;
      if (field.errors['minlength']) return `${this.getFieldDisplayName(fieldName)} must be at least 3 characters`;
      if (field.errors['maxlength']) return `${this.getFieldDisplayName(fieldName)} cannot exceed 100 characters`;
      if (field.errors['min']) return `${this.getFieldDisplayName(fieldName)} must be greater than or equal to 0`;
      if (field.errors['max']) return `${this.getFieldDisplayName(fieldName)} cannot exceed ${fieldName === 'ticketPrice' ? '999999' : '10000'}`;
      if (field.errors['pastDate']) return 'Event date must be today or in the future';
      if (field.errors['invalidDate']) return 'Please enter a valid date and time';
      if (field.errors['invalidPrice']) return 'Please enter a valid price';
      if (field.errors['negativePrice']) return 'Price cannot be negative';
      if (field.errors['maxPrice']) return 'Price cannot exceed ₹999,999';
    }
    return '';
  }

  private getFieldDisplayName(fieldName: string): string {
    const displayNames: { [key: string]: string } = {
      'name': 'Event name',
      'category': 'Category',
      'location': 'Location',
      'date': 'Date and time',
      'ticketCount': 'Ticket count',
      'ticketPrice': 'Ticket price'
    };
    return displayNames[fieldName] || fieldName;
  }

  private markFormGroupTouched(formGroup: FormGroup) {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  debugJWT() {
    const token = localStorage.getItem('jwtToken');
    if (token) {
      try {
        const payload = this.decodeJWT(token);
        console.log('Current JWT Payload:', payload);
        console.log('Current User ID:', this.currentUserId);
        console.log('Current User Roles:', this.userRoles);
        console.log('Is Organizer:', this.isOrganizer);
        console.log('Is Admin:', this.isAdmin);
        console.log('Token expiry:', new Date((payload.exp || 0) * 1000));
        console.log('Token valid:', payload.exp ? payload.exp > Math.floor(Date.now() / 1000) : 'Unknown');
      } catch (error) {
        console.error('Error debugging JWT:', error);
      }
    } else {
      console.log('No JWT token found');
    }
  }

  private extractEventId(event: any): number {
    const possibleIds = [
      event.id,
      event.eventId, 
      event.event_id,
      event.event_Id,
      event.Event_Id
    ];
    
    for (const id of possibleIds) {
      if (id !== undefined && id !== null && id > 0) {
        return Number(id);
      }
    }
    
    return 0;
  }

  navigateToFeedbacks(event: Event): void {
    const eventId = this.extractEventId(event);
    
    if (!eventId || eventId === 0) {
      console.error('Event ID is missing');
      this.showErrorMessage('Cannot view feedbacks: Event ID is missing.');
      return;
    }

    if (!this.isOrganizer) {
      this.showErrorMessage('Only organizers can view event feedbacks.');
      return;
    }
    
    console.log(`Navigating to feedbacks for event ${eventId}: ${event.name}`);
    
    this.router.navigate(['/feedback-list/event', eventId], {
      queryParams: { 
        eventName: event.name,
        organizerId: this.currentUserId,
        viewMode: 'event'
      }
    });
  }

  viewAllEventFeedbacks(): void {
    if (!this.isOrganizer && !this.isAdmin) {
      console.warn('User not recognized as organizer:', {
        isOrganizer: this.isOrganizer,
        isAdmin: this.isAdmin,
        userRoles: this.userRoles,
        currentUserId: this.currentUserId
      });
      
      if (this.events.length > 0) {
        console.log('User has events, assuming organizer privileges');
        this.isOrganizer = true;
      } else {
        this.showErrorMessage('Only organizers can view event feedbacks. Please ensure you have the correct permissions.');
        return;
      }
    }
    
    console.log('Navigating to all event feedbacks for organizer:', this.currentUserId);
    
    this.router.navigate(['/feedback-list/organizer', this.currentUserId], {
      queryParams: { 
        viewMode: 'organizer',
        showAllEvents: true
      }
    });
  }

  canViewEventFeedbacks(event: Event): boolean {
    return this.isOrganizer || 
           this.isAdmin || 
           event.organizerId === this.currentUserId ||
           this.userRoles.includes('organizer') ||
           this.userRoles.includes('admin');
  }

  getFeedbackCount(eventId: number): string {
    return 'View Feedbacks';
  }

  hasEventEnded(event: Event): boolean {
    try {
      const eventDate = new Date(event.date);
      const now = new Date();
      return eventDate < now;
    } catch (error) {
      console.error('Error checking event date:', error);
      return false;
    }
  }
}

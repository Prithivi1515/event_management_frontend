import { Routes } from '@angular/router';
import { LandingPageComponent } from './landing-page/landing-page.component';
import { LoginComponent } from './login/login.component';
import { RegistrationComponent } from './registration/registration.component';
import { EventListComponent } from './event/event-list/event-list.component';
import { ManageEventsComponent } from './event/manage-events/manage-events.component';
import { TicketBookingComponent } from './ticket-booking/ticket-booking.component';
import { TicketHistoryComponent } from './ticket-history/ticket-history.component';
import { FeedbackComponent } from './feedback/feedback.component';
import { ProfileComponent } from './profile/profile.component';
import { FeedbackListComponent } from './feedback/feedback-list/feedback-list.component';

export const routes: Routes = [
    {path: '', component: LandingPageComponent},
    {path: 'login', component: LoginComponent},
    {path: 'registration', component: RegistrationComponent},
    {path: 'events', component: EventListComponent},
    {path: 'my-events', component: ManageEventsComponent}, 
    {path: 'booking/:id', component: TicketBookingComponent},
    {path: 'my-bookings', component: TicketHistoryComponent},
    {path: 'feedback', component: FeedbackComponent},
    {path: 'profile', component: ProfileComponent},
    { path: 'feedback-list', component: FeedbackListComponent }, // Fallback route
    { path: 'feedback-list/event/:eventId', component: FeedbackListComponent },
    { path: 'feedback-list/organizer', component: FeedbackListComponent },
    { path: 'feedback-list/user', component: FeedbackListComponent },
    
];

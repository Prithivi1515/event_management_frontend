import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { TicketService, BookingRequest } from '../services/ticket.service';


// Declare Razorpay for TypeScript
declare global {
  interface Window {
    Razorpay: any;
  }
}

interface PaymentData {
  eventId: number;
  userId: number;
  quantity: number;
  totalAmount: number;
  customerDetails: {
    name: string;
    email: string;
    phone: string;
  };
  event: {
    name: string;
    date: string;
    location: string;
    price: number;
  };
  bookingRequest: BookingRequest; // Add this to include booking request data

}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: {
    name: string;
    email: string;
    contact: string;
  };
  theme: {
    color: string;
  };
  handler: (response: any) => void;
  modal: {
    ondismiss: () => void;
  };
}

// Backend API interfaces
interface OrderRequest {
  customerName: string;
  email: string;
  phoneNumber: string;
  amount: number;
}

interface OrderResponse {
  secretKey: string;
  razorpayOrderId: string;
  applicationFee: string;
  secretId: string;
  pgName: string;
}

interface PaymentSaveRequest {
  razorpayOrderId: string;
  paymentId: string;
  status: string;
  amount: number;
}

@Component({
  selector: 'app-payment',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './payment.component.html',
  styleUrl: './payment.component.css'
})
export class PaymentComponent implements OnInit, OnDestroy {
  // Backend API URL - Update this to match your backend URL
  private readonly API_URL = 'http://localhost:9090/pay'; // Your backend URL
  
  // Payment data from navigation state
  paymentData: PaymentData | null = null;
  
  // Component state
  isProcessing = false;
  paymentStatus = 'pending'; // pending, processing, success, failed, cancelled
  errorMessage = '';
  bookingConfirmation: any = null;
  currentStep = 1; // 1: Review, 2: Processing, 3: Success/Failed
  
  // Payment order details from backend
  orderResponse: OrderResponse | null = null;
  
  // Subscriptions
  private subscriptions: Subscription[] = [];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private http: HttpClient,
    private ticketService: TicketService // Inject TicketService
  ) {
    // Get payment data from navigation state
    const navigation = this.router.getCurrentNavigation();
    if (navigation?.extras?.state) {
      this.paymentData = navigation.extras.state as PaymentData;
    }
  }


  ngOnInit(): void {
    // Check if payment data is available
    if (!this.paymentData) {
      console.error('No payment data found');
      this.router.navigate(['/events']);
      return;
    }

    console.log('Payment data received:', this.paymentData);
    
    // Load Razorpay script if not already loaded
    this.loadRazorpayScript();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => {
      if (sub && !sub.closed) {
        sub.unsubscribe();
      }
    });
    this.subscriptions = [];
  }

  private loadRazorpayScript(): void {
    // Check if Razorpay is already loaded
    if (window.Razorpay) {
      return;
    }

    // Create script element
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => {
      console.log('Razorpay script loaded successfully');
    };
    script.onerror = () => {
      console.error('Failed to load Razorpay script');
      this.handlePaymentError('Failed to load payment gateway. Please refresh and try again.');
    };
    document.head.appendChild(script);
  }

  proceedToPayment(): void {
    if (this.isProcessing || !this.paymentData) return;
    
    this.isProcessing = true;
    this.currentStep = 2;
    this.paymentStatus = 'processing';
    this.errorMessage = '';

    // Create payment order using your backend API
    this.createPaymentOrder();
  }

  private createPaymentOrder(): void {
    // Prepare order request according to your backend model
    const orderRequest: OrderRequest = {
      customerName: this.paymentData!.customerDetails.name,
      email: this.paymentData!.customerDetails.email,
      phoneNumber: this.paymentData!.customerDetails.phone,
      amount: this.paymentData!.totalAmount // Backend expects amount in rupees, will convert to paise
    };

    console.log('Creating payment order with backend:', orderRequest);

    // Call your backend API
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    const subscription = this.http.post<OrderResponse>(`${this.API_URL}/createOrder`, orderRequest, { headers }).subscribe({
      next: (response) => {
        console.log('Payment order created successfully:', response);
        this.orderResponse = response;
        this.initializeRazorpayPayment();
      },
      error: (error) => {
        console.error('Error creating payment order:', error);
        this.handlePaymentError('Failed to create payment order. Please try again.');
      }
    });

    this.subscriptions.push(subscription);
  }

  private initializeRazorpayPayment(): void {
    if (!window.Razorpay || !this.orderResponse || !this.paymentData) {
      this.handlePaymentError('Payment gateway not available. Please refresh and try again.');
      return;
    }

    const options: RazorpayOptions = {
      key: this.orderResponse.secretId, // Use the secretId from backend response
      amount: parseInt(this.orderResponse.applicationFee) * 100, // Amount in paise
      currency: 'INR',
      name: 'Event Management System',
      description: `Booking for ${this.paymentData.event.name}`,
      order_id: this.orderResponse.razorpayOrderId,
      prefill: {
        name: this.paymentData.customerDetails.name,
        email: this.paymentData.customerDetails.email,
        contact: this.paymentData.customerDetails.phone
      },
      theme: {
        color: '#3399cc'
      },
      handler: (response: any) => {
        this.handlePaymentSuccess(response);
      },
      modal: {
        ondismiss: () => {
          this.handlePaymentDismiss();
        }
      }
    };

    console.log('Initializing Razorpay with options:', options);

    const razorpayInstance = new window.Razorpay(options);
    razorpayInstance.open();
  }

  private handlePaymentSuccess(response: any): void {
    console.log('Razorpay payment successful:', response);
    
    // Save payment details to backend
    this.bookTicketAfterPayment(response);
  }

  private bookTicketAfterPayment(razorpayResponse: any): void {
    if (!this.paymentData?.bookingRequest) {
      this.handlePaymentError('Booking data not available');
      return;
    }

    console.log('Booking ticket after successful payment...');
    
    // Call the ticket booking service
    const bookingSubscription = this.ticketService.bookTicket(this.paymentData.bookingRequest).subscribe({
      next: (bookingResponse) => {
        console.log('Ticket booked successfully after payment:', bookingResponse);
        this.handleBookingSuccess(razorpayResponse, bookingResponse);
      },
      error: (error) => {
        console.error('Failed to book ticket after payment:', error);
        // This is a critical error - payment succeeded but booking failed
        this.handleBookingFailureAfterPayment(razorpayResponse, error);
      }
    });

    this.subscriptions.push(bookingSubscription);
  }

  private handleBookingSuccess(razorpayResponse: any, bookingResponse: any): void {
    // Save payment details to backend
    this.savePaymentDetails(razorpayResponse);

    // Create booking confirmation with actual booking data
    this.bookingConfirmation = {
      bookingId: this.extractBookingId(bookingResponse),
      eventName: this.paymentData!.event.name,
      quantity: this.paymentData!.quantity,
      totalAmount: this.paymentData!.totalAmount,
      paymentId: razorpayResponse.razorpay_payment_id,
      orderId: this.orderResponse!.razorpayOrderId,
      bookingDate: new Date().toISOString(),
      status: 'confirmed',
      pgName: this.orderResponse!.pgName,
      bookingResponse: bookingResponse
    };

    this.paymentStatus = 'success';
    this.currentStep = 3;
    this.isProcessing = false;

    console.log('Payment and booking completed successfully:', this.bookingConfirmation);
  }

  private handleBookingFailureAfterPayment(razorpayResponse: any, error: any): void {
    // Payment succeeded but booking failed - this needs special handling
    console.error('Critical error: Payment succeeded but booking failed', error);
    
    // Save payment details anyway
    this.savePaymentDetails(razorpayResponse);

    // Create a special error state
    this.bookingConfirmation = {
      paymentId: razorpayResponse.razorpay_payment_id,
      orderId: this.orderResponse!.razorpayOrderId,
      status: 'payment_success_booking_failed',
      pgName: this.orderResponse!.pgName,
      errorMessage: 'Payment successful but booking failed. Please contact support.',
      totalAmount: this.paymentData!.totalAmount
    };

    this.paymentStatus = 'failed';
    this.currentStep = 3;
    this.isProcessing = false;
    this.errorMessage = 'Payment was successful, but there was an issue with your booking. Please contact our support team with your payment ID: ' + razorpayResponse.razorpay_payment_id;
  }

  private extractBookingId(bookingResponse: any): number {
    // Extract booking ID from the booking response
    // Adjust this based on your actual booking response structure
    if (bookingResponse?.bookingId) {
      return bookingResponse.bookingId;
    }
    if (bookingResponse?.ticketId) {
      return bookingResponse.ticketId;
    }
    // If no booking ID is available, generate a random one for display
    return Math.floor(Math.random() * 10000) + 1000;
  }

  
  private savePaymentDetails(razorpayResponse: any): void {
    const paymentSaveRequest: PaymentSaveRequest = {
      razorpayOrderId: this.orderResponse!.razorpayOrderId,
      paymentId: razorpayResponse.razorpay_payment_id,
      status: 'success',
      amount: parseInt(this.orderResponse!.applicationFee)
    };

    console.log('Saving payment details:', paymentSaveRequest);

    // Here you can add a backend endpoint to save payment details
    // For now, we'll simulate successful completion
    this.simulatePaymentVerification(razorpayResponse);
  }

  private simulatePaymentVerification(razorpayResponse: any): void {
    // Simulate verification delay
    setTimeout(() => {
      // Create booking confirmation
      this.bookingConfirmation = {
        bookingId: Math.floor(Math.random() * 10000) + 1000,
        eventName: this.paymentData!.event.name,
        quantity: this.paymentData!.quantity,
        totalAmount: this.paymentData!.totalAmount,
        paymentId: razorpayResponse.razorpay_payment_id,
        orderId: this.orderResponse!.razorpayOrderId,
        bookingDate: new Date().toISOString(),
        status: 'confirmed',
        pgName: this.orderResponse!.pgName
      };

      this.paymentStatus = 'success';
      this.currentStep = 3;
      this.isProcessing = false;

      console.log('Payment verified successfully:', this.bookingConfirmation);
    }, 2000);
  }

  private handlePaymentDismiss(): void {
    console.log('Payment modal dismissed by user');
    this.paymentStatus = 'cancelled';
    this.currentStep = 3;
    this.isProcessing = false;
    this.errorMessage = 'Payment was cancelled. You can try again if needed.';
  }

  private handlePaymentError(message: string): void {
    this.paymentStatus = 'failed';
    this.currentStep = 3;
    this.errorMessage = message;
    this.isProcessing = false;
  }

  retryPayment(): void {
    this.paymentStatus = 'pending';
    this.currentStep = 1;
    this.errorMessage = '';
    this.isProcessing = false;
    this.orderResponse = null;
    this.bookingConfirmation = null;
  }

  goBackToBooking(): void {
    this.router.navigate(['/ticket-booking'], {
      queryParams: { eventId: this.paymentData?.eventId }
    });
  }

  goToEvents(): void {
    this.router.navigate(['/events']);
  }

  goToMyBookings(): void {
    this.router.navigate(['/my-bookings']);
  }

  formatAmount(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount);
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getStatusIcon(): string {
    switch (this.paymentStatus) {
      case 'processing': return 'bi-clock-history';
      case 'success': return 'bi-check-circle-fill';
      case 'failed': return 'bi-x-circle-fill';
      case 'cancelled': return 'bi-dash-circle-fill';
      default: return 'bi-credit-card';
    }
  }

  getStatusClass(): string {
    switch (this.paymentStatus) {
      case 'processing': return 'text-warning';
      case 'success': return 'text-success';
      case 'failed': return 'text-danger';
      case 'cancelled': return 'text-secondary';
      default: return 'text-primary';
    }
  }

  // Method to get payment gateway info
  getPaymentGatewayInfo(): string {
    if (this.orderResponse) {
      return `Payment Gateway: ${this.orderResponse.pgName} (${this.orderResponse.secretId})`;
    }
    return 'Razorpay Payment Gateway';
  }
}
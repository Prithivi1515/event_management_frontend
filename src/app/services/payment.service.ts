import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

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

@Injectable({
  providedIn: 'root'
})
export class RazorpayPaymentService {
  private readonly API_URL = 'http://localhost:9090/pay';

  constructor(private http: HttpClient) {}

  createOrder(orderRequest: OrderRequest): Observable<OrderResponse> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    
    return this.http.post<OrderResponse>(`${this.API_URL}/createOrder`, orderRequest, { headers });
  }

  // Add method to save payment details if you create a backend endpoint
  savePayment(paymentRequest: PaymentSaveRequest): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    
    return this.http.post(`${this.API_URL}/savePayment`, paymentRequest, { headers });
  }
}

import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  
  if (req.url.includes('/auth/')) {
    return next(req);
  }

  const token = authService.getToken();

  if (token) {
    const authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
    
    return next(authReq).pipe(
      catchError((error: HttpErrorResponse) => {
        // Handle authentication errors
        if (error.status === 401) {
          authService.handleAuthError(error);
        }
        return throwError(() => error);
      })
    );
  }

  return next(req);
};

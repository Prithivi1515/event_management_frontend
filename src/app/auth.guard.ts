import { CanActivateFn } from '@angular/router';

export const authGuard: CanActivateFn = (route, state) => {
  if(localStorage.getItem('isLoggedIn') !== 'true') {
    window.location.href = '/login';
    return false;
  }
  if(localStorage.getItem("userRole")==="organizer" || localStorage.getItem("userRole")==="admin") {
    return true;
  }
  if(localStorage.getItem("userRole")==="user") {
    window.location.href = '';
    return false;
  }
  return false;
};

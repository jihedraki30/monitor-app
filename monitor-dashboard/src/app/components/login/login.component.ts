// src/app/components/login/login.component.ts
import { Component } from '@angular/core';
import { Router }    from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls:   ['./login.component.scss']
})
export class LoginComponent {

  username  = '';
  password  = '';
  showPass  = false;
  loading   = false;
  errorMsg  = '';

  constructor(private authService: AuthService, private router: Router) {
    // Already logged in? Go straight to dashboard
    if (this.authService.isLoggedIn()) {
      this.router.navigate(['/dashboard']);
    }
  }

  submit(): void {
    if (!this.username.trim() || !this.password) {
      this.errorMsg = 'Please enter both username and password.';
      return;
    }

    this.loading  = true;
    this.errorMsg = '';

    this.authService.login(this.username.trim(), this.password).subscribe({
      next:  ()  => this.router.navigate(['/dashboard']),
      error: err => {
        this.loading  = false;
        this.errorMsg = err.status === 401
          ? 'Invalid username or password.'
          : 'Login failed. Please try again.';
      }
    });
  }
}

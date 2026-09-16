// src/app/components/change-password/change-password.component.ts
import { Component, EventEmitter, Output } from '@angular/core';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-change-password',
  templateUrl: './change-password.component.html',
  styleUrls:   ['./change-password.component.scss']
})
export class ChangePasswordComponent {

  @Output() closed = new EventEmitter<void>();

  currentPassword  = '';
  newPassword      = '';
  confirmPassword  = '';
  showCurrent      = false;
  showNew          = false;
  loading          = false;
  errorMsg         = '';
  successMsg       = '';

  constructor(private authService: AuthService) {}

  get strengthLevel(): number {
    const p = this.newPassword;
    if (!p) return 0;
    let score = 0;
    if (p.length >= 8)                score++;
    if (/[A-Z]/.test(p))              score++;
    if (/[0-9]/.test(p))              score++;
    if (/[^A-Za-z0-9]/.test(p))       score++;
    return score;   // 0-4
  }

  get strengthLabel(): string {
    return ['', 'Weak', 'Fair', 'Good', 'Strong'][this.strengthLevel];
  }

  get strengthClass(): string {
    return ['', 'str-weak', 'str-fair', 'str-good', 'str-strong'][this.strengthLevel];
  }

  submit(): void {
    this.errorMsg   = '';
    this.successMsg = '';

    if (!this.currentPassword || !this.newPassword || !this.confirmPassword) {
      this.errorMsg = 'All fields are required.'; return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.errorMsg = 'New passwords do not match.'; return;
    }
    if (this.newPassword.length < 8) {
      this.errorMsg = 'Password must be at least 8 characters.'; return;
    }

    this.loading = true;

    this.authService.changePassword({
      currentPassword:  this.currentPassword,
      newPassword:      this.newPassword,
      confirmPassword:  this.confirmPassword
    }).subscribe({
      next: () => {
        this.loading     = false;
        this.successMsg  = 'Password updated successfully!';
        setTimeout(() => this.closed.emit(), 1500);
      },
      error: err => {
        this.loading  = false;
        this.errorMsg = err.error?.error ?? 'Failed to update password.';
      }
    });
  }

  close(): void { this.closed.emit(); }
}

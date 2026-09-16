// src/app/services/auth.service.ts
import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../environments/environment';

export interface LoginResponse {
  token:    string;
  username: string;
}

export interface ChangePasswordRequest {
  currentPassword:  string;
  newPassword:      string;
  confirmPassword:  string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {

  private readonly BASE = `${environment.apiBaseUrl}/auth`;
  private readonly TOKEN_KEY = 'audit_jwt';

  constructor(
    private http: HttpClient,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  // ── Auth actions ───────────────────────────────────────────────────────

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.BASE}/login`, { username, password })
      .pipe(tap(res => {
        if (isPlatformBrowser(this.platformId)) {
          localStorage.setItem(this.TOKEN_KEY, res.token);
        }
      }));
  }

  logout(): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(this.TOKEN_KEY);
    }
    this.router.navigate(['/login']);
  }

  changePassword(payload: ChangePasswordRequest): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.BASE}/change-password`, payload);
  }

  // ── Token helpers ──────────────────────────────────────────────────────

  getToken(): string | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    return localStorage.getItem(this.TOKEN_KEY);
  }

  isLoggedIn(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;

    const token = this.getToken();
    if (!token) return false;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }

  getUsername(): string {
    if (!isPlatformBrowser(this.platformId)) return '';

    const token = this.getToken();
    if (!token) return '';

    try {
      return JSON.parse(atob(token.split('.')[1])).sub ?? '';
    } catch {
      return '';
    }
  }
}

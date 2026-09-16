// src/app/app-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { AuditDashboardComponent } from './components/audit-dashboard/audit-dashboard.component';
import { LoginComponent } from './components/login/login.component';
import { ChangePasswordComponent } from './components/change-password/change-password.component';

import { AuthGuard } from './guards/auth.guard';

const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
    title: 'Login - Audit Dashboard'
  },
  {
    path: '',
    component: AuditDashboardComponent,
    canActivate: [AuthGuard],
    title: 'Audit Dashboard'
  },
  {
    path: 'change-password',
    component: ChangePasswordComponent,
    canActivate: [AuthGuard],
    title: 'Change Password'
  },
  {
    path: '**',
    redirectTo: ''   // Unknown routes → dashboard (will be guarded)
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, {
    enableTracing: false,        // set to true only for debugging
    scrollPositionRestoration: 'enabled'
  })],
  exports: [RouterModule]
})
export class AppRoutingModule { }

// src/app/services/audit.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment.prod';

import {
  AuditLog,
  AuditStats,
  EndpointCount,
  HourlyCount,
  IpCount,
  AppRate
} from '../models/audit-log.model';

export interface PageResponse<T> {
  content:       T[];
  totalElements: number;
  totalPages:    number;
  number:        number;
  size:          number;
  first:         boolean;
  last:          boolean;
}

export interface DeleteHistoryResponse {
  deleted: number;
  range:   string;
}

/** Optional filters sent with every query (user + date-time window, ISO-8601 UTC). */
export interface ExtraFilters {
  user?: string;
  from?: string;
  to?:   string;
}

export type DeleteRange = 'last_day' | 'last_week' | 'last_month' | 'all';

@Injectable({ providedIn: 'root' })
export class AuditService {

  private readonly BASE = `${environment.apiBaseUrl}/audit`;

  constructor(private http: HttpClient) {}

  private withExtra(params: HttpParams, e: ExtraFilters = {}): HttpParams {
    if (e.user?.trim()) params = params.set('user', e.user.trim());
    if (e.from)         params = params.set('from', e.from);
    if (e.to)           params = params.set('to',   e.to);
    return params;
  }

  getApps(): Observable<string[]> {
    return this.http.get<string[]>(`${this.BASE}/apps`);
  }

  getLogs(
    method?:      string,
    statusGroup?: string,
    app?:         string,
    page   = 0,
    size   = 20,
    extra: ExtraFilters = {}
  ): Observable<PageResponse<AuditLog>> {

    let params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());

    if (method?.trim())      params = params.set('method', method);
    if (statusGroup?.trim()) params = params.set('status', statusGroup);
    if (app?.trim())         params = params.set('app',    app);
    params = this.withExtra(params, extra);

    return this.http.get<PageResponse<AuditLog>>(`${this.BASE}/logs`, { params });
  }

  getStats(app?: string, timeRange = '24h', extra: ExtraFilters = {}): Observable<AuditStats> {
    let params = new HttpParams().set('timeRange', timeRange);
    if (app?.trim()) params = params.set('app', app);
    params = this.withExtra(params, extra);
    return this.http.get<AuditStats>(`${this.BASE}/stats`, { params });
  }

  getTopEndpoints(limit = 8, app?: string, extra: ExtraFilters = {}): Observable<EndpointCount[]> {
    let params = new HttpParams().set('limit', limit.toString());
    if (app?.trim()) params = params.set('app', app);
    params = this.withExtra(params, extra);
    return this.http.get<EndpointCount[]>(`${this.BASE}/endpoints`, { params });
  }

  getHourlyTimeline(timeRange = '24h', app?: string, extra: ExtraFilters = {}): Observable<HourlyCount[]> {
    let params = new HttpParams().set('timeRange', timeRange);
    if (app?.trim()) params = params.set('app', app);
    params = this.withExtra(params, extra);
    return this.http.get<HourlyCount[]>(`${this.BASE}/timeline`, { params });
  }

  getTopIps(limit = 8, timeRange = '24h', app?: string, extra: ExtraFilters = {}): Observable<IpCount[]> {
    let params = new HttpParams()
      .set('limit', limit.toString())
      .set('timeRange', timeRange);
    if (app?.trim()) params = params.set('app', app);
    params = this.withExtra(params, extra);
    return this.http.get<IpCount[]>(`${this.BASE}/top-ips`, { params });
  }

  getAppRates(timeRange = '24h', extra: ExtraFilters = {}): Observable<AppRate[]> {
    const params = this.withExtra(new HttpParams().set('timeRange', timeRange), extra);
    return this.http.get<AppRate[]>(`${this.BASE}/rates`, { params });
  }

  deleteHistory(range: DeleteRange): Observable<DeleteHistoryResponse> {
    const params = new HttpParams().set('range', range);
    return this.http.delete<DeleteHistoryResponse>(`${this.BASE}/history`, { params });
  }
}

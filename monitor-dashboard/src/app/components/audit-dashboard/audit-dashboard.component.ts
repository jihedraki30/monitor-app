// src/app/components/audit-dashboard/audit-dashboard.component.ts
import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewInit,
  Inject,
  NgZone
} from '@angular/core';

import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

import {
  Chart,
  ChartConfiguration,
  DoughnutController,
  BarController,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';

import { AuditService, PageResponse, DeleteRange } from '../../services/audit.service';
import {
  AuditLog,
  AuditStats,
  EndpointCount,
  HourlyCount
} from '../../models/audit-log.model';

Chart.register(
  DoughnutController,
  BarController,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend
);

@Component({
  selector: 'app-audit-dashboard',
  templateUrl: './audit-dashboard.component.html',
  styleUrls: ['./audit-dashboard.component.scss']
})
export class AuditDashboardComponent implements OnInit, OnDestroy, AfterViewInit {

  @ViewChild('statusPie')   statusPieRef!:   ElementRef<HTMLCanvasElement>;
  @ViewChild('rolePie')     rolePieRef!:     ElementRef<HTMLCanvasElement>;
  @ViewChild('timelineBar') timelineBarRef!: ElementRef<HTMLCanvasElement>;

  logs:      AuditLog[]      = [];
  endpoints: EndpointCount[] = [];
  timeline:  HourlyCount[]   = [];
  username:  string          = '';

  availableApps: string[] = [];

  stats: AuditStats = {
    total: 0, withJwt: 0, anonymous: 0,
    errors: 0, uniqueUsers: 0, avgResponseMs: 0
  };

  // Pagination
  currentPage   = 0;
  pageSize      = 20;
  totalPages    = 1;
  totalElements = 0;

  // Filters
  filterMethod = '';
  filterStatus = '';
  filterApp    = '';
  timeRange    = '24h';

  loading             = false;
  lastUpdated: Date | null = null;
  secondsSinceUpdate  = 0;

  // ── Delete history modal ─────────────────────────────────────
  showDeleteModal   = false;
  deleteRange: DeleteRange = 'last_day';
  deleting          = false;
  deleteResult: string | null = null;

  readonly deleteRangeOptions: { value: DeleteRange; label: string }[] = [
    { value: 'last_day',   label: 'Last 24 hours' },
    { value: 'last_week',  label: 'Last 7 days'   },
    { value: 'last_month', label: 'Last 30 days'  },
    { value: 'all',        label: 'All history'   },
  ];

  private statusChart?:   Chart<'doughnut'>;
  private roleChart?:     Chart<'doughnut'>;
  private timelineChart?: Chart<'bar'>;
  private chartsReady     = false;
  private refreshTimer?:  ReturnType<typeof setInterval>;
  private clockTimer?:    ReturnType<typeof setInterval>;
  private closeTimer?:    ReturnType<typeof setTimeout>;

  constructor(
    private auditService: AuditService,
    private authService: AuthService,
    private router: Router,
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    this.username = this.authService.getUsername();
    this.loadApps();
    this.load();

    if (isPlatformBrowser(this.platformId)) {
      this.ngZone.runOutsideAngular(() => {
        this.refreshTimer = setInterval(() => {
          this.ngZone.run(() => this.load());
        }, 30_000);

        this.clockTimer = setInterval(() => {
          this.ngZone.run(() => {
            if (this.lastUpdated) {
              this.secondsSinceUpdate = Math.floor(
                (Date.now() - this.lastUpdated.getTime()) / 1000
              );
            }
          });
        }, 1000);
      });
    }
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.buildCharts();
      this.chartsReady = true;
      if (this.logs.length) this.updateCharts();
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.refreshTimer);
    clearInterval(this.clockTimer);
    clearTimeout(this.closeTimer);
    this.statusChart?.destroy();
    this.roleChart?.destroy();
    this.timelineChart?.destroy();
  }

  // ─────────────────────────────────────────────────────────────
  // APP LIST
  // ─────────────────────────────────────────────────────────────

  loadApps(): void {
    this.auditService.getApps().subscribe({
      next:  apps => (this.availableApps = apps),
      error: err  => console.warn('Apps load failed', err)
    });
  }

  appLabel(app: string): string {
    return app
      .split(/[-_]/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  // ─────────────────────────────────────────────────────────────
  // DATA LOADING
  // ─────────────────────────────────────────────────────────────

  load(): void {
    this.loading = true;

    if (this.currentPage >= this.totalPages && this.totalPages > 0) {
      this.currentPage = this.totalPages - 1;
    }

    this.auditService.getStats(this.filterApp, this.timeRange).subscribe({
      next:  s  => (this.stats = s),
      error: err => console.warn('Stats load failed', err)
    });

    this.auditService.getLogs(
      this.filterMethod,
      this.filterStatus,
      this.filterApp,
      this.currentPage,
      this.pageSize
    ).subscribe({
      next: (response: PageResponse<AuditLog>) => {
        this.logs          = response.content       || [];
        this.totalElements = response.totalElements ?? 0;
        this.totalPages    = response.totalPages    ?? 1;
        this.currentPage   = response.number        ?? this.currentPage;
        this.loading       = false;
        this.lastUpdated   = new Date();
        this.secondsSinceUpdate = 0;

        if (this.chartsReady) this.updateCharts();
      },
      error: err => {
        console.error('Logs load failed', err);
        this.loading = false;
      }
    });

    this.auditService.getTopEndpoints(8, this.filterApp).subscribe(e => this.endpoints = e || []);
    this.auditService.getHourlyTimeline(this.timeRange, this.filterApp).subscribe(t => {
      this.timeline = t || [];
      if (this.chartsReady) this.updateTimelineChart();
    });
  }

  // ─────────────────────────────────────────────────────────────
  // PAGINATION & FILTERS
  // ─────────────────────────────────────────────────────────────

  prevPage(): void {
    if (this.currentPage > 0) { this.currentPage--; this.load(); }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages - 1) { this.currentPage++; this.load(); }
  }

  onPageSizeChange(): void  { this.currentPage = 0; this.load(); }
  applyFilters(): void      { this.currentPage = 0; this.load(); }
  onTimeRangeChange(): void { this.currentPage = 0; this.load(); }

  // ─────────────────────────────────────────────────────────────
  // DELETE HISTORY
  // ─────────────────────────────────────────────────────────────

  openDeleteModal(): void {
    clearTimeout(this.closeTimer);
    this.deleteRange     = 'last_day';
    this.deleteResult    = null;
    this.deleting        = false;
    this.showDeleteModal = true;
  }

  closeDeleteModal(): void {
    if (this.deleting) return;          // still block mid-delete clicks
    clearTimeout(this.closeTimer);      // cancel pending auto-close
    this.showDeleteModal = false;
    this.deleteResult    = null;
  }

  confirmDelete(): void {
    if (this.deleting) return;
    this.deleting     = true;
    this.deleteResult = null;

    this.auditService.deleteHistory(this.deleteRange).subscribe({
      next: res => {
        this.deleting     = false;
        this.deleteResult = `✓ ${res.deleted} record(s) deleted.`;
        this.currentPage  = 0;
        this.load();
        // auto-close after 1.5 s — tracked so Cancel/X can cancel it
        this.closeTimer = setTimeout(() => this.closeDeleteModal(), 1500);
      },
      error: err => {
        this.deleting     = false;
        this.deleteResult = `✗ Delete failed: ${err.message ?? 'unknown error'}`;
      }
    });
  }

  get deleteRangeLabel(): string {
    return this.deleteRangeOptions.find(o => o.value === this.deleteRange)?.label ?? '';
  }

  // ─────────────────────────────────────────────────────────────
  // CHARTS
  // ─────────────────────────────────────────────────────────────

  private buildCharts(): void {
    const doughnutOpts: ChartConfiguration<'doughnut'>['options'] = {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: { legend: { display: false }, tooltip: {
        callbacks: {
          label: ctx => ` ${ctx.label}: ${ctx.parsed} (${
            ctx.dataset.data.reduce((a: number, b: any) => a + b, 0) > 0
              ? Math.round(ctx.parsed / (ctx.dataset.data.reduce((a: number, b: any) => a + b, 0)) * 100)
              : 0
          }%)`
        }
      }}
    };

    this.statusChart = new Chart(this.statusPieRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels: ['2xx Success', '4xx Client Error', '5xx Server Error'],
        datasets: [{ data: [0, 0, 0], backgroundColor: ['#639922', '#BA7517', '#E24B4A'], borderWidth: 0 }]
      },
      options: doughnutOpts
    });

    this.roleChart = new Chart(this.rolePieRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels: ['Admin', 'Avocat', 'Client', 'Anonymous'],
        datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#7F77DD', '#378ADD', '#1D9E75', '#888780'], borderWidth: 0 }]
      },
      options: doughnutOpts
    });

    this.timelineChart = new Chart(this.timelineBarRef.nativeElement, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{ label: 'Requests', data: [], backgroundColor: '#378ADD', borderRadius: 4, borderSkipped: false }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#888780', font: { size: 11 }, maxRotation: 0,
              callback: function(val, idx) {
                const label = (this as any).getLabelForValue(idx);
                if (!label) return '';
                const parts = label.split(' ');
                return parts.length > 1 ? parts[1] : label;
              }
            }
          },
          y: {
            grid: { color: 'rgba(136,135,128,0.15)' },
            ticks: { color: '#888780', font: { size: 11 } }
          }
        }
      }
    });
  }

  private updateCharts(): void {
    if (!this.statusChart || !this.roleChart) return;

    const s2xx = this.stats.total - this.stats.errors;
    const s4xx = this.logs.filter(r => r.status >= 400 && r.status < 500).length;
    const s5xx = this.logs.filter(r => r.status >= 500).length;
    this.statusChart.data.datasets[0].data = [s2xx > 0 ? s2xx : 0, s4xx, s5xx];
    this.statusChart.update();

    const roles = ['ROLE_ADMIN', 'ROLE_AVOCAT', 'ROLE_CLIENT', 'ANONYMOUS'];
    this.roleChart.data.datasets[0].data = roles.map(r => this.logs.filter(l => l?.role === r).length);
    this.roleChart.update();
  }

  private updateTimelineChart(): void {
    if (!this.timelineChart) return;
    this.timelineChart.data.labels              = this.timeline.map(h => h.hour);
    this.timelineChart.data.datasets[0].data    = this.timeline.map(h => h.count);
    this.timelineChart.update();
  }

  // ─────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────

  get errPct(): number {
    return this.stats.total
      ? Math.round((this.stats.errors / this.stats.total) * 1000) / 10
      : 0;
  }

  get jwtPct(): string {
    return this.stats.total
      ? ((this.stats.withJwt / this.stats.total) * 100).toFixed(0)
      : '0';
  }

  get lastUpdatedLabel(): string {
    const s = this.secondsSinceUpdate;
    if (s < 60)   return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  }

  statusClass(s: number): string {
    if (s >= 500) return 'badge-err';
    if (s >= 400) return 'badge-warn';
    return 'badge-ok';
  }

  roleClass(r: string): string {
    const map: Record<string, string> = {
      ROLE_ADMIN:  'badge-admin',
      ROLE_AVOCAT: 'badge-avocat',
      ROLE_CLIENT: 'badge-client',
      ANONYMOUS:   'badge-anon'
    };
    return map[r] || 'badge-anon';
  }

  roleLabel(r: string): string {
    return (r || 'ANONYMOUS').replace('ROLE_', '');
  }

  timeLabel(iso: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleString([], {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }

  normalizeUri(uri: string | null | undefined): string {
    if (!uri) return 'unknown';
    return uri.replace(/\/\d+/g, '/{id}').replace(/[?#].*/, '');
  }

  maxEndpoint(): number {
    return Math.max(...this.endpoints.map(e => e.count), 1);
  }

  endpointPct(count: number): number {
    return Math.round((count / this.maxEndpoint()) * 100);
  }

  logout(): void {
    this.authService.logout();
  }

  goToChangePassword(): void {
    this.router.navigate(['/change-password']);
  }
}

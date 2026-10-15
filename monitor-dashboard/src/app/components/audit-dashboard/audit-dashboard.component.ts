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

import { AuditService, PageResponse, DeleteRange, ExtraFilters } from '../../services/audit.service';
import {
  AuditLog,
  AuditStats,
  EndpointCount,
  HourlyCount,
  IpCount,
  AppRate
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
  @ViewChild('topIpsBar')   topIpsBarRef!:   ElementRef<HTMLCanvasElement>;  // ← replaces rolePie
  @ViewChild('timelineBar') timelineBarRef!: ElementRef<HTMLCanvasElement>;

  logs:      AuditLog[]      = [];
  endpoints: EndpointCount[] = [];
  timeline:  HourlyCount[]   = [];
  topIps:    IpCount[]       = [];           // ← new
  username:  string          = '';
  appRates:  AppRate[]       = [];
  ratesError = '';            // shown in the rates table if /rates fails

  // Endpoint hover tooltip
  hoveredLog: AuditLog | null = null;
  tipX     = 0;
  tipY     = 0;
  tipAbove = false;

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
  filterUser   = '';
  filterFrom   = '';   // <input type="datetime-local"> value (local time); '' = not set
  filterTo     = '';
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
  private topIpsChart?:   Chart<'bar'>;        // ← replaces roleChart
  private timelineChart?: Chart<'bar'>;
  private topIpsSorted:   IpCount[] = [];   // same order as the bars (used by the tooltip)
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
    this.topIpsChart?.destroy();
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
    const extra = this.extraFilters;

    if (this.currentPage >= this.totalPages && this.totalPages > 0) {
      this.currentPage = this.totalPages - 1;
    }

    // Stats — now correctly scoped to timeRange + app
    this.auditService.getStats(this.filterApp, this.timeRange, extra).subscribe({
      next:  s  => (this.stats = s),
      error: err => console.warn('Stats load failed', err)
    });

    this.auditService.getLogs(
      this.filterMethod,
      this.filterStatus,
      this.filterApp,
      this.currentPage,
      this.pageSize,
      extra
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

    this.auditService.getTopEndpoints(8, this.filterApp, extra).subscribe(e => this.endpoints = e || []);

    this.auditService.getHourlyTimeline(this.timeRange, this.filterApp, extra).subscribe(t => {
      this.timeline = t || [];
      if (this.chartsReady) this.updateTimelineChart();
    });

    // Average traffic per app (per minute / hour / day) over the selected range
    this.auditService.getAppRates(this.timeRange, extra).subscribe({
      next:  r   => { this.appRates = r || []; this.ratesError = ''; },
      error: err => {
        console.warn('Rates load failed', err);
        this.appRates   = [];
        this.ratesError = `Rates failed (HTTP ${err?.status ?? '?'}): ${err?.error?.message || err?.error?.error || err?.message || 'unknown error'}`;
      }
    });

    // Load top IPs (respects timeRange + app filter)
    this.auditService.getTopIps(8, this.timeRange, this.filterApp, extra).subscribe(ips => {
      this.topIps = ips || [];
      if (this.chartsReady) this.updateTopIpsChart();
    });
  }

  // ─────────────────────────────────────────────────────────────
  // ENDPOINT TOOLTIP
  // ─────────────────────────────────────────────────────────────

  showTip(ev: MouseEvent, log: AuditLog): void {
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const tipW = 360, tipH = 260;
    this.tipX     = Math.max(8, Math.min(rect.left, window.innerWidth - tipW - 8));
    this.tipAbove = rect.bottom + tipH > window.innerHeight;
    this.tipY     = this.tipAbove ? rect.top - 6 : rect.bottom + 6;
    this.hoveredLog = log;
  }

  hideTip(): void { this.hoveredLog = null; }

  // ── Average traffic per app ──────────────────────────────────

  /** Period (seconds) all apps were averaged over — the same for every row. */
  get ratesPeriodSec(): number {
    return this.appRates.length ? this.appRates[0].periodSeconds : 0;
  }

  get ratesPeriodLabel(): string {
    const s = this.ratesPeriodSec;
    if (!s) return '—';
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), rm = m % 60;
    if (h < 48) return rm ? `${h}h ${rm}m` : `${h}h`;
    const d = Math.floor(h / 24), rh = h % 24;
    return rh ? `${d}d ${rh}h` : `${d}d`;
  }

  /** Total row: computed from the grand total, not by summing rounded rates. */
  get ratesTotal(): { total: number; perMinute: number; perHour: number; perDay: number } {
    const total = this.appRates.reduce((a, r) => a + r.total, 0);
    const p = this.ratesPeriodSec || 60;
    return {
      total,
      perMinute: total / (p / 60),
      perHour:   total / (p / 3600),
      perDay:    total / (p / 86400)
    };
  }

  sharePct(r: AppRate): number {
    const t = this.ratesTotal.total;
    return t ? (r.total / t) * 100 : 0;
  }

  /** Click a row to filter the whole dashboard on that app (click again to clear). */
  selectApp(app: string): void {
    this.filterApp = this.filterApp === app ? '' : app;
    this.applyFilters();
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

  /** Preset range button: also drops any custom date-time window. */
  selectRange(r: string): void {
    this.timeRange  = r;
    this.filterFrom = '';
    this.filterTo   = '';
    this.onTimeRangeChange();
  }

  clearDates(): void {
    this.filterFrom = '';
    this.filterTo   = '';
    this.applyFilters();
  }

  get customRange(): boolean {
    return !!(this.filterFrom || this.filterTo);
  }

  /** Text shown in the card headers: preset (24h) or the custom window. */
  get rangeLabel(): string {
    if (!this.customRange) return this.timeRange;
    const f = (v: string, fallback: string) => v ? v.replace('T', ' ') : fallback;
    return `${f(this.filterFrom, 'start')} → ${f(this.filterTo, 'now')}`;
  }

  /** User + date-time window sent to the API (local inputs → ISO UTC). */
  private get extraFilters(): ExtraFilters {
    return {
      user: (this.filterUser || '').trim() || undefined,
      from: this.toIso(this.filterFrom, false),
      to:   this.toIso(this.filterTo,   true)
    };
  }

  /** `to` is inclusive of the whole minute picked (HH:MM:59.999). */
  private toIso(v: string, endOfMinute: boolean): string | undefined {
    if (!v) return undefined;
    const d = new Date(v);
    if (isNaN(d.getTime())) return undefined;
    return new Date(d.getTime() + (endOfMinute ? 59_999 : 0)).toISOString();
  }

  fmtRate(v: number | null | undefined): string {
    const n = v ?? 0;
    return n.toFixed(n > 0 && n < 0.1 ? 3 : 2);
  }

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
    if (this.deleting) return;
    clearTimeout(this.closeTimer);
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

    // Status doughnut
    this.statusChart = new Chart(this.statusPieRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels: ['2xx Success', '4xx Client Error', '5xx Server Error'],
        datasets: [{ data: [0, 0, 0], backgroundColor: ['#639922', '#BA7517', '#E24B4A'], borderWidth: 0 }]
      },
      options: doughnutOpts
    });

    // Top IPs horizontal bar chart — replaces the role doughnut
    this.topIpsChart = new Chart(this.topIpsBarRef.nativeElement, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: 'Requests',
          data: [],
          backgroundColor: 'rgba(55, 138, 221, 0.65)',
          borderRadius: 4,
          borderSkipped: false
        }]
      },
      options: {
        indexAxis: 'y',          // horizontal bars — IPs on y-axis
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: items => this.topIpsSorted[items[0].dataIndex]?.ip ?? '',
              label: ctx => {
                const ip = this.topIpsSorted[ctx.dataIndex];
                return [
                  ` ${ctx.parsed.x} request${ctx.parsed.x === 1 ? '' : 's'}`,
                  ` avg ${this.fmtRate(ip?.perMinute)} / min`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(136,135,128,0.15)' },
            ticks: { color: '#888780', font: { size: 11 } }
          },
          y: {
            grid: { display: false },
            ticks: {
              color: '#8a95a3',
              font: { size: 11, family: "'IBM Plex Mono', monospace" }
            }
          }
        }
      }
    });

    // Timeline bar
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
    if (!this.statusChart) return;

    const s2xx = this.stats.total - this.stats.errors;
    const s4xx = this.logs.filter(r => r.status >= 400 && r.status < 500).length;
    const s5xx = this.logs.filter(r => r.status >= 500).length;
    this.statusChart.data.datasets[0].data = [s2xx > 0 ? s2xx : 0, s4xx, s5xx];
    this.statusChart.update();
  }

  private updateTimelineChart(): void {
    if (!this.timelineChart) return;
    this.timelineChart.data.labels           = this.timeline.map(h => h.hour);
    this.timelineChart.data.datasets[0].data = this.timeline.map(h => h.count);
    this.timelineChart.update();
  }

  private updateTopIpsChart(): void {
    if (!this.topIpsChart) return;
    // Show IPs in descending order on a horizontal bar (highest count at top)
    const sorted = [...this.topIps].sort((a, b) => a.count - b.count); // Chart.js renders bottom-up
    this.topIpsSorted                      = sorted;
    this.topIpsChart.data.labels           = sorted.map(ip => `${ip.ip}  ·  ${this.fmtRate(ip.perMinute)}/min`);
    this.topIpsChart.data.datasets[0].data = sorted.map(ip => ip.count);
    this.topIpsChart.update();
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

package com.dashboard.web.dashboard_backend;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/audit")
@CrossOrigin("*")
public class AuditController {

    @Autowired
    private RequestLogRepository repository;

    // ── Time-range string → hours ─────────────────────────────────────────
    private int toHours(String timeRange) {
        return switch (timeRange == null ? "24h" : timeRange) {
            case "1h"  ->   1;
            case "6h"  ->   6;
            case "7d"  -> 168;
            default    ->  24;   // "24h" and fallback
        };
    }

    private String toAppFilter(String app) {
        if (app == null || app.isBlank()) return null;
        return app.trim();
    }

    private String clean(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }

    // ── Date-time window ─────────────────────────────────────────────────
    //
    // `from` / `to` are ISO-8601 instants (e.g. 2026-10-15T12:30:00Z).
    // If neither is sent, the preset timeRange (1h/6h/24h/7d) is used: [now - range, now].
    // If only one is sent, the other side is open (from = beginning of data, to = now).

    private Instant parseInstant(String s, String name) {
        if (s == null || s.isBlank()) return null;
        try {
            return Instant.parse(s.trim());
        } catch (DateTimeParseException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid '" + name + "' date: " + s);
        }
    }

    private boolean isCustomRange(String from, String to) {
        return (from != null && !from.isBlank()) || (to != null && !to.isBlank());
    }

    /** @return [start, end] */
    private Instant[] window(String timeRange, String from, String to) {
        Instant now   = Instant.now();
        Instant start = parseInstant(from, "from");
        Instant end   = parseInstant(to, "to");

        if (start == null && end == null) {
            return new Instant[]{ now.minus(toHours(timeRange), ChronoUnit.HOURS), now };
        }
        if (end == null)   end   = now;
        if (start == null) start = Instant.EPOCH;
        return new Instant[]{ start, end };
    }

    /**
     * Lower bound always; upper bound ONLY when the caller sent an explicit `to`
     * (presets stay open-ended, exactly like before, so rows stamped slightly in
     * the future are not dropped).
     */
    private LogFilter windowed(String app, String user, Instant[] w, String to) {
        return new LogFilter()
                .app(toAppFilter(app))
                .user(clean(user))
                .between(Date.from(w[0]), (to != null && !to.isBlank()) ? Date.from(w[1]) : null);
    }

    /**
     * Averaging period (seconds), shared by every row:
     * the window, capped to the age of the oldest log (a young database is not
     * diluted by a range it cannot fill) and to "now", floored at 60 s.
     */
    private long periodSeconds(Instant[] w) {
        Instant start = w[0];
        Instant end   = w[1].isAfter(Instant.now()) ? Instant.now() : w[1];

        List<RequestLog> oldest = repository.findOldest(PageRequest.of(0, 1));
        if (!oldest.isEmpty() && oldest.get(0).getParsed_at() != null) {
            Instant first = oldest.get(0).getParsed_at().toInstant();
            if (first.isAfter(start)) start = first;
        }
        return Math.max(60L, Duration.between(start, end).getSeconds());
    }

    // ── Distinct apps ────────────────────────────────────────────────────
    @GetMapping("/apps")
    public List<String> getApps() {
        return repository.findDistinctApps();
    }

    // ── Logs ─────────────────────────────────────────────────────────────
    // The preset range does not scope this list (unchanged behaviour); a custom
    // from/to does.
    @GetMapping("/logs")
    public PagedResponse<RequestLog> getLogs(
            @RequestParam(required = false) String method,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String app,
            @RequestParam(required = false) String user,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "20") int size) {

        var pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "parsed_at"));

        LogFilter filter = new LogFilter()
                .app(toAppFilter(app))
                .user(clean(user))
                .method(clean(method));

        if (clean(status) != null) {
            int[] range = statusRange(status);
            filter.status(range[0], range[1]);
        }
        if (isCustomRange(from, to)) {
            Instant[] w = window(null, from, to);
            filter.between(Date.from(w[0]), Date.from(w[1]));
        }

        Page<RequestLog> result = repository.search(filter, pageable);
        return new PagedResponse<>(result);
    }

    private int[] statusRange(String group) {
        return switch (group) {
            case "2xx" -> new int[]{200, 300};
            case "4xx" -> new int[]{400, 500};
            case "5xx" -> new int[]{500, 600};
            default    -> new int[]{0, 1000};
        };
    }

    // ── Stats ────────────────────────────────────────────────────────────
    @GetMapping("/stats")
    public AuditStats getStats(
            @RequestParam(required = false) String app,
            @RequestParam(required = false) String user,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(defaultValue = "24h") String timeRange) {

        Instant[] w = window(timeRange, from, to);
        AuditStats stats = repository.getAuditStats(windowed(app, user, w, to));

        // Guard: aggregation returns null when nothing matches
        if (stats == null) {
            stats = new AuditStats();
        }
        return stats;
    }

    // ── Traffic rate per app ─────────────────────────────────────────────
    //
    // All apps share the same period (see periodSeconds). The app filter is NOT
    // applied here so the table keeps listing every app; user + window are.
    //
    // perDayPerIp = average requests/day made by ONE ip of that app
    //             = total / uniqueIps / (period in days)
    @GetMapping("/rates")
    public List<AppRate> getAppRates(
            @RequestParam(defaultValue = "24h") String timeRange,
            @RequestParam(required = false) String user,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {

        Instant[] w = window(timeRange, from, to);
        List<AppRate> rates = repository.getAppRates(windowed(null, user, w, to));
        long period = periodSeconds(w);

        for (AppRate r : rates) {
            r.setPeriodSeconds(period);
            r.setPerMinute(round(r.getTotal() / (period / 60.0),    3));
            r.setPerHour  (round(r.getTotal() / (period / 3600.0),  2));
            r.setPerDay   (round(r.getTotal() / (period / 86400.0), 2));
            r.setPerDayPerIp(r.getUniqueIps() > 0
                    ? round(r.getTotal() / (double) r.getUniqueIps() / (period / 86400.0), 2)
                    : 0);
        }
        return rates;
    }

    private double round(double v, int decimals) {
        double f = Math.pow(10, decimals);
        return Math.round(v * f) / f;
    }

    // ── Top endpoints ────────────────────────────────────────────────────
    // Preset range does not scope this list (unchanged behaviour); a custom from/to does.
    @GetMapping("/endpoints")
    public List<EndpointCount> getTopEndpoints(
            @RequestParam(defaultValue = "8") int limit,
            @RequestParam(required = false) String app,
            @RequestParam(required = false) String user,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {

        LogFilter filter = new LogFilter().app(toAppFilter(app)).user(clean(user));
        if (isCustomRange(from, to)) {
            Instant[] w = window(null, from, to);
            filter.between(Date.from(w[0]), Date.from(w[1]));
        }
        return repository.findTopEndpoints(filter, limit);
    }

    // ── Timeline ─────────────────────────────────────────────────────────
    // Bucket size adapts to the window: <= 3h per minute, <= 7d per hour, else per day.
    @GetMapping("/timeline")
    public List<HourlyCount> getHourlyTimeline(
            @RequestParam(defaultValue = "24h") String timeRange,
            @RequestParam(required = false) String app,
            @RequestParam(required = false) String user,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {

        Instant[] w = window(timeRange, from, to);
        long spanSec = Duration.between(w[0], w[1]).getSeconds();
        String bucket = spanSec <= 3 * 3600L ? "minute"
                      : spanSec <= 7 * 86400L ? "hour"
                      : "day";
        return repository.getTimeline(windowed(app, user, w, to), bucket);
    }

    // ── Top IPs (with avg requests / minute per IP) ──────────────────────
    @GetMapping("/top-ips")
    public List<IpCount> getTopIps(
            @RequestParam(defaultValue = "8")   int limit,
            @RequestParam(defaultValue = "24h") String timeRange,
            @RequestParam(required = false)     String app,
            @RequestParam(required = false)     String user,
            @RequestParam(required = false)     String from,
            @RequestParam(required = false)     String to) {

        Instant[] w = window(timeRange, from, to);
        List<IpCount> ips = repository.findTopIps(windowed(app, user, w, to), limit);
        long period = periodSeconds(w);

        for (IpCount ip : ips) {
            ip.setPerMinute(round(ip.getCount() / (period / 60.0), 3));
        }
        return ips;
    }

    // ── Delete history ───────────────────────────────────────────────────
    @DeleteMapping("/history")
    public ResponseEntity<Map<String, Object>> deleteHistory(
            @RequestParam(defaultValue = "all") String range) {

        long deleted;

        if ("all".equals(range)) {
            long count = repository.count();
            repository.deleteAll();
            deleted = count;
        } else {
            Instant cutoff = switch (range) {
                case "last_day"   -> Instant.now().minus(1,  ChronoUnit.DAYS);
                case "last_week"  -> Instant.now().minus(7,  ChronoUnit.DAYS);
                case "last_month" -> Instant.now().minus(30, ChronoUnit.DAYS);
                default -> throw new IllegalArgumentException("Unknown range: " + range);
            };
            deleted = repository.deleteByParsedAtAfter(Date.from(cutoff));
        }

        return ResponseEntity.ok(Map.of(
                "deleted", deleted,
                "range",   range
        ));
    }
}
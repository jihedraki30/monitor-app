package com.dashboard.web.dashboard_backend;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
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

    // ── Distinct apps ────────────────────────────────────────────────────
    @GetMapping("/apps")
    public List<String> getApps() {
        return repository.findDistinctApps();
    }

    // ── Logs ─────────────────────────────────────────────────────────────
    @GetMapping("/logs")
    public PagedResponse<RequestLog> getLogs(
            @RequestParam(required = false) String method,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String app,
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "20") int size) {

        var pageable  = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "parsed_at"));
        String appFilter = toAppFilter(app);
        boolean hasApp    = appFilter != null;
        boolean hasMethod = method != null && !method.isBlank();
        boolean hasStatus = status != null && !status.isBlank();

        Page<RequestLog> result;

        if (hasApp) {
            if (hasMethod && hasStatus) {
                int[] range = statusRange(status);
                result = repository.findByAppMethodAndStatusRange(appFilter, method, range[0], range[1], pageable);
            } else if (hasMethod) {
                result = repository.findByAppAndMethod(appFilter, method, pageable);
            } else if (hasStatus) {
                int[] range = statusRange(status);
                result = repository.findByAppAndStatusRange(appFilter, range[0], range[1], pageable);
            } else {
                result = repository.findByApp(appFilter, pageable);
            }
        } else if (hasMethod && hasStatus) {
            int[] range = statusRange(status);
            result = repository.findByMethodAndStatusRange(method, range[0], range[1], pageable);
        } else if (hasMethod) {
            result = repository.findByMethod(method, pageable);
        } else if (hasStatus) {
            result = repository.findByStatusGroup(status, pageable);
        } else {
            result = repository.findAllByOrderByParsedAtDesc(pageable);
        }

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
            @RequestParam(defaultValue = "24h") String timeRange) {
        return repository.getAuditStats();
    }

    // ── Top endpoints ────────────────────────────────────────────────────
    @GetMapping("/endpoints")
    public List<EndpointCount> getTopEndpoints(
            @RequestParam(defaultValue = "8") int limit,
            @RequestParam(required = false) String app) {

        String appFilter = toAppFilter(app);
        if (appFilter != null) {
            return repository.findTopEndpointsByApp(limit, appFilter);
        }
        return repository.findTopEndpoints(limit);
    }

    // ── Hourly timeline ──────────────────────────────────────────────────
    @GetMapping("/timeline")
    public List<HourlyCount> getHourlyTimeline(
            @RequestParam(defaultValue = "24h") String timeRange,
            @RequestParam(required = false) String app) {

        int hours = toHours(timeRange);
        String appFilter = toAppFilter(app);
        if (appFilter != null) {
            return repository.getHourlyTimelineByApp(hours, appFilter);
        }
        return repository.getHourlyTimeline(hours);
    }

    // ── Delete history ───────────────────────────────────────────────────
    // range values: "last_day" | "last_week" | "last_month" | "all"
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
            deleted = repository.deleteByParsedAtAfter(java.util.Date.from(cutoff));
        }

        return ResponseEntity.ok(Map.of(
                "deleted", deleted,
                "range",   range
        ));
    }
}
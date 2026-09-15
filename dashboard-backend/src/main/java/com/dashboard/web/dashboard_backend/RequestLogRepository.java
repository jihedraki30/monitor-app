package com.dashboard.web.dashboard_backend;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.Aggregation;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;

import java.util.Date;
import java.util.List;

public interface RequestLogRepository extends MongoRepository<RequestLog, String> {

    // ── Paginated log queries ────────────────────────────────────────────

    @Query(value = "{}", sort = "{ 'parsed_at' : -1 }")
    Page<RequestLog> findAllByOrderByParsedAtDesc(Pageable pageable);

    @Query("{'status': {$gte: ?0, $lt: ?1}}")
    Page<RequestLog> findByStatusRange(int minStatus, int maxStatus, Pageable pageable);

    // ── Method filter variants ───────────────────────────────────────────

    Page<RequestLog> findByMethod(String method, Pageable pageable);

    @Query("{'method': ?0, 'status': {$gte: ?1, $lt: ?2}}")
    Page<RequestLog> findByMethodAndStatusRange(String method, int minStatus, int maxStatus, Pageable pageable);

    // ── App filter variants ──────────────────────────────────────────────

    @Query("{'app': ?0}")
    Page<RequestLog> findByApp(String app, Pageable pageable);

    @Query("{'app': ?0, 'method': ?1}")
    Page<RequestLog> findByAppAndMethod(String app, String method, Pageable pageable);

    @Query("{'app': ?0, 'status': {$gte: ?1, $lt: ?2}}")
    Page<RequestLog> findByAppAndStatusRange(String app, int minStatus, int maxStatus, Pageable pageable);

    @Query("{'app': ?0, 'method': ?1, 'status': {$gte: ?2, $lt: ?3}}")
    Page<RequestLog> findByAppMethodAndStatusRange(String app, String method, int minStatus, int maxStatus, Pageable pageable);

    // ── Status group helpers ─────────────────────────────────────────────

    default Page<RequestLog> findByStatusGroup(String group, Pageable pageable) {
        return switch (group) {
            case "2xx" -> findByStatusRange(200, 300, pageable);
            case "4xx" -> findByStatusRange(400, 500, pageable);
            case "5xx" -> findByStatusRange(500, 600, pageable);
            default    -> findAll(pageable);
        };
    }

    default Page<RequestLog> findByMethodAndStatusGroup(String method, String group, Pageable pageable) {
        return switch (group) {
            case "2xx" -> findByMethodAndStatusRange(method, 200, 300, pageable);
            case "4xx" -> findByMethodAndStatusRange(method, 400, 500, pageable);
            case "5xx" -> findByMethodAndStatusRange(method, 500, 600, pageable);
            default    -> findByMethod(method, pageable);
        };
    }

    // ── Delete by date range ─────────────────────────────────────────────
    // Deletes all docs where parsed_at >= cutoff (i.e. "within last N days")
    @Query(value = "{ 'parsed_at': { $gte: ?0 } }", delete = true)
    long deleteByParsedAtAfter(Date cutoff);

    // ── Stats aggregation ────────────────────────────────────────────────

    @Aggregation(pipeline = {
        "{ $group: { _id: null, " +
        "  total:          { $sum: 1 }, " +
        "  withJwt:        { $sum: { $cond: ['$has_token', 1, 0] } }, " +
        "  errors:         { $sum: { $cond: [{ $gte: ['$status', 400] }, 1, 0] } }, " +
        "  uniqueUsers:    { $addToSet: '$user_email' }, " +
        "  avgResponseSec: { $avg: '$request_time' } } }",

        "{ $project: { _id: 0, total: 1, withJwt: 1, " +
        "  anonymous:      { $subtract: ['$total', '$withJwt'] }, " +
        "  errors:         1, " +
        "  uniqueUsers:    { $size: '$uniqueUsers' }, " +
        "  avgResponseMs:  { $round: [{ $multiply: ['$avgResponseSec', 1000] }, 1] } } }"
    })
    AuditStats getAuditStats();

    // ── Distinct apps ────────────────────────────────────────────────────

    @Aggregation(pipeline = {
        "{ $match:   { app: { $ne: null, $exists: true } } }",
        "{ $group:   { _id: '$app' } }",
        "{ $sort:    { _id: 1 } }",
        "{ $project: { _id: 1 } }"
    })
    List<String> findDistinctApps();

    // ── Top endpoints ────────────────────────────────────────────────────

    @Aggregation(pipeline = {
        "{ $group: { _id: '$uri', count: { $sum: 1 } } }",
        "{ $sort:  { count: -1 } }",
        "{ $limit: ?0 }",
        "{ $project: { _id: 0, uri: '$_id', count: 1 } }"
    })
    List<EndpointCount> findTopEndpoints(int limit);

    @Aggregation(pipeline = {
        "{ $match: { app: ?1 } }",
        "{ $group: { _id: '$uri', count: { $sum: 1 } } }",
        "{ $sort:  { count: -1 } }",
        "{ $limit: ?0 }",
        "{ $project: { _id: 0, uri: '$_id', count: 1 } }"
    })
    List<EndpointCount> findTopEndpointsByApp(int limit, String app);

    // ── Hourly timeline ──────────────────────────────────────────────────

    @Aggregation(pipeline = {
        "{ $match: { $expr: { $gte: [ '$parsed_at', { $dateSubtract: { startDate: '$$NOW', unit: 'hour', amount: ?0 } } ] } } }",
        "{ $group: { _id: { $dateToString: { format: '%Y-%m-%d %H:00', date: '$parsed_at' } }, count: { $sum: 1 } } }",
        "{ $sort: { _id: 1 } }",
        "{ $project: { _id: 0, hour: '$_id', count: 1 } }"
    })
    List<HourlyCount> getHourlyTimeline(int hours);

    @Aggregation(pipeline = {
        "{ $match: { $expr: { $gte: [ '$parsed_at', { $dateSubtract: { startDate: '$$NOW', unit: 'hour', amount: ?0 } } ] }, app: ?1 } }",
        "{ $group: { _id: { $dateToString: { format: '%Y-%m-%d %H:00', date: '$parsed_at' } }, count: { $sum: 1 } } }",
        "{ $sort: { _id: 1 } }",
        "{ $project: { _id: 0, hour: '$_id', count: 1 } }"
    })
    List<HourlyCount> getHourlyTimelineByApp(int hours, String app);
}
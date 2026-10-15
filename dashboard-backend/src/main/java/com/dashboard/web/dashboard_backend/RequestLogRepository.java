package com.dashboard.web.dashboard_backend;

import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.Aggregation;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;

import java.util.Date;
import java.util.List;

/**
 * Filtered queries (logs, stats, endpoints, timeline, top IPs, rates) now live in
 * RequestLogRepositoryCustom / RequestLogRepositoryCustomImpl so that app, user,
 * method, status and date-time range can be combined freely.
 */
public interface RequestLogRepository extends MongoRepository<RequestLog, String>, RequestLogRepositoryCustom {

    // ── Delete by date range ─────────────────────────────────────────────
    // Deletes all docs where parsed_at >= cutoff (i.e. "within last N days")
    @Query(value = "{ 'parsed_at': { $gte: ?0 } }", delete = true)
    long deleteByParsedAtAfter(Date cutoff);

    // Oldest log in the collection (use PageRequest.of(0, 1)) — tells the
    // controller how much history really exists, to cap the averaging period.
    @Query(value = "{ 'parsed_at': { $ne: null } }", sort = "{ 'parsed_at' : 1 }", fields = "{ 'parsed_at' : 1 }")
    List<RequestLog> findOldest(Pageable pageable);

    // ── Distinct apps ────────────────────────────────────────────────────

    @Aggregation(pipeline = {
        "{ $match:   { app: { $ne: null, $exists: true } } }",
        "{ $group:   { _id: '$app' } }",
        "{ $sort:    { _id: 1 } }",
        "{ $project: { _id: 0, app: '$_id' } }"
    })
    List<String> findDistinctApps();
}
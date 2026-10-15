package com.dashboard.web.dashboard_backend;

import org.bson.Document;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.Aggregation;
import org.springframework.data.mongodb.core.aggregation.AggregationOperation;
import org.springframework.data.mongodb.core.aggregation.AggregationOptions;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.support.PageableExecutionUtils;

import java.util.ArrayList;
import java.util.List;

import static org.springframework.data.mongodb.core.aggregation.Aggregation.match;

public class RequestLogRepositoryCustomImpl implements RequestLogRepositoryCustom {

    private static final String COLLECTION = "requests";

    private final MongoTemplate mongo;

    public RequestLogRepositoryCustomImpl(MongoTemplate mongo) {
        this.mongo = mongo;
    }

    // ── helpers ──────────────────────────────────────────────────────────

    private static AggregationOperation raw(String json) {
        return ctx -> Document.parse(json);
    }

    private <T> List<T> run(List<AggregationOperation> ops, Class<T> out) {
        Aggregation agg = Aggregation.newAggregation(ops)
                .withOptions(AggregationOptions.builder().allowDiskUse(true).build());
        return mongo.aggregate(agg, COLLECTION, out).getMappedResults();
    }

    private static List<AggregationOperation> pipeline(Criteria match, String... stages) {
        List<AggregationOperation> ops = new ArrayList<>();
        ops.add(match(match));
        for (String s : stages) ops.add(raw(s));
        return ops;
    }

    // ── Logs ─────────────────────────────────────────────────────────────

    @Override
    public Page<RequestLog> search(LogFilter filter, Pageable pageable) {
        Query query = new Query(filter.toCriteria()).with(pageable);
        List<RequestLog> content = mongo.find(query, RequestLog.class);
        return PageableExecutionUtils.getPage(content, pageable,
                () -> mongo.count(Query.of(query).limit(-1).skip(-1), RequestLog.class));
    }

    // ── Stats ────────────────────────────────────────────────────────────

    @Override
    public AuditStats getAuditStats(LogFilter filter) {
        List<AuditStats> r = run(pipeline(filter.toCriteria(),
            "{ $group: { _id: null, " +
            "  total:          { $sum: 1 }, " +
            "  withJwt:        { $sum: { $cond: ['$has_token', 1, 0] } }, " +
            "  errors:         { $sum: { $cond: [{ $gte: ['$status', 400] }, 1, 0] } }, " +
            "  uniqueUsers:    { $addToSet: '$user_email' }, " +
            "  avgResponseSec: { $avg: '$request_time' } } }",
            "{ $project: { _id: 0, total: 1, withJwt: 1, " +
            "  anonymous:     { $subtract: ['$total', '$withJwt'] }, " +
            "  errors:        1, " +
            "  uniqueUsers:   { $size: '$uniqueUsers' }, " +
            "  avgResponseMs: { $round: [{ $multiply: ['$avgResponseSec', 1000] }, 1] } } }"
        ), AuditStats.class);
        return r.isEmpty() ? null : r.get(0);
    }

    // ── Top endpoints ────────────────────────────────────────────────────

    @Override
    public List<EndpointCount> findTopEndpoints(LogFilter filter, int limit) {
        return run(pipeline(filter.toCriteria(),
            "{ $group: { _id: '$uri', count: { $sum: 1 } } }",
            "{ $sort:  { count: -1 } }",
            "{ $limit: " + limit + " }",
            "{ $project: { _id: 0, uri: '$_id', count: 1 } }"
        ), EndpointCount.class);
    }

    // ── Timeline ─────────────────────────────────────────────────────────

    @Override
    public List<HourlyCount> getTimeline(LogFilter filter, String bucket) {
        String format = switch (bucket) {
            case "minute" -> "%Y-%m-%d %H:%M";
            case "day"    -> "%Y-%m-%d";
            default       -> "%Y-%m-%d %H:00";
        };
        return run(pipeline(filter.toCriteria(),
            "{ $group: { _id: { $dateToString: { format: '" + format + "', date: '$parsed_at' } }, count: { $sum: 1 } } }",
            "{ $sort: { _id: 1 } }",
            "{ $project: { _id: 0, hour: '$_id', count: 1 } }"
        ), HourlyCount.class);
    }

    // ── Top IPs ──────────────────────────────────────────────────────────

    @Override
    public List<IpCount> findTopIps(LogFilter filter, int limit) {
        return run(pipeline(filter.toCriteria(Criteria.where("ip").ne(null)),
            "{ $group: { _id: '$ip', count: { $sum: 1 } } }",
            "{ $sort:  { count: -1 } }",
            "{ $limit: " + limit + " }",
            "{ $project: { _id: 0, ip: '$_id', count: 1 } }"
        ), IpCount.class);
    }

    // ── Rates per app (total + distinct IPs) ─────────────────────────────

    @Override
    public List<AppRate> getAppRates(LogFilter filter) {
        return run(pipeline(filter.toCriteria(Criteria.where("app").ne(null)),
            // 1) one row per (app, ip)  — keeps the pipeline small for the distinct-IP count
            "{ $group: { _id: { app: '$app', ip: '$ip' }, n: { $sum: 1 } } }",
            // 2) one row per app
            "{ $group: { _id: '$_id.app', total: { $sum: '$n' }, " +
            "  uniqueIps: { $sum: { $cond: [{ $ne: ['$_id.ip', null] }, 1, 0] } } } }",
            "{ $project: { _id: 0, app: '$_id', total: 1, uniqueIps: 1 } }",
            "{ $sort: { total: -1, app: 1 } }"
        ), AppRate.class);
    }
}
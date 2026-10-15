package com.dashboard.web.dashboard_backend;

import org.springframework.data.mongodb.core.query.Criteria;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Optional filters shared by every audit query. Any field left null is ignored,
 * so one object replaces the old app / method / status query-method combinations.
 */
public class LogFilter {
    private String  app;
    private String  user;        // case-insensitive "contains" on user_email
    private String  method;
    private Integer statusMin;   // inclusive
    private Integer statusMax;   // exclusive
    private Date    from;        // parsed_at >= from (inclusive)
    private Date    to;          // parsed_at <= to   (inclusive)

    public LogFilter app(String v)    { this.app = v;    return this; }
    public LogFilter user(String v)   { this.user = v;   return this; }
    public LogFilter method(String v) { this.method = v; return this; }
    public LogFilter status(int min, int max) { this.statusMin = min; this.statusMax = max; return this; }
    public LogFilter between(Date from, Date to) { this.from = from; this.to = to; return this; }

    public Criteria toCriteria(Criteria... extra) {
        List<Criteria> c = new ArrayList<>();

        if (app != null)    c.add(Criteria.where("app").is(app));
        if (method != null) c.add(Criteria.where("method").is(method));
        if (user != null) {
            c.add(Criteria.where("user_email")
                    .regex(Pattern.compile(Pattern.quote(user), Pattern.CASE_INSENSITIVE)));
        }
        if (statusMin != null) {
            c.add(Criteria.where("status").gte(statusMin).lt(statusMax));
        }
        if (from != null || to != null) {
            Criteria t = Criteria.where("parsed_at");
            if (from != null) t = t.gte(from);
            if (to != null)   t = t.lte(to);
            c.add(t);
        }
        c.addAll(Arrays.asList(extra));

        return c.isEmpty() ? new Criteria() : new Criteria().andOperator(c.toArray(new Criteria[0]));
    }
}
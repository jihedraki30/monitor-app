package com.dashboard.web.dashboard_backend;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;

/** Filter-driven queries (app / user / method / status / date-time window all optional). */
public interface RequestLogRepositoryCustom {

    Page<RequestLog> search(LogFilter filter, Pageable pageable);

    AuditStats getAuditStats(LogFilter filter);

    List<EndpointCount> findTopEndpoints(LogFilter filter, int limit);

    /** bucket = "minute" | "hour" | "day" */
    List<HourlyCount> getTimeline(LogFilter filter, String bucket);

    List<IpCount> findTopIps(LogFilter filter, int limit);

    /** total requests + distinct IPs per app (rates are computed in the controller). */
    List<AppRate> getAppRates(LogFilter filter);
}
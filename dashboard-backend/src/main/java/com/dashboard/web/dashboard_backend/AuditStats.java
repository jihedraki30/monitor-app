package com.dashboard.web.dashboard_backend;

public class AuditStats {
    private long total;
    private long withJwt;
    private long anonymous;
    private long errors;
    private long uniqueUsers;
    private double avgResponseMs;

    // Getters + Setters (or use Lombok)
    public long getTotal() { return total; }
    public void setTotal(long total) { this.total = total; }

    public long getWithJwt() { return withJwt; }
    public void setWithJwt(long withJwt) { this.withJwt = withJwt; }

    public long getAnonymous() { return anonymous; }
    public void setAnonymous(long anonymous) { this.anonymous = anonymous; }

    public long getErrors() { return errors; }
    public void setErrors(long errors) { this.errors = errors; }

    public long getUniqueUsers() { return uniqueUsers; }
    public void setUniqueUsers(long uniqueUsers) { this.uniqueUsers = uniqueUsers; }

    public double getAvgResponseMs() { return avgResponseMs; }
    public void setAvgResponseMs(double avgResponseMs) { this.avgResponseMs = avgResponseMs; }
}
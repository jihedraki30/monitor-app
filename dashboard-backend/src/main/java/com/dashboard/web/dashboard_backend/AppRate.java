package com.dashboard.web.dashboard_backend;

public class AppRate {
    private String app;
    private long   total;       // requests in the selected time range
    private long   periodSeconds; // averaging period, identical for every app (range capped to the age of the data)
    private double perMinute;   // average requests per minute over the range
    private double perHour;     // average requests per hour over the range
    private double perDay;      // average requests per day over the range

    public String getApp()                 { return app; }
    public void setApp(String app)         { this.app = app; }
    public long getTotal()                 { return total; }
    public void setTotal(long total)       { this.total = total; }
    public long getPeriodSeconds()         { return periodSeconds; }
    public void setPeriodSeconds(long v)   { this.periodSeconds = v; }
    public double getPerMinute()           { return perMinute; }
    public void setPerMinute(double v)     { this.perMinute = v; }
    public double getPerHour()             { return perHour; }
    public void setPerHour(double v)       { this.perHour = v; }
    public double getPerDay()              { return perDay; }
    public void setPerDay(double v)        { this.perDay = v; }
}
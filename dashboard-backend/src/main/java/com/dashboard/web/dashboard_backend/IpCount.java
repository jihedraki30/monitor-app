package com.dashboard.web.dashboard_backend;

public class IpCount {
    private String ip;
    private long count;
    private double perMinute;   // average requests per minute from this ip over the averaging period

    public String getIp()          { return ip; }
    public void setIp(String ip)   { this.ip = ip; }
    public long getCount()         { return count; }
    public void setCount(long c)   { this.count = c; }
    public double getPerMinute()   { return perMinute; }
    public void setPerMinute(double v) { this.perMinute = v; }
}
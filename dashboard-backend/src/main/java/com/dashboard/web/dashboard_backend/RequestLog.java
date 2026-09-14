package com.dashboard.web.dashboard_backend;

import java.util.Date;
import java.util.List;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

@Document(collection = "requests")
@CompoundIndex(name = "idx_app", def = "{'app': 1}")
public class RequestLog {

    @Id
    private String id;

    private String time;
    private String ip;
    private String app;
    private String method;
    private String uri;
    private int status;
    @Field("request_time")
    private double request_time;
    private int bytes_sent;
    private String user_email;
    private String role;
    private List<String> all_roles;
    private boolean has_token;
    private String user_agent;

    @Field("parsed_at")   // ← Important mapping
    private Date parsed_at;

    // Getters and Setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getTime() { return time; }
    public void setTime(String time) { this.time = time; }

    public String getIp() { return ip; }
    public void setIp(String ip) { this.ip = ip; }

    public String getApp() { return app; }
    public void setApp(String app) { this.app = app; }

    public String getMethod() { return method; }
    public void setMethod(String method) { this.method = method; }

    public String getUri() { return uri; }
    public void setUri(String uri) { this.uri = uri; }

    public int getStatus() { return status; }
    public void setStatus(int status) { this.status = status; }

    public double getRequest_time() { return request_time; }
    public void setRequest_time(double request_time) { this.request_time = request_time; }

    public int getBytes_sent() { return bytes_sent; }
    public void setBytes_sent(int bytes_sent) { this.bytes_sent = bytes_sent; }

    public String getUser_email() { return user_email; }
    public void setUser_email(String user_email) { this.user_email = user_email; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public List<String> getAll_roles() { return all_roles; }
    public void setAll_roles(List<String> all_roles) { this.all_roles = all_roles; }

    public boolean isHas_token() { return has_token; }
    public void setHas_token(boolean has_token) { this.has_token = has_token; }

    public String getUser_agent() { return user_agent; }
    public void setUser_agent(String user_agent) { this.user_agent = user_agent; }

    public Date getParsed_at() { return parsed_at; }
    public void setParsed_at(Date parsed_at) { this.parsed_at = parsed_at; }
}
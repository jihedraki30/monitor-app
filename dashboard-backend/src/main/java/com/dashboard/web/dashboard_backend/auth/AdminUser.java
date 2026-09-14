package com.dashboard.web.dashboard_backend.auth;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * Persisted admin account.  Only one record is expected (single-admin design).
 */
@Document(collection = "admin_users")
public class AdminUser {

    @Id
    private String id;

    @Indexed(unique = true)
    private String username;

    /** BCrypt-hashed password */
    private String passwordHash;

    public AdminUser() {}

    public AdminUser(String username, String passwordHash) {
        this.username     = username;
        this.passwordHash = passwordHash;
    }

    // ── Getters / Setters ──────────────────────────────────────────────────

    public String getId()           { return id; }
    public void   setId(String id)  { this.id = id; }

    public String getUsername()                  { return username; }
    public void   setUsername(String username)   { this.username = username; }

    public String getPasswordHash()                       { return passwordHash; }
    public void   setPasswordHash(String passwordHash)    { this.passwordHash = passwordHash; }
}
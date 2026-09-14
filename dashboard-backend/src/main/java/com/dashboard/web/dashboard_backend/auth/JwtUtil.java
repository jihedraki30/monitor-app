package com.dashboard.web.dashboard_backend.auth;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

@Component
public class JwtUtil {

    private final SecretKey key;
    private final long      expirationMs;

    public JwtUtil(
            @Value("${app.jwt.secret}")         String secret,
            @Value("${app.jwt.expiration-ms}")  long   expirationMs) {

        // Derive a proper HMAC key from the config string
        this.key          = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMs = expirationMs;
    }

    /** Create a signed JWT for the given username. */
    public String generate(String username) {
        return Jwts.builder()
                .subject(username)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + expirationMs))
                .signWith(key)
                .compact();
    }

    /** Extract username from a valid token (throws if invalid/expired). */
    public String extractUsername(String token) {
        return parseClaims(token).getPayload().getSubject();
    }

    /** Returns true if the token parses correctly and is not expired. */
    public boolean isValid(String token) {
        try {
            parseClaims(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }

    private Jws<Claims> parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token);
    }
}
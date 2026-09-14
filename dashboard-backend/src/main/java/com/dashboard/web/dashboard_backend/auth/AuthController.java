package com.dashboard.web.dashboard_backend.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AdminUserRepository adminRepo;
    private final PasswordEncoder     encoder;
    private final JwtUtil             jwtUtil;

    @Value("${app.admin.username:admin}")
    private String bootstrapUsername;

    @Value("${app.admin.password:Admin@1234}")
    private String bootstrapPassword;

    public AuthController(AdminUserRepository adminRepo,
                          PasswordEncoder encoder,
                          JwtUtil jwtUtil) {
        this.adminRepo = adminRepo;
        this.encoder   = encoder;
        this.jwtUtil   = jwtUtil;
    }

    /**
     * On first startup: seed the admin account if no admin exists yet.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void seedAdmin() {
        if (adminRepo.count() == 0) {
            adminRepo.save(new AdminUser(
                    bootstrapUsername,
                    encoder.encode(bootstrapPassword)));
            System.out.println("[Auth] Bootstrap admin created: " + bootstrapUsername);
        }
    }

    // ── POST /api/auth/login ──────────────────────────────────────────────
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest req) {
        return adminRepo.findByUsername(req.username())
                .filter(admin -> encoder.matches(req.password(), admin.getPasswordHash()))
                .map(admin -> ResponseEntity.ok(Map.of(
                        "token",    jwtUtil.generate(admin.getUsername()),
                        "username", admin.getUsername())))
                .orElse(ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "Invalid credentials")));
    }

    // ── POST /api/auth/change-password  (requires valid JWT) ─────────────
    @PostMapping("/change-password")
    public ResponseEntity<?> changePassword(
            @AuthenticationPrincipal String username,
            @RequestBody ChangePasswordRequest req) {

        if (!req.newPassword().equals(req.confirmPassword())) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Passwords do not match"));
        }

        if (req.newPassword().length() < 8) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Password must be at least 8 characters"));
        }

        return adminRepo.findByUsername(username)
                .map(admin -> {
                    if (!encoder.matches(req.currentPassword(), admin.getPasswordHash())) {
                        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                                .body(Map.of("error", "Current password is incorrect"));
                    }
                    admin.setPasswordHash(encoder.encode(req.newPassword()));
                    adminRepo.save(admin);
                    return ResponseEntity.ok(Map.of("message", "Password updated successfully"));
                })
                .orElse(ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("error", "Admin user not found")));
    }

    // ── GET /api/auth/me  (verify token + return username) ───────────────
    @GetMapping("/me")
    public ResponseEntity<?> me(@AuthenticationPrincipal String username) {
        return ResponseEntity.ok(Map.of("username", username));
    }

    // ── Records (Java 16+) used as request DTOs ───────────────────────────
    public record LoginRequest(String username, String password) {}
    public record ChangePasswordRequest(
            String currentPassword,
            String newPassword,
            String confirmPassword) {}
}
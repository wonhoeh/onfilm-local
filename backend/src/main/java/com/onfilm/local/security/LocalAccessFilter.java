package com.onfilm.local.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class LocalAccessFilter extends OncePerRequestFilter {
    private final byte[] token;

    public LocalAccessFilter(@Value("${onfilm.token}") String token) {
        if (token.length() < 32) throw new IllegalArgumentException("Local access token is required (32+ characters)");
        this.token = token.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("X-Frame-Options", "DENY");
        response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; "
                + "connect-src 'self'; img-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
        String expectedHost = "127.0.0.1:" + request.getLocalPort();
        String origin = request.getHeader("Origin");
        String supplied = request.getHeader("X-Onfilm-Token");
        boolean allowed = expectedHost.equals(request.getHeader("Host"))
                && (origin == null || origin.equals("http://" + expectedHost))
                && !"cross-site".equals(request.getHeader("Sec-Fetch-Site"))
                && supplied != null && MessageDigest.isEqual(token, supplied.getBytes(StandardCharsets.UTF_8));
        if (!allowed) {
            response.setStatus(403);
            response.setContentType("application/json");
            response.getWriter().write("{\"message\":\"Local app access only\"}");
            return;
        }
        chain.doFilter(request, response);
    }
}

package com.onfilm.local.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.*;

class LocalAccessFilterTest {
    private static final String TOKEN = "test".repeat(16);

    MockHttpServletRequest request() {
        var req = new MockHttpServletRequest("GET", "/api/profile");
        req.setLocalPort(18765);
        req.addHeader("Host", "127.0.0.1:18765");
        req.addHeader("X-Onfilm-Token", TOKEN);
        return req;
    }

    boolean allowed(MockHttpServletRequest req) throws Exception {
        var passed = new AtomicBoolean();
        var res = new MockHttpServletResponse();
        new LocalAccessFilter(TOKEN).doFilter(req, res, (a,b) -> passed.set(true));
        if (!passed.get()) assertThat(res.getStatus()).isEqualTo(403);
        assertThat(res.getHeader("Content-Security-Policy")).contains("frame-ancestors 'none'");
        return passed.get();
    }

    @Test void acceptsOwnApp() throws Exception {
        var req = request(); req.addHeader("Origin", "http://127.0.0.1:18765");
        assertThat(allowed(req)).isTrue();
        assertThat(allowed(request())).isTrue();
    }
    @Test void rejectsMissingAndWrongTokens() throws Exception {
        var req = request(); req.removeHeader("X-Onfilm-Token");
        assertThat(allowed(req)).isFalse();
        req.addHeader("X-Onfilm-Token", "wrong"); assertThat(allowed(req)).isFalse();
    }
    @Test void rejectsForeignOriginAndHostEvenWithToken() throws Exception {
        var req = request(); req.addHeader("Origin", "https://evil.example");
        assertThat(allowed(req)).isFalse();
        req = request(); req.removeHeader("Host"); req.addHeader("Host", "evil.example:18765");
        assertThat(allowed(req)).isFalse();
        req = request(); req.addHeader("Sec-Fetch-Site", "cross-site");
        assertThat(allowed(req)).isFalse();
    }
}

package com.onfilm.local.profile;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Optional public email. Legacy phone/privacy columns are retained but never exposed. */
public record ProfileContact(String email) {
    public ProfileContact {
        email=email==null?"":email.strip();
        if(email.length()>254 || (!email.isEmpty()&&!email.matches("[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)+")))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"올바른 이메일을 입력해 주세요.");
    }
}

package com.onfilm.local.notification;

import com.onfilm.local.profile.LocalPersistenceTest;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.*;

class NotificationPersistenceTest extends LocalPersistenceTest {
    @Test void latestFirstAndReadBoundarySurviveRestart(){
        long first;
        try(var ctx=start()){
            var jdbc=ctx.getBean(JdbcTemplate.class);
            jdbc.update("INSERT INTO app_notification(job_id,message) VALUES ('one','첫 번째 완료')");
            var notices=ctx.getBean(NotificationController.class);
            first=notices.list().items().get(0).id();
            jdbc.update("INSERT INTO app_notification(job_id,message) VALUES ('two','두 번째 완료')");
            assertThat(notices.list().items()).extracting(NotificationController.Notice::message).containsExactly("두 번째 완료","첫 번째 완료");
            notices.read(new NotificationController.ReadRequest(first));
            assertThat(notices.list().unread()).isEqualTo(1);
        }
        try(var ctx=start()){
            var notices=ctx.getBean(NotificationController.class);
            assertThat(notices.list().items()).hasSize(2);
            assertThat(notices.list().items().get(1).read()).isTrue();
            assertThat(notices.list().items().get(0).read()).isFalse();
            notices.read(new NotificationController.ReadRequest(notices.list().items().get(0).id()));
            notices.read(new NotificationController.ReadRequest(notices.list().items().get(0).id()));
            assertThat(notices.list().unread()).isZero();
        }
    }
}

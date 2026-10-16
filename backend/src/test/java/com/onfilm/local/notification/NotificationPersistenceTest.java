package com.onfilm.local.notification;

import com.onfilm.local.profile.LocalPersistenceTest;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.*;

class NotificationPersistenceTest extends LocalPersistenceTest {
    @Test void individualReadAndClearPersistWithoutChangingMedia(){
        try(var context=start()){
            var jdbc=context.getBean(JdbcTemplate.class);
            jdbc.update("INSERT INTO app_notification(job_id,message) VALUES ('notice-a','첫 알림'),('notice-b','둘째 알림')");
            var controller=context.getBean(NotificationController.class);var inbox=controller.list();
            assertThat(inbox.unread()).isEqualTo(2);
            controller.readOne(inbox.items().get(0).id());
            assertThat(controller.list().unread()).isEqualTo(1);
            assertThat(controller.list().items().get(0).read()).isTrue();
            assertThat(controller.list().items().get(1).read()).isFalse();
        }
        try(var context=start()){
            var controller=context.getBean(NotificationController.class);assertThat(controller.list().unread()).isEqualTo(1);
            controller.clear();controller.clear();assertThat(controller.list().items()).isEmpty();
        }
        try(var context=start()){assertThat(context.getBean(NotificationController.class).list().items()).isEmpty();}
    }
}

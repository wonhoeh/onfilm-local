package com.onfilm.local.profile;

import com.onfilm.local.export.PortfolioExportService;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class ProfileMeasurementsTest extends LocalPersistenceTest {
    private ProfileController.Update request(long version,String height,String weight){
        return new ProfileController.Update("배우","첫 줄\n둘째 줄",version,null,"서울",null,null,null,null,
                height==null?null:new BigDecimal(height),weight==null?null:new BigDecimal(weight));
    }
    @Test void measurementsPersistExportValidateAndClear()throws Exception {
        try(var context=start()){
            var controller=context.getBean(ProfileController.class);
            var validator=context.getBean(jakarta.validation.Validator.class);
            assertThat(validator.validate(request(0,"-1","60"))).isNotEmpty();
            assertThat(validator.validate(request(0,"175.55","60"))).isNotEmpty();
            assertThat(validator.validate(request(0,"175","501"))).isNotEmpty();
            assertThat(validator.validate(request(0,null,null))).isEmpty();
            controller.update(request(0,"175.5","65"));
            var exports=context.getBean(PortfolioExportService.class);var result=exports.create();
            var json=context.getBean(com.fasterxml.jackson.databind.ObjectMapper.class).readTree(exports.resource(result.id(),"portfolio.json").toFile());
            assertThat(json.at("/profile/heightCm").decimalValue()).isEqualByComparingTo("175.5");
            assertThat(json.at("/profile/weightKg").decimalValue()).isEqualByComparingTo("65");
        }
        try(var context=start()){
            var controller=context.getBean(ProfileController.class);
            assertThat(controller.get().heightCm()).isEqualByComparingTo("175.5");
            assertThat(controller.get().weightKg()).isEqualByComparingTo("65");
            controller.update(request(1,null,null));
        }
        try(var context=start()){
            assertThat(context.getBean(ProfileController.class).get().heightCm()).isNull();
            assertThat(context.getBean(ProfileController.class).get().weightKg()).isNull();
        }
    }
}

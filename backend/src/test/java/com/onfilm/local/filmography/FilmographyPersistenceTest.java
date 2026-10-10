package com.onfilm.local.filmography;

import com.onfilm.local.profile.LocalPersistenceTest;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;

class FilmographyPersistenceTest extends LocalPersistenceTest {
    private FilmographyController.Item item(String id,String title) {
        return new FilmographyController.Item(id,title,2026,90,"ALL",List.of("ACTOR","DIRECTOR"),List.of("드라마"),"LEAD","주인공");
    }
    @Test void createEditOrderDeleteAndRestart() {
        String first,second;
        try(var context=start()) {
            var api=context.getBean(FilmographyController.class);
            var saved=api.update(new FilmographyController.Update(0,List.of(item(null,"첫 작품"),item(null,"두 번째"))));
            first=saved.items().get(0).id();second=saved.items().get(1).id();
            api.update(new FilmographyController.Update(1,List.of(item(second,"수정 작품"),item(first,"첫 작품"))));
            assertThatThrownBy(()->api.update(new FilmographyController.Update(1,List.of()))).isInstanceOf(ResponseStatusException.class);
            assertThatThrownBy(()->api.update(new FilmographyController.Update(2,List.of(item(second,"중복"),item(second,"중복"))))).isInstanceOf(ResponseStatusException.class);
            assertThatThrownBy(()->api.update(new FilmographyController.Update(2,List.of(item("unknown","잘못된 ID"))))).isInstanceOf(ResponseStatusException.class);
            assertThatThrownBy(()->api.update(new FilmographyController.Update(2,List.of(item(null," "))))).isInstanceOf(ResponseStatusException.class);
            assertThat(api.get().version()).isEqualTo(2);
            assertThat(api.get().items()).extracting(FilmographyController.Item::title).containsExactly("수정 작품","첫 작품");
        }
        try(var context=start()) {
            var api=context.getBean(FilmographyController.class);
            assertThat(api.get().items()).extracting(FilmographyController.Item::id).containsExactly(second,first);
            assertThat(api.get().items().get(0).roles()).containsExactly("ACTOR","DIRECTOR");
            assertThat(api.get().items().get(0).genres()).containsExactly("드라마");
            api.update(new FilmographyController.Update(2,List.of(item(first,"남긴 작품"))));
        }
        try(var context=start()) {
            var api=context.getBean(FilmographyController.class);
            assertThat(api.get().items()).extracting(FilmographyController.Item::title).containsExactly("남긴 작품");
            api.update(new FilmographyController.Update(3,List.of()));
            assertThat(api.get().items()).isEmpty();
        }
    }
    @Test void invalidFieldsAndPartialWritesRollBack() {
        try(var context=start()) {
            var api=context.getBean(FilmographyController.class);
            var tooManyGenres=new FilmographyController.Item(null,"장르 초과",2026,1,"ALL",List.of(),List.of("액션","드라마","스릴러","코미디"),"","");
            assertThatThrownBy(()->api.update(new FilmographyController.Update(0,List.of(tooManyGenres)))).isInstanceOf(ResponseStatusException.class);
            assertThat(api.get().version()).isZero();
            var invalid=new FilmographyController.Item(null,"잘못된 작품",2026,1,"ALL",List.of("DIRECTOR"),List.of("드라마"),"LEAD","배역");
            assertThatThrownBy(()->api.update(new FilmographyController.Update(0,List.of(item(null,"먼저 추가"),invalid)))).isInstanceOf(ResponseStatusException.class);
            assertThat(api.get().version()).isZero();assertThat(api.get().items()).isEmpty();
            var badYear=new FilmographyController.Item(null,"작품",9999,1,"ALL",List.of(),List.of(),"","");
            assertThatThrownBy(()->api.update(new FilmographyController.Update(0,List.of(badYear)))).isInstanceOf(ResponseStatusException.class);
            assertThatThrownBy(()->api.update(new FilmographyController.Update(0,java.util.Collections.nCopies(51,item(null,"작품"))))).isInstanceOf(ResponseStatusException.class);
        }
    }
}

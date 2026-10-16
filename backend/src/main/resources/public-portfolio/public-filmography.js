(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  let busy=false;
  async function load(){
    if(busy)return;busy=true;window.OnfilmPreview?.close();
    $('retryFilms').hidden=true;$('filmGroups').hidden=true;$('filmsStatus').textContent='필모그래피를 불러오는 중입니다.';
    for(const group of ['video','directing','lead','supporting','experience'])$(group+'Films').replaceChildren();
    try{
      const response=await fetch('portfolio.json');if(!response.ok)throw new Error();const data=await response.json();
      document.title=data.profile.name+' · 필모그래피 · OnFilm';
      for(const film of data.films){const group={ACTING:'video',DIRECTING:'directing',LEAD:'lead',SUPPORTING:'supporting',MINOR:'experience'}[film.category]||'video';$(group+'Films').append(window.createPublicFilmCard(film,true));}
      for(const group of ['video','directing','lead','supporting','experience']){const count=$(group+'Films').children.length;$(group+'Count').textContent=count+'편';$(group+'Empty').hidden=true;$(group+'Films').closest('section').hidden=count===0;}
      $('filmGroups').hidden=false;$('filmsStatus').textContent=data.films.length?'':'등록된 작품이 없습니다.';
    }catch{$('filmsStatus').textContent='필모그래피를 불러오지 못했습니다.';$('retryFilms').hidden=false;}
    finally{busy=false;}
  }
  $('retryFilms').onclick=load;void load();
})();

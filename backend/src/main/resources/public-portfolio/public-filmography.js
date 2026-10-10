(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  let busy=false;
  $('detailsClose').onclick=()=>$('details').close();
  async function load(){
    if(busy)return;busy=true;window.OnfilmPreview?.close();
    $('retryFilms').hidden=true;$('filmGroups').hidden=true;$('filmsStatus').textContent='필모그래피를 불러오는 중입니다.';
    $('videoFilms').replaceChildren();$('experienceFilms').replaceChildren();
    try{
      const response=await fetch('portfolio.json');if(!response.ok)throw new Error();const data=await response.json();
      document.title=data.profile.name+' · 필모그래피 · OnFilm';
      for(const film of data.films)$(film.manifestUrl?'videoFilms':'experienceFilms').append(window.createPublicFilmCard(film,true));
      for(const group of ['video','experience']){const count=$(group+'Films').children.length;$(group+'Count').textContent=count+'편';$(group+'Empty').hidden=count>0;}
      $('filmGroups').hidden=false;$('filmsStatus').textContent='';
    }catch{$('filmsStatus').textContent='필모그래피를 불러오지 못했습니다.';$('retryFilms').hidden=false;}
    finally{busy=false;}
  }
  $('retryFilms').onclick=load;void load();
})();

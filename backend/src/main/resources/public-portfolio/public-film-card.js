(() => {
  'use strict';
  const roles={ACTOR:'배우',DIRECTOR:'감독',WRITER:'작가'};
  const casts={LEAD:'주연',SUPPORTING:'조연',CAMEO:'단역'};
  const ages={ALL:'전체 관람가',AGE_12:'12세 이상',AGE_15:'15세 이상',AGE_18:'청소년 관람불가'};
  const node=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  window.createPublicFilmCard=(film,fromFilmography=false)=>{
    const participation=[film.year,...film.roles.flatMap(role=>role==='ACTOR'?[roles[role],casts[film.castType],film.characterName?.trim()]:[roles[role]])].filter(Boolean).join(' · ');
    const card=node(film.manifestUrl?'a':'article','film-card');
    if(film.manifestUrl)card.href='video-player.html?videoId='+encodeURIComponent(film.id)+(fromFilmography?'&from=filmography':'');
    else {
      card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',film.title+' 상세 정보');
      card.onclick=()=>{
        document.getElementById('detailsTitle').textContent=film.title;
        document.getElementById('detailsText').textContent=[participation,film.genres.join(' · '),film.runtime?film.runtime+'분':'',ages[film.ageRating]].filter(Boolean).join('\n')||'등록된 참여 정보가 없습니다.';
        document.getElementById('details').showModal();
      };
      card.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();card.click();}};
    }
    const frame=node('div','film-poster-frame'),image=node('img','film-poster');
    image.loading='lazy';image.decoding='async';image.src=film.thumbnail;image.alt='';frame.append(image);
    const body=node('div','film-body');body.append(node('div','film-title',film.title),node('div','film-meta',participation));card.append(frame,body);
    card.addEventListener('click',()=>window.OnfilmPreview?.close());
    window.OnfilmPreview?.bind(card,{title:film.title,genres:film.genres,runtime:film.runtime,age:ages[film.ageRating]||'',thumbnail:film.thumbnail,trailerUrl:film.trailerUrl,canPlay:!!film.manifestUrl,participation:film.manifestUrl?'':participation,play:()=>card.click()});
    return card;
  };
})();

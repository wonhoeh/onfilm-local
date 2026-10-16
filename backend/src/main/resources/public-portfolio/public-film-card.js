(() => {
  'use strict';
  const roles={ACTOR:'배우',DIRECTOR:'감독',WRITER:'작가'};
  const casts={LEAD:'주연',SUPPORTING:'조연',CAMEO:'단역'};
  const ages={ALL:'전체 관람가',AGE_12:'12세 이상',AGE_15:'15세 이상',AGE_18:'청소년 관람불가'};
  const node=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  const dialog=document.getElementById('details');
  let stopTrailer=()=>{};
  dialog.addEventListener('close',()=>{stopTrailer();stopTrailer=()=>{};});
  window.addEventListener('pagehide',()=>stopTrailer());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopTrailer();});
  let outsideStart=false;
  const outside=event=>{const r=dialog.getBoundingClientRect();return event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom;};
  dialog.addEventListener('pointerdown',event=>{outsideStart=event.target===dialog&&outside(event);});
  dialog.addEventListener('pointercancel',()=>{outsideStart=false;});
  dialog.addEventListener('click',event=>{if(outsideStart&&event.target===dialog&&outside(event))dialog.close();outsideStart=false;});
  window.createPublicFilmCard=(film,fromFilmography=false)=>{
    const participation=[film.year,...film.roles.flatMap(role=>role==='ACTOR'?[roles[role],casts[film.castType],film.characterName?.trim()]:[roles[role]])].filter(Boolean).join(' · ');
    const card=node(film.manifestUrl?'a':'article','film-card');
    card.setAttribute('aria-label',film.title+' 상세 정보');
    const touchLayout=()=>matchMedia('(max-width: 760px), (hover: none)').matches;
    function details(){
      stopTrailer();
      window.OnfilmPreview?.close();
      const dialog=document.getElementById('details');
      dialog.replaceChildren();
      const info=node('div','popup-info'),title=node('h2','popup-title',film.title);title.id='detailsTitle';
      const meta=node('div','popup-meta',[film.genres.join(' · '),film.runtime?film.runtime+'분':''].filter(Boolean).join(' · '));
      if(ages[film.ageRating])meta.append(node('span','popup-age',ages[film.ageRating]));
      const credits=node('div','popup-participation',participation);credits.id='detailsText';credits.hidden=!participation;
      info.append(title,meta,credits);
      const image=node('img','details-thumbnail');image.src=film.thumbnail;image.alt=film.title+' 섬네일';
      const position=film.thumbnailPosition||{x:50,y:50};image.style.objectPosition=`${position.x}% ${position.y}%`;dialog.prepend(image);
      if(film.manifestUrl){
        const play=node('a','details-play');play.href=card.href;play.setAttribute('aria-label',film.title+' 영상 재생');play.title='영상 재생';
        play.innerHTML='<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M8 4.5v15l12-7.5z"/></svg>';const actions=node('div','popup-action-row');actions.append(play);info.append(actions);
      }
      dialog.append(info);
      if(!dialog.open)dialog.showModal();
      stopTrailer=window.OnfilmPreview?.mountTrailer(image,{trailerUrl:film.trailerUrl,thumbnail:film.thumbnail,thumbnailPosition:film.thumbnailPosition})||(()=>{});
    }
    if(film.manifestUrl)card.href='video-player.html?videoId='+encodeURIComponent(film.id)+(fromFilmography?'&from=filmography':'');
    else {
      card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',film.title+' 상세 정보');
      card.onclick=details;
      card.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();card.click();}};
    }
    const frame=node('div','film-poster-frame'),image=node('img','film-poster');
    image.loading='lazy';image.decoding='async';image.src=film.thumbnail;image.alt='';frame.append(image);
    const thumbnailPosition=film.thumbnailPosition||{x:50,y:50};image.style.objectPosition=`${thumbnailPosition.x}% ${thumbnailPosition.y}%`;
    const mobilePosition=film.mobileThumbnailPosition||{x:50,y:50};image.style.setProperty('--mobile-thumbnail-position',`${mobilePosition.x}% ${mobilePosition.y}%`);
    const body=node('div','film-body');body.append(node('div','film-title',film.title),node('div','film-meta',participation));card.append(frame,body);
    card.addEventListener('click',()=>window.OnfilmPreview?.close());
    card.addEventListener('click',event=>{if(touchLayout()){event.preventDefault();event.stopImmediatePropagation();details();}},true);
    window.OnfilmPreview?.bind(card,{touchDetails:true,title:film.title,genres:film.genres,runtime:film.runtime,age:ages[film.ageRating]||'',thumbnail:film.thumbnail,thumbnailPosition,trailerUrl:film.trailerUrl,canPlay:!!film.manifestUrl,participation,play:()=>card.click()});
    return card;
  };
})();

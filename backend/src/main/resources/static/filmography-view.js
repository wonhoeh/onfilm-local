(() => {
  const $=id=>document.getElementById(id);
  const roles={ACTOR:'배우',DIRECTOR:'감독',WRITER:'작가'};
  const casts={LEAD:'주연',SUPPORTING:'조연',CAMEO:'단역'};
  const ages={ALL:'전체 관람가',AGE_12:'12세 이상',AGE_15:'15세 이상',AGE_18:'청소년 관람불가'};
  let busy=false;
  function details(title,text){$('detailsTitle').textContent=title;$('detailsText').textContent=text;$('filmDetails').showModal();}
  $('closeDetails').addEventListener('click',()=>$('filmDetails').close());
  function cardFor(item,films){
    const video=films.videos?.find(v=>v.filmId===item.id);
    const participation=[item.year,...item.roles.flatMap(role=>role==='ACTOR'?[roles[role],casts[item.castType],item.characterName?.trim()]:[roles[role]])].filter(Boolean).join(' · ');
    const card=document.createElement('article');card.className='film-card';card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',item.title+' 상세 정보');
    const frame=document.createElement('div');frame.className='film-poster-frame';
    const image=document.createElement('img');image.className='film-poster';image.alt='';image.loading='lazy';
    image.src=films.thumbnailIds?.includes(item.id)?'/api/filmography/'+encodeURIComponent(item.id)+'/thumbnail?v='+films.version:'/images/film-placeholder.png';
    const thumbnailPosition=item.thumbnailPosition||{x:50,y:50};image.style.objectPosition=`${thumbnailPosition.x}% ${thumbnailPosition.y}%`;
    const mobilePosition=item.mobileThumbnailPosition||{x:50,y:50};image.style.setProperty('--mobile-thumbnail-position',`${mobilePosition.x}% ${mobilePosition.y}%`);
    image.onerror=()=>{image.onerror=null;image.src='/images/film-placeholder.png';};frame.append(image);
    const body=document.createElement('div');body.className='film-body';
    const title=document.createElement('div');title.className='film-title';title.textContent=item.title;
    const meta=document.createElement('div');meta.className='film-meta';meta.textContent=participation;body.append(title,meta);card.append(frame,body);
    let opening=false;
    const show=async()=>{
      if(opening)return;window.OnfilmPreview?.close();
      if(video){
        opening=true;
        try{
          const res=await fetch('/api/videos/'+encodeURIComponent(video.id)+'/playback');
          if(res.ok){location.assign('/video-player.html?videoId='+encodeURIComponent(video.id)+'&from=filmography');return;}
          details(item.title,'아직 재생할 수 없습니다. 편집 화면에서 영상 파일과 인코딩 상태를 확인해 주세요.');
        }catch{details(item.title,'영상 상태를 확인하지 못했습니다. 다시 눌러 주세요.');}
        finally{opening=false;}
      }else details(item.title,[participation,item.genres.join(' · '),item.runtime?item.runtime+'분':'',ages[item.ageRating]].filter(Boolean).join('\n')||'등록된 참여 정보가 없습니다.');
    };
    card.addEventListener('click',show);card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();show();}});
    window.OnfilmPreview?.bind(card,{title:item.title,genres:item.genres,runtime:item.runtime,age:ages[item.ageRating]||'',thumbnail:image.src,thumbnailPosition,trailerId:films.trailers?.find(t=>t.filmId===item.id)?.id,canPlay:!!video,participation,play:show});
    return {card,video};
  }
  async function load(){
    if(busy)return;busy=true;window.OnfilmPreview?.close();$('retryFilms').hidden=true;$('filmGroups').hidden=true;$('filmsStatus').textContent='필모그래피를 불러오는 중입니다.';
    for(const group of ['video','directing','lead','supporting','experience'])$(group+'Films').replaceChildren();
    try{
      const res=await fetch('/api/filmography');if(!res.ok)throw new Error();const films=await res.json();
      // Keep the existing DOM IDs; grouping now follows the selected category, not video presence.
      for(const item of films.items){const {card}=cardFor(item,films);const group={ACTING:'video',DIRECTING:'directing',LEAD:'lead',SUPPORTING:'supporting',MINOR:'experience'}[item.category]||'video';$(group+'Films').append(card);}
      for(const group of ['video','directing','lead','supporting','experience']){const count=$(group+'Films').children.length;$(group+'Count').textContent=count+'편';$(group+'Empty').hidden=true;$(group+'Films').closest('section').hidden=count===0;}
      $('filmGroups').hidden=false;$('filmsStatus').textContent=films.items.length?'':'등록된 작품이 없습니다.';
    }catch{$('filmsStatus').textContent='필모그래피를 불러오지 못했습니다.';$('retryFilms').hidden=false;}
    finally{busy=false;}
  }
  $('retryFilms').addEventListener('click',load);void load();
})();

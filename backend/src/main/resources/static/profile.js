(() => {
  const $ = id => document.getElementById(id);
  let busy=false, galleryBusy=false, photos=[], photoIndex=0, returnFocus=null;
  const menu=$('profileEditOverlay'), lightbox=$('lightbox');
  function showMenu() { returnFocus=document.activeElement;menu.hidden=false;menu.classList.add('show');$('profileSettingsBtn').setAttribute('aria-expanded','true');$('editProfileLink').focus(); }
  function closeMenu() { menu.hidden=true;menu.classList.remove('show');$('profileSettingsBtn').setAttribute('aria-expanded','false');returnFocus?.focus(); }
  function notice(title,text,url='') {
    $('noticeTitle').textContent=title;$('noticeText').textContent=text;
    $('noticeUrl').hidden=!url;$('noticeUrl').value=url;$('localNotice').showModal();
    if(url){$('noticeUrl').focus();$('noticeUrl').select();}
  }
  $('noticeClose').addEventListener('click',()=>$('localNotice').close());
  $('profileSettingsBtn').addEventListener('click',showMenu);
  menu.addEventListener('click',event=>{
    if(event.target===menu){closeMenu();return;}
    const action=event.target.closest('[data-action]')?.dataset.action;
    if(!action)return;
    closeMenu();
    if(action==='profile') location.assign('/index.html?edit=1');
    if(action==='gallery') location.assign('/edit-gallery.html');
    if(action==='filmography') location.assign('/edit-filmography.html');
    if(action==='export') location.assign('/export.html');
    if(action==='backup') location.assign('/backup.html');
  });
  const filmWrapper=document.querySelector('#filmSliderContainer .film-slider-wrapper');
  const filmStatus=document.createElement('p');filmStatus.setAttribute('role','status');
  const retryFilms=document.createElement('button');retryFilms.type='button';retryFilms.textContent='필모그래피 다시 읽기';retryFilms.hidden=true;
  $('filmographySection').append(filmStatus,retryFilms);
  retryFilms.addEventListener('click',loadFilms);
  let filmBusy=false;
  const roleLabels={ACTOR:'배우',DIRECTOR:'감독',WRITER:'작가'};
  const castLabels={LEAD:'주연',SUPPORTING:'조연',CAMEO:'단역'};
  const ageLabels={ALL:'전체 관람가',AGE_12:'12세 이상',AGE_15:'15세 이상',AGE_18:'청소년 관람불가'};
  function filmArrows(){
    $('filmPrevBtn').hidden=filmWrapper.scrollLeft<=1;
    $('filmNextBtn').hidden=filmWrapper.scrollLeft+filmWrapper.clientWidth>=filmWrapper.scrollWidth-1;
  }
  $('filmPrevBtn').addEventListener('click',()=>filmWrapper.scrollBy({left:-filmWrapper.clientWidth,behavior:'smooth'}));
  $('filmNextBtn').addEventListener('click',()=>filmWrapper.scrollBy({left:filmWrapper.clientWidth,behavior:'smooth'}));
  filmWrapper.addEventListener('scroll',filmArrows);window.addEventListener('resize',filmArrows);
  async function loadFilms(){
    if(filmBusy)return;filmBusy=true;retryFilms.hidden=true;filmStatus.textContent='필모그래피를 불러오는 중입니다.';
    $('filmEmpty').classList.add('hidden');filmWrapper.classList.add('hidden');$('filmSlider').replaceChildren();
    $('filmPrevBtn').hidden=true;$('filmNextBtn').hidden=true;
    try{
      const res=await fetch('/api/filmography');if(!res.ok)throw new Error();const films=await res.json();
      for(const item of films.items){
        const card=document.createElement('article');card.className='film-card';card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',item.title+' 상세 정보');
        const frame=document.createElement('div');frame.className='film-poster-frame';const image=document.createElement('img');image.className='film-poster';image.src=films.thumbnailIds?.includes(item.id)?'/api/filmography/'+encodeURIComponent(item.id)+'/thumbnail?v='+films.version:'/images/film-placeholder.png';image.alt='';frame.append(image);
        image.addEventListener('error',()=>{filmStatus.textContent='일부 섬네일을 읽지 못했습니다.';retryFilms.hidden=false;});
        const body=document.createElement('div');body.className='film-body';const title=document.createElement('div');title.className='film-title';title.textContent=item.title;
        const meta=document.createElement('div');meta.className='film-meta';meta.textContent=[item.year,...item.roles.map(r=>roleLabels[r])].filter(Boolean).join(' · ');body.append(title,meta);card.append(frame,body);
        const video=films.videos?.find(v=>v.filmId===item.id);
        const videoText=video?'원본 영상: '+video.name+' · 편집 화면에서 HLS 인코딩을 완료하면 재생할 수 있습니다.':'등록된 원본 영상 없음';
        let opening=false;
        const show=async()=>{
          if(opening)return;
          if(video){
            opening=true;
            try{const response=await fetch('/api/videos/'+encodeURIComponent(video.id)+'/playback');if(response.ok){location.href='/video-player.html?videoId='+encodeURIComponent(video.id);return;}}
            catch{notice(item.title,'영상 상태를 확인하지 못했습니다. 다시 눌러 주세요.');return;}
            finally{opening=false;}
          }
          notice(item.title,[meta.textContent,item.runtime?item.runtime+'분':'',ageLabels[item.ageRating]||'',item.genres.join(' · '),castLabels[item.castType]||'',item.characterName,videoText].filter(Boolean).join(' / '));
        };
        card.addEventListener('click',show);card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();show();}});$('filmSlider').append(card);
      }
      $('filmEmpty').classList.toggle('hidden',films.items.length>0);filmWrapper.classList.toggle('hidden',films.items.length===0);filmWrapper.scrollLeft=0;filmStatus.textContent='';requestAnimationFrame(filmArrows);
    }catch{filmStatus.textContent='필모그래피를 불러오지 못했습니다.';retryFilms.hidden=false;}
    finally{filmBusy=false;}
  }
  function showPhoto(index) {
    photoIndex=index;$('lightboxImage').src=photos[index];$('previousPhoto').hidden=index===0;$('nextPhoto').hidden=index===photos.length-1;
  }
  function openPhoto(index) {returnFocus=document.activeElement;showPhoto(index);lightbox.hidden=false;lightbox.classList.add('show');$('closeLightbox').focus();}
  function closePhoto() {lightbox.hidden=true;lightbox.classList.remove('show');$('lightboxImage').removeAttribute('src');returnFocus?.focus();}
  $('closeLightbox').addEventListener('click',closePhoto);
  lightbox.addEventListener('click',event=>{if(event.target===lightbox || event.target===$('lightboxImage'))closePhoto();});
  $('previousPhoto').addEventListener('click',()=>{if(photoIndex>0)showPhoto(photoIndex-1);});
  $('nextPhoto').addEventListener('click',()=>{if(photoIndex<photos.length-1)showPhoto(photoIndex+1);});
  document.addEventListener('keydown',event=>{
    const active=!menu.hidden ? menu : !lightbox.hidden ? lightbox : null;
    if(!active || $('localNotice').open)return;
    if(event.key==='Escape'){event.preventDefault();active===menu ? closeMenu() : closePhoto();}
    if(active===lightbox && event.key==='ArrowLeft' && photoIndex>0)showPhoto(photoIndex-1);
    if(active===lightbox && event.key==='ArrowRight' && photoIndex<photos.length-1)showPhoto(photoIndex+1);
    if(event.key==='Tab'){
      const buttons=[...active.querySelectorAll('button')].filter(button=>!button.hidden);
      const first=buttons[0],last=buttons.at(-1);
      if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
      if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  async function loadGallery() {
    if(galleryBusy)return;galleryBusy=true;
    $('retryGallery').hidden=true;$('galleryViewStatus').textContent='사진을 불러오는 중입니다.';
    $('galleryEmpty').classList.add('hidden');
    $('galleryGrid').querySelectorAll('.gallery-item-wrap').forEach(item=>item.remove());
    photos=[];
    try {
      const response=await fetch('/api/gallery');if(!response.ok)throw new Error();
      const gallery=await response.json();
      photos=gallery.ids.map(id=>'/api/gallery/'+encodeURIComponent(id)+'/image');
      photos.forEach((url,index)=>{
        const wrap=document.createElement('button');wrap.type='button';wrap.className='gallery-item-wrap';wrap.setAttribute('aria-label','사진 '+(index+1)+' 크게 보기');
        const image=document.createElement('img');image.className='gallery-item';image.src=url;image.alt='갤러리 사진 '+(index+1);image.loading='lazy';
        image.addEventListener('error',()=>{$('galleryViewStatus').textContent='일부 사진을 읽지 못했습니다.';$('retryGallery').hidden=false;});
        wrap.append(image);wrap.addEventListener('click',()=>openPhoto(index));$('galleryGrid').append(wrap);
      });
      $('galleryEmpty').classList.toggle('hidden',photos.length>0);
      $('galleryViewStatus').textContent='';
    } catch {$('galleryViewStatus').textContent='사진을 불러오지 못했습니다.';$('retryGallery').hidden=false;}
    finally {galleryBusy=false;}
  }
  async function load() {
    if(busy)return;busy=true;
    $('retryProfile').hidden=true;$('viewStatus').hidden=false;$('viewStatus').textContent='프로필을 불러오는 중입니다.';
    $('pageRoot').classList.remove('booting');
    for(const id of ['profileContent','filmographySection','gallerySection'])$(id).hidden=true;
    try {
      const response=await fetch('/api/profile');if(!response.ok)throw new Error();
      const profile=await response.json();
      if(!profile.name?.trim()){location.replace('/index.html?edit=1');return;}
      $('profileName').textContent=profile.name;
      const contact=profile.contact||{};
      $('contactSection').hidden=!contact.email?.trim();
      $('contactEmailDisplay').textContent=contact.email||'';
      $('profileMeta').textContent=(profile.birthDate || '생년월일 미등록')+' · '+(profile.birthPlace || '출생지 미등록');
      $('bioDisplay').textContent=profile.oneLineIntro || '소개글을 입력해 주세요.';
      $('profilePhoto').src=profile.hasPortrait ? '/api/profile/portrait?v='+profile.version : '/images/profile-placeholder.png';
      $('profilePhoto').onerror=()=>{$('profilePhoto').onerror=null;$('profilePhoto').src='/images/profile-placeholder.png';};
      $('snsRow').replaceChildren();
      for(const [index,entry] of (profile.snsList || []).entries()){
        if(index){const separator=document.createElement('span');separator.className='sns-separator';separator.textContent='·';$('snsRow').append(separator);}
        const brand={INSTAGRAM:'instagram',YOUTUBE:'youtube',TIKTOK:'tiktok'}[entry.type] || 'etc';
        const link=document.createElement('a');link.className='sns-pill';link.dataset.brand=brand;link.href=entry.url;link.title=entry.type;link.setAttribute('aria-label',entry.type+' 주소');
        const badge=document.createElement('span');badge.className='sns-badge';const icon=document.createElement('span');icon.className='sns-icon';badge.append(icon);link.append(badge);
        link.addEventListener('click',event=>{event.preventDefault();notice(entry.type,'주소를 복사해 브라우저에서 열어 주세요.',entry.url);});
        $('snsRow').append(link);
      }
      $('snsRow').classList.toggle('is-empty',!profile.snsList?.length);
      $('tagList').replaceChildren();
      for(const tag of profile.rawTags || []){const chip=document.createElement('span');chip.className='profile-tag';chip.textContent='#'+tag;$('tagList').append(chip);}
      $('tagList').classList.toggle('is-empty',!profile.rawTags?.length);
      $('filmEmpty').classList.add('hidden');
      document.querySelector('#filmSliderContainer .film-slider-wrapper').classList.add('hidden');
      for(const id of ['filmPrevBtn','filmNextBtn'])$(id).hidden=true;
      for(const id of ['profileContent','filmographySection','gallerySection'])$(id).hidden=false;
      $('viewStatus').textContent='저장된 프로필입니다.';$('viewStatus').hidden=true;
      void loadGallery();void loadFilms();
    } catch {$('viewStatus').textContent='프로필을 불러오지 못했습니다. 다시 시도해 주세요.';$('retryProfile').hidden=false;}
    finally {busy=false;}
  }
  $('retryProfile').addEventListener('click',load);$('retryGallery').addEventListener('click',loadGallery);
  void load();
})();

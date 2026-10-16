(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const node=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  const wrapper=document.querySelector('.film-slider-wrapper');
  function arrows(){ $('filmPrevBtn').hidden=wrapper.scrollLeft<=1;$('filmNextBtn').hidden=wrapper.scrollLeft+wrapper.clientWidth>=wrapper.scrollWidth-1; }
  $('filmPrevBtn').onclick=()=>wrapper.scrollBy({left:-wrapper.clientWidth,behavior:'smooth'});
  $('filmNextBtn').onclick=()=>wrapper.scrollBy({left:wrapper.clientWidth,behavior:'smooth'});
  wrapper.addEventListener('scroll',arrows);window.addEventListener('resize',arrows);
  const lightbox=$('lightbox'),page=document.querySelector('.page-root');
  let photos=[],photoIndex=0,returnFocus=null;
  function showPhoto(index){
    if(index<0||index>=photos.length)return;
    photoIndex=index;$('lightboxImage').src=photos[index];$('lightboxImage').alt='갤러리 사진 '+(index+1);
    $('previousPhoto').hidden=index===0;$('nextPhoto').hidden=index===photos.length-1;
    if(document.activeElement.hidden)$('closeLightbox').focus();
  }
  function openPhoto(index){
    returnFocus=document.activeElement;showPhoto(index);window.OnfilmPreview?.close();
    page.inert=true;lightbox.hidden=false;lightbox.classList.add('show');$('closeLightbox').focus();
  }
  function closePhoto(){
    lightbox.hidden=true;lightbox.classList.remove('show');$('lightboxImage').removeAttribute('src');page.inert=false;returnFocus?.focus();
  }
  $('closeLightbox').onclick=closePhoto;
  $('previousPhoto').onclick=()=>showPhoto(photoIndex-1);
  $('nextPhoto').onclick=()=>showPhoto(photoIndex+1);
  lightbox.onclick=event=>{if(event.target===lightbox||event.target===$('lightboxImage'))closePhoto();};
  document.addEventListener('keydown',event=>{
    if(lightbox.hidden)return;
    if(event.key==='Escape'){event.preventDefault();closePhoto();}
    if(event.key==='ArrowLeft'){event.preventDefault();showPhoto(photoIndex-1);}
    if(event.key==='ArrowRight'){event.preventDefault();showPhoto(photoIndex+1);}
    if(event.key==='Tab'){
      const buttons=[...lightbox.querySelectorAll('button')].filter(button=>!button.hidden),first=buttons[0],last=buttons.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  async function load(){
    try{
      const res=await fetch('portfolio.json');if(!res.ok)throw new Error();const data=await res.json(),p=data.profile;
      document.title=p.name+' · OnFilm';$('profileName').textContent=p.name;$('bioDisplay').textContent=p.intro;
      const contact=p.contact||{};
      $('contactSection').hidden=!contact.email?.trim();
      $('copyContactEmail').hidden=!contact.email?.trim();
      $('contactEmailDisplay').textContent=contact.email||'';
      $('profileMeta').replaceChildren(...[[p.birthDate,p.birthPlace],[p.heightCm?Number(p.heightCm)+' cm':null,p.weightKg?Number(p.weightKg)+' kg':null]].filter(values=>values.some(Boolean)).map(values=>{const line=document.createElement('div');line.className='profile-meta-line';for(const text of values.filter(Boolean)){const span=document.createElement('span');span.textContent=text;line.append(span);}return line;}));$('profilePhoto').src=p.portrait;
      const portraitPosition=p.portraitPosition||{x:50,y:50};$('profilePhoto').style.objectPosition=`${portraitPosition.x}% ${portraitPosition.y}%`;
      for(const entry of p.sns){
        const url=new URL(entry.url);if(!['http:','https:'].includes(url.protocol))continue;
        const a=node('a','sns-pill');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label',entry.type);
        a.dataset.brand={INSTAGRAM:'instagram',YOUTUBE:'youtube',TIKTOK:'tiktok'}[entry.type]||'etc';
        const badge=node('span','sns-badge');badge.append(node('span','sns-icon'));a.append(badge);$('snsRow').append(a);
      }
      for(const tag of p.tags)$('tagList').append(node('span','profile-tag','#'+tag));
      for(const film of data.films)$('filmSlider').append(window.createPublicFilmCard(film));
      $('filmEmpty').hidden=data.films.length!==0;
      photos=data.photos;
      for(const [index,url] of photos.entries()){
        const button=node('button','gallery-item-wrap');button.type='button';button.setAttribute('aria-label','사진 '+(index+1)+' 크게 보기');
        const image=node('img','gallery-item');image.src=url;image.alt='갤러리 사진 '+(index+1);image.loading='lazy';button.append(image);
        const position=data.photoPositions?.[index]||{x:50,y:50};image.style.objectPosition=`${position.x}% ${position.y}%`;
        button.onclick=()=>openPhoto(index);$('galleryGrid').append(button);
      }
      $('photoEmpty').hidden=data.photos.length!==0;$('publicStatus').textContent='';requestAnimationFrame(arrows);
    }catch{$('publicStatus').textContent='공개본을 읽지 못했습니다. 페이지를 새로고침해 주세요. HTML 파일 직접 실행이 아닌 정적 웹 호스팅이 필요합니다.';}
  }
  void load();
})();

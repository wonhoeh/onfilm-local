(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const node=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  const roles={ACTOR:'배우',DIRECTOR:'감독',WRITER:'작가'};
  const wrapper=document.querySelector('.film-slider-wrapper');
  function arrows(){ $('filmPrevBtn').hidden=wrapper.scrollLeft<=1;$('filmNextBtn').hidden=wrapper.scrollLeft+wrapper.clientWidth>=wrapper.scrollWidth-1; }
  $('filmPrevBtn').onclick=()=>wrapper.scrollBy({left:-wrapper.clientWidth,behavior:'smooth'});
  $('filmNextBtn').onclick=()=>wrapper.scrollBy({left:wrapper.clientWidth,behavior:'smooth'});
  wrapper.addEventListener('scroll',arrows);window.addEventListener('resize',arrows);
  $('detailsClose').onclick=()=>$('details').close();$('photoClose').onclick=()=>$('photoDialog').close();
  async function load(){
    try{
      const res=await fetch('portfolio.json');if(!res.ok)throw new Error();const data=await res.json(),p=data.profile;
      document.title=p.name+' · OnFilm';$('profileName').textContent=p.name;$('bioDisplay').textContent=p.intro;
      const contact=p.contact||{};
      $('contactSection').hidden=!contact.email?.trim();
      $('contactEmailDisplay').textContent=contact.email||'';
      $('profileMeta').textContent=[p.birthDate,p.birthPlace].filter(Boolean).join(' · ');$('profilePhoto').src=p.portrait;
      for(const entry of p.sns){
        const url=new URL(entry.url);if(!['http:','https:'].includes(url.protocol))continue;
        const a=node('a','sns-pill');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label',entry.type);
        a.dataset.brand={INSTAGRAM:'instagram',YOUTUBE:'youtube',TIKTOK:'tiktok'}[entry.type]||'etc';
        const badge=node('span','sns-badge');badge.append(node('span','sns-icon'));a.append(badge);$('snsRow').append(a);
      }
      for(const tag of p.tags)$('tagList').append(node('span','profile-tag','#'+tag));
      for(const film of data.films){
        const card=node(film.manifestUrl?'a':'article','film-card');
        if(film.manifestUrl)card.href='video-player.html?videoId='+encodeURIComponent(film.id);
        else {card.tabIndex=0;card.setAttribute('role','button');const show=()=>{$('detailsTitle').textContent=film.title;$('detailsText').textContent=[film.year,film.runtime?film.runtime+'분':'',...film.genres,film.characterName,'등록된 영상 없음'].filter(Boolean).join(' · ');$('details').showModal();};card.onclick=show;card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();show();}};}
        const frame=node('div','film-poster-frame'),image=node('img','film-poster');image.src=film.thumbnail;image.alt='';frame.append(image);
        const body=node('div','film-body');body.append(node('div','film-title',film.title),node('div','film-meta',[film.year,...film.roles.map(r=>roles[r])].filter(Boolean).join(' · ')));card.append(frame,body);$('filmSlider').append(card);
      }
      $('filmEmpty').hidden=data.films.length!==0;
      for(const [index,url] of data.photos.entries()){
        const button=node('button','gallery-item-wrap');button.type='button';button.setAttribute('aria-label','사진 '+(index+1)+' 크게 보기');
        const image=node('img','gallery-item');image.src=url;image.alt='갤러리 사진 '+(index+1);image.loading='lazy';button.append(image);
        button.onclick=()=>{$('largePhoto').src=url;$('photoDialog').showModal();};$('galleryGrid').append(button);
      }
      $('photoEmpty').hidden=data.photos.length!==0;$('publicStatus').textContent='';requestAnimationFrame(arrows);
    }catch{$('publicStatus').textContent='공개본을 읽지 못했습니다. 페이지를 새로고침해 주세요. HTML 파일 직접 실행이 아닌 정적 웹 호스팅이 필요합니다.';}
  }
  void load();
})();

/* Original OnFilm movie-popup CSS, geometry and sound SVGs; local HLS lifecycle. */
(() => {
  const popup=document.createElement('div');popup.className='movie-popup';popup.setAttribute('role','region');popup.setAttribute('aria-label','작품 미리보기');popup.hidden=true;
  popup.innerHTML=`<div class="popup-video-box">
    <img class="popup-thumb" alt="작품 섬네일"><video muted loop playsinline></video>
    <button type="button" class="popup-mute-btn" aria-label="음소거 해제" hidden>
      <svg class="popup-sound-on" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="26" height="26" hidden>
        <path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25 l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51 c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396 C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z"/>
      </svg>
      <svg class="popup-sound-off" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="26" height="26">
        <path stroke-linecap="round" stroke-linejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51 c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396 C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z"/>
      </svg>
    </button></div><div class="popup-info"><div class="popup-title"></div><div class="popup-meta"></div><div class="popup-action-row"><button type="button" class="popup-play-btn-circle" aria-label="원본 영상 재생"><span>▶</span></button></div></div>`;
  document.body.append(popup);
  const video=popup.querySelector('video'),thumb=popup.querySelector('.popup-thumb'),mute=popup.querySelector('.popup-mute-btn');
  let active=null,info=null,hls=null,abort=null,hideTimer=null,removeTimer=null,serial=0;
  // SVG does not reflect the HTMLElement.hidden property: update the attribute for CSS.
  function sound(){popup.querySelector('.popup-sound-on').toggleAttribute('hidden',video.muted);popup.querySelector('.popup-sound-off').toggleAttribute('hidden',!video.muted);mute.setAttribute('aria-label',video.muted?'음소거 해제':'음소거');mute.setAttribute('aria-pressed',String(!video.muted));}
  video.addEventListener('volumechange',sound);
  function stop(){
    abort?.abort();abort=null;if(hls){hls.destroy();hls=null;}
    video.onloadedmetadata=null;video.onerror=null;video.ontimeupdate=null;video.pause();video.removeAttribute('src');video.load();video.muted=true;sound();thumb.style.opacity='1';mute.hidden=true;
  }
  function close(immediate=false){
    clearTimeout(hideTimer);clearTimeout(removeTimer);serial++;active=null;info=null;stop();
    popup.style.opacity='0';popup.style.transform='scale(0.85) translateY(10px)';
    const remove=()=>{popup.classList.remove('show');popup.hidden=true;};if(immediate)remove();else removeTimer=setTimeout(remove,180);
  }
  function leave(){clearTimeout(hideTimer);hideTimer=setTimeout(()=>close(),120);}
  async function show(card,data){
    clearTimeout(hideTimer);
    if(active===card)return;
    clearTimeout(hideTimer);clearTimeout(removeTimer);const current=++serial;stop();active=card;info=data;
    popup.querySelector('.popup-title').textContent=data.title;
    popup.classList.toggle('experience-preview',data.canPlay===false);
    popup.querySelector('.popup-action-row').hidden=data.canPlay===false;
    let participation=popup.querySelector('.popup-participation');
    if(!participation){participation=document.createElement('div');participation.className='popup-participation';popup.querySelector('.popup-info').append(participation);}
    participation.textContent=data.participation||'';participation.hidden=!data.participation;
    const meta=popup.querySelector('.popup-meta');meta.replaceChildren(document.createTextNode([data.genres.join(' · '),data.runtime?data.runtime+'분':''].filter(Boolean).join(' · ')));
    if(data.age){const badge=document.createElement('span');badge.className='popup-age';badge.textContent=data.age;meta.append(badge);}
    thumb.src=data.thumbnail;thumb.style.opacity='1';video.muted=true;sound();
    const rect=card.getBoundingClientRect(),scale=matchMedia('(prefers-reduced-motion: reduce)').matches?1:Math.min(1.3,(innerWidth-24)/rect.width,(innerHeight-24)/(rect.height+60));
    const width=rect.width,height=rect.height+60,dx=width*(scale-1)/2,dy=height*(scale-1)/2;
    popup.style.width=width+'px';popup.style.height=height+'px';
    popup.style.left=Math.max(12+dx,Math.min(rect.left,innerWidth-width-dx-12))+'px';
    popup.style.top=Math.max(12+dy+6*scale,Math.min(rect.top-24,innerHeight-height-dy-12+6*scale))+'px';
    popup.hidden=false;popup.style.opacity='0';popup.style.transform='scale(0.9)';popup.classList.add('show');
    requestAnimationFrame(()=>{if(current===serial){popup.style.opacity='1';popup.style.transform=`scale(${scale}) translateY(-6px)`;}});
    if(!data.trailerId&&!data.trailerUrl)return;
    abort=new AbortController();
    try{
      let expected;
      if(data.trailerUrl){
        if(!/^media\/film-[0-9]+-trailer\/index\.m3u8$/.test(data.trailerUrl))throw new Error();expected=data.trailerUrl;
      }else{
        const res=await fetch('/api/videos/'+encodeURIComponent(data.trailerId)+'/playback',{signal:abort.signal});if(!res.ok)throw new Error();
        const playback=await res.json();if(current!==serial)return;
        expected='/api/videos/'+encodeURIComponent(data.trailerId)+'/hls/index.m3u8';if(playback.manifestUrl!==expected)throw new Error();
      }
      const fallback=()=>{if(current===serial)stop();};
      const play=()=>{if(current===serial)video.play().catch(fallback);};
      video.onerror=fallback;
      video.ontimeupdate=()=>{if(current===serial&&video.currentTime>=.15){thumb.style.opacity='0';mute.hidden=false;}};
      if(window.Hls?.isSupported()){
        hls=new Hls({enableWorker:false,maxBufferLength:10,backBufferLength:0});
        hls.on(Hls.Events.MANIFEST_PARSED,play);hls.on(Hls.Events.ERROR,(_,error)=>{if(error.fatal)fallback();});
        hls.loadSource(expected);hls.attachMedia(video);
      }else if(video.canPlayType('application/vnd.apple.mpegurl')){video.onloadedmetadata=play;video.src=expected;}else fallback();
    }catch{if(current===serial)stop();}
  }
  popup.addEventListener('mouseenter',()=>clearTimeout(hideTimer));popup.addEventListener('mouseleave',leave);
  popup.addEventListener('focusin',()=>clearTimeout(hideTimer));popup.addEventListener('focusout',event=>{if(!popup.contains(event.relatedTarget))leave();});
  for(const name of ['pointerdown','mousedown','touchstart'])mute.addEventListener(name,event=>{event.preventDefault();event.stopPropagation();},{capture:true,passive:false});
  mute.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();video.muted=!video.muted;if(!video.muted&&video.volume===0)video.volume=1;sound();});
  popup.addEventListener('click',event=>{if(event.target.closest('.popup-mute-btn'))return;const play=info?.play;close(true);play?.();});
  for(const name of ['wheel','scroll','resize','blur','pagehide'])window.addEventListener(name,()=>close(true),{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)close(true);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')close(true);});
  window.OnfilmPreview={close:()=>close(true),bind(card,data){card.addEventListener('mouseenter',()=>show(card,data));card.addEventListener('mouseleave',leave);card.addEventListener('focus',()=>setTimeout(()=>{if(document.activeElement===card&&!document.querySelector('dialog[open]'))show(card,data);},80));card.addEventListener('blur',event=>{if(!popup.contains(event.relatedTarget))leave();});}};
})();

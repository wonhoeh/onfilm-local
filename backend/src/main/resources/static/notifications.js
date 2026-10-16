(() => {
  const host=document.createElement('aside');host.className='notification-hub';
  host.innerHTML='<button type="button" class="notification-bell" aria-label="알림" aria-expanded="false" aria-controls="notificationPanel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span class="notification-badge" hidden></span></button><section id="notificationPanel" class="notification-panel" aria-label="인코딩 알림" hidden><header><strong>알림</strong><button type="button" class="notification-read">모두 비우기</button></header><p class="notification-status" role="status"></p><div class="notification-items"></div></section>';
  document.body.append(host);
  const bell=host.querySelector('.notification-bell'),badge=host.querySelector('.notification-badge'),panel=host.querySelector('section'),list=host.querySelector('.notification-items'),status=host.querySelector('.notification-status'),read=host.querySelector('.notification-read');
  const toast=document.createElement('div');toast.className='encoding-toast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');document.body.append(toast);
  let latest=0,unread=0,seen=null,polling=false,reading=false,stopped=false,toastTimer,exitTimer,revision=0;
  try{const saved=sessionStorage.getItem('onfilm.notificationSeen');if(saved!==null&&Number.isFinite(Number(saved)))seen=Number(saved);}catch{}
  function close(focus=false){panel.hidden=true;bell.setAttribute('aria-expanded','false');if(focus)bell.focus();}
  function announce(items){
    clearTimeout(toastTimer);clearTimeout(exitTimer);
    toast.textContent=items.length===1?items[0].message:items.length+'건의 인코딩이 완료되었습니다. 알림에서 확인하세요.';
    requestAnimationFrame(()=>toast.classList.add('show'));
    toastTimer=setTimeout(()=>{toast.classList.remove('show');exitTimer=setTimeout(()=>toast.textContent='',250);},4500);
  }
  async function poll(){
    if(polling||stopped)return;polling=true;
    const expectedRevision=revision;
    try{
      const response=await fetch('/api/notifications',{cache:'no-store'});if(!response.ok)throw new Error();
      const data=await response.json();if(stopped||revision!==expectedRevision)return;
      latest=data.items[0]?.id||0;unread=data.unread;
      if(seen!==null&&latest>=seen){const fresh=data.items.filter(item=>item.id>seen&&!item.read);if(fresh.length)announce(fresh);}
      seen=latest;try{sessionStorage.setItem('onfilm.notificationSeen',String(seen));}catch{}
      badge.hidden=data.unread===0;badge.textContent=data.unread>99?'99+':String(data.unread);bell.setAttribute('aria-label',data.unread?'알림, 읽지 않은 알림 '+data.unread+'개':'알림');
      read.disabled=reading||data.items.length===0;status.textContent=data.items.length?'':'아직 알림이 없습니다.';
      list.replaceChildren();
      for(const item of data.items){
        const row=document.createElement('button');row.type='button';row.className='notification-item'+(item.read?'':' unread');row.setAttribute('aria-label',item.message+(item.read?'':' · 새 알림'));
        const message=document.createElement('p');message.textContent=item.message;
        const time=document.createElement('time');time.dateTime=item.createdAt;time.textContent=new Date(item.createdAt).toLocaleString('ko-KR');
        row.append(message,time);list.append(row);
        row.onclick=async()=>{if(item.read)return;row.disabled=true;try{const res=await fetch('/api/notifications/'+item.id+'/read',{method:'POST'});if(!res.ok)throw new Error();revision++;item.read=true;row.classList.remove('unread');row.setAttribute('aria-label',item.message);await poll();}catch{status.textContent='읽음 처리에 실패했습니다.';}finally{row.disabled=false;}};
      }
    }catch{if(!stopped){status.textContent='알림을 불러오지 못했습니다. 잠시 후 다시 확인합니다.';read.disabled=true;}}
    finally{polling=false;}
  }
  bell.addEventListener('click',()=>{panel.hidden=!panel.hidden;bell.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)void poll();});
  read.addEventListener('click',async()=>{
    if(reading)return;reading=true;read.disabled=true;
    try{const res=await fetch('/api/notifications',{method:'DELETE'});if(!res.ok)throw new Error();revision++;list.replaceChildren();badge.hidden=true;status.textContent='아직 알림이 없습니다.';await poll();}
    catch{status.textContent='알림을 비우지 못했습니다. 다시 시도해 주세요.';}
    finally{reading=false;read.disabled=!list.children.length;}
  });
  host.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close(true);}});
  document.addEventListener('pointerdown',event=>{if(!host.contains(event.target))close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.preventDefault();close(true);}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void poll();});
  const timer=setInterval(()=>void poll(),2500);
  window.addEventListener('pagehide',()=>{stopped=true;clearInterval(timer);clearTimeout(toastTimer);clearTimeout(exitTimer);});
  void poll();
})();

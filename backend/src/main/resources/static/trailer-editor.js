(() => {
  'use strict';
  const time=value=>{const tenths=Math.round(Math.max(0,value)*10),s=Math.floor(tenths/10);return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}.${tenths%10}`;};
  function seconds(value){
    const parts=String(value).trim().split(':');
    if(parts.length>3||parts.some(p=>!/^\d+(\.\d+)?$/.test(p)))return NaN;
    return parts.reduce((sum,p)=>sum*60+Number(p),0);
  }
  function validRange(start,end,duration){return Number.isFinite(start)&&Number.isFinite(end)&&start>=0&&end<=duration&&end-start>=0.2&&end-start<=300;}
  let opened=false;
  async function open({draftId,sourceId,filmId}){
    if(opened)return {accepted:false};opened=true;
    const previous=document.activeElement;
    const dialog=document.createElement('dialog');dialog.className='trailer-editor';dialog.setAttribute('aria-labelledby','trailerEditorTitle');
    dialog.innerHTML=`<div class="trailer-editor-head"><h2 id="trailerEditorTitle">원본에서 트레일러 만들기</h2><p>원하는 한 구간을 선택하세요. 최대 5분 · 원본은 변경되지 않습니다.</p></div>
      <div class="trailer-video-wrap"><video class="trailer-editor-video" controls playsinline preload="metadata"></video></div>
      <div class="trailer-editor-selection"><div class="trailer-editor-track"><div class="trailer-editor-highlight"></div>
      <input class="trailer-start-range" type="range" min="0" step="0.1" aria-label="트레일러 시작 지점"><input class="trailer-end-range" type="range" min="0" step="0.1" aria-label="트레일러 종료 지점"></div>
      <div class="trailer-editor-times"><label><span>시작</span><input class="trailer-start-time" type="text" inputmode="decimal" aria-label="시작 시간" placeholder="00:00:00.0"></label><span class="trailer-time-arrow" aria-hidden="true">→</span><label><span>종료</span><input class="trailer-end-time" type="text" inputmode="decimal" aria-label="종료 시간" placeholder="00:00:30.0"></label><div class="trailer-duration"><span>선택 구간</span><strong class="trailer-selected-length"></strong></div>
      <button type="button" class="trailer-loop" aria-label="선택 구간 반복 재생" title="선택 구간 반복 재생" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 2 4 4-4 4M4 11V9a3 3 0 0 1 3-3h13M8 22l-4-4 4-4m12-1v2a3 3 0 0 1-3 3H4"/></svg></button></div></div>
      <p class="trailer-editor-status" role="status" aria-live="polite">원본을 분석하고 있습니다.</p><progress class="trailer-editor-progress" max="100" value="0" aria-label="트레일러 준비 진행률"></progress>
      <div class="trailer-editor-footer"><button type="button" class="ghost-btn trailer-retry" hidden>원본 다시 확인</button><button type="button" class="ghost-btn trailer-reset" hidden>구간 다시 선택</button><button type="button" class="ghost-btn trailer-cancel">취소</button><button type="button" class="primary-btn trailer-create" disabled>트레일러 만들기</button><button type="button" class="primary-btn trailer-accept" hidden>트레일러 사용</button></div>`;
    const $=selector=>dialog.querySelector(selector),video=$('video'),status=$('.trailer-editor-status'),startRange=$('.trailer-start-range'),endRange=$('.trailer-end-range'),startTime=$('.trailer-start-time'),endTime=$('.trailer-end-time');
    let edit=null,start=0,end=0,initialized=false,inRequest=false,disposed=false,timer,looping=false,loaded='',resolveResult;
    const result=new Promise(resolve=>{resolveResult=resolve;});
    const base=()=>'/api/trailer-edits/'+encodeURIComponent(edit.id);
    async function request(url,method='GET',body){
      const response=await fetch(url,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
      if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.message||'작업 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');}
      return response.status===204?null:response.text().then(text=>text?JSON.parse(text):null);
    }
    const editable=()=>edit?.status==='READY'&&!inRequest;
    function setLoop(value){looping=value;$('.trailer-loop').setAttribute('aria-pressed',String(value));$('.trailer-loop').title=value?'구간 반복 끄기':'선택 구간 반복 재생';}
    function syncTimes(){
      startRange.value=start;endRange.value=end;if(document.activeElement!==startTime)startTime.value=time(start);if(document.activeElement!==endTime)endTime.value=time(end);
      $('.trailer-selected-length').textContent=`${Math.max(0,end-start).toFixed(1)}초`;
      $('.trailer-editor-track').style.setProperty('--start',`${edit?.duration?start/edit.duration*100:0}%`);
      $('.trailer-editor-track').style.setProperty('--end',`${edit?.duration?end/edit.duration*100:100}%`);
      $('.trailer-create').disabled=!editable()||!validRange(start,end,edit?.duration);
    }
    function render(){
      if(disposed)return;
      const active=['QUEUED','RUNNING','CANCELLING'].includes(edit?.status),done=edit?.status==='DONE',failed=['FAILED','INTERRUPTED'].includes(edit?.status);
      $('.trailer-editor-selection').hidden=done;
      for(const control of dialog.querySelectorAll('.trailer-editor-selection input,.trailer-loop'))control.disabled=!editable();
      $('.trailer-editor-progress').hidden=!active;$('.trailer-editor-progress').value=edit?.progress||0;
      $('.trailer-create').hidden=done;$('.trailer-accept').hidden=!done;$('.trailer-accept').disabled=inRequest;
      $('.trailer-reset').hidden=!(done||failed&&edit.duration>0);$('.trailer-reset').disabled=inRequest;
      $('.trailer-retry').hidden=!(failed&&edit.duration<=0);$('.trailer-retry').disabled=inRequest;
      if(edit){
        if(active)status.textContent=`${edit.status==='QUEUED'?'작업 대기 중':edit.phase==='CLIP'?'트레일러 추출·인코딩 중':edit.phase==='PREVIEW'?'호환 미리보기 변환 중':'원본 분석 중'} · ${edit.progress}%`;
        else if(failed)status.textContent=edit.message;
        else if(done)status.textContent='완성된 트레일러를 확인하고 사용을 눌러 주세요. 작품 저장 전까지 기존 트레일러는 유지됩니다.';
        else if(edit.status==='READY')status.textContent='시작·종료를 조정한 뒤 선택 구간을 재생해 확인하세요.';
        if(edit.duration>0&&!initialized){start=edit.start??0;end=edit.end??Math.min(30,edit.duration);initialized=true;startRange.max=endRange.max=edit.duration;}
        if(edit.status==='READY'||done){
          const url=base()+'/content/'+(done?'result':'source');
          if(loaded!==url){setLoop(false);loaded=url;video.src=url;video.load();}
        }
      }
      syncTimes();
    }
    async function poll(){
      if(disposed||!edit||inRequest)return;
      try{edit=await request(base());render();}catch(error){if(!disposed)status.textContent=error.message;}
      finally{if(!disposed)timer=setTimeout(poll,1000);}
    }
    async function action(path,body){
      if(inRequest||!edit)return;inRequest=true;clearTimeout(timer);video.pause();setLoop(false);render();
      let failure='';
      try{edit=await request(base()+path,'POST',body);render();}
      catch(error){failure=error.message+' 작업이 접수됐을 수 있어 상태를 다시 확인합니다.';}
      finally{inRequest=false;render();if(failure)status.textContent=failure;timer=setTimeout(poll,failure?3000:500);}
    }
    function finish(accepted){disposed=true;clearTimeout(timer);window.removeEventListener('resize',clampWindow);video.pause();video.removeAttribute('src');video.load();dialog.close();dialog.remove();opened=false;previous?.focus();resolveResult({accepted});}
    async function cancel(){
      if(inRequest)return;
      inRequest=true;clearTimeout(timer);video.pause();
      try{if(edit)await request(base(),'DELETE');finish(false);}
      catch(error){status.textContent=error.message+' 취소를 다시 눌러 주세요.';inRequest=false;timer=setTimeout(poll,1000);}
    }
    for(const [input,isStart] of [[startRange,true],[endRange,false]])input.addEventListener('input',()=>{
      video.pause();if(isStart)start=Math.min(Number(input.value),Math.max(0,end-0.2));else end=Math.max(Number(input.value),start+0.2);
      end=Math.min(end,edit.duration);syncTimes();video.currentTime=isStart?start:end;
    });
    function resumeLoop(){if(looping&&validRange(start,end,edit?.duration)){video.currentTime=start;void video.play().catch(()=>{});}}
    startRange.addEventListener('change',resumeLoop);endRange.addEventListener('change',resumeLoop);
    for(const [input,isStart] of [[startTime,true],[endTime,false]])input.addEventListener('change',()=>{
      const value=seconds(input.value);const a=isStart?value:start,b=isStart?end:value;
      if(!validRange(a,b,edit?.duration)){status.textContent='시간을 확인해 주세요. 00:00:15.5 또는 초 단위로 입력하며, 선택 구간은 0.2초~5분입니다.';syncTimes();return;}
      start=a;end=b;video.pause();syncTimes();video.currentTime=isStart?start:end;resumeLoop();
    });
    $('.trailer-loop').onclick=()=>{if(looping){setLoop(false);return;}if(!validRange(start,end,edit.duration)){status.textContent='선택 구간은 0.2초~5분이어야 합니다.';return;}setLoop(true);video.currentTime=start;void video.play().catch(()=>{setLoop(false);status.textContent='재생 버튼을 다시 눌러 주세요.';});};
    video.addEventListener('timeupdate',()=>{if(looping&&video.currentTime>=end){video.currentTime=start;void video.play().catch(()=>{});}});
    video.addEventListener('ended',()=>{if(looping){video.currentTime=start;void video.play().catch(()=>{});}});
    video.addEventListener('error',()=>{if(!disposed&&loaded)status.textContent='이 원본 형식은 편집창에서 재생할 수 없습니다. 시간을 직접 입력해 트레일러를 만들거나 H.264 MP4 원본을 선택해 주세요.';});
    $('.trailer-retry').onclick=()=>void action('/retry');
    dialog.addEventListener('keydown',event=>{
      if(event.ctrlKey||event.metaKey||event.altKey||event.isComposing)return;
      const field=event.target.closest('input,textarea,select,[contenteditable=true]');
      if(field&&!(field.matches('input[type=range]')&&event.code==='Space'))return;
      if(!['Space','ArrowLeft','ArrowRight'].includes(event.code))return;
      event.preventDefault();event.stopPropagation();
      if(event.repeat||video.readyState<1)return;
      if(event.code==='Space'){
        if(video.paused)void video.play().catch(()=>{status.textContent='영상을 재생하지 못했습니다. 원본 형식을 확인해 주세요.';});else video.pause();
      }else video.currentTime=Math.max(0,Math.min(video.duration,video.currentTime+(event.code==='ArrowLeft'?-10:10)));
    },true);
    const heading=$('.trailer-editor-head');let drag=null;
    function place(left,top){dialog.style.margin='0';dialog.style.left=Math.max(0,Math.min(left,innerWidth-dialog.offsetWidth))+'px';dialog.style.top=Math.max(0,Math.min(top,innerHeight-dialog.offsetHeight))+'px';}
    function clampWindow(){if(dialog.style.margin==='0px'||dialog.style.margin==='0'){const r=dialog.getBoundingClientRect();place(r.left,r.top);}}
    heading.addEventListener('pointerdown',event=>{if(event.button!==0)return;const r=dialog.getBoundingClientRect();drag={x:event.clientX-r.left,y:event.clientY-r.top};heading.setPointerCapture(event.pointerId);event.preventDefault();});
    heading.addEventListener('pointermove',event=>{if(drag)place(event.clientX-drag.x,event.clientY-drag.y);});
    const endDrag=()=>{drag=null;};heading.addEventListener('pointerup',endDrag);heading.addEventListener('pointercancel',endDrag);heading.addEventListener('lostpointercapture',endDrag);
    window.addEventListener('resize',clampWindow);
    $('.trailer-reset').onclick=()=>{loaded='';void action('/reset');};
    $('.trailer-create').onclick=()=>{if(validRange(start,end,edit?.duration))void action('/cut',{start,end});};
    $('.trailer-accept').onclick=async()=>{
      if(inRequest||edit?.status!=='DONE')return;inRequest=true;clearTimeout(timer);render();
      try{await request(base()+'/accept','POST');finish(true);}
      catch(error){inRequest=false;render();status.textContent=error.message+' 사용을 다시 눌러 확인해 주세요.';}
    };
    $('.trailer-cancel').onclick=()=>void cancel();
    dialog.addEventListener('cancel',event=>{event.preventDefault();void cancel();});
    document.body.append(dialog);dialog.showModal();render();
    try{inRequest=true;edit=await request('/api/filmography-drafts/'+encodeURIComponent(draftId)+'/trailer-editor','POST',{sourceId,filmId:filmId||null});inRequest=false;render();timer=setTimeout(poll,500);}
    catch(error){inRequest=false;status.textContent=error.message+' 취소 후 다시 열면 기존 작업을 확인합니다.';}
    return result;
  }
  window.OnfilmTrailerEditor={open,time,seconds,validRange};
})();

(() => {
  'use strict';
  const clamp=n=>Math.max(0,Math.min(100,Number.isFinite(n)?n:50));
  const normalize=p=>({x:Math.round(clamp(p?.x)),y:Math.round(clamp(p?.y))});
  function drag(start,dx,dy,overflow){
    return normalize({x:overflow.x>0.5?start.x-dx/overflow.x*100:start.x,y:overflow.y>0.5?start.y-dy/overflow.y*100:start.y});
  }
  let opened=false;
  async function open({src,position,ratio=4/5,turns=0}) {
    if(opened)return null;
    opened=true;
    const focus=document.activeElement,dialog=document.createElement('dialog');dialog.className='image-position-dialog';
    dialog.setAttribute('aria-label','사진 노출 위치 조정');
    dialog.innerHTML='<h2>사진 위치 조정</h2><p>사진을 드래그해 보이는 부분을 맞춰 주세요.</p><div class="image-position-frame" tabindex="0" aria-label="사진 위치 미리보기. 방향키로 조정"><img draggable="false" alt="프로필에 표시될 사진 영역"></div><div class="image-position-ranges"><label>좌우 <input type="range" min="0" max="100" step="1" data-axis="x" aria-label="사진 좌우 위치" disabled></label><label>상하 <input type="range" min="0" max="100" step="1" data-axis="y" aria-label="사진 상하 위치" disabled></label></div><p class="image-position-status" role="status">사진을 불러오는 중입니다.</p><div class="image-position-actions"><button type="button" data-action="reset" disabled>가운데로</button><button type="button" data-action="cancel">취소</button><button type="button" data-action="apply" disabled>적용</button></div>';
    const frame=dialog.querySelector('.image-position-frame'),image=frame.querySelector('img'),status=dialog.querySelector('[role=status]');
    const stage=document.createElement('div');stage.className='image-position-stage';frame.before(stage);stage.append(frame);
    dialog.querySelector('p').textContent='밝은 영역이 실제로 표시됩니다. 사진을 드래그해 위치를 맞춰 주세요.';
    const inputs=[...dialog.querySelectorAll('input')],apply=dialog.querySelector('[data-action=apply]'),reset=dialog.querySelector('[data-action=reset]');
    frame.style.setProperty('--image-ratio',ratio);
    let value=normalize(position),ready=false,dragging=null,closed=false;
    const overflow=()=>{
      const w=turns%2?image.naturalHeight:image.naturalWidth,h=turns%2?image.naturalWidth:image.naturalHeight;
      const scale=Math.max(frame.clientWidth/w,frame.clientHeight/h);
      return {x:w*scale-frame.clientWidth,y:h*scale-frame.clientHeight,scale};
    };
    function render(){
      image.style.objectPosition=`${value.x}% ${value.y}%`;
      const excess=ready?overflow():{x:0,y:0};
      if(ready){
        image.style.width=image.naturalWidth*excess.scale+'px';image.style.height=image.naturalHeight*excess.scale+'px';
        image.style.left=(frame.clientWidth/2+excess.x*(.5-value.x/100))+'px';
        image.style.top=(frame.clientHeight/2+excess.y*(.5-value.y/100))+'px';
        image.style.transform=`translate(-50%,-50%) rotate(${turns*90}deg)`;
      }
      for(const input of inputs){input.value=value[input.dataset.axis];input.disabled=!ready||excess[input.dataset.axis]<0.5;}
    }
    const observer=new ResizeObserver(render);observer.observe(frame);
    const result=new Promise(resolve=>{
      function finish(answer){if(closed)return;closed=true;observer.disconnect();dialog.close();dialog.remove();opened=false;focus?.focus({preventScroll:true});resolve(answer);}
      dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
      dialog.querySelector('[data-action=cancel]').onclick=()=>finish(null);
      apply.onclick=()=>{if(ready)finish({...value});};
      reset.onclick=()=>{value={x:50,y:50};render();};
    });
    inputs.forEach(input=>input.oninput=()=>{value[input.dataset.axis]=Number(input.value);render();});
    frame.onpointerdown=event=>{if(!ready||event.button!==0)return;event.preventDefault();frame.focus();dragging={id:event.pointerId,x:event.clientX,y:event.clientY,value:{...value},overflow:overflow()};frame.setPointerCapture(event.pointerId);frame.classList.add('dragging');};
    frame.onpointermove=event=>{if(dragging?.id!==event.pointerId)return;value=drag(dragging.value,event.clientX-dragging.x,event.clientY-dragging.y,dragging.overflow);render();};
    const end=event=>{if(dragging?.id!==event.pointerId)return;if(event.type==='pointercancel'){value=dragging.value;render();}dragging=null;frame.classList.remove('dragging');if(frame.hasPointerCapture(event.pointerId))frame.releasePointerCapture(event.pointerId);};
    frame.onpointerup=end;frame.onpointercancel=end;
    frame.onkeydown=event=>{
      if(!ready||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();const axis=['ArrowLeft','ArrowRight'].includes(event.key)?'x':'y';
      if(overflow()[axis]<0.5)return;
      value[axis]=clamp(value[axis]+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)*(event.shiftKey?10:1));render();
    };
    document.body.append(dialog);dialog.showModal();render();
    void (async()=>{
      try {
        if(closed)return;
        // load also completes in occluded Electron windows; decode() may wait for a frame.
        await new Promise((resolve,reject)=>{
          const finish=error=>{clearTimeout(timeout);image.onload=image.onerror=null;error?reject(error):resolve();};
          const timeout=setTimeout(()=>finish(new Error('Image load timeout')),15000);
          image.onload=()=>finish(image.naturalWidth?null:new Error('Invalid image'));
          image.onerror=()=>finish(new Error('Image load failed'));
          image.src=src;
          if(image.complete&&image.naturalWidth)finish();
        });
        if(closed)return;
        ready=true;apply.disabled=reset.disabled=false;status.textContent='적용 후 편집 화면에서 저장해 주세요.';render();
      }catch{if(!closed)status.textContent='사진을 불러오지 못했습니다. 취소 후 다시 시도해 주세요.';}
    })();
    return result;
  }
  window.OnfilmImagePosition={open,normalize,drag};
})();

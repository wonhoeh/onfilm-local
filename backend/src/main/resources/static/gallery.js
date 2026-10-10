(() => {
  const $=id=>document.getElementById(id);
  const input=$('gallery-files'),status=$('gallery-status'),list=$('gallery'),browse=$('browseBtn'),area=$('uploadArea'),save=$('gallery-save'),retry=$('gallery-retry');
  let version=0,photos=[],ready=false,busy=false,dirty=false;
  let draggedPhoto=null;
  const dragType='application/x-onfilm-gallery-photo';
  function clearDropMarks(){list.querySelectorAll('.drop-before,.drop-after').forEach(card=>card.classList.remove('drop-before','drop-after'));}
  function endDrag(){draggedPhoto=null;clearDropMarks();list.querySelectorAll('.dragging').forEach(card=>card.classList.remove('dragging'));}
  function canReorder(event){return !busy&&ready&&photos.includes(draggedPhoto)&&event.dataTransfer?.types.includes(dragType)&&!event.dataTransfer.types.includes('Files');}
  const paths={front:'M15 5l-7 7 7 7',back:'M9 5l7 7-7 7',rotate:'M20 7V2l-3 3a8 8 0 1 0 3 9 M20 7h-5',delete:'M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14 M10 10v7 M14 10v7'};
  function icon(action){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
    const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[action]);svg.append(path);return svg;
  }
  function controls(){
    if(busy||!ready)endDrag();
    input.disabled=busy||!ready||photos.length>=12;browse.disabled=input.disabled;save.disabled=busy||!ready;retry.disabled=busy;
    list.querySelectorAll('button').forEach(b=>b.disabled=busy||!ready||b.dataset.edge==='true');
    list.querySelectorAll('.photo-preview').forEach(frame=>frame.draggable=!busy&&ready);
  }
  function fit(image,photo){
    const w=image.naturalWidth,h=image.naturalHeight;if(!w||!h)return;
    const frame=image.parentElement,odd=photo.turns%2;
    const scale=Math.min(frame.clientWidth/(odd?h:w),frame.clientHeight/(odd?w:h));
    image.style.width=w*scale+'px';image.style.height=h*scale+'px';image.style.transform=`translate(-50%,-50%) rotate(${photo.turns*90}deg)`;
  }
  function render(){
    endDrag();
    list.replaceChildren();$('photoCountText').textContent=`사진 ${photos.length}/12장`;$('emptyHint').hidden=photos.length!==0;
    photos.forEach((photo,index)=>{
      const card=document.createElement('figure');card.className='photo-card';
      const frame=document.createElement('div');frame.className='photo-preview';
      frame.title='드래그하여 사진 순서 변경';
      const image=document.createElement('img');image.className='photo-thumb';image.alt=`갤러리 사진 ${index+1}`;
      image.draggable=false;
      frame.addEventListener('dragstart',event=>{
        if(busy||!ready||!event.dataTransfer){event.preventDefault();return;}
        endDrag();draggedPhoto=photo;event.dataTransfer.setData(dragType,'reorder');event.dataTransfer.effectAllowed='move';card.classList.add('dragging');
      });
      frame.addEventListener('dragend',endDrag);
      card.addEventListener('dragover',event=>{
        if(!canReorder(event))return;
        event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';clearDropMarks();
        if(draggedPhoto!==photo)card.classList.add(photos.indexOf(draggedPhoto)>photos.indexOf(photo)?'drop-before':'drop-after');
      });
      card.addEventListener('dragleave',event=>{if(!card.contains(event.relatedTarget))card.classList.remove('drop-before','drop-after');});
      card.addEventListener('drop',event=>{
        if(!canReorder(event)){endDrag();return;}
        event.preventDefault();event.stopPropagation();
        const from=photos.indexOf(draggedPhoto),to=photos.indexOf(photo);
        endDrag();if(from===to)return;
        const [moved]=photos.splice(from,1);photos.splice(to,0,moved);dirty=true;status.textContent='';render();
      });
      image.src=photo.draftId?`/api/gallery/drafts/${photo.draftId}/image`:`/api/gallery/${photo.id}/image?v=${version}`;
      image.addEventListener('load',()=>fit(image,photo));image.addEventListener('error',()=>{status.textContent='사진을 읽지 못했습니다. 다시 시도해 주세요.';retry.hidden=false;});frame.append(image);
      const actions=document.createElement('div');actions.className='photo-actions';
      for(const [action,label] of [['front','앞으로'],['back','뒤로'],['rotate','시계 방향으로 90도 회전'],['delete','삭제']]){
        const button=document.createElement('button');button.type='button';button.className='photo-action';button.dataset.action=action;
        button.title=label;button.setAttribute('aria-label',`${index+1}번 사진 ${label}`);button.append(icon(action));
        button.dataset.edge=String(action==='front'&&index===0||action==='back'&&index===photos.length-1);
        button.addEventListener('click',()=>{
          if(busy||!ready)return;
          if(action==='delete'){if(!confirm('갤러리에서 삭제할까요?'))return;photos.splice(index,1);}
          else if(action==='rotate')photo.turns=(photo.turns+1)%4;
          else{const next=index+(action==='front'?-1:1);if(next<0||next>=photos.length)return;[photos[index],photos[next]]=[photos[next],photos[index]];}
          dirty=true;status.textContent='';render();
        });actions.append(button);
      }
      card.append(frame,actions);list.append(card);
    });controls();
  }
  async function request(url,options){
    const res=await fetch(url,options);
    if(!res.ok){const data=await res.json().catch(()=>({}));throw new Error(data.message|| (res.status===409?'다른 변경이 있습니다. 다시 읽기로 저장 상태를 확인해 주세요.':res.status===413?'파일 용량은 5MB 이하여야 합니다.':'처리하지 못했습니다. 파일과 저장 공간을 확인해 주세요.'));}
    return res.json();
  }
  async function load(){
    if(busy||(dirty&&!confirm('저장하지 않은 변경을 버리고 다시 읽을까요?')))return;
    busy=true;controls();
    try{
      const profile=await request('/api/profile');if(!profile.name?.trim()){busy=false;location.replace('/index.html?edit=1');return;}
      const data=await request('/api/gallery');version=data.version;photos=data.ids.map(id=>({id,turns:0}));ready=true;dirty=false;retry.hidden=true;status.textContent='';render();
    }catch{ready=false;status.textContent='불러오기에 실패했습니다. 다시 시도해 주세요.';retry.hidden=false;}
    finally{busy=false;controls();}
  }
  async function upload(files){
    if(!files.length||busy||!ready)return;
    if(photos.length+files.length>12){status.textContent='총 12장까지만 추가할 수 있습니다.';input.value='';return;}
    busy=true;controls();let completed=0;
    try{
      for(const file of files){
        if(file.size>5*1024*1024)throw new Error('파일 용량은 5MB 이하여야 합니다.');
        status.textContent=`${completed+1}/${files.length}장 준비 중…`;
        const body=new FormData();body.append('file',file);
        const draft=await request('/api/gallery/drafts',{method:'POST',body});photos.push({draftId:draft.id,turns:0});dirty=true;completed++;render();
      }
      status.textContent='';
    }catch(error){status.textContent=`${error.message} 준비된 사진은 화면에 유지됩니다. 실패한 파일을 다시 선택해 주세요.`;}
    finally{input.value='';busy=false;controls();}
  }
  save.addEventListener('click',async()=>{
    if(busy||!ready)return;busy=true;controls();status.textContent='저장 중입니다.';
    try{
      await request('/api/gallery/edit',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({version,photos})});
      dirty=false;busy=false;try{sessionStorage.setItem('onfilm.gallerySaved','1');}catch{}location.assign('/profile.html');
    }catch{ready=false;retry.hidden=false;status.textContent='저장 결과를 확인하지 못했습니다. 입력은 유지됩니다. 다시 읽기로 저장 상태를 확인해 주세요.';}
    finally{busy=false;controls();}
  });
  input.addEventListener('change',()=>void upload([...input.files]));browse.addEventListener('click',()=>input.click());retry.addEventListener('click',load);
  for(const name of ['dragover','drop'])window.addEventListener(name,event=>event.preventDefault());
  area.addEventListener('dragover',event=>{if(!input.disabled&&event.dataTransfer?.types.includes('Files'))area.classList.add('dragover');});area.addEventListener('dragleave',()=>area.classList.remove('dragover'));
  area.addEventListener('drop',event=>{area.classList.remove('dragover');if(!input.disabled)void upload([...event.dataTransfer.files]);});
  window.addEventListener('drop',endDrag);window.addEventListener('dragend',endDrag);window.addEventListener('blur',endDrag);
  window.addEventListener('resize',()=>list.querySelectorAll('img').forEach((image,index)=>fit(image,photos[index])));
  window.addEventListener('beforeunload',event=>{if(dirty||busy){event.preventDefault();event.returnValue='';}});
  void load();
})();

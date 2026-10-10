(() => {
  const $=id=>document.getElementById(id);
  let version=0, items=[], dirty=false, busy=false, ready=false;
  let thumbnailIds=new Set();
  let videos=[],trailers=[];
  let encodingJobs=[],encodingKnown=false,encodingPolling=false;
  const genreDrafts=new WeakMap();
  const mediaDrafts=new WeakMap();
  const uncertainMedia=new WeakSet();
  const labels={ACTOR:'배우',DIRECTOR:'감독',WRITER:'작가'};
  function node(tag,cls,text) {const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;}
  function dropIcon(label){
    const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
    icon.setAttribute('viewBox','0 0 32 32');icon.setAttribute('class','upload-drop-icon');icon.setAttribute('role','img');icon.setAttribute('aria-label',label+' 드래그 앤 드롭');
    const path=document.createElementNS(icon.namespaceURI,'path');path.setAttribute('d','M16 4v16 M10 14l6 6 6-6 M5 20v7h22v-7');icon.append(path);return icon;
  }
  function controls() {
    $('addFilmBtn').disabled=!ready||busy||items.length>=50;$('saveFilms').disabled=!ready||busy||items.some(item=>uncertainMedia.has(item));
    $('reloadFilms').disabled=busy;
    $('filmList').querySelectorAll('input,select,button').forEach(el=>el.disabled=busy||!ready||el.dataset.actorDisabled==='true'||el.dataset.unsaved==='true'||el.dataset.encodingDisabled==='true');
  }
  function render() {
    $('filmList').replaceChildren();$('filmEmptyHint').hidden=items.length>0;
    items.forEach((item,index)=>{
      const card=node('article','film-card'),header=node('div','film-card-header'),title=node('div','film-card-title',item.title||'새 작품'),actions=node('div','film-card-actions');
      function action(label,fn,cls='ghost-btn') {const b=node('button',cls,label);b.type='button';b.addEventListener('click',fn);actions.append(b);}
      action('위로',()=>move(index,-1));action('아래로',()=>move(index,1));
      action('삭제',()=>{if(confirm('이 작품을 삭제할까요?')){items.splice(index,1);dirty=true;render();}},'delete-film-btn');
      header.append(title,actions);card.append(header);
      const body=node('div','film-card-body'),fields=node('div','film-fields');
      function field(label,key,options={}) {
        const group=node('label','field-group');group.append(node('span','field-label',label));
        const input=node(options.choices?'select':'input',options.choices?'select-input':'text-input');input.dataset.field=key;
        if(options.choices)for(const [value,text] of Object.entries(options.choices)){const option=node('option','',text);option.value=value;input.append(option);}
        else {input.type=options.type||'text';if(options.maxLength)input.maxLength=options.maxLength;if(options.min)input.min=options.min;if(options.max)input.max=options.max;}
        input.value=item[key]??'';input.required=key==='title';
        input.addEventListener('input',()=>{
          item[key]=options.type==='number'?(input.value===''?null:Number(input.value)):input.value;
          dirty=true;if(key==='title')title.textContent=item.title||'새 작품';
        });group.append(input);fields.append(group);return input;
      }
      field('제목','title',{maxLength:200});
      const metaGrid=node('div','film-meta-grid');
      metaGrid.append(field('개봉연도','year',{type:'number',min:1888,max:2100}).parentElement,field('런타임(분)','runtime',{type:'number',min:1,max:1440}).parentElement,
        field('관람연령','ageRating',{choices:{'':'선택',ALL:'전체 관람가',AGE_12:'12세 이상',AGE_15:'15세 이상',AGE_18:'청소년 관람불가'}}).parentElement);
      fields.append(metaGrid);
      const genreGroup=node('div','field-group'),genreLabel=node('label','field-label','장르');
      const genreWrap=node('div','chip-input-wrap'),genreInput=node('input','text-input genre-chip-input');
      genreInput.type='text';genreInput.id='genre-input-'+index;genreInput.dataset.field='genres';genreLabel.htmlFor=genreInput.id;
      genreInput.placeholder='장르를 입력하고 Enter를 누르세요';genreInput.autocomplete='off';genreInput.value=genreDrafts.get(item)||'';
      const chipBox=node('div','chip-box genre-chip-box');chipBox.setAttribute('aria-label','장르 목록');
      const genreHint=node('p','field-hint','Enter로 추가 · ×로 삭제 · 각 30자, 최대 3개');
      const genreStatus=node('p','field-hint genre-status');genreStatus.id='genre-status-'+index;genreStatus.setAttribute('role','status');
      genreInput.setAttribute('aria-describedby',genreStatus.id);
      function renderChips(){
        chipBox.replaceChildren();
        item.genres.forEach((genre,genreIndex)=>{
          const chip=node('span','chip is-custom');chip.append(node('span','',genre),node('span','chip-kind','직접 입력'));
          const remove=node('button','','×');remove.type='button';remove.setAttribute('aria-label',genre+' 장르 삭제');
          remove.addEventListener('click',()=>{if(busy||!ready)return;item.genres.splice(genreIndex,1);dirty=true;renderChips();genreInput.focus();genreStatus.textContent='장르를 삭제했습니다. 작품을 저장해 주세요.';});
          chip.append(remove);chipBox.append(chip);
        });
      }
      genreInput.addEventListener('input',()=>{genreDrafts.set(item,genreInput.value);dirty=true;genreStatus.textContent='';});
      genreInput.addEventListener('keydown',event=>{
        if(event.key!=='Enter')return;
        // Do not submit the whole form or commit a half-composed Korean syllable.
        if(event.isComposing||event.keyCode===229)return;
        event.preventDefault();
        if(event.repeat||busy||!ready)return;
        const value=genreInput.value.trim().replace(/\s+/g,' ');
        if(!value){genreInput.value='';genreDrafts.delete(item);return;}
        if(value.length>30){genreStatus.textContent='장르는 30자 이하로 입력해 주세요.';return;}
        if(item.genres.some(genre=>genre.trim().replace(/\s+/g,' ').toLowerCase()===value.toLowerCase())){
          genreInput.value='';genreDrafts.delete(item);genreStatus.textContent='이미 추가한 장르입니다.';return;
        }
        if(item.genres.length>=3){genreStatus.textContent='장르는 최대 3개까지 추가할 수 있습니다.';return;}
        item.genres.push(value);dirty=true;genreInput.value='';genreDrafts.delete(item);renderChips();genreStatus.textContent='장르를 추가했습니다. 작품을 저장해 주세요.';
      });
      renderChips();if(item.genres.length>3)genreStatus.textContent='기존 장르는 보관되어 있습니다. 저장하려면 3개 이하로 정리해 주세요.';genreWrap.append(genreInput,chipBox,genreHint,genreStatus);genreGroup.append(genreLabel,genreWrap);fields.append(genreGroup);
      const roles=node('div','field-group');roles.append(node('span','field-label','참여 역할'));const list=node('div','role-option-list');
      const actorFields=[];
      function actorState(){actorFields.forEach(el=>{el.dataset.actorDisabled=String(!item.roles.includes('ACTOR'));el.disabled=!item.roles.includes('ACTOR');});}
      for(const [value,text] of Object.entries(labels)){
        const label=node('label','role-option'),check=document.createElement('input');check.type='checkbox';check.value=value;check.checked=item.roles.includes(value);
        check.addEventListener('change',()=>{item.roles=[...list.querySelectorAll('input:checked')].map(el=>el.value);if(!item.roles.includes('ACTOR')){item.castType='';item.characterName='';actorFields.forEach(el=>el.value='');}actorState();dirty=true;});label.append(check,document.createTextNode(text));list.append(label);
      }
      roles.append(list);fields.append(roles);
      actorFields.push(field('캐스팅 구분','castType',{choices:{'':'선택',LEAD:'주연',SUPPORTING:'조연',CAMEO:'단역'}}),field('극중 배역이름','characterName',{maxLength:100}));actorState();
      const roleGrid=node('div','film-meta-grid role-fields');roleGrid.append(roles,...actorFields.map(el=>el.parentElement));fields.append(roleGrid);
      const media=node('div','upload-block');media.append(node('div','field-label','섬네일 업로드'));
      const zone=node('div','dropzone thumb-dropzone');
      const draft=mediaDrafts.get(item),hasThumbnail=draft?.thumbnailChanged?draft.thumbnailPresent:thumbnailIds.has(item.id);
      if(!hasThumbnail)zone.append(dropIcon('섬네일'));
      if(hasThumbnail){
        const preview=node('img','thumbnail-preview');preview.src=draft?.thumbnailChanged?'/api/filmography-drafts/'+draft.id+'/thumbnail?v='+Date.now():'/api/filmography/'+encodeURIComponent(item.id)+'/thumbnail?v='+version;preview.alt=item.title+' 섬네일';zone.append(preview);
        preview.addEventListener('error',()=>{$('filmStatus').textContent='섬네일을 읽지 못했습니다. 다시 읽기를 눌러 주세요.';});
      }
      const file=node('input','thumb-file-input');file.type='file';file.accept='image/jpeg,image/png';file.hidden=true;
      const browse=node('button','thumb-browse-btn',hasThumbnail?'섬네일 교체':'파일 선택');browse.type='button';
      browse.addEventListener('click',()=>file.click());
      file.addEventListener('change',()=>{if(file.files[0])void changeThumbnail(item,file.files[0]);});
      zone.addEventListener('dragover',event=>event.preventDefault());zone.addEventListener('drop',event=>{event.preventDefault();if(event.dataTransfer.files.length!==1){$('filmStatus').textContent='섬네일은 한 장씩 선택해 주세요.';return;}void changeThumbnail(item,event.dataTransfer.files[0]);});
      const thumbActions=node('div','media-actions');thumbActions.append(browse);zone.append(file,thumbActions);
      if(hasThumbnail){const remove=node('button','delete-film-btn','섬네일 삭제');remove.type='button';remove.addEventListener('click',()=>{if(confirm('섬네일을 삭제하도록 변경할까요? 마지막 저장 시 반영됩니다.'))void changeThumbnail(item,null);});thumbActions.append(remove);}
      media.append(zone);
      for(const kind of ['trailer','video']){
      const isTrailer=kind==='trailer',label=isTrailer?'트레일러':'영상';
      media.append(node('div','field-label',isTrailer?'트레일러':'원본 영상'));
      const videoZone=node('div','dropzone '+kind+'-dropzone'),video=isTrailer?(draft?.trailerChanged?draft.trailer:trailers.find(v=>v.filmId===item.id)):(draft?.videoChanged?draft.video:videos.find(v=>v.filmId===item.id));
      if(!video)videoZone.append(dropIcon(label));
      if(video)videoZone.append(node('p','file-info '+kind+'-info',video.name+' · '+(video.bytes/1024/1024).toFixed(1)+'MB · '+(video.available?'파일 저장 완료':'저장 파일을 찾을 수 없거나 크기가 달라졌습니다. 다시 선택해 주세요.')));
      const videoFile=node('input',kind+'-file-input');videoFile.type='file';videoFile.accept='.mp4,.mov';videoFile.hidden=true;
      const selectVideo=node('button','thumb-browse-btn',label+(video?' 교체':' 선택'));selectVideo.type='button';
      selectVideo.addEventListener('click',()=>videoFile.click());
      videoFile.addEventListener('change',()=>{if(videoFile.files[0])void changeVideo(item,videoFile.files[0],kind);});
      videoZone.addEventListener('dragover',event=>event.preventDefault());videoZone.addEventListener('drop',event=>{event.preventDefault();if(event.dataTransfer.files.length!==1){$('filmStatus').textContent='영상은 한 개씩 선택해 주세요.';return;}void changeVideo(item,event.dataTransfer.files[0],kind);});
      const videoActions=node('div','media-actions');videoActions.append(selectVideo);videoZone.append(videoFile);
      if(video){const unlink=node('button','ghost-btn',label+' 연결 해제');unlink.type='button';unlink.addEventListener('click',()=>{if(confirm('마지막 저장 시 '+label+' 연결을 해제합니다. 복사본은 보관됩니다.'))void changeVideo(item,null,kind);});videoActions.append(unlink);}
      if(video?.available){
        const state=node('p','encoding-state');state.dataset.videoId=video.id;state.setAttribute('role','status');
        const progress=document.createElement('progress');progress.className='encoding-progress';progress.max=100;progress.value=0;progress.dataset.videoId=video.id;progress.setAttribute('aria-label',label+' 인코딩 진행률');progress.hidden=true;videoZone.append(progress);
        const encode=node('button','encoding-start ghost-btn','인코딩 시작');encode.type='button';encode.dataset.videoId=video.id;
        encode.addEventListener('click',()=>void requestEncoding(video.id));videoZone.append(state);videoActions.append(encode);
        const watch=node('button','encoding-watch ghost-btn',label+' 보기');watch.type='button';watch.dataset.videoId=video.id;watch.dataset.staged=String(!!(isTrailer?draft?.trailerChanged:draft?.videoChanged));watch.hidden=true;
        watch.addEventListener('click',()=>{if(busy)return;if(dirty){$('filmStatus').textContent='작품 정보 변경을 먼저 저장한 뒤 영상을 열어 주세요.';return;}location.href='/video-player.html?videoId='+encodeURIComponent(video.id);});videoActions.append(watch);
      }
      videoZone.append(videoActions);
      media.append(videoZone);
      }
      body.append(fields,media);card.append(body);$('filmList').append(card);
    });updateEncoding();controls();
  }
  function updateEncoding(){
    const labels={QUEUED:'인코딩 대기 중',RUNNING:'인코딩 중',DONE:'HLS 변환 완료',FAILED:'인코딩 실패',INTERRUPTED:'앱 종료로 중단됨'};
    document.querySelectorAll('.encoding-state').forEach(el=>{const job=encodingJobs.find(j=>j.videoId===el.dataset.videoId);el.textContent=!encodingKnown?'인코딩 상태를 확인할 수 없습니다. 잠시 후 자동으로 다시 확인합니다.':job?[labels[job.status],['RUNNING','DONE'].includes(job.status)?job.progress+'%':'',['FAILED','INTERRUPTED'].includes(job.status)?job.message:''].filter(Boolean).join(' · '):'인코딩 전';});
    document.querySelectorAll('.encoding-progress').forEach(el=>{const job=encodingJobs.find(j=>j.videoId===el.dataset.videoId);el.hidden=!encodingKnown||!['QUEUED','RUNNING','DONE'].includes(job?.status);el.value=job?.progress||0;});
    document.querySelectorAll('.encoding-start').forEach(el=>{const job=encodingJobs.find(j=>j.videoId===el.dataset.videoId);el.dataset.encodingDisabled=String(!encodingKnown||['QUEUED','RUNNING','DONE'].includes(job?.status));el.textContent=['FAILED','INTERRUPTED'].includes(job?.status)?'인코딩 재시도':'인코딩 시작';});
    document.querySelectorAll('.encoding-watch').forEach(el=>{el.hidden=el.dataset.staged==='true'||!encodingKnown||!encodingJobs.some(j=>j.videoId===el.dataset.videoId&&j.status==='DONE');});
  }
  async function pollEncoding(){
    if(encodingPolling)return;encodingPolling=true;
    try{const res=await fetch('/api/encoding');if(!res.ok)throw new Error();encodingJobs=await res.json();encodingKnown=true;}
    catch{encodingKnown=false;}finally{encodingPolling=false;updateEncoding();controls();}
  }
  async function requestEncoding(videoId){
    if(busy||!ready)return;
    busy=true;controls();
    try{const res=await fetch('/api/videos/'+encodeURIComponent(videoId)+'/encoding',{method:'POST'});if(!res.ok)throw new Error();await pollEncoding();$('filmStatus').textContent='인코딩 작업을 접수했습니다. 앱을 열어 두면 한 개씩 처리합니다.';}
    catch{$('filmStatus').textContent='작업 접수 결과를 확인하지 못했습니다. 인코딩 상태를 확인한 뒤 다시 시도해 주세요.';await pollEncoding();}
    finally{busy=false;controls();}
  }
  const encodingTimer=setInterval(()=>void pollEncoding(),2000);
  window.addEventListener('pagehide',()=>clearInterval(encodingTimer));
  void pollEncoding();
  function move(index,offset){const next=index+offset;if(next<0||next>=items.length)return;[items[index],items[next]]=[items[next],items[index]];dirty=true;render();}
  async function ensureDraft(item){
    if(mediaDrafts.has(item))return mediaDrafts.get(item);
    const res=await fetch('/api/filmography-drafts',{method:'POST'});if(!res.ok)throw new Error('임시 작업을 만들지 못했습니다.');
    const draft=await res.json();mediaDrafts.set(item,draft);return draft;
  }
  async function recoverDraft(item,error){
    const draft=mediaDrafts.get(item);
    if(draft){uncertainMedia.add(item);try{const res=await fetch('/api/filmography-drafts/'+draft.id);if(res.ok){mediaDrafts.set(item,await res.json());uncertainMedia.delete(item);render();}}catch{}}
    $('filmStatus').textContent=error.message+' 작품 정보는 유지됩니다. 파일 표시를 확인한 뒤 다시 선택해 주세요.';
    if(uncertainMedia.has(item))$('filmStatus').textContent+=' 임시 파일 상태를 확인하지 못해 저장을 잠시 막았습니다. 해당 파일을 다시 선택하거나 다시 읽기로 편집을 취소해 주세요.';
  }
  async function changeVideo(item,file,kind='video'){
    if(busy||!ready)return;
    if(file&&(!/\.(mp4|mov)$/i.test(file.name)||file.size===0||file.size>2*1024*1024*1024)){$('filmStatus').textContent='MP4/MOV 파일을 선택해 주세요. 빈 파일은 저장할 수 없으며 최대 2GB입니다.';return;}
    busy=true;dirty=true;controls();$('filmStatus').textContent='영상 임시 복사 중입니다. 앱을 종료하지 마세요.';
    try{
      const draft=await ensureDraft(item),url='/api/filmography-drafts/'+draft.id+'/'+kind;
      if(file)await new Promise((resolve,reject)=>{
        const xhr=new XMLHttpRequest();xhr.open('POST',url+'?name='+encodeURIComponent(file.name));xhr.setRequestHeader('Content-Type','application/octet-stream');
        xhr.upload.addEventListener('progress',event=>{if(event.lengthComputable)$('filmStatus').textContent='영상 복사 전송 '+Math.round(event.loaded/event.total*100)+'% · 저장 확인 중 (앱을 종료하지 마세요)';});
        xhr.onload=()=>{if(xhr.status>=200&&xhr.status<300){resolve();return;}let message='영상 저장에 실패했습니다.';try{message=JSON.parse(xhr.responseText).message||message;}catch{}reject(new Error(message));};
        xhr.onerror=xhr.onabort=()=>reject(new Error('영상 전송이 중단됐습니다.'));xhr.send(file);
      });
      else {const res=await fetch(url,{method:'DELETE'});if(!res.ok)throw new Error('영상 연결 해제 결과를 확인하지 못했습니다.');}
      const res=await fetch('/api/filmography-drafts/'+draft.id);if(!res.ok)throw new Error('임시 상태를 확인하지 못했습니다.');mediaDrafts.set(item,await res.json());
      uncertainMedia.delete(item);render();$('filmStatus').textContent=file?'영상을 임시 보관했습니다. 지금 인코딩할 수 있으며 마지막 저장 시 작품에 연결됩니다.':'영상 연결 해제를 준비했습니다. 마지막 저장 시 반영됩니다.';
    }catch(error){await recoverDraft(item,error);}
    finally{busy=false;controls();}
  }
  async function changeThumbnail(item,file){
    if(busy||!ready)return;
    busy=true;dirty=true;controls();$('filmStatus').textContent='섬네일 준비 중입니다.';
    try{
      const draft=await ensureDraft(item),url='/api/filmography-drafts/'+draft.id+'/thumbnail';
      let res;
      if(file){const body=new FormData();body.append('file',file);res=await fetch(url,{method:'POST',body});}
      else res=await fetch(url,{method:'DELETE'});
      if(!res.ok){const data=await res.json().catch(()=>({}));throw new Error(data.message||'섬네일을 저장하지 못했습니다.');}
      mediaDrafts.set(item,await res.json());
      uncertainMedia.delete(item);render();$('filmStatus').textContent=file?'섬네일을 준비했습니다. 마지막 저장 시 반영됩니다.':'섬네일 삭제를 준비했습니다. 마지막 저장 시 반영됩니다.';
    }catch(error){await recoverDraft(item,error);}
    finally{busy=false;controls();}
  }
  async function load(){
    if(busy||(dirty&&!confirm('저장하지 않은 변경을 버리고 다시 읽을까요?')))return;
    busy=true;ready=false;controls();$('filmStatus').textContent='필모그래피를 불러오는 중입니다.';
    try{
      const profile=await fetch('/api/profile');if(!profile.ok)throw new Error();if(!(await profile.json()).name?.trim()){location.replace('/index.html?edit=1');return;}
      const res=await fetch('/api/filmography');if(!res.ok)throw new Error();const data=await res.json();version=data.version;items=data.items;thumbnailIds=new Set(data.thumbnailIds);videos=data.videos||[];trailers=data.trailers||[];dirty=false;ready=true;render();$('filmStatus').textContent='작품 정보·섬네일·영상을 준비한 뒤 저장해 주세요. 저장 전에도 영상 인코딩을 시작할 수 있습니다.';
    }catch{$('filmStatus').textContent='읽지 못했습니다. 다시 읽기를 눌러 주세요. 기존 저장 내용은 변경하지 않았습니다.';}
    finally{busy=false;controls();}
  }
  $('addFilmBtn').addEventListener('click',()=>{items.push({id:null,title:'',year:null,runtime:null,ageRating:'',roles:[],genres:[],castType:'',characterName:''});dirty=true;render();$('filmList').lastElementChild.querySelector('input').focus();});
  $('filmographyForm').addEventListener('submit',async event=>{
    event.preventDefault();if(!ready||busy||items.some(item=>uncertainMedia.has(item)))return;
    const pending=items.find(item=>(genreDrafts.get(item)||'').trim());
    if(pending){$('filmStatus').textContent='입력 중인 장르를 Enter로 추가하거나 지운 뒤 저장해 주세요.';document.getElementById('genre-input-'+items.indexOf(pending)).focus();return;}
    if(items.some(item=>!item.title.trim()||item.genres.length>3||item.genres.some(g=>g.length>30))){$('filmStatus').textContent='제목과 장르를 확인해 주세요. 장르는 각 30자, 최대 3개입니다.';return;}
    busy=true;controls();$('filmStatus').textContent='저장 중입니다.';
    try{
      const media=items.flatMap((item,index)=>mediaDrafts.has(item)?[{index,draftId:mediaDrafts.get(item).id}]:[]);
      const res=await fetch('/api/filmography',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({version,items,media})});
      if(!res.ok){if(res.status===409){ready=false;throw new Error('다른 변경이 있거나 앞선 저장이 완료됐습니다. 다시 읽기로 확인해 주세요.');}if(res.status===400){const error=new Error('입력 형식과 길이를 확인해 주세요.');error.correctable=true;throw error;}throw new Error('저장 결과를 확인하지 못했습니다. 다시 읽기로 확인해 주세요.');}
      await res.json();dirty=false;busy=false;
      try{sessionStorage.setItem('onfilm.filmographySaved','1');}catch{}
      location.assign('/profile.html');
    }catch(error){if(!error.correctable)ready=false;$('filmStatus').textContent=error.correctable?error.message:'저장 결과를 확인하지 못했습니다. 입력 내용은 화면에 남아 있습니다. 응답이 유실됐을 수 있으니 다시 읽기로 저장 상태를 확인해 주세요.';}
    finally{busy=false;controls();}
  });
  $('reloadFilms').addEventListener('click',load);
  window.addEventListener('beforeunload',event=>{if(dirty||busy){event.preventDefault();event.returnValue='';}});
  void load();
})();

(() => {
  const $=id=>document.getElementById(id);
  let version=0, items=[], dirty=false, busy=false, ready=false;
  let thumbnailIds=new Set();
  let videos=[];
  let encodingJobs=[],encodingKnown=false,encodingPolling=false;
  const genreDrafts=new WeakMap();
  const labels={ACTOR:'배우',DIRECTOR:'감독',WRITER:'작가'};
  function node(tag,cls,text) {const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;}
  function controls() {
    $('addFilmBtn').disabled=!ready||busy||items.length>=50;$('saveFilms').disabled=!ready||busy;
    $('reloadFilms').disabled=busy;
    $('filmList').querySelectorAll('input,select,button').forEach(el=>el.disabled=busy||!ready||el.dataset.actorDisabled==='true'||el.dataset.unsaved==='true'||el.dataset.encodingDisabled==='true');
  }
  function render() {
    $('filmList').replaceChildren();$('filmEmptyHint').hidden=items.length>0;
    items.forEach((item,index)=>{
      const card=node('article','film-card'),header=node('div','film-card-header'),title=node('div','film-card-title',item.title||'새 작품'),actions=node('div','film-card-actions');
      function action(label,fn,cls='ghost-btn') {const b=node('button',cls,label);b.type='button';b.addEventListener('click',fn);actions.append(b);}
      action('위로',()=>move(index,-1));action('아래로',()=>move(index,1));
      action('삭제',()=>{if(confirm('이 작품을 삭제할까요? 저장을 눌러야 반영됩니다.')){items.splice(index,1);dirty=true;render();}},'delete-film-btn');
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
      const genreHint=node('p','field-hint','Enter로 추가 · ×로 삭제 · 각 30자, 최대 10개 · 작품 저장 시 반영');
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
        if(item.genres.length>=10){genreStatus.textContent='장르는 최대 10개까지 추가할 수 있습니다.';return;}
        item.genres.push(value);dirty=true;genreInput.value='';genreDrafts.delete(item);renderChips();genreStatus.textContent='장르를 추가했습니다. 작품을 저장해 주세요.';
      });
      renderChips();genreWrap.append(genreInput,chipBox,genreHint,genreStatus);genreGroup.append(genreLabel,genreWrap);fields.append(genreGroup);
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
      zone.append(node('p','field-hint',item.id?'JPEG/PNG · 5MB 이하 · 긴 변 2,048px 자동 축소. 섬네일 변경은 즉시 저장됩니다.':'작품을 먼저 저장한 뒤 편집 화면을 다시 열면 섬네일을 추가할 수 있습니다.'));
      if(thumbnailIds.has(item.id)){
        const preview=node('img','thumbnail-preview');preview.src='/api/filmography/'+encodeURIComponent(item.id)+'/thumbnail?v='+version;preview.alt=item.title+' 섬네일';zone.append(preview);
        preview.addEventListener('error',()=>{$('filmStatus').textContent='섬네일을 읽지 못했습니다. 다시 읽기를 눌러 주세요.';});
      }
      const file=node('input','thumb-file-input');file.type='file';file.accept='image/jpeg,image/png';file.hidden=true;file.dataset.unsaved=String(!item.id);
      const browse=node('button','thumb-browse-btn',thumbnailIds.has(item.id)?'섬네일 교체':'파일 선택');browse.type='button';browse.dataset.unsaved=String(!item.id);
      browse.addEventListener('click',()=>{if(dirty){$('filmStatus').textContent='작품 정보 변경을 먼저 저장한 뒤 섬네일을 변경해 주세요.';return;}file.click();});
      file.addEventListener('change',()=>{if(file.files[0])void changeThumbnail(item,file.files[0]);});
      zone.addEventListener('dragover',event=>event.preventDefault());zone.addEventListener('drop',event=>{event.preventDefault();if(event.dataTransfer.files.length!==1){$('filmStatus').textContent='섬네일은 한 장씩 선택해 주세요.';return;}void changeThumbnail(item,event.dataTransfer.files[0]);});
      zone.append(file,browse);
      if(thumbnailIds.has(item.id)){const remove=node('button','delete-film-btn','섬네일 삭제');remove.type='button';remove.addEventListener('click',()=>{if(confirm('섬네일을 삭제할까요? 즉시 저장됩니다.'))void changeThumbnail(item,null);});zone.append(remove);}
      media.append(zone);
      media.append(node('div','field-label','트레일러'),node('div','dropzone','트레일러는 다음 단계에서 지원합니다.'));
      media.append(node('div','field-label','원본 영상'));
      const videoZone=node('div','dropzone video-dropzone'),video=videos.find(v=>v.filmId===item.id);
      videoZone.append(node('p','field-hint','MP4/MOV · 최대 2GB · 앱 폴더로 복사합니다. 원본은 변경하지 않습니다. 저장 후 HLS 인코딩을 완료하면 프로필의 작품 카드에서 재생할 수 있습니다.'));
      if(video)videoZone.append(node('p','file-info video-info',video.name+' · '+(video.bytes/1024/1024).toFixed(1)+'MB · '+(video.available?'원본 저장 완료':'저장 파일을 찾을 수 없거나 크기가 달라졌습니다. 다시 선택해 주세요.')));
      if(!item.id)videoZone.append(node('p','field-hint','작품을 먼저 저장한 뒤 편집 화면을 다시 열어 주세요.'));
      const videoFile=node('input','video-file-input');videoFile.type='file';videoFile.accept='.mp4,.mov';videoFile.hidden=true;videoFile.dataset.unsaved=String(!item.id);
      const selectVideo=node('button','thumb-browse-btn',video?'영상 교체':'영상 선택');selectVideo.type='button';selectVideo.dataset.unsaved=String(!item.id);
      selectVideo.addEventListener('click',()=>{if(dirty){$('filmStatus').textContent='작품 정보 변경을 먼저 저장한 뒤 영상을 선택해 주세요.';return;}videoFile.click();});
      videoFile.addEventListener('change',()=>{if(videoFile.files[0])void changeVideo(item,videoFile.files[0]);});
      videoZone.addEventListener('dragover',event=>event.preventDefault());videoZone.addEventListener('drop',event=>{event.preventDefault();if(event.dataTransfer.files.length!==1){$('filmStatus').textContent='영상은 한 개씩 선택해 주세요.';return;}void changeVideo(item,event.dataTransfer.files[0]);});
      videoZone.append(videoFile,selectVideo);
      if(video){const unlink=node('button','ghost-btn','영상 연결 해제');unlink.type='button';unlink.addEventListener('click',()=>{if(confirm('영상 연결을 해제할까요? 복사본은 복구를 위해 앱 폴더에 보관됩니다.'))void changeVideo(item,null);});videoZone.append(unlink);}
      if(video?.available){
        const state=node('p','encoding-state');state.dataset.videoId=video.id;state.setAttribute('role','status');
        const encode=node('button','encoding-start ghost-btn','인코딩 시작');encode.type='button';encode.dataset.videoId=video.id;
        encode.addEventListener('click',()=>void requestEncoding(video.id));videoZone.append(state,encode);
        const watch=node('button','encoding-watch ghost-btn','영상 보기');watch.type='button';watch.dataset.videoId=video.id;watch.hidden=true;
        watch.addEventListener('click',()=>{if(busy)return;if(dirty){$('filmStatus').textContent='작품 정보 변경을 먼저 저장한 뒤 영상을 열어 주세요.';return;}location.href='/video-player.html?videoId='+encodeURIComponent(video.id);});videoZone.append(watch);
      }
      videoZone.append(node('p','field-hint','영상 변경은 즉시 저장됩니다. 교체·연결 해제한 이전 복사본은 보관됩니다.'));
      media.append(videoZone);
      body.append(fields,media);card.append(body);$('filmList').append(card);
    });updateEncoding();controls();
  }
  function updateEncoding(){
    const labels={QUEUED:'인코딩 대기 중',RUNNING:'인코딩 중 · 다른 편집은 계속할 수 있습니다.',DONE:'HLS 변환 완료 · 영상 보기 또는 프로필 작품 카드에서 재생할 수 있습니다.',FAILED:'인코딩 실패',INTERRUPTED:'앱 종료로 중단됨'};
    document.querySelectorAll('.encoding-state').forEach(el=>{const job=encodingJobs.find(j=>j.videoId===el.dataset.videoId);el.textContent=!encodingKnown?'인코딩 상태를 확인할 수 없습니다. 잠시 후 자동으로 다시 확인합니다.':job?[labels[job.status],job.message].filter(Boolean).join(' · '):'인코딩 전';});
    document.querySelectorAll('.encoding-start').forEach(el=>{const job=encodingJobs.find(j=>j.videoId===el.dataset.videoId);el.dataset.encodingDisabled=String(!encodingKnown||['QUEUED','RUNNING','DONE'].includes(job?.status));el.textContent=['FAILED','INTERRUPTED'].includes(job?.status)?'인코딩 재시도':'인코딩 시작';});
    document.querySelectorAll('.encoding-watch').forEach(el=>{el.hidden=!encodingKnown||!encodingJobs.some(j=>j.videoId===el.dataset.videoId&&j.status==='DONE');});
  }
  async function pollEncoding(){
    if(encodingPolling)return;encodingPolling=true;
    try{const res=await fetch('/api/encoding');if(!res.ok)throw new Error();encodingJobs=await res.json();encodingKnown=true;}
    catch{encodingKnown=false;}finally{encodingPolling=false;updateEncoding();controls();}
  }
  async function requestEncoding(videoId){
    if(busy||!ready)return;if(dirty){$('filmStatus').textContent='작품 정보 변경을 먼저 저장한 뒤 인코딩을 시작해 주세요.';return;}
    busy=true;controls();
    try{const res=await fetch('/api/videos/'+encodeURIComponent(videoId)+'/encoding',{method:'POST'});if(!res.ok)throw new Error();await pollEncoding();$('filmStatus').textContent='인코딩 작업을 접수했습니다. 앱을 열어 두면 한 개씩 처리합니다.';}
    catch{$('filmStatus').textContent='작업 접수 결과를 확인하지 못했습니다. 인코딩 상태를 확인한 뒤 다시 시도해 주세요.';await pollEncoding();}
    finally{busy=false;controls();}
  }
  const encodingTimer=setInterval(()=>void pollEncoding(),2000);
  window.addEventListener('pagehide',()=>clearInterval(encodingTimer));
  void pollEncoding();
  function move(index,offset){const next=index+offset;if(next<0||next>=items.length)return;[items[index],items[next]]=[items[next],items[index]];dirty=true;render();}
  async function changeVideo(item,file){
    if(busy||!ready)return;
    if(dirty||!item.id){$('filmStatus').textContent='작품 정보 변경을 먼저 저장한 뒤 영상을 선택해 주세요.';return;}
    if(file&&(!/\.(mp4|mov)$/i.test(file.name)||file.size===0||file.size>2*1024*1024*1024)){$('filmStatus').textContent='MP4/MOV 파일을 선택해 주세요. 빈 파일은 저장할 수 없으며 최대 2GB입니다.';return;}
    busy=true;controls();$('filmStatus').textContent='영상 저장 중입니다. 앱을 종료하지 마세요.';
    try{
      const url='/api/filmography/'+encodeURIComponent(item.id)+'/video?version='+version;
      if(file)await new Promise((resolve,reject)=>{
        const xhr=new XMLHttpRequest();xhr.open('POST',url+'&name='+encodeURIComponent(file.name));xhr.setRequestHeader('Content-Type','application/octet-stream');
        xhr.upload.addEventListener('progress',event=>{if(event.lengthComputable)$('filmStatus').textContent='영상 복사 전송 '+Math.round(event.loaded/event.total*100)+'% · 저장 확인 중 (앱을 종료하지 마세요)';});
        xhr.onload=()=>{if(xhr.status>=200&&xhr.status<300){resolve();return;}let message='영상 저장에 실패했습니다.';try{message=JSON.parse(xhr.responseText).message||message;}catch{}reject(new Error(message));};
        xhr.onerror=xhr.onabort=()=>reject(new Error('영상 전송이 중단됐습니다.'));xhr.send(file);
      });
      else {const res=await fetch(url,{method:'DELETE'});if(!res.ok)throw new Error('영상 연결 해제 결과를 확인하지 못했습니다.');}
      const res=await fetch('/api/filmography');if(!res.ok)throw new Error('저장 상태를 확인하지 못했습니다.');const data=await res.json();version=data.version;items=data.items;thumbnailIds=new Set(data.thumbnailIds);videos=data.videos||[];
      render();$('filmStatus').textContent=file?'영상을 저장하고 작품에 연결했습니다. 아직 인코딩 전입니다.':'영상 연결을 해제했습니다. 복사본은 보관됩니다.';
    }catch(error){ready=false;$('filmStatus').textContent=error.message+' 응답이 유실됐을 수 있으니 다시 읽기로 저장 상태를 확인해 주세요.';}
    finally{busy=false;controls();}
  }
  async function changeThumbnail(item,file){
    if(busy||!ready)return;
    if(dirty||!item.id){$('filmStatus').textContent='작품 정보 변경을 먼저 저장한 뒤 섬네일을 변경해 주세요.';return;}
    busy=true;controls();$('filmStatus').textContent='섬네일 저장 중입니다.';
    try{
      const url='/api/filmography/'+encodeURIComponent(item.id)+'/thumbnail';
      let res;
      if(file){const body=new FormData();body.append('file',file);body.append('version',version);res=await fetch(url,{method:'POST',body});}
      else res=await fetch(url+'?version='+version,{method:'DELETE'});
      if(!res.ok){const data=await res.json().catch(()=>({}));throw new Error(data.message||'섬네일을 저장하지 못했습니다.');}
      version=(await res.json()).version;if(file)thumbnailIds.add(item.id);else thumbnailIds.delete(item.id);
      render();$('filmStatus').textContent=file?'섬네일을 저장했습니다.':'섬네일을 삭제했습니다.';
    }catch(error){ready=false;$('filmStatus').textContent=error.message+' 응답 유실 시 저장됐을 수 있으니 다시 읽기로 확인해 주세요.';}
    finally{busy=false;controls();}
  }
  async function load(){
    if(busy||(dirty&&!confirm('저장하지 않은 변경을 버리고 다시 읽을까요?')))return;
    busy=true;ready=false;controls();$('filmStatus').textContent='필모그래피를 불러오는 중입니다.';
    try{
      const profile=await fetch('/api/profile');if(!profile.ok)throw new Error();if(!(await profile.json()).name?.trim()){location.replace('/index.html?edit=1');return;}
      const res=await fetch('/api/filmography');if(!res.ok)throw new Error();const data=await res.json();version=data.version;items=data.items;thumbnailIds=new Set(data.thumbnailIds);videos=data.videos||[];dirty=false;ready=true;render();$('filmStatus').textContent='불러왔습니다. 작품 정보는 저장 버튼으로, 섬네일·영상 연결은 즉시 저장됩니다.';
    }catch{$('filmStatus').textContent='읽지 못했습니다. 다시 읽기를 눌러 주세요. 기존 저장 내용은 변경하지 않았습니다.';}
    finally{busy=false;controls();}
  }
  $('addFilmBtn').addEventListener('click',()=>{items.push({id:null,title:'',year:null,runtime:null,ageRating:'',roles:[],genres:[],castType:'',characterName:''});dirty=true;render();$('filmList').lastElementChild.querySelector('input').focus();});
  $('filmographyForm').addEventListener('submit',async event=>{
    event.preventDefault();if(!ready||busy)return;
    const pending=items.find(item=>(genreDrafts.get(item)||'').trim());
    if(pending){$('filmStatus').textContent='입력 중인 장르를 Enter로 추가하거나 지운 뒤 저장해 주세요.';document.getElementById('genre-input-'+items.indexOf(pending)).focus();return;}
    if(items.some(item=>!item.title.trim()||item.genres.length>10||item.genres.some(g=>g.length>30))){$('filmStatus').textContent='제목과 장르의 길이·개수를 확인해 주세요.';return;}
    busy=true;controls();$('filmStatus').textContent='저장 중입니다.';
    try{
      const res=await fetch('/api/filmography',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({version,items})});
      if(!res.ok){if(res.status===409){ready=false;throw new Error('다른 변경이 있거나 앞선 저장이 완료됐습니다. 다시 읽기로 확인해 주세요.');}if(res.status===400){const error=new Error('입력 형식과 길이를 확인해 주세요.');error.correctable=true;throw error;}throw new Error('저장 결과를 확인하지 못했습니다. 다시 읽기로 확인해 주세요.');}
      await res.json();dirty=false;location.assign('/profile.html');
    }catch(error){if(!error.correctable)ready=false;$('filmStatus').textContent=error.correctable?error.message:'저장 결과를 확인하지 못했습니다. 입력 내용은 화면에 남아 있습니다. 응답이 유실됐을 수 있으니 다시 읽기로 저장 상태를 확인해 주세요.';}
    finally{busy=false;controls();}
  });
  $('reloadFilms').addEventListener('click',load);
  window.addEventListener('beforeunload',event=>{if(dirty||busy){event.preventDefault();event.returnValue='';}});
  void load();
})();

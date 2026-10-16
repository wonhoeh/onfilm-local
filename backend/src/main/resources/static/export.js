(() => {
  const $=id=>document.getElementById(id);let busy=false,publishing=false,pendingExportId=null,stopPending=false,stopped=false,canStop=false;
  const node=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  const controls=()=>{$('createExport').disabled=busy||publishing||!$('confirmExport').checked;$('reloadExports').disabled=busy||publishing;$('readStorage').disabled=busy||publishing||!window.onfilmExports;$('exportsList').querySelectorAll('button').forEach(button=>button.disabled=busy||publishing||(button.dataset.action==='publish'&&stopPending));$('checkPublication').disabled=busy||publishing;$('stopPublication').disabled=busy||publishing||!!pendingExportId||!canStop||stopped;};
  function showPublication(result){
    $('cancelPublication').hidden=!result.busy;
    pendingExportId=result.pendingExportId||null;$('checkPublication').hidden=!pendingExportId;
    stopPending=Boolean(result.stopPending);stopped=Boolean(result.stopped);canStop=Boolean(result.canStop);
    $('stopPublication').hidden=!window.onfilmExports?.stopPublication||!result.configured;
    $('stopPublication').textContent=stopped?'게시 종료됨':stopPending?'게시 종료 재시도':'게시 종료';
    $('stopPublication').title=canStop?'':'Cloudflare 연결에서 R2 관리 API Token을 저장해 주세요.';
    $('publishStatus').textContent=!result.configured&&!result.busy&&result.status==='idle'?'Cloudflare 연결에서 공개 주소와 키를 먼저 저장해 주세요.':result.message;
    const progress=result.progress;$('publishProgress').hidden=!result.busy||!progress;
    if(progress){$('publishProgress').value=progress.totalBytes?Math.round(progress.bytes/progress.totalBytes*100):100;$('publishStatus').textContent+=` ${progress.completed}/${progress.total}개 · ${$('publishProgress').value}%`;}
    const last=result.lastPublished;
    $('publishedUrl').textContent=last?`최근 게시: ${last.url} · ${new Date(last.publishedAt).toLocaleString('ko-KR')}`:result.url?`공개 예정 주소: ${result.url}`:'';
  }
  async function publicationStatus(){
    if(!window.onfilmExports?.publicationStatus){$('publishStatus').textContent='데스크톱 앱에서 게시할 수 있습니다.';return;}
    try{const result=await window.onfilmExports.publicationStatus();showPublication(result);publishing=Boolean(result.busy);controls();if(publishing&&!publishCall) setTimeout(()=>void publicationStatus(),1000);}catch{$('publishStatus').textContent='게시 상태를 확인하지 못했습니다.';}
  }
  let publishCall=false;
  async function publish(id,stop=false){
    if(busy||publishing)return;publishing=true;publishCall=true;controls();
    $('publishStatus').textContent=stop?'게시 종료 대상을 확인하고 있습니다.':'게시할 공개본을 확인하고 있습니다.';
    const timer=setInterval(()=>void publicationStatus(),1000);
    try{showPublication(await (stop?window.onfilmExports.stopPublication():window.onfilmExports.publish(id)));}
    catch{$('publishStatus').textContent='게시 응답을 확인하지 못했습니다. 다시 들어와 배포 결과를 확인해 주세요.';}
    finally{clearInterval(timer);publishing=false;publishCall=false;controls();await publicationStatus();}
  }
  $('checkPublication').onclick=()=>{if(pendingExportId)void publish(pendingExportId);};
  $('stopPublication').onclick=()=>void publish(null,true);
  $('cancelPublication').onclick=async()=>{try{const result=await window.onfilmExports.cancelPublication();$('publishStatus').textContent=result.message;}catch{$('publishStatus').textContent='중단 결과를 확인하지 못했습니다. 잠시 후 상태를 확인해 주세요.';}};
  async function fileAction(id,action){
    if(busy)return;busy=true;controls();$('exportStatus').textContent=action==='saveZip'?'ZIP을 준비하고 저장 중입니다. 앱을 종료하지 마세요.':action==='trash'?'공개본을 확인하고 정리 중입니다.':'결과 폴더를 여는 중입니다.';
    try{const result=await window.onfilmExports[action](id);if(result.status==='trashed'){await reload();$('storageStatus').textContent='정리 후 사용량 확인을 다시 눌러 주세요.';}$('exportStatus').textContent=result.status==='saved'?'ZIP을 저장했습니다: '+result.name:result.status==='opened'?'결과 폴더를 열었습니다. site 폴더 안의 파일이 공개 대상입니다.':result.status==='trashed'?'선택한 공개본을 휴지통으로 이동했습니다. 휴지통을 비우기 전에는 OS에서 복구할 수 있습니다.':result.status==='cancelled'?'작업을 취소했습니다.':result.message;}
    catch{$('exportStatus').textContent='파일 작업 결과를 확인하지 못했습니다. 선택한 저장 폴더를 확인해 주세요.';}
    finally{busy=false;controls();}
  }
  $('confirmExport').onchange=controls;
  async function reload(){
    try{const res=await fetch('/api/exports');if(!res.ok)throw new Error();const data=await res.json();
      $('exportDirectory').textContent='저장 폴더: '+data.directory;$('exportsList').replaceChildren();
      for(const item of data.items){const row=node('article','export-row'),info=node('div','export-info'),actions=node('div','export-actions'),link=document.createElement('a');link.className='btn';link.textContent='미리보기';link.href='/api/exports/'+item.id+'/site/index.html';
        info.append(node('h3','export-name',new Date(item.createdAt).toLocaleString('ko-KR')),node('p','export-meta',item.fileCount+'개 파일 · '+(item.bytes/1024/1024).toFixed(2)+' MB'));actions.append(link);row.append(info,actions);
        if(window.onfilmExports)for(const [action,label] of [['saveZip','ZIP 저장'],['openFolder','폴더 열기'],['trash','휴지통 이동']]){const button=document.createElement('button');button.type='button';button.className='btn';button.dataset.action=action;button.onclick=()=>fileAction(item.id,action);button.textContent=label;actions.append(button);}
        if(window.onfilmExports?.publish){const button=node('button','btn','게시');button.type='button';button.dataset.action='publish';button.onclick=()=>void publish(item.id);actions.prepend(button);}
        $('exportsList').append(row);}
      $('exportStatus').textContent=data.busy?'공개본 생성 중입니다. 잠시 후 새로고침해 주세요.':data.items.length?'총 '+data.items.length+'개의 공개본 · 수정한 내용은 새 공개본에 반영됩니다.':'아직 만든 공개본이 없습니다.';
      controls();
    }catch{$('exportStatus').textContent='결과를 확인하지 못했습니다. 새로고침해 주세요.';}
  }
  $('reloadExports').onclick=reload;
  $('readStorage').onclick=async()=>{
    if(busy)return;busy=true;controls();$('storageStatus').textContent='사용량을 계산하고 있습니다.';
    try{const data=await window.onfilmExports.storageUsage();if(data.status!=='measured')throw new Error();
      const grid=node('div','storage-grid');for(const group of data.groups){const card=node('div','storage-item');card.append(node('span','',group.label),node('strong','',(group.bytes/1024/1024).toFixed(2)+' MB'));if(group.skipped)card.append(node('small','','누락·링크 등 일부 제외'));grid.append(card);}
      $('storageStatus').replaceChildren(grid,node('p','storage-total','합계: '+(data.total/1024/1024).toFixed(2)+' MB'));
    }catch{$('storageStatus').textContent='사용량을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.';}finally{busy=false;controls();}
  };
  $('createExport').onclick=async()=>{
    if(busy||!$('confirmExport').checked)return;busy=true;controls();$('exportStatus').textContent='공개본을 복사하는 중입니다. 앱을 종료하지 마세요.';
    try{const res=await fetch('/api/exports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({includeVisibleProfile:true})});
      if(!res.ok){const data=await res.json();throw new Error(data.message||'공개본 생성에 실패했습니다.');}await res.json();await reload();
    }catch(error){$('exportStatus').textContent=error.message+' 이미 완료됐을 수 있으니 새로고침으로 확인해 주세요.';}
    finally{busy=false;controls();}
  };
  window.addEventListener('beforeunload',event=>{if(busy){event.preventDefault();event.returnValue='';}});
  controls();void reload();void publicationStatus();
})();

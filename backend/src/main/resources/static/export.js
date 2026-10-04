(() => {
  const $=id=>document.getElementById(id);let busy=false;
  const controls=()=>{$('createExport').disabled=busy||!$('confirmExport').checked;$('reloadExports').disabled=busy;$('readStorage').disabled=busy||!window.onfilmExports;$('exportsList').querySelectorAll('button').forEach(button=>button.disabled=busy);};
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
      for(const item of data.items){const row=document.createElement('p'),link=document.createElement('a');link.className='btn';link.textContent='미리보기';link.href='/api/exports/'+item.id+'/site/index.html';
        row.append(document.createTextNode(new Date(item.createdAt).toLocaleString()+' · '+item.fileCount+'개 파일 · '+(item.bytes/1024/1024).toFixed(2)+' MB '),link);
        if(window.onfilmExports)for(const [action,label] of [['saveZip','ZIP 저장'],['openFolder','결과 폴더 열기'],['trash','휴지통으로 이동']]){const button=document.createElement('button');button.type='button';button.className='btn';button.dataset.action=action;button.onclick=()=>fileAction(item.id,action);button.textContent=label;row.append(document.createTextNode(' '),button);}
        $('exportsList').append(row);}
      $('exportStatus').textContent=data.busy?'공개본 생성 중입니다. 잠시 후 결과 다시 읽기를 눌러 주세요.':data.items.length?'완료된 공개본입니다. 미리보기로 확인해 주세요.':'아직 만든 공개본이 없습니다.';
    }catch{$('exportStatus').textContent='결과를 확인하지 못했습니다. 다시 읽기를 눌러 주세요.';}
  }
  $('reloadExports').onclick=reload;
  $('readStorage').onclick=async()=>{
    if(busy)return;busy=true;controls();$('storageStatus').textContent='사용량을 계산하고 있습니다.';
    try{const data=await window.onfilmExports.storageUsage();if(data.status!=='measured')throw new Error();
      $('storageStatus').textContent=data.groups.map(g=>g.label+': '+(g.bytes/1024/1024).toFixed(2)+' MB'+(g.skipped?' (누락·링크 등 일부 제외)':'')).join(' / ')+' / 합계: '+(data.total/1024/1024).toFixed(2)+' MB';
    }catch{$('storageStatus').textContent='사용량을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.';}finally{busy=false;controls();}
  };
  $('createExport').onclick=async()=>{
    if(busy||!$('confirmExport').checked)return;busy=true;controls();$('exportStatus').textContent='공개본을 복사하는 중입니다. 앱을 종료하지 마세요.';
    try{const res=await fetch('/api/exports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({includeVisibleProfile:true})});
      if(!res.ok){const data=await res.json();throw new Error(data.message||'공개본 생성에 실패했습니다.');}await res.json();await reload();
    }catch(error){$('exportStatus').textContent=error.message+' 응답 유실 시 완료됐을 수 있으니 결과 다시 읽기로 확인해 주세요.';}
    finally{busy=false;controls();}
  };
  window.addEventListener('beforeunload',event=>{if(busy){event.preventDefault();event.returnValue='';}});
  controls();void reload();
})();

(() => {
  const $=id=>document.getElementById(id);let busy=false;
  async function run(action){
    if(busy)return;busy=true;$('createBackup').disabled=true;$('restoreBackup').disabled=true;$('back').hidden=true;
    $('backupLocation').hidden=true;$('backupLocationPath').textContent='';$('backupStatus').dataset.state='busy';
    $('backupStatus').textContent='파일을 확인하고 처리 중입니다. 완료 전 앱을 종료하지 마세요.';
    try{
      const result=await window.onfilmBackup[action]();
      const success=result.status==='saved'||result.status==='restored';
      $('backupStatus').dataset.state=success?'success':result.status==='cancelled'?'idle':'error';
      $('backupStatus').textContent=result.status==='saved'?'백업을 저장했습니다. 폴더 전체를 보관해 주세요.':result.status==='restored'?'복원했습니다. 프로필로 돌아가 확인해 주세요.':result.status==='cancelled'?'취소했습니다.':result.message||'작업을 완료하지 못했습니다.';
      if(success&&result.location){$('backupLocationLabel').textContent=result.status==='saved'?'백업 저장 위치':'복원 전 데이터 보관 위치';$('backupLocationPath').textContent=result.location;$('backupLocation').hidden=false;}
    }catch{$('backupStatus').dataset.state='error';$('backupStatus').textContent='결과를 확인하지 못했습니다. 데이터 폴더를 보존하고 앱을 다시 실행해 주세요.';}
    finally{busy=false;$('createBackup').disabled=false;$('restoreBackup').disabled=false;$('back').hidden=false;}
  }
  $('createBackup').onclick=()=>run('create');$('restoreBackup').onclick=()=>run('restore');
  if(!window.onfilmBackup){$('createBackup').disabled=true;$('restoreBackup').disabled=true;$('backupStatus').textContent='Electron 앱에서 사용할 수 있습니다.';}
  window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
})();

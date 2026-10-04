(() => {
  const $=id=>document.getElementById(id);let busy=false;
  async function run(action){
    if(busy)return;busy=true;$('createBackup').disabled=true;$('restoreBackup').disabled=true;$('back').hidden=true;
    $('backupStatus').textContent='파일을 확인하고 처리 중입니다. 완료 전 앱을 종료하지 마세요.';
    try{
      const result=await window.onfilmBackup[action]();
      $('backupStatus').textContent=result.status==='saved'?'백업을 저장했습니다: '+result.location:result.status==='restored'?'복원했습니다. 복원 전 데이터 보관 위치: '+result.location:result.status==='cancelled'?'취소했습니다.':result.message;
    }catch{$('backupStatus').textContent='결과를 확인하지 못했습니다. 데이터 폴더를 보존하고 앱을 다시 실행해 주세요.';}
    finally{busy=false;$('createBackup').disabled=false;$('restoreBackup').disabled=false;$('back').hidden=false;}
  }
  $('createBackup').onclick=()=>run('create');$('restoreBackup').onclick=()=>run('restore');
  if(!window.onfilmBackup){$('createBackup').disabled=true;$('restoreBackup').disabled=true;$('backupStatus').textContent='Electron 앱에서 사용할 수 있습니다.';}
  window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
})();

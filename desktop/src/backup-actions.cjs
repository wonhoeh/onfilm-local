const {createBackup,validateBackup,restoreBackup}=require('./backup-store.cjs');
function authorizedBackupSender(event,contents,origin){
  if(event.sender!==contents||event.senderFrame!==contents.mainFrame)return false;
  try{const u=new URL(event.senderFrame.url);return u.origin===origin&&u.pathname==='/backup.html';}catch{return false;}
}
function createBackupActions({dataDir,backend,chooseFolder,confirmRestore,ensureIdle=async()=>{}}){
  let busy=false;
  return {get busy(){return busy;},async run(action){
    if(busy||!backend||!['create','restore'].includes(action))return {status:'error',message:'지금은 실행할 수 없습니다.'};
    busy=true;let stopped=false,started=false;
    try{
      const selection=await chooseFolder(action);if(selection.canceled||selection.filePaths.length!==1)return {status:'cancelled'};
      const folder=selection.filePaths[0];
      if(action==='restore'){
        await validateBackup(folder);
        if(!await confirmRestore())return {status:'cancelled'};
      }
      await ensureIdle();
      await backend.stop();
      if(backend.forcedStop)throw new Error('서버가 정상 종료되지 않았습니다. 백업·복원을 실행하지 않았습니다. 앱을 종료하고 다시 확인해 주세요.');
      stopped=true;
      if(action==='create'){
        const location=await createBackup(dataDir,folder);
        await backend.resume();started=true;return {status:'saved',location};
      }
      const location=await restoreBackup(dataDir,folder,{start:async()=>{await backend.resume();started=true;},stop:async()=>{started=false;await backend.stop();if(backend.forcedStop)throw new Error('복원 서버 종료 실패. 복원 기록과 기존 데이터 폴더를 보존해 주세요.');}});
      return {status:'restored',location};
    }catch(error){
      if(stopped&&!started){
        const fs=require('node:fs');
        if(!fs.existsSync(require('./backup-store.cjs').journalPath(dataDir)))try{await backend.resume();}catch{return {status:'error',message:'데이터는 보존했지만 서버 재시작에 실패했습니다. 앱을 종료하고 다시 실행해 주세요.'};}
      }
      return {status:'error',message:error.message||'작업에 실패했습니다. 기존 파일은 보존됩니다.'};
    }finally{busy=false;}
  }};
}
module.exports={createBackupActions,authorizedBackupSender};

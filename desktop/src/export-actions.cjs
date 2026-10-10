const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {Readable} = require('node:stream');
const {pipeline} = require('node:stream/promises');
const {createWriteStream} = require('node:fs');
const {measure,storageUsage}=require('./storage-usage.cjs');

const validId = id => typeof id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id);
function authorizedExportSender(event, contents, origin) {
  if(event.sender !== contents || event.senderFrame !== contents.mainFrame)return false;
  try{const url=new URL(event.senderFrame.url);return url.origin===origin&&url.pathname==='/export.html'&&!url.username&&!url.password;}catch{return false;}
}

function createExportActions({dataDir,origin,token,chooseDestination,openDirectory,confirmTrash,trashDirectory}) {
  let busy=false, disposed=false;
  const transfers=new Set();
  async function resolveExport(id){
    if(!validId(id)||!dataDir)throw new Error('완료된 공개본을 선택해 주세요.');
    const base=await fs.realpath(dataDir),root=path.join(base,'exports'),folder=path.join(root,id),site=path.join(folder,'site');
    for(const dir of [root,folder,site])if(await fs.realpath(dir)!==dir||!(await fs.lstat(dir)).isDirectory())throw new Error('공개본 폴더를 확인할 수 없습니다.');
    const index=await fs.lstat(path.join(site,'index.html'));
    if(!index.isFile()||index.isSymbolicLink())throw new Error('공개본 파일이 없습니다.');
    const marker=path.join(folder,'result.json'),stat=await fs.lstat(marker);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8*1024*1024)throw new Error('공개본 완료 기록이 없습니다.');
    const record=JSON.parse(await fs.readFile(marker,'utf8'));
    if(record.id!==id||!Array.isArray(record.files)||!record.files.some(file=>file.path==='index.html'))throw new Error('공개본 완료 기록이 올바르지 않습니다.');
    return site;
  }
  async function perform(action){
    if(disposed)return {status:'error',message:'창이 닫혔습니다.'};
    if(busy)return {status:'error',message:'다른 저장 작업이 진행 중입니다.'};
    busy=true;
    try{return await action();}catch{return {status:'error',message:'파일 작업에 실패했습니다. 저장 공간·권한·공개본 파일을 확인해 주세요. 기존 파일은 덮어쓰지 않습니다.'};}
    finally{busy=false;}
  }
  return {
    get busy(){return busy;},
    usage(){return perform(async()=>({status:'measured',...await storageUsage(dataDir)}));},
    trash(id){return perform(async()=>{
      const site=await resolveExport(id),folder=path.dirname(site),before=await fs.lstat(folder);
      const record=JSON.parse(await fs.readFile(path.join(folder,'result.json'),'utf8'));
      const allowed=new Set(['result.json','portfolio.zip',...record.files.map(file=>'site/'+file.path)]);
      const check=async()=>{
        const result=await measure(folder);
        if(result.skipped||result.files.some(name=>!allowed.has(name)&&!/^archive-[0-9a-f-]{36}\.partial$/.test(name)))throw new Error('Unknown export files');
        return result;
      };
      const result=await check();
      if(!await confirmTrash({id,bytes:result.bytes}))return {status:'cancelled'};
      if(disposed)return {status:'cancelled'};
      await resolveExport(id);const after=await fs.lstat(folder);
      if(before.ino!==after.ino||before.dev!==after.dev)throw new Error('Changed export folder');
      await check();await trashDirectory(folder);
      return {status:'trashed'};
    });},
    open(id){return perform(async()=>{
      const site=await resolveExport(id);if(disposed)return {status:'cancelled'};
      const error=await openDirectory(site);if(error)throw new Error(error);return {status:'opened'};
    });},
    save(id){return perform(async()=>{
      await resolveExport(id);
      const selected=await chooseDestination('onfilm-'+id+'.zip');
      if(disposed||!selected||selected.canceled||!selected.filePath)return {status:'cancelled'};
      const destination=selected.filePath;
      if(!path.isAbsolute(destination)||!destination.toLowerCase().endsWith('.zip'))return {status:'error',message:'.zip 확장자로 저장해 주세요.'};
      try{await fs.lstat(destination);return {status:'error',message:'같은 이름의 파일이 있습니다. 기존 파일 보호를 위해 다른 이름으로 저장해 주세요.'};}
      catch(error){if(error.code!=='ENOENT')throw error;}
      const controller=new AbortController();transfers.add(controller);
      const timeout=setTimeout(()=>controller.abort(),30*60*1000);timeout.unref();
      let partial,created=false;
      try{
        const response=await fetch(origin+'/api/exports/'+id+'/archive',{method:'POST',headers:{'X-Onfilm-Token':token},signal:controller.signal,redirect:'error'});
        if(!response.ok||!response.headers.get('content-type')?.startsWith('application/zip')||!response.body)throw new Error('Archive unavailable');
        const expected=Number(response.headers.get('content-length'));
        if(!Number.isSafeInteger(expected)||expected<=0)throw new Error('Missing length');
        partial=path.join(path.dirname(destination),'.onfilm-'+randomUUID()+'.partial');
        const output=createWriteStream(partial,{flags:'wx',mode:0o600});
        output.once('open',()=>{created=true;});
        await pipeline(Readable.fromWeb(response.body),output,{signal:controller.signal});
        if((await fs.stat(partial)).size!==expected||disposed)throw new Error('Incomplete transfer');
        const handle=await fs.open(partial,'r+');try{await handle.sync();}finally{await handle.close();}
        // Atomic publication without replacement, including a destination created after the dialog.
        await fs.link(partial,destination);
        return {status:'saved',name:path.basename(destination)};
      }finally{
        clearTimeout(timeout);controller.abort();transfers.delete(controller);
        if(created)await fs.unlink(partial).catch(()=>{});
      }
    });},
    dispose(){disposed=true;for(const controller of transfers)controller.abort();},
  };
}
module.exports={createExportActions,authorizedExportSender,validId};

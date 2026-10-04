// Called only while the owned API is stopped. No shell commands, symlink traversal or overwrites.
const fs=require('node:fs/promises');
const path=require('node:path');
const {createReadStream}=require('node:fs');
const {createHash,randomUUID}=require('node:crypto');
const format='onfilm-local-backup-v1';
const marker='onfilm-backup.json';
const journalPath=dataDir=>path.resolve(dataDir)+'.restore-pending.json';
const within=(parent,child)=>child===parent||child.startsWith(parent+path.sep);
async function dataRoot(directory){
  const root=await fs.realpath(directory);
  if(root===path.parse(root).root||root===await fs.realpath(require('node:os').homedir()))throw new Error('앱 전용 데이터 폴더만 사용할 수 있습니다.');
  const names=await fs.readdir(root);
  if(names.some(name=>!['database','media','exports','.DS_Store'].includes(name)))throw new Error('앱 데이터 외의 파일이 있는 폴더는 백업·복원할 수 없습니다.');
  return root;
}
const allowed=name=>name==='database/onfilm.mv.db'||(/^media\/(videos|encoded)\/[A-Za-z0-9_./-]+$/.test(name)&&!name.split('/').some(p=>p==='.'||p==='..'||!p));
async function hash(file){const sum=createHash('sha256');for await(const bytes of createReadStream(file))sum.update(bytes);return sum.digest('hex');}
async function regular(file){const s=await fs.lstat(file);if(!s.isFile()||s.isSymbolicLink())throw new Error('일반 파일이 아닌 항목이 있습니다.');return s;}
async function scan(root){
  const files=[];
  async function visit(relative){
    const full=path.join(root,relative),s=await fs.lstat(full);
    if(s.isSymbolicLink())throw new Error('심볼릭 링크는 백업할 수 없습니다.');
    if(s.isDirectory())for(const child of await fs.readdir(full))await visit(relative+'/'+child);
    else{const name=relative.replaceAll(path.sep,'/');if(!allowed(name)||!s.isFile())throw new Error('지원하지 않는 데이터 파일입니다.');files.push({path:name,bytes:s.size});}
    if(files.length>100000)throw new Error('백업 파일 수 제한을 초과했습니다.');
  }
  await regular(path.join(root,'database','onfilm.mv.db'));
  if(!(await fs.lstat(path.join(root,'database'))).isDirectory())throw new Error('DB 폴더를 확인해 주세요.');
  await visit('database/onfilm.mv.db');
  if(await exists(path.join(root,'media')))await visit('media');
  return files;
}
async function checkSpace(directory,bytes){const s=await fs.statfs(directory);if(s.bavail*s.bsize<bytes+64*1024*1024)throw new Error('저장 공간이 부족합니다.');}
async function writeRecord(file,record){const text=JSON.stringify(record);if(Buffer.byteLength(text)>16*1024*1024)throw new Error('백업 목록이 너무 큽니다.');const h=await fs.open(file,'wx',0o600);try{await h.writeFile(text);await h.sync();}finally{await h.close();}}
async function copyEntry(from,to,entry){
  const source=path.join(from,entry.path),target=path.join(to,entry.path);
  if((await regular(source)).size!==entry.bytes)throw new Error('파일 크기가 변경됐습니다.');
  await fs.mkdir(path.dirname(target),{recursive:true});
  await fs.copyFile(source,target,require('node:fs').constants.COPYFILE_EXCL);
  const checksum=await hash(target);
  if((await regular(target)).size!==entry.bytes||(entry.sha256&&checksum!==entry.sha256))throw new Error('파일 검증에 실패했습니다.');
  const handle=await fs.open(target,'r+');try{await handle.sync();}finally{await handle.close();}
  return {...entry,sha256:checksum};
}
async function createBackup(dataDir,destination){
  const root=await dataRoot(dataDir),parent=await fs.realpath(destination);
  if(within(root,parent))throw new Error('앱 데이터 폴더 밖을 선택해 주세요.');
  if(await exists(journalPath(dataDir)))throw new Error('완료되지 않은 복원이 있습니다.');
  const entries=await scan(root),bytes=entries.reduce((sum,e)=>sum+e.bytes,0);await checkSpace(parent,bytes);
  const id='onfilm-backup-'+randomUUID(),stage=path.join(parent,id+'.partial'),complete=path.join(parent,id);
  await fs.mkdir(stage,{mode:0o700});const payload=path.join(stage,'data');await fs.mkdir(payload);
  const files=[];for(const entry of entries)files.push(await copyEntry(root,payload,entry));
  const record={format,createdAt:new Date().toISOString(),bytes,files};
  await writeRecord(path.join(stage,marker),record);await fs.rename(stage,complete);return complete;
}
async function validateBackup(directory){
  const root=await fs.realpath(directory);
  if(path.basename(root).endsWith('.partial'))throw new Error('완료되지 않은 백업입니다.');
  const file=path.join(root,marker);if((await regular(file)).size>16*1024*1024)throw new Error('백업 목록이 너무 큽니다.');
  const record=JSON.parse(await fs.readFile(file,'utf8'));
  if(record.format!==format||!Array.isArray(record.files)||record.files.length>100000)throw new Error('OnFilm 백업이 아닙니다.');
  const payload=path.join(root,'data');if(await fs.realpath(payload)!==payload)throw new Error('백업 경로가 올바르지 않습니다.');
  const actual=await scan(payload),names=new Set();let bytes=0;
  for(const entry of record.files){
    if(!allowed(entry.path)||names.has(entry.path.toLowerCase())||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||!/^[a-f0-9]{64}$/.test(entry.sha256))throw new Error('백업 목록이 올바르지 않습니다.');
    names.add(entry.path.toLowerCase());bytes+=entry.bytes;
    const source=path.join(payload,entry.path);
    if(await fs.realpath(source)!==source||(await regular(source)).size!==entry.bytes||await hash(source)!==entry.sha256)throw new Error('백업 파일이 누락되었거나 손상됐습니다.');
  }
  if(actual.length!==record.files.length||!record.files.some(e=>e.path==='database/onfilm.mv.db')||bytes!==record.bytes||!Number.isSafeInteger(bytes))throw new Error('백업 파일 구성이 일치하지 않습니다.');
  return {root,payload,record};
}
async function exists(file){try{await fs.lstat(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function restoreBackup(dataDir,backup,{start,stop}){
  const root=await dataRoot(dataDir),source=await validateBackup(backup),journal=journalPath(dataDir);
  if(within(root,source.root)||within(source.root,root))throw new Error('앱 데이터와 분리된 백업을 선택해 주세요.');
  if(await exists(journal))throw new Error('완료되지 않은 복원이 있습니다.');
  const parent=path.dirname(root);await checkSpace(parent,source.record.bytes);
  const id=randomUUID(),stage=path.join(parent,'.onfilm-restore-'+id),previous=path.join(parent,'onfilm-before-restore-'+id),failed=path.join(parent,'onfilm-failed-restore-'+id);
  await fs.mkdir(stage,{mode:0o700});for(const entry of source.record.files)await copyEntry(source.payload,stage,entry);
  // Persistent guard prevents the next launch from silently initializing an empty DB after a crash.
  await writeRecord(journal,{format,root,previous,stage,failed});
  let moved=false,installed=false;
  try{
    await fs.rename(root,previous);moved=true;await fs.rename(stage,root);installed=true;
    await start();await fs.unlink(journal);return previous;
  }catch(error){
    await stop();
    if(installed)await fs.rename(root,failed);
    if(moved)await fs.rename(previous,root);
    await fs.unlink(journal);
    throw new Error('복원에 실패하여 기존 데이터를 유지했습니다. '+error.message);
  }
}
module.exports={createBackup,validateBackup,restoreBackup,journalPath};

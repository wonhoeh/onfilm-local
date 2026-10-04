const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createBackup,validateBackup,restoreBackup,journalPath}=require('../src/backup-store.cjs');
const {createBackupActions,authorizedBackupSender}=require('../src/backup-actions.cjs');
async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'onfilm-backup-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const data=path.join(root,'data'),dest=path.join(root,'backups');
  await fs.mkdir(path.join(data,'database'),{recursive:true});await fs.mkdir(path.join(data,'media','videos'),{recursive:true});await fs.mkdir(dest);
  await fs.writeFile(path.join(data,'database','onfilm.mv.db'),'database snapshot');await fs.writeFile(path.join(data,'media','videos','test.source'),'video');
  return {root,data,dest};
}
test('backup hashes data, omits exports, restores and preserves previous data',async t=>{
  const {data,dest}=await fixture(t);await fs.mkdir(path.join(data,'exports'));await fs.writeFile(path.join(data,'exports','private.txt'),'excluded');
  const backup=await createBackup(data,dest),validated=await validateBackup(backup);assert.equal(validated.record.files.length,2);
  await fs.writeFile(path.join(data,'database','onfilm.mv.db'),'new edits');
  const previous=await restoreBackup(data,backup,{start:async()=>{},stop:async()=>{}});
  assert.equal(await fs.readFile(path.join(data,'database','onfilm.mv.db'),'utf8'),'database snapshot');
  assert.equal(await fs.readFile(path.join(previous,'database','onfilm.mv.db'),'utf8'),'new edits');
  assert.equal(await fs.readFile(path.join(previous,'exports','private.txt'),'utf8'),'excluded');
  await assert.rejects(fs.stat(journalPath(data)),{code:'ENOENT'});
});
test('failed database startup rolls back without deleting either data set',async t=>{
  const {data,dest}=await fixture(t),backup=await createBackup(data,dest);await fs.writeFile(path.join(data,'database','onfilm.mv.db'),'current');
  await assert.rejects(restoreBackup(data,backup,{start:async()=>{throw Error('bad database');},stop:async()=>{}}),/기존 데이터/);
  assert.equal(await fs.readFile(path.join(data,'database','onfilm.mv.db'),'utf8'),'current');
  await assert.rejects(fs.stat(journalPath(data)),{code:'ENOENT'});
});
test('corruption, traversal, symlinks and app-internal backup destination are rejected',async t=>{
  const {data,dest,root}=await fixture(t);await assert.rejects(createBackup(data,data));
  const backup=await createBackup(data,dest),file=path.join(backup,'data','media','videos','test.source');
  await fs.writeFile(file,'bad');await assert.rejects(validateBackup(backup),/손상/);
  await fs.writeFile(file,'video');
  const marker=path.join(backup,'onfilm-backup.json'),record=JSON.parse(await fs.readFile(marker,'utf8'));
  record.files[0].path='../outside';await fs.writeFile(marker,JSON.stringify(record));await assert.rejects(validateBackup(backup));
  await fs.symlink(root,path.join(data,'media','link'));await assert.rejects(createBackup(data,dest),/심볼릭/);
});
test('persistent restore guard and failed rollback preserve recovery information',async t=>{
  const {data,dest}=await fixture(t),backup=await createBackup(data,dest);
  await assert.rejects(restoreBackup(data,backup,{start:async()=>{throw Error('start');},stop:async()=>{throw Error('cannot stop');}}));
  assert.ok(await fs.stat(journalPath(data)));await assert.rejects(createBackup(data,dest));
  const record=JSON.parse(await fs.readFile(journalPath(data),'utf8'));assert.ok(await fs.stat(record.previous));
  assert.throws(()=>require('../src/config.cjs').configuration(data,{jar:__filename}),/중단된 복원/);
});
test('IPC sender, cancellation and forced shutdown do not allow unsafe backup',async t=>{
  const {data,dest}=await fixture(t);const contents={mainFrame:{url:'http://127.0.0.1:18765/backup.html'}};
  assert.equal(authorizedBackupSender({sender:contents,senderFrame:contents.mainFrame},contents,'http://127.0.0.1:18765'),true);
  assert.equal(authorizedBackupSender({sender:contents,senderFrame:{}},contents,'http://127.0.0.1:18765'),false);
  let stops=0;const backend={forcedStop:true,stop:async()=>{stops++;},resume:async()=>{throw Error('must not restart');}};
  const cancelled=createBackupActions({dataDir:data,backend,chooseFolder:async()=>({canceled:true}),confirmRestore:async()=>false});
  assert.equal((await cancelled.run('create')).status,'cancelled');assert.equal(stops,0);
  const actions=createBackupActions({dataDir:data,backend,chooseFolder:async()=>({filePaths:[dest]}),confirmRestore:async()=>true});
  assert.equal((await actions.run('create')).status,'error');assert.deepEqual(await fs.readdir(dest),[]);
});
test('busy guard, encoding refusal and failed backup resume safely',async t=>{
  const {data}=await fixture(t);let stops=0,starts=0;
  const backend={forcedStop:false,stop:async()=>{stops++;},resume:async()=>{starts++;}};
  let choose;
  const actions=createBackupActions({dataDir:data,backend,chooseFolder:()=>new Promise(resolve=>{choose=resolve;}),confirmRestore:async()=>true});
  const pending=actions.run('create');assert.equal((await actions.run('restore')).status,'error');
  choose({filePaths:[data]});assert.equal((await pending).status,'error');assert.equal(stops,1);assert.equal(starts,1);
  const blocked=createBackupActions({dataDir:data,backend,chooseFolder:async()=>({filePaths:[data]}),ensureIdle:async()=>{throw Error('encoding');}});
  assert.equal((await blocked.run('create')).status,'error');assert.equal(stops,1);
});
test('mixed user folders are never moved or backed up',async t=>{
  const {data,dest}=await fixture(t);const backup=await createBackup(data,dest);
  await fs.writeFile(path.join(data,'personal.txt'),'keep');
  await assert.rejects(createBackup(data,dest),/앱 데이터 외/);
  await assert.rejects(restoreBackup(data,backup,{start:async()=>{},stop:async()=>{}}),/앱 데이터 외/);
  assert.equal(await fs.readFile(path.join(data,'personal.txt'),'utf8'),'keep');
});

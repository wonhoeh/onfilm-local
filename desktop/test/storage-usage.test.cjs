const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {storageUsage}=require('../src/storage-usage.cjs');
const {createExportActions}=require('../src/export-actions.cjs');
const id='12345678-1234-1234-1234-123456789abc';
async function fixture(t){
  const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'onfilm-storage-test-')));
  t.after(()=>fs.rm(temp,{recursive:true,force:true}));
  const root=path.join(temp,'app'),folder=path.join(root,'exports',id);
  for(const dir of ['database','media',`exports/${id}/site`])await fs.mkdir(path.join(root,dir),{recursive:true});
  for(const [name,value] of [['database/onfilm.mv.db','DB'],['media/video.source','VIDEO'],[`exports/${id}/site/index.html`,'PUBLIC'],[`exports/${id}/portfolio.zip`,'ZIP']])await fs.writeFile(path.join(root,name),value);
  await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({id,files:[{path:'index.html'}]}));
  await fs.writeFile(path.join(temp,'external.zip'),'EXTERNAL');
  return {temp,root,folder};
}
test('usage counts app categories without following links or external backups',async t=>{
  const {temp,root}=await fixture(t);
  await fs.symlink(path.join(temp,'external.zip'),path.join(root,'media','link'));
  const usage=await storageUsage(root);
  assert.equal(usage.groups[0].bytes,2);assert.equal(usage.groups[1].bytes,5);
  assert.equal(usage.groups[1].skipped,1);
  assert.equal(usage.total,usage.groups.reduce((sum,g)=>sum+g.bytes,0));
});
test('completed export cleanup is recoverable, confirmed and excludes DB/media/external ZIP',async t=>{
  const {temp,root,folder}=await fixture(t);let consent=false,calls=0;
  const actions=createExportActions({dataDir:root,confirmTrash:async()=>consent,trashDirectory:async dir=>{calls++;assert.equal(dir,folder);await fs.rename(dir,path.join(temp,'trash'));}});
  assert.equal((await actions.trash(id)).status,'cancelled');assert.equal(calls,0);
  assert.equal((await actions.trash('../database')).status,'error');
  await fs.writeFile(path.join(folder,'unexpected.txt'),'USER');consent=true;
  assert.equal((await actions.trash(id)).status,'error');assert.equal(calls,0);
  await fs.unlink(path.join(folder,'unexpected.txt'));
  const before=(await actions.usage()).total;
  assert.equal((await actions.trash(id)).status,'trashed');assert.equal(calls,1);
  assert.ok((await actions.usage()).total<before);
  assert.equal(await fs.readFile(path.join(temp,'trash/site/index.html'),'utf8'),'PUBLIC');
  assert.equal(await fs.readFile(path.join(root,'database/onfilm.mv.db'),'utf8'),'DB');
  assert.equal(await fs.readFile(path.join(root,'media/video.source'),'utf8'),'VIDEO');
  assert.equal(await fs.readFile(path.join(temp,'external.zip'),'utf8'),'EXTERNAL');
});
test('trash failure has no permanent-delete fallback and changes after confirmation are refused',async t=>{
  const {temp,root,folder}=await fixture(t);let mode='failure',calls=0;
  const actions=createExportActions({dataDir:root,confirmTrash:async()=>{
    if(mode==='change')await fs.symlink(path.join(temp,'external.zip'),path.join(folder,'site','link'));
    if(mode==='dispose')actions.dispose();
    return true;
  },trashDirectory:async()=>{calls++;throw new Error('OS trash unavailable');}});
  assert.equal((await actions.trash(id)).status,'error');assert.equal(calls,1);
  assert.equal(await fs.readFile(path.join(folder,'site/index.html'),'utf8'),'PUBLIC');
  mode='change';assert.equal((await actions.trash(id)).status,'error');assert.equal(calls,1);
  await fs.unlink(path.join(folder,'site/link'));
  mode='dispose';assert.equal((await actions.trash(id)).status,'cancelled');assert.equal(calls,1);
});

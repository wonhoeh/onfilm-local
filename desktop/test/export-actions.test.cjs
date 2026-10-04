const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const {createExportActions,authorizedExportSender}=require('../src/export-actions.cjs');
const id='12345678-1234-1234-1234-123456789abc';
test('export IPC accepts only the owning main frame on the export screen',()=>{
  const contents={mainFrame:{url:'http://127.0.0.1:18765/export.html'}};
  const event={sender:contents,senderFrame:contents.mainFrame},origin='http://127.0.0.1:18765';
  assert.equal(authorizedExportSender(event,contents,origin),true);
  assert.equal(authorizedExportSender({...event,senderFrame:{...contents.mainFrame}},contents,origin),false);
  contents.mainFrame.url=origin+'/profile.html';assert.equal(authorizedExportSender(event,contents,origin),false);
  contents.mainFrame.url='http://127.0.0.1:9876/export.html';assert.equal(authorizedExportSender(event,contents,origin),false);
});
test('ZIP saving protects existing files, cleans failed transfers and validates folder IDs',async t=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'onfilm-zip-test-'));
  t.after(()=>fs.rm(temp,{recursive:true,force:true}));
  const site=path.join(temp,'exports',id,'site');await fs.mkdir(site,{recursive:true});
  await fs.writeFile(path.join(site,'index.html'),'public');
  await fs.writeFile(path.join(site,'..','result.json'),JSON.stringify({id,files:[{path:'index.html'}]}));
  let mode='ok',calls=0;
  const server=http.createServer(async(req,res)=>{
    calls++;assert.equal(req.method,'POST');assert.equal(req.headers['x-onfilm-token'],'test-only');
    assert.equal(req.url,'/api/exports/'+id+'/archive');
    if(mode==='race')await fs.writeFile(path.join(temp,'out.zip'),'other writer');
    res.writeHead(200,{'Content-Type':'application/zip','Content-Length':mode==='broken'?100:4});
    res.end('ZIP!');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  let selected={canceled:true},opened;
  const actions=createExportActions({dataDir:temp,origin:'http://127.0.0.1:'+server.address().port,token:'test-only',
    chooseDestination:async()=>selected,openDirectory:async dir=>{opened=dir;return '';}});
  t.after(()=>actions.dispose());
  assert.equal((await actions.save(id)).status,'cancelled');assert.equal(calls,0);
  assert.equal((await actions.open('../outside')).status,'error');assert.equal(opened,undefined);
  assert.equal((await actions.open(id)).status,'opened');assert.equal(opened,await fs.realpath(site));
  selected={canceled:false,filePath:path.join(temp,'out.zip')};
  assert.equal((await actions.save(id)).status,'saved');assert.equal(await fs.readFile(selected.filePath,'utf8'),'ZIP!');
  assert.equal((await actions.save(id)).status,'error');assert.equal(calls,1);
  await fs.unlink(selected.filePath);mode='race';
  assert.equal((await actions.save(id)).status,'error');assert.equal(await fs.readFile(selected.filePath,'utf8'),'other writer');
  await fs.unlink(selected.filePath);mode='broken';
  assert.equal((await actions.save(id)).status,'error');
  assert.equal((await fs.readdir(temp)).some(name=>name.endsWith('.partial')||name==='out.zip'),false);
});

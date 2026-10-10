const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {randomUUID}=require('node:crypto');
const {preparePublication,readEntry,sha256}=require('../src/cloudflare/publication-files.cjs');
const {createPublicationClient,assetHash}=require('../src/cloudflare/publication-client.cjs');
const {createPublicationActions,createReceiptStore}=require('../src/cloudflare/publication.cjs');

const config={accountId:'a'.repeat(32),bucket:'onfilm-media',project:'onfilm-test',publicSlug:'actor_01',
  siteOrigin:'https://onfilm.example',mediaOrigin:'https://media.onfilm.example',accessKeyId:'b'.repeat(32),
  secretAccessKey:'c'.repeat(64),pagesToken:'d'.repeat(40)};
const signal=()=>new AbortController().signal;
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'onfilm-publish-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const dataDir=path.join(root,'data'),id=randomUUID(),site=path.join(dataDir,'exports',id,'site');
  const contents={'index.html':'<html>actor</html>','public-profile.js':'/* profile */',
    'video-player.html':'<html>player</html>','video-player.js':'/* player */',
    'portfolio.json':JSON.stringify({profile:{portrait:'media/portrait.png'},photos:[],films:[{id:'film-0',manifestUrl:'media/film-0/index.m3u8'}]}),
    'media/portrait.png':'image','media/film-0/index.m3u8':'#EXTM3U\n#EXTINF:1,\nsegment-00000.ts\n#EXT-X-ENDLIST\n','media/film-0/segment-00000.ts':'video',
    'icons/link.svg':'<svg/>','icons/bootstrap-icons-LICENSE.txt':'license'};
  const files=[];
  for(const [name,data]of Object.entries(contents)) {
    await fs.mkdir(path.dirname(path.join(site,name)),{recursive:true});await fs.writeFile(path.join(site,name),data);
    files.push({path:name,bytes:Buffer.byteLength(data)});
  }
  const marker=path.join(site,'..','result.json');await fs.writeFile(marker,JSON.stringify({id,files}));
  return {root,dataDir,id,site,marker,files,plan:await preparePublication(dataDir,id,config,signal())};
}

test('publication keeps local export unchanged, routes slug media to R2, and omits originals/DB',async t=>{
  const f=await fixture(t),before=await fs.readFile(path.join(f.site,'portfolio.json'));
  assert.equal(f.plan.url,'https://onfilm.example/actor_01/');
  assert(f.plan.files.some(file=>file.name==='/actor_01/index.html'));
  assert(f.plan.files.some(file=>file.name==='/404.html'));
  assert(!f.plan.files.some(file=>file.name.includes('/media/')));
  assert(f.plan.redirects.includes('/actor_01/media/* https://media.onfilm.example/onfilm/v1/'));
  assert(f.plan.redirects.includes('/ /actor_01/ 302'));
  assert.equal(f.plan.media.find(entry=>entry.path.endsWith('.ts')).contentType,'video/mp2t');
  assert.deepEqual(await fs.readFile(path.join(f.site,'portfolio.json')),before);
  const changed=await preparePublication(f.dataDir,f.id,{...config,publicSlug:'different'},signal());
  assert.equal(changed.prefix,f.plan.prefix);assert.notEqual(changed.release,f.plan.release);
  assert(!JSON.stringify(f.plan).includes(config.pagesToken));
});

test('publication accepts optimized JPEG references with image/jpeg and retains PNG compatibility',async t=>{
  const f=await fixture(t);
  await fs.rename(path.join(f.site,'media/portrait.png'),path.join(f.site,'media/portrait.jpg'));
  const data=JSON.parse(await fs.readFile(path.join(f.site,'portfolio.json'),'utf8'));
  data.profile.portrait='media/portrait.jpg';
  await fs.writeFile(path.join(f.site,'portfolio.json'),JSON.stringify(data));
  for(const file of f.files){if(file.path==='media/portrait.png')file.path='media/portrait.jpg';file.bytes=(await fs.stat(path.join(f.site,file.path))).size;}
  await fs.writeFile(f.marker,JSON.stringify({id:f.id,files:f.files}));
  const plan=await preparePublication(f.dataDir,f.id,config,signal());
  assert.equal(plan.media.find(file=>file.path==='media/portrait.jpg').contentType,'image/jpeg');
});

test('publication rejects traversal, symlinks, unlisted media references, changed files and private files',async t=>{
  const f=await fixture(t);
  for(const name of ['../secret','media/../../secret','db/onfilm.mv.db','_worker.js','media/file.mp4']) {
    await fs.writeFile(f.marker,JSON.stringify({id:f.id,files:[...f.files,{path:name,bytes:1}]}));
    await assert.rejects(preparePublication(f.dataDir,f.id,config,signal()));
  }
  await fs.writeFile(f.marker,JSON.stringify({id:f.id,files:f.files.filter(item=>!item.path.endsWith('.ts'))}));
  await assert.rejects(preparePublication(f.dataDir,f.id,config,signal()),/누락/);
  await fs.writeFile(f.marker,JSON.stringify({id:f.id,files:f.files}));
  const entry=f.plan.media.find(item=>item.path==='media/portrait.png');
  await fs.writeFile(path.join(f.site,entry.path),'other');
  await assert.rejects(readEntry(f.plan.site,entry),/변경/);
  await fs.unlink(path.join(f.site,entry.path));
  await fs.writeFile(path.join(f.root,'outside.png'),'image');
  await fs.symlink(path.join(f.root,'outside.png'),path.join(f.site,entry.path));
  await assert.rejects(preparePublication(f.dataDir,f.id,config,signal()),/링크/);
});

function fakeCloud() {
  const objects=new Map(),requests=[],uploads=new Map();let puts=0,deploys=0;
  const makeS3=options=>{
    assert.equal(options.endpoint,'https://'+config.accountId+'.r2.cloudflarestorage.com');
    return {destroy(){},async send(command){
      const input=command.input;requests.push(command.constructor.name);
      if(command.constructor.name==='HeadObjectCommand') {
        if(!objects.has(input.Key))throw {$metadata:{httpStatusCode:404}};
        return objects.get(input.Key);
      }
      assert.equal(command.constructor.name,'PutObjectCommand');assert.equal(input.IfNoneMatch,'*');
      assert.equal(input.Metadata.sha256,sha256(input.Body));puts++;
      objects.set(input.Key,{Metadata:input.Metadata,ContentLength:input.Body.length});return {};
    }};
  };
  const fetchImpl=async(url,options)=>{
    requests.push({url,options});assert(url.startsWith('https://api.cloudflare.com/client/v4/'));assert.equal(options.redirect,'error');
    let result;
    if(url.endsWith('/upload-token'))result={jwt:'upload-only-token'};
    else if(url.endsWith('/check-missing'))result=JSON.parse(options.body).hashes.filter(hash=>!uploads.has(hash));
    else if(url.endsWith('/assets/upload')){for(const file of JSON.parse(options.body)){assert(file.base64);uploads.set(file.key,file);}result={};}
    else if(url.endsWith('/upsert-hashes'))result={};
    else if(url.endsWith('/deployments')){
      deploys++;assert(objects.size>0);assert.equal(options.body.get('branch'),'production');
      const manifest=JSON.parse(options.body.get('manifest'));assert(manifest['/actor_01/index.html']);assert(manifest['/404.html']);
      assert.equal([...Object.keys(manifest)].some(name=>name.includes('/media/')),false);
      assert((await options.body.get('_redirects').text()).includes(':splat'));
      result={id:'deployment-1'};
    }else if(url.endsWith('/deployments/deployment-1'))result={id:'deployment-1',environment:'production',latest_stage:{name:'deploy',status:'success'}};
    else result={name:config.project,production_branch:'production'};
    return Response.json({success:true,result});
  };
  return {objects,requests,uploads,makeS3,fetchImpl,get puts(){return puts;},get deploys(){return deploys;}};
}

test('R2 upload reuses matching objects, protects collisions, and Pages uses upload JWT + multipart production manifest',async t=>{
  const f=await fixture(t),cloud=fakeCloud();
  const client=createPublicationClient(cloud)(config,signal());
  const project=await client.project();await client.uploadMedia(f.plan,()=>{});const count=cloud.puts;
  await client.uploadMedia(f.plan,()=>{});assert.equal(cloud.puts,count);
  const manifest=await client.uploadPages(f.plan);
  await client.deploy(f.plan,manifest,project.branch,'onfilm-local:test');
  assert.equal(await client.waitDeployment('deployment-1'),'success');
  for(const request of cloud.requests.filter(item=>item.url?.includes('/pages/assets/')))assert.equal(request.options.headers.Authorization,'Bearer upload-only-token');
  const entry=f.plan.media[0];cloud.objects.set(f.plan.prefix+'/'+entry.path,{Metadata:{sha256:'wrong'},ContentLength:entry.bytes});
  await assert.rejects(client.uploadMedia(f.plan,()=>{}),/기존 파일 보호/);
  assert.equal(cloud.puts,count);
  // Independent known BLAKE3 empty-string vector: hash input is base64(bytes)+extension.
  assert.equal(await assetHash({name:'/LICENSE',data:Buffer.alloc(0)}),'af1349b9f5f9a1a6a0404dea36dcc949');
});

test('publisher commits receipt only after production success, cancellation writes nothing and busy blocks duplicates',async t=>{
  const f=await fixture(t),cloud=fakeCloud(),store={read:async()=>config};
  const receipts=createReceiptStore(f.dataDir+'.connections');
  const cancelled=createPublicationActions({dataDir:f.dataDir,store,receipts,confirm:async()=>false,makeClient:createPublicationClient(cloud)});
  assert.equal((await cancelled.publish(f.id)).status,'cancelled');assert.equal(cloud.requests.length,0);
  assert.deepEqual(await receipts.read(config),{});
  let release;
  const actions=createPublicationActions({dataDir:f.dataDir,store,receipts,confirm:()=>new Promise(resolve=>{release=resolve;}),makeClient:createPublicationClient(cloud)});
  const work=actions.publish(f.id);
  while(!release)await new Promise(resolve=>setImmediate(resolve));
  assert(actions.busy);assert.equal((await actions.publish(f.id)).status,'error');release(true);
  const result=await work;assert.equal(result.status,'published');assert.equal(result.lastPublished.exportId,f.id);
  assert.equal(cloud.deploys,1);assert.equal(actions.busy,false);
  const saved=JSON.stringify(await receipts.read(config));assert(!saved.includes(config.pagesToken));assert(!saved.includes(config.secretAccessKey));
  const reopened=createPublicationActions({dataDir:f.dataDir,store,confirm:async()=>true});
  assert.equal((await reopened.status()).lastPublished.url,'https://onfilm.example/actor_01/');
});

test('lost deployment response is reconciled after restart without a second upload or deployment',async t=>{
  const f=await fixture(t),store={read:async()=>config},receipts=createReceiptStore(f.dataDir+'.connections');
  let creates=0,finds=0,marker;
  const client={project:async()=>({branch:'production'}),uploadMedia:async()=>{},uploadPages:async()=>({}),
    deploy:async(_plan,_manifest,_branch,value)=>{creates++;marker=value;throw new Error(config.pagesToken);},
    findDeployment:async value=>{finds++;assert.equal(value,marker);return {id:'existing-1'};},waitDeployment:async()=> 'success'};
  const build=()=>createPublicationActions({dataDir:f.dataDir,store,receipts,confirm:async()=>true,makeClient:()=>client});
  const initial=await build().publish(f.id);assert.equal(initial.status,'pending');assert.equal(initial.pendingExportId,f.id);
  assert(!initial.message.includes(config.pagesToken));
  assert.equal((await build().publish(randomUUID())).status,'pending');assert.equal(creates,1);
  const completed=await build().publish(f.id);assert.equal(completed.status,'published');assert.equal(creates,1);assert.equal(finds,1);
});

test('upload failure and failed deployment preserve the last successful receipt; pending is not success',async t=>{
  const f=await fixture(t),store={read:async()=>config},receipts=createReceiptStore(f.dataDir+'.connections');
  const last={url:'https://onfilm.example/old/',exportId:'previous'};
  await receipts.write(config,{lastPublished:last});
  const base={project:async()=>({branch:'production'}),uploadMedia:async()=>{},uploadPages:async()=>({}),deploy:async()=>({id:'new-1'}),waitDeployment:async()=> 'pending'};
  const build=client=>createPublicationActions({dataDir:f.dataDir,store,receipts,confirm:async()=>true,makeClient:()=>client});
  assert.equal((await build({...base,uploadMedia:async()=>{throw new Error('upload failed');}}).publish(f.id)).status,'error');
  assert.deepEqual((await receipts.read(config)).lastPublished,last);
  assert.equal((await build(base).publish(f.id)).status,'pending');
  assert.deepEqual((await receipts.read(config)).lastPublished,last);
  assert.equal((await build({...base,waitDeployment:async()=> 'failure'}).publish(f.id)).status,'error');
  assert.deepEqual((await receipts.read(config)).lastPublished,last);
});

test('explicit Pages rejection allows retry but unknown outcomes remain pending',async t=>{
  const f=await fixture(t),store={read:async()=>config};
  const client={project:async()=>({branch:'production'}),uploadMedia:async()=>{},uploadPages:async()=>({}),
    deploy:async()=>{throw Object.assign(new Error('denied'),{rejected:true});}};
  const actions=createPublicationActions({dataDir:f.dataDir,store,confirm:async()=>true,makeClient:()=>client});
  assert.equal((await actions.publish(f.id)).status,'error');
  assert.equal((await actions.status()).pendingExportId,null);
});

test('cancel aborts an upload without deploying, and an unknown create result cannot be blindly retried',async t=>{
  const f=await fixture(t),store={read:async()=>config};let started=false,deploys=0;
  const actions=createPublicationActions({dataDir:f.dataDir,store,confirm:async()=>true,makeClient:(_config,abortSignal)=>({
    project:async()=>({branch:'production'}),uploadMedia:()=>new Promise((_resolve,reject)=>{started=true;abortSignal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});}),
    deploy:async()=>{deploys++;},
  })});
  const work=actions.publish(f.id);while(!started)await new Promise(resolve=>setImmediate(resolve));
  actions.cancel();assert.equal((await work).status,'cancelled');assert.equal(deploys,0);assert.equal(actions.busy,false);
  const receipts=createReceiptStore(f.dataDir+'.connections');
  await receipts.write(config,{attempt:{exportId:f.id,phase:'submitting',marker:'onfilm-local:unknown'}});
  const pending=createPublicationActions({dataDir:f.dataDir,store,confirm:async()=>true,makeClient:()=>({findDeployment:async()=>null,deploy:async()=>{deploys++;}})});
  assert.equal((await pending.publish(f.id)).status,'pending');assert.equal(deploys,0);
  assert.equal((await pending.publish(f.id)).pendingExportId,f.id);
});

test('local receipt write failure after remote success stays recoverable, not an upload failure',async t=>{
  const f=await fixture(t),store={read:async()=>config},disk=createReceiptStore(f.dataDir+'.connections');
  const receipts={read:disk.read,write:async(config,value)=>{if(value.attempt.phase==='success')throw new Error('disk full');await disk.write(config,value);}};
  const client={project:async()=>({branch:'production'}),uploadMedia:async()=>{},uploadPages:async()=>({}),deploy:async()=>({id:'finished-1'}),waitDeployment:async()=> 'success'};
  const first=createPublicationActions({dataDir:f.dataDir,store,receipts,confirm:async()=>true,makeClient:()=>client});
  const result=await first.publish(f.id);assert.equal(result.status,'pending');assert.equal(result.pendingExportId,f.id);
  const retry=createPublicationActions({dataDir:f.dataDir,store,receipts:disk,confirm:async()=>{throw new Error('should only read');},makeClient:()=>({waitDeployment:client.waitDeployment})});
  assert.equal((await retry.publish(f.id)).status,'published');
});

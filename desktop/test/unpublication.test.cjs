const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createPublicationActions,createReceiptStore}=require('../src/cloudflare/publication.cjs');
const {createPublicationClient}=require('../src/cloudflare/publication-client.cjs');
const {closedPlan}=require('../src/cloudflare/unpublication.cjs');
const config={accountId:'a'.repeat(32),bucket:'onfilm-media',project:'onfilm-test',publicSlug:'actor_01',siteOrigin:'https://onfilm.example',mediaOrigin:'https://media.onfilm.example',accessKeyId:'b'.repeat(32),secretAccessKey:'c'.repeat(64),pagesToken:'d'.repeat(40),r2ManagementToken:'e'.repeat(40)};
function paginationClient(total,markerIndex=-1){
  const pages=[];
  const client=createPublicationClient({fetchImpl:async(url,options)=>{
    const query=new URL(url).searchParams;assert.equal(query.get('per_page'),'25');assert.equal(options.method,'GET');
    const page=Number(query.get('page'));pages.push(page);
    const start=(page-1)*25;
    const result=Array.from({length:Math.max(0,Math.min(25,total-start))},(_,i)=>({id:'id-'+(start+i),deployment_trigger:{metadata:{commit_message:start+i===markerIndex?'target':'other'}}}));
    return new Response(JSON.stringify({success:true,result}));
  }})(config,new AbortController().signal);
  return {client,pages};
}
test('deployment listing drains 25-item pages including exact-page boundaries and preserves the 200 limit',async()=>{
  for(const total of [0,18,25,26,200]){
    const {client,pages}=paginationClient(total);assert.equal((await client.listDeployments()).length,total);
    assert.equal(pages.length,Math.floor(total/25)+1);
  }
  const {client}=paginationClient(201);await assert.rejects(client.listDeployments(),/200개/);
});
test('lost-response lookup traverses 25-item pages and retains the 1000-record search budget',async()=>{
  const {client,pages}=paginationClient(1000,999);assert.equal((await client.findDeployment('target')).id,'id-999');assert.equal(pages.length,40);
  const empty=paginationClient(25);assert.equal(await empty.client.findDeployment('missing'),null);assert.deepEqual(empty.pages,[1,2]);
});
test('API failures expose operation, HTTP status and numeric codes but no remote message or credentials',async()=>{
  const client=createPublicationClient({fetchImpl:async()=>new Response(JSON.stringify({errors:[{code:8000024,message:config.pagesToken},{code:config.pagesToken}]}),{status:400})})(config,new AbortController().signal);
  await assert.rejects(client.listDeployments(),error=>{
    assert.match(error.message,/Pages 배포 기록 조회.*HTTP 400.*8000024/);assert(!error.message.includes(config.pagesToken));assert.equal(error.status,400);assert.equal(error.rejected,true);return true;
  });
});
async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'onfilm-stop-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const receipts=createReceiptStore(root),events=[];
  const cloud={current:'old',live:['old','older'],enabled:true,creates:0,deleteFails:false,lost:false,permission:false};
  const client={
    project:async()=>({branch:'production',deploymentId:cloud.current}),
    verifyCurrent:async id=>{if(cloud.current!==id)throw Error('changed');},
    listDeployments:async()=>cloud.live.map(id=>({id,latest_stage:{status:'success'}})),
    uploadPages:async()=>{events.push('upload');return {};},uploadMedia:async()=>{},
    deploy:async(_p,_m,_b,marker)=>{cloud.creates++;cloud.marker=marker;cloud.current='new-'+cloud.creates;cloud.live.push(cloud.current);events.push('deploy');if(cloud.lost)throw Error('lost');return {id:cloud.current};},
    findDeployment:async marker=>marker===cloud.marker?{id:cloud.current}:null,
    waitDeployment:async()=> 'success',
    publicAccess:{
      read:async()=>{if(cloud.permission)throw Error('denied');return [{domain:'media.onfilm.example',kind:'custom',enabled:cloud.enabled}];},
      disableAll:async(_snapshot,guard)=>{await guard();events.push('disable');cloud.enabled=false;},
      enableConfigured:async()=>{events.push('enable');cloud.enabled=true;},
    },
    deleteDeployment:async(id,current)=>{await client.verifyCurrent(current);assert.notEqual(id,current);if(cloud.deleteFails)throw Error('delete failed');events.push('delete:'+id);cloud.live=cloud.live.filter(x=>x!==id);},
  };
  const store={read:async()=>({...config})};
  const build=(options={})=>createPublicationActions({dataDir:root,store,receipts,makeClient:()=>client,confirm:async()=>true,confirmStop:async()=>true,
    prepare:async()=>({site:root,url:config.siteOrigin+'/actor_01/',prefix:'onfilm/v1/test',release:'test',redirects:'',files:[],media:[],bytes:0}),...options});
  return {root,receipts,events,cloud,client,store,build};
}
test('closed release contains no portfolio data, no media redirect and a real 404 document',()=>{
  const plan=closedPlan();assert.deepEqual(plan.files.map(f=>f.name),['/404.html']);assert.equal(plan.redirects,'');assert.match(plan.headers,/no-store/);assert.match(plan.files[0].data.toString(),/현재 공개 중인 포트폴리오가 없습니다/);
});
test('stop survives restart, disables media then deletes old deployments, never R2 files',async t=>{
  const f=await fixture(t);const r=await f.build().stop();assert.equal(r.status,'stopped');assert.equal(r.stopped,true);
  assert.deepEqual(f.events,['upload','deploy','disable','delete:old','delete:older']);assert.deepEqual(f.cloud.live,['new-1']);
  assert.equal((await f.build().status()).status,'stopped');await f.build().stop();assert.equal(f.cloud.creates,1);
  assert(!JSON.stringify(await f.receipts.read(config)).includes(config.r2ManagementToken));
});
test('cancel, missing token and denied read permission make no external writes',async t=>{
  const f=await fixture(t);assert.equal((await f.build({confirmStop:async()=>false}).stop()).status,'cancelled');
  f.store.read=async()=>({...config,r2ManagementToken:''});await f.build().stop();assert.equal(f.events.length,0);
  f.store.read=async()=>config;f.cloud.permission=true;await f.build().stop();assert.equal(f.events.length,0);
});
test('lost stop response is reconciled without a second deployment',async t=>{
  const f=await fixture(t);f.cloud.lost=true;
  assert.equal((await f.build().stop()).stopPending,true);assert.equal(f.cloud.enabled,true);
  assert.equal((await f.build().stop()).status,'stopped');assert.equal(f.cloud.creates,1);
});
test('partial cleanup failure remains resumable and blocks publication',async t=>{
  const f=await fixture(t);f.cloud.deleteFails=true;
  const r=await f.build().stop();assert.equal(r.stopPending,true);assert.equal(r.stopped,false);assert.equal(f.cloud.enabled,false);
  await f.build().publish('new-export');assert.equal(f.cloud.creates,1);
  f.cloud.deleteFails=false;assert.equal((await f.build().stop()).status,'stopped');assert.equal(f.cloud.creates,1);
});
test('failed stop deployment is included in cleanup on a successful retry',async t=>{
  const f=await fixture(t);
  f.client.waitDeployment=async()=>{f.cloud.current='old';return 'failure';};
  assert.equal((await f.build().stop()).stopPending,true);
  f.client.waitDeployment=async()=> 'success';
  assert.equal((await f.build().stop()).status,'stopped');
  assert.deepEqual(f.cloud.live,['new-2']);assert(f.events.includes('delete:new-1'));
});
test('external canonical deployment change prevents media and deployment mutations',async t=>{
  const f=await fixture(t);f.client.waitDeployment=async()=>{f.cloud.current='external';return 'success';};
  const r=await f.build().stop();assert(r.stopPending);assert.equal(f.cloud.enabled,true);assert(!f.events.includes('disable'));
});
test('pending publication blocks stop; changed target blocks resume',async t=>{
  const f=await fixture(t);await f.receipts.write(config,{attempt:{phase:'waiting',exportId:'x'}});
  await f.build().stop();assert.equal(f.events.length,0);
  await f.receipts.write(config,{});f.cloud.lost=true;await f.build().stop();
  f.store.read=async()=>({...config,bucket:'other-bucket'});await f.build().stop();assert.equal(f.cloud.creates,1);assert.equal(f.cloud.enabled,true);
});
test('republish after stop restores only configured public access after deployment success',async t=>{
  const f=await fixture(t);await f.build().stop();
  const r=await f.build().publish('export-id');assert.equal(r.status,'published');assert.equal(r.stopped,false);assert.equal(f.cloud.enabled,true);
  assert(f.events.lastIndexOf('enable')>f.events.lastIndexOf('deploy'));
});
test('shared mutex rejects publish and stop while confirmation is open',async t=>{
  const f=await fixture(t);let release,entered=false;
  const actions=f.build({confirmStop:()=>{entered=true;return new Promise(r=>release=r);}}),work=actions.stop();
  while(!entered)await new Promise(r=>setImmediate(r));
  assert(actions.busy);assert.equal((await actions.publish('x')).status,'error');assert.equal((await actions.stop()).status,'error');release(false);await work;
});
test('R2 management uses fixed API host, distinct credential, all public endpoints and read-back verification',async()=>{
  let custom=true,managed=true;const requests=[];
  const client=createPublicationClient({fetchImpl:async(url,options)=>{
    assert(url.startsWith('https://api.cloudflare.com/client/v4/accounts/'+config.accountId+'/r2/buckets/'+config.bucket+'/domains/'));
    assert.equal(options.headers.Authorization,'Bearer '+config.r2ManagementToken);assert.equal(options.redirect,'error');requests.push({url,options});
    if(options.method==='PUT'){const {enabled}=JSON.parse(options.body);if(url.endsWith('/managed'))managed=enabled;else custom=enabled;}
    const result=url.endsWith('/custom')?{domains:[{domain:'media.onfilm.example',enabled:custom}]}:{domain:url.endsWith('/managed')?'pub-test.r2.dev':'media.onfilm.example',enabled:url.endsWith('/managed')?managed:custom};
    return new Response(JSON.stringify({success:true,result}));
  }})(config,new AbortController().signal);
  const snapshot=await client.publicAccess.read();let guards=0;
  await client.publicAccess.disableAll(snapshot,async()=>guards++);assert.equal(guards,2);assert(!custom&&!managed);
  await client.publicAccess.enableConfigured();assert(custom&&!managed);
  assert(!requests.some(r=>r.options.method==='DELETE'));
});
test('Pages deletion verifies canonical production and never deletes the current deployment',async()=>{
  let current='closed';const requests=[];
  const client=createPublicationClient({fetchImpl:async(url,options)=>{
    assert.equal(options.headers.Authorization,'Bearer '+config.pagesToken);requests.push({url,method:options.method});
    const result=options.method==='DELETE'?{}:{name:config.project,canonical_deployment:{id:current,environment:'production',latest_stage:{name:'deploy',status:'success'}}};
    return new Response(JSON.stringify({success:true,result}));
  }})(config,new AbortController().signal);
  await assert.rejects(client.deleteDeployment('closed','closed'));assert.equal(requests.length,0);
  await client.deleteDeployment('old','closed');assert.equal(requests[1].method,'DELETE');assert(requests[1].url.endsWith('/deployments/old?force=true'));
  current='external';await assert.rejects(client.deleteDeployment('older','closed'));assert.equal(requests.filter(r=>r.method==='DELETE').length,1);
});

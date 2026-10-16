const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {cleanupMedia}=require('../src/cloudflare/media-cleanup.cjs');
const {createPublicationActions}=require('../src/cloudflare/publication.cjs');
const {createPublicationClient}=require('../src/cloudflare/publication-client.cjs');
const config={accountId:'a'.repeat(32),bucket:'media',project:'test',publicSlug:'actor',siteOrigin:'https://example.com',mediaOrigin:'https://media.example.com',accessKeyId:'b'.repeat(32),secretAccessKey:'c'.repeat(64),pagesToken:'d'.repeat(40)};
const prefix=()=>`onfilm/v2/test/${randomUUID()}`;
test('cleanup drains pages, preserves current/unrelated objects and resumes partial failure',async()=>{
 const old=prefix(),current=prefix();const objects=new Set(Array.from({length:1100},(_,i)=>`${old}/media/${i}.ts`));objects.add(`${current}/media/a`);objects.add('other/file');
 let checks=0,fail=true,destroyed=0;
 const makeS3=()=>({destroy(){destroyed++;},async send(command){const input=command.input;
  if(command.constructor.name==='ListObjectsV2Command')return {Contents:[...objects].filter(k=>k.startsWith(input.Prefix)).slice(0,500).map(Key=>({Key}))};
  const batch=input.Delete.Objects;for(const o of batch.slice(0,fail?1:batch.length))objects.delete(o.Key);
  if(fail){fail=false;return {Errors:[{Code:'AccessDenied'}]};}return {Deleted:batch};
 }});
 const args={config,signal:new AbortController().signal,prefix:old,currentPrefix:current,verifyCurrent:async()=>{checks++;},makeS3};
 await assert.rejects(cleanupMedia(args));assert.equal(objects.size,1101);
 assert.equal((await cleanupMedia(args)).deleted,1099);assert.deepEqual([...objects],[`${current}/media/a`,'other/file']);assert.equal(destroyed,2);assert(checks>=8);
});
test('cleanup refuses current, legacy, foreign, unexpected objects and changed deployment',async()=>{
 const current=prefix();let deleted=0;
 const makeS3=()=>({destroy(){},async send(c){if(c.constructor.name==='DeleteObjectsCommand')deleted++;return {Contents:[{Key:'outside/file'}]};}});
 const args={config,signal:new AbortController().signal,currentPrefix:current,verifyCurrent:async()=>{},makeS3};
 for(const p of [current,'onfilm/v1/'+ 'a'.repeat(64),'onfilm/v2/other/'+randomUUID(),prefix()])await assert.rejects(cleanupMedia({...args,prefix:p}));
 await assert.rejects(cleanupMedia({...args,prefix:prefix(),verifyCurrent:async()=>{throw Error('changed');}}));assert.equal(deleted,0);
 let s3calls=0;
 const client=createPublicationClient({fetchImpl:async()=>Response.json({success:true,result:{name:'test',canonical_deployment:{id:'other'}}}),makeS3:()=>({destroy(){},send(){s3calls++;}})})(config,new AbortController().signal);
 await assert.rejects(client.cleanupMedia(prefix(),current,'expected'));assert.equal(s3calls,0);
});
test('publisher cleans only after durable success; retries failures without failing publication',async()=>{
 let record={lastPublished:{prefix:prefix(),bucket:config.bucket,deploymentId:'old'}},fail=true,cleaned=[],wait='success';
 const receipts={read:async()=>structuredClone(record),write:async(_c,r)=>{record=structuredClone(r);}};
 const client={project:async()=>({branch:'production'}),uploadMedia:async()=>{},uploadPages:async()=>({}),deploy:async()=>({id:'new'}),waitDeployment:async()=>wait,
 cleanupMedia:async(p,current,id)=>{assert.equal(record.attempt.phase,'success');assert.equal(id,'new');assert.notEqual(p,current);if(fail)throw Error();cleaned.push(p);}};
 const actions=createPublicationActions({dataDir:'/unused',store:{read:async()=>config},receipts,confirm:async()=>true,makeClient:()=>client,
 prepare:async()=>({prefix:'onfilm/v1/hash',redirects:'/actor/media/* https://media.example.com/onfilm/v1/hash/media/:splat 302',url:'https://example.com/actor/',bytes:1})});
 const first=await actions.publish('one');assert.equal(first.status,'published');assert.match(first.message,/다음 게시/);assert.equal(record.cleanup.length,1);
 fail=false;assert.equal((await actions.publish('two')).status,'published');assert.equal(record.cleanup.length,0);assert.equal(cleaned.length,2);
 wait='failure';await actions.publish('three');assert.equal(cleaned.length,2);
 wait='success';await actions.publish('four');assert.equal(cleaned.length,4);assert.equal(record.cleanup.length,0);
});

test('legacy and foreign-bucket receipts are preserved; failed success-record write never deletes',async()=>{
 let record={lastPublished:{prefix:'onfilm/v1/'+ 'a'.repeat(64),bucket:config.bucket},cleanup:[{prefix:prefix(),bucket:'other'}]},failWrite=false,deletes=0;
 const receipts={read:async()=>structuredClone(record),write:async(_c,r)=>{if(failWrite&&r.attempt.phase==='success')throw Error('disk full');record=structuredClone(r);}};
 const client={project:async()=>({branch:'production'}),uploadMedia:async()=>{},uploadPages:async()=>({}),deploy:async()=>({id:'new'}),waitDeployment:async()=> 'success',cleanupMedia:async()=>{deletes++;}};
 const actions=createPublicationActions({dataDir:'/unused',store:{read:async()=>config},receipts,confirm:async()=>true,makeClient:()=>client,prepare:async()=>({prefix:'onfilm/v1/hash',redirects:'',url:'https://example.com/actor/',bytes:1})});
 assert.equal((await actions.publish('one')).status,'published');assert.equal(deletes,0);assert.equal(record.cleanup.length,1);
 failWrite=true;assert.equal((await actions.publish('two')).status,'pending');assert.equal(deletes,0);
});

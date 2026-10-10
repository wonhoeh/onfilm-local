const path = require('node:path');
const {setTimeout:delay} = require('node:timers/promises');
const {blake3} = require('hash-wasm');
const {S3Client,HeadObjectCommand,PutObjectCommand} = require('@aws-sdk/client-s3');
const {readEntry,PublishError} = require('./publication-files.cjs');

// Pages' Direct Upload protocol follows Cloudflare workers-sdk/pages upload + hashFile.
async function assetHash(file) {
  return (await blake3(file.data.toString('base64') + path.extname(file.name).slice(1))).slice(0,32);
}

function createPublicationClient({fetchImpl=fetch, makeS3=options=>new S3Client(options), pause=delay}={}) {
  return (config, signal) => {
    const projectPath = `/accounts/${config.accountId}/pages/projects/${config.project}`;
    async function api(route, {method='GET',body,bearer=config.pagesToken,json=false}={}) {
      const response = await fetchImpl('https://api.cloudflare.com/client/v4'+route, {
        method,headers:{Authorization:`Bearer ${bearer}`,...(json?{'Content-Type':'application/json'}:{})},
        body:json?JSON.stringify(body):body,redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(60000)]),
      });
      if (!response.ok) {
        await response.body?.cancel();
        const error=new PublishError(response.status===401||response.status===403 ? 'Cloudflare 키와 쓰기 권한을 확인해 주세요.' : response.status===429 ? 'Cloudflare 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.' : 'Cloudflare 요청에 실패했습니다. 연결 설정과 네트워크를 확인해 주세요.');
        error.rejected=[400,401,403,404,413,422,429].includes(response.status);throw error;
      }
      const data = await response.json();
      if (data.success !== true) {const error=new PublishError('Cloudflare에서 요청을 거부했습니다. 연결 설정과 권한을 확인해 주세요.');error.rejected=true;throw error;}
      return data.result;
    }
    return {
      async project() {
        const result = await api(projectPath);
        if (result.name!==config.project || result.source || !result.production_branch) throw new PublishError('Direct Upload 방식의 Pages 프로젝트와 production branch를 확인해 주세요.');
        return {branch:result.production_branch};
      },
      async uploadMedia(plan, progress) {
        const client = makeS3({region:'auto',endpoint:`https://${config.accountId}.r2.cloudflarestorage.com`,
          credentials:{accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey},
          forcePathStyle:true,maxAttempts:2,followRegionRedirects:false});
        let completed=0,bytes=0;
        try {
          for (const entry of plan.media) {
            signal.throwIfAborted();
            const Key=plan.prefix+'/'+entry.path, Bucket=config.bucket;
            let found;
            try { found=await client.send(new HeadObjectCommand({Bucket,Key}),{abortSignal:AbortSignal.any([signal,AbortSignal.timeout(60000)])}); }
            catch(error) { if(error?.$metadata?.httpStatusCode!==404)throw error; }
            if (found) {
              if (found.Metadata?.sha256!==entry.hash || found.ContentLength!==entry.bytes) throw new PublishError('R2 파일이 예상한 내용과 다릅니다. 기존 파일 보호를 위해 게시를 중단했습니다.');
            } else {
              const data=await readEntry(plan.site,entry);
              await client.send(new PutObjectCommand({Bucket,Key,Body:data,ContentLength:data.length,
                ContentType:entry.contentType,CacheControl:'public, max-age=31536000, immutable',
                Metadata:{sha256:entry.hash},IfNoneMatch:'*'}),{abortSignal:AbortSignal.any([signal,AbortSignal.timeout(300000)])});
            }
            bytes+=entry.bytes;
            progress({completed:++completed,total:plan.media.length,bytes,totalBytes:plan.bytes});
          }
        } catch(error) {
          if (error instanceof PublishError)throw error;
          throw new PublishError('R2 업로드를 완료하지 못했습니다. 네트워크·버킷 쓰기 권한을 확인하고 같은 공개본으로 다시 시도해 주세요.');
        } finally {client.destroy();}
      },
      async uploadPages(plan) {
        const {jwt}=await api(projectPath+'/upload-token');
        if (typeof jwt!=='string'||!jwt)throw new PublishError('Pages 업로드 권한을 확인해 주세요.');
        const files=await Promise.all(plan.files.map(async file=>({...file,hash:await assetHash(file)})));
        const hashes=[...new Set(files.map(file=>file.hash))];
        const missing=await api('/pages/assets/check-missing',{method:'POST',body:{hashes},json:true,bearer:jwt});
        if (!Array.isArray(missing)||missing.some(hash=>!hashes.includes(hash)))throw new PublishError('Pages 업로드 응답을 확인하지 못했습니다.');
        for (const hash of missing) {
          const file=files.find(item=>item.hash===hash);
          await api('/pages/assets/upload',{method:'POST',bearer:jwt,json:true,body:[{
            key:hash,value:file.data.toString('base64'),metadata:{contentType:file.contentType},base64:true,
          }]});
        }
        await api('/pages/assets/upsert-hashes',{method:'POST',bearer:jwt,json:true,body:{hashes}});
        return Object.fromEntries(files.map(file=>[file.name,file.hash]));
      },
      async deploy(plan, manifest, branch, marker) {
        const body=new FormData();body.set('manifest',JSON.stringify(manifest));body.set('branch',branch);
        body.set('commit_message',marker);
        body.set('_redirects',new Blob([plan.redirects]),'_redirects');
        body.set('_headers',new Blob([plan.headers]),'_headers');
        return api(projectPath+'/deployments',{method:'POST',body});
      },
      async findDeployment(marker) {
        // A lost create response must never blindly trigger a second production deployment.
        for(let page=1;page<=10;page++) {
          const list=await api(projectPath+`/deployments?per_page=100&page=${page}`);
          if(!Array.isArray(list))throw new PublishError('배포 기록을 확인하지 못했습니다.');
          const found=list.find(item=>item.deployment_trigger?.metadata?.commit_message===marker);
          if(found)return found;
          if(list.length<100)break;
        }
        return null;
      },
      async waitDeployment(id) {
        if (!/^[a-zA-Z0-9-]{1,100}$/.test(id))throw new PublishError('배포 ID를 확인하지 못했습니다.');
        for(let attempt=0;attempt<90;attempt++) {
          const result=await api(projectPath+'/deployments/'+id);
          if(result.id!==id||result.environment!=='production')throw new PublishError('운영 배포 상태를 확인하지 못했습니다. Cloudflare 대시보드를 확인해 주세요.');
          const stage=result.latest_stage;
          if(stage?.name==='deploy'&&stage.status==='success')return 'success';
          if(['failure','canceled','skipped'].includes(stage?.status))return 'failure';
          await pause(2000,undefined,{signal});
        }
        return 'pending';
      },
    };
  };
}
module.exports={createPublicationClient,assetHash};

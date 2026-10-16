const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {normalize}=require('./connection.cjs');
const {preparePublication,bindPublicationVersion,PublishError,sha256}=require('./publication-files.cjs');
const {createPublicationClient}=require('./publication-client.cjs');
const {ownedPrefix}=require('./media-cleanup.cjs');
const {stopPublication,targetKey}=require('./unpublication.cjs');

// Receipts are intentionally separate from portable profile data and contain no credentials.
function createReceiptStore(directory) {
  const fileFor=config=>path.join(directory,'publication-'+sha256(config.accountId+'/'+config.project)+'.json');
  return {
    async read(config) {
      const file=fileFor(config);let stat;
      try{stat=await fs.lstat(file);}catch(error){if(error.code==='ENOENT')return {};throw error;}
      if(!stat.isFile()||stat.isSymbolicLink()||stat.size>131072)throw new Error('Invalid receipt');
      const receipt=JSON.parse(await fs.readFile(file,'utf8'));
      if(receipt.version!==1)throw new Error('Invalid receipt version');
      return receipt;
    },
    async write(config,receipt) {
      const serialized=JSON.stringify({...receipt,version:1});
      if(Buffer.byteLength(serialized)>131072)throw new Error('Receipt too large');
      await fs.mkdir(directory,{recursive:true,mode:0o700});
      if((await fs.lstat(directory)).isSymbolicLink())throw new Error('Invalid receipt directory');
      const temporary=path.join(directory,randomUUID()+'.partial');
      const handle=await fs.open(temporary,'wx',0o600);
      try{await handle.writeFile(serialized);await handle.sync();}finally{await handle.close();}
      try{await fs.rename(temporary,fileFor(config));}finally{await fs.unlink(temporary).catch(()=>{});}
    },
  };
}

function createPublicationActions({dataDir,store,confirm,confirmStop=async()=>false,makeClient=createPublicationClient(),
  receipts=createReceiptStore(dataDir+'.connections'),prepare=preparePublication}) {
  let busy=false,disposed=false,controller,state={status:'idle',message:'공개본을 선택하고 게시를 눌러 주세요.'};
  async function configRead(){return normalize(await store.read());}
  const update=values=>{state={...state,...values};};
  return {
    get busy(){return busy;},
    cancel(){controller?.abort();return {status:'cancelling',message:'중단을 요청했습니다. 이미 접수된 Pages 배포는 완료될 수 있으므로 결과를 확인해 주세요.'};},
    async status() {
      if(busy)return {...state,busy};
      try {
        const config=await configRead(),receipt=await receipts.read(config);
        const stop=receipt.stop;
        const stopState=state.status==='idle'&&stop?{status:stop.phase==='done'?'stopped':'stopPending',message:stop.phase==='done'?'게시 종료됨. 로컬 데이터와 R2 파일은 보관 중입니다.':'게시 종료가 완료되지 않았습니다. 재시도를 눌러 주세요.'}:{};
        return {...state,...stopState,busy,configured:true,url:`${config.siteOrigin}/${config.publicSlug}/`,
          stopPending:Boolean(stop&&stop.phase!=='done'),stopped:stop?.phase==='done',canStop:Boolean(config.r2ManagementToken),
          lastPublished:receipt.lastPublished||null,
          pendingExportId:['submitting','waiting'].includes(receipt.attempt?.phase)?receipt.attempt.exportId:null};
      }catch{return {...state,busy,configured:false};}
    },
    async stop(){
      if(busy||disposed)return {status:'error',message:'다른 게시 작업이 진행 중입니다.'};
      busy=true;controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),30*60*1000);timer.unref?.();
      update({status:'stopping',message:'게시 종료 대상을 확인하고 있습니다.',progress:null});
      try{
        const config=await configRead(),receipt=await receipts.read(config);
        await stopPublication({config,receipt,receipts,client:makeClient(config,controller.signal),confirm:confirmStop,update,signal:controller.signal});
      }catch(error){update({status:'stopPending',message:error instanceof PublishError?error.message:'게시 종료를 완료하지 못했습니다. 이미 일부 처리됐을 수 있습니다. 연결·권한을 확인한 뒤 재시도해 주세요.'});}
      finally{clearTimeout(timer);busy=false;controller=undefined;}
      return this.status();
    },
    async publish(exportId) {
      if(busy||disposed)return {status:'error',message:'다른 게시 작업이 진행 중입니다.'};
      busy=true;controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),2*60*60*1000);timer.unref?.();
      update({status:'preparing',message:'게시할 공개본을 확인하고 있습니다.',progress:null});
      let receipt,config;
      try {
        config=await configRead();receipt=await receipts.read(config);
        if(receipt.stop&&receipt.stop.phase!=='done')throw new PublishError('게시 종료를 먼저 재시도해 완료해 주세요.');
        if(receipt.stop&&receipt.stop.target!==targetKey(config))throw new PublishError('게시 종료 당시 연결 설정으로 되돌린 뒤 게시해 주세요.');
        const client=makeClient(config,controller.signal);
        const pending=['submitting','waiting'].includes(receipt.attempt?.phase);
        if(pending&&receipt.attempt.exportId!==exportId)throw new PublishError('이전 배포의 결과 확인이 필요합니다. 아래 결과 확인 버튼을 먼저 눌러 주세요.');
        if(!pending) {
          const plan=await prepare(dataDir,exportId,config,controller.signal);
          const approved=await confirm({url:plan.url,project:config.project,bytes:plan.bytes,exportId});
          if(!approved){update({status:'cancelled',message:'게시를 취소했습니다.'});return {...state};}
          controller.signal.throwIfAborted();
          const project=await client.project();
          // Never reuse a retired namespace, even when re-publishing the same export.
          // This keeps another publishing attempt from uploading into a cleanup target.
          const prefix=`onfilm/v2/${config.project}/${randomUUID()}`;
          bindPublicationVersion(plan,config,prefix);
          // Abandoned uploads are retained on failure, then retired only after a later success.
          const abandoned=receipt.attempt;
          if(['uploading','failed'].includes(abandoned?.phase)&&abandoned.bucket===config.bucket
            &&ownedPrefix(abandoned.prefix,config.project)) {
            receipt.cleanup=[...(receipt.cleanup||[])];
            if(!receipt.cleanup.some(item=>item.prefix===abandoned.prefix&&item.bucket===abandoned.bucket))
              receipt.cleanup.push({prefix:abandoned.prefix,bucket:abandoned.bucket});
          }
          // Persist intent before any upload. Keep the previous successful receipt throughout.
          receipt.attempt={exportId,release:plan.release,url:plan.url,prefix,bucket:config.bucket,marker:'onfilm-local:'+randomUUID(),phase:'uploading'};
          await receipts.write(config,receipt);
          update({status:'uploading',message:'사진·영상을 R2에 올리고 있습니다. 앱을 종료하지 마세요.'});
          await client.uploadMedia(plan,progress=>update({progress}));
          update({status:'pages',message:'공개 화면을 Pages에 올리고 있습니다.',progress:null});
          const manifest=await client.uploadPages(plan);
          // If the process dies or the response is lost after this point, reconcile, never resend blindly.
          receipt.attempt.phase='submitting';await receipts.write(config,receipt);
          let deployment;
          try{deployment=await client.deploy(plan,manifest,project.branch,receipt.attempt.marker);}
          catch(error){if(error.rejected){receipt.attempt.phase='failed';await receipts.write(config,receipt);}throw error;}
          if(!/^[a-zA-Z0-9-]{1,100}$/.test(deployment?.id||''))throw new PublishError('배포 접수 결과가 불분명합니다. 결과 확인을 눌러 주세요.');
          receipt.attempt.deploymentId=deployment.id;receipt.attempt.phase='waiting';await receipts.write(config,receipt);
        }
        update({status:'waiting',message:'Cloudflare에서 배포 완료 여부를 확인하고 있습니다.',progress:null});
        if(!receipt.attempt.deploymentId) {
          const found=await client.findDeployment(receipt.attempt.marker);
          if(!found)throw new PublishError('배포 응답이 유실되어 접수 여부를 확정할 수 없습니다. 잠시 후 결과 확인을 다시 눌러 주세요. 계속 확인되지 않으면 Cloudflare 배포 기록을 확인해야 합니다. 중복 배포는 자동 실행하지 않습니다.');
          receipt.attempt.deploymentId=found.id;receipt.attempt.phase='waiting';await receipts.write(config,receipt);
        }
        const result=await client.waitDeployment(receipt.attempt.deploymentId);
        if(result==='pending') {
          update({status:'pending',message:'Cloudflare가 아직 배포 중입니다. 잠시 후 결과 확인을 눌러 주세요.'});
        } else if(result==='failure') {
          receipt.attempt.phase='failed';await receipts.write(config,receipt);
          throw new PublishError('Pages 배포가 완료되지 않았습니다. 같은 공개본으로 다시 게시할 수 있습니다.');
        } else if(result==='success') {
          if(receipt.stop){
            await client.verifyCurrent(receipt.attempt.deploymentId);
            await client.publicAccess.enableConfigured();
          }
          const cleanup=[...(receipt.cleanup||[])];
          const previous=receipt.lastPublished;
          if(previous?.bucket===config.bucket && ownedPrefix(previous.prefix,config.project)
            && previous.prefix!==receipt.attempt.prefix && !cleanup.some(item=>item.prefix===previous.prefix&&item.bucket===previous.bucket)) {
            cleanup.push({prefix:previous.prefix,bucket:previous.bucket});
          }
          const completed={...receipt,stop:null,attempt:{...receipt.attempt,phase:'success'},lastPublished:{exportId:receipt.attempt.exportId,url:receipt.attempt.url,
            prefix:receipt.attempt.prefix,bucket:receipt.attempt.bucket,
            deploymentId:receipt.attempt.deploymentId,publishedAt:new Date().toISOString()},cleanup};
          await receipts.write(config,completed);
          receipt=completed;
          update({status:'published',message:'게시되었습니다. 공개 주소에서 확인해 주세요.',url:receipt.lastPublished.url});
          // Deletion is best-effort AFTER the successful receipt has been durably written.
          // A deletion/network failure must never turn a successful publication into failure.
          try {
            for(const target of [...cleanup]) {
              if(target.bucket!==config.bucket)continue;
              if(receipt.lastPublished.bucket!==config.bucket)throw new Error('Publication bucket changed');
              update({message:'게시되었습니다. 이전 사진·영상을 정리하고 있습니다.'});
              await client.cleanupMedia(target.prefix,receipt.lastPublished.prefix,receipt.lastPublished.deploymentId);
              const next={...receipt,cleanup:receipt.cleanup.filter(item=>item!==target)};
              await receipts.write(config,next);receipt=next;
            }
            update({message:receipt.cleanup.length?'게시되었습니다. 다른 버킷의 이전 파일은 보존했습니다.':'게시되었습니다. 공개 주소에서 확인해 주세요.'});
          } catch {
            update({message:'게시되었습니다. 이전 파일 일부는 정리하지 못했습니다. 다음 게시 성공 시 다시 정리합니다.'});
          }
        } else throw new PublishError('배포 완료 상태를 확인하지 못했습니다.');
      }catch(error) {
        const uncertain=['submitting','waiting'].includes(receipt?.attempt?.phase);
        const cancelled=controller.signal.aborted&&!uncertain;
        update({status:uncertain?'pending':cancelled?'cancelled':'error',message:cancelled?
          '업로드를 중단했습니다. 같은 공개본으로 다시 게시할 수 있습니다. 이미 올라간 파일은 삭제하지 않았습니다.':error instanceof PublishError?error.message:
          uncertain?'배포 결과를 확인하지 못했습니다. 이미 게시됐을 수 있으니 결과 확인을 눌러 주세요.':
          '게시를 완료하지 못했습니다. 연결 설정·네트워크·공개본 파일을 확인하고 다시 시도해 주세요. 기존 공개 파일은 삭제하지 않았습니다.'});
      }finally{clearTimeout(timer);busy=false;controller=undefined;}
      return this.status();
    },
    dispose(){disposed=true;controller?.abort();},
  };
}
module.exports={createPublicationActions,createReceiptStore};

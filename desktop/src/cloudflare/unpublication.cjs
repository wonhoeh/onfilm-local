const {randomUUID}=require('node:crypto');
const {PublishError,sha256}=require('./publication-files.cjs');
const targetKey=c=>sha256([c.accountId,c.project,c.bucket,c.siteOrigin,c.mediaOrigin,c.publicSlug].join('\n'));
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(id);

function closedPlan(){
  const data=Buffer.from('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>공개 종료 · OnFilm</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111;color:#eee;font-family:system-ui;text-align:center}main{padding:28px}h1{font-size:22px}p{color:#aaa}</style></head><body><main><h1>현재 공개 중인 포트폴리오가 없습니다.</h1><p>공개가 종료되었습니다.</p></main></body></html>');
  return {files:[{name:'/404.html',data,contentType:'text/html; charset=utf-8'}],redirects:'',
    headers:'/*\n  Cache-Control: no-store\n  X-Robots-Tag: noindex\n  X-Content-Type-Options: nosniff\n'};
}

// The caller owns the shared publish/stop mutex and cancellation controller.
async function stopPublication({config,receipt,receipts,client,confirm,update,signal}){
  if(['submitting','waiting'].includes(receipt.attempt?.phase))throw new PublishError('진행 중인 게시 결과를 먼저 확인해 주세요.');
  if(!config.r2ManagementToken)throw new PublishError('Cloudflare 연결에서 R2 관리 API Token을 저장해 주세요.');
  const persist=async()=>{await receipts.write(config,receipt);};
  if(receipt.stop&&receipt.stop.target!==targetKey(config))throw new PublishError('게시 종료 당시 연결 설정으로 되돌린 뒤 다시 시도해 주세요.');
  if(receipt.stop?.phase==='done'){
    await client.verifyCurrent(receipt.stop.deploymentId);
    if((await client.listDeployments()).some(d=>d.id!==receipt.stop.deploymentId))throw new PublishError('외부에서 다른 배포가 추가됐습니다. 대시보드에서 공개 상태를 확인해 주세요.');
    if((await client.publicAccess.read()).some(d=>d.enabled))throw new PublishError('R2 공개 접근이 외부에서 다시 켜졌습니다. 대시보드에서 차단 상태를 확인해 주세요.');
    update({status:'stopped',message:'게시 종료됨. 로컬 데이터와 R2 파일은 보관 중입니다.'});return;
  }
  if(!receipt.stop){
    const project=await client.project();
    if(!validId(project.deploymentId))throw new PublishError('현재 운영 배포를 확인할 수 없습니다.');
    await client.verifyCurrent(project.deploymentId);
    const domains=await client.publicAccess.read();
    if(!domains.some(d=>d.domain===new URL(config.mediaOrigin).hostname))throw new PublishError('미디어 주소와 R2 버킷 연결을 확인해 주세요.');
    const deployments=await client.listDeployments();
    if(deployments.some(d=>!['success','failure','canceled','skipped'].includes(d.latest_stage?.status)))throw new PublishError('Cloudflare에서 진행 중인 배포가 있습니다. 완료 후 다시 시도해 주세요.');
    if(!await confirm({project:config.project,bucket:config.bucket,url:`${config.siteOrigin}/${config.publicSlug}/`,count:deployments.length})){
      update({status:'cancelled',message:'게시 종료를 취소했습니다.'});return;
    }
    signal.throwIfAborted();
    receipt.stop={target:targetKey(config),phase:'prepared',branch:project.branch,previousId:project.deploymentId,
      marker:'onfilm-local:stop:'+randomUUID(),domains,oldIds:deployments.map(d=>d.id),startedAt:new Date().toISOString()};
    await persist();
  }
  const stop=receipt.stop;
  if(stop.phase==='prepared'){
    update({message:'게시 종료 화면을 준비하고 있습니다.'});
    await client.verifyCurrent(stop.previousId);
    const plan=closedPlan(),manifest=await client.uploadPages(plan);
    await client.verifyCurrent(stop.previousId);
    signal.throwIfAborted();stop.phase='submitting';await persist();
    let deployment;
    try{deployment=await client.deploy(plan,manifest,stop.branch,stop.marker);}
    catch(error){if(error.rejected){stop.phase='prepared';await persist();}throw error;}
    if(!validId(deployment?.id))throw new PublishError('종료 배포 접수 여부를 확인하지 못했습니다. 게시 종료 재시도를 눌러 주세요.');
    stop.deploymentId=deployment.id;stop.phase='waiting';await persist();
  }
  if(stop.phase==='submitting'){
    const found=await client.findDeployment(stop.marker);
    if(!validId(found?.id))throw new PublishError('종료 배포 응답이 유실됐습니다. 잠시 후 재시도해 주세요. 중복 배포는 하지 않습니다.');
    stop.deploymentId=found.id;stop.phase='waiting';await persist();
  }
  if(stop.phase==='waiting'){
    update({message:'종료 화면의 운영 배포 반영을 확인하고 있습니다.'});
    const result=await client.waitDeployment(stop.deploymentId);
    if(result==='failure'){
      if(!stop.oldIds.includes(stop.deploymentId))stop.oldIds.push(stop.deploymentId);
      stop.phase='prepared';delete stop.deploymentId;stop.marker='onfilm-local:stop:'+randomUUID();await persist();
      throw new PublishError('종료 화면 배포에 실패했습니다. 다시 시도해 주세요.');
    }
    if(result!=='success')throw new PublishError('종료 화면 배포 확인 중입니다. 잠시 후 재시도해 주세요.');
    await client.verifyCurrent(stop.deploymentId);
    stop.phase='closing';await persist();
  }
  if(stop.phase!=='closing')throw new PublishError('게시 종료 기록을 확인하지 못했습니다.');
  const guard=()=>client.verifyCurrent(stop.deploymentId);
  await guard();
  update({message:'페이지 종료 완료 · R2 공개 접근을 차단하고 있습니다.'});
  await client.publicAccess.disableAll(stop.domains,guard);
  stop.mediaClosed=true;await persist();
  update({message:'페이지·미디어 차단 완료 · 과거 배포 주소를 정리하고 있습니다.'});
  const live=await client.listDeployments();
  if(live.some(d=>d.id!==stop.deploymentId&&!stop.oldIds.includes(d.id)))throw new PublishError('종료 도중 다른 배포가 추가됐습니다. 대시보드에서 확인해 주세요.');
  for(const deployment of live){
    if(deployment.id===stop.deploymentId)continue;
    signal.throwIfAborted();await client.deleteDeployment(deployment.id,stop.deploymentId);
  }
  await guard();
  if((await client.listDeployments()).some(d=>d.id!==stop.deploymentId))throw new PublishError('과거 배포가 남아 있습니다. 게시 종료를 다시 시도해 주세요.');
  if((await client.publicAccess.read()).some(d=>d.enabled))throw new PublishError('R2 공개 차단 상태가 변경됐습니다. 다시 시도해 주세요.');
  stop.phase='done';stop.completedAt=new Date().toISOString();await persist();
  update({status:'stopped',message:'게시 종료됨. 로컬 데이터와 R2 파일은 보관 중입니다.'});
}
module.exports={stopPublication,closedPlan,targetKey};

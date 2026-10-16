const {PublishError}=require('./publication-files.cjs');
const validDomain=value=>typeof value==='string'&&value.length<=253&&/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(value);

// Only Cloudflare's control plane receives the management credential, never media URLs.
function createPublicAccess(config,api){
  const base=`/accounts/${config.accountId}/r2/buckets/${config.bucket}/domains`;
  const call=(suffix,options={})=>{
    if(!config.r2ManagementToken)throw new PublishError('Cloudflare 연결에서 R2 관리 API Token을 저장해 주세요.');
    return api(base+suffix,{...options,bearer:config.r2ManagementToken});
  };
  async function read(){
    const custom=await call('/custom'),managed=await call('/managed');
    if(!Array.isArray(custom?.domains)||custom.domains.length>50||!validDomain(managed?.domain)||typeof managed.enabled!=='boolean'
      ||custom.domains.some(d=>!validDomain(d.domain)||typeof d.enabled!=='boolean'))throw new PublishError('R2 공개 주소를 확인하지 못했습니다.');
    return [...custom.domains.map(d=>({domain:d.domain,enabled:d.enabled,kind:'custom'})),{domain:managed.domain,enabled:managed.enabled,kind:'managed'}];
  }
  async function set(item,enabled){
    if(!validDomain(item.domain)||!['custom','managed'].includes(item.kind))throw new PublishError('R2 공개 주소가 올바르지 않습니다.');
    await call(item.kind==='managed'?'/managed':'/custom/'+encodeURIComponent(item.domain),{method:'PUT',json:true,body:{enabled}});
  }
  return {
    read,
    async disableAll(expected,guard){
      const current=await read();
      if(current.some(d=>!expected.some(e=>e.domain===d.domain&&e.kind===d.kind)))throw new PublishError('R2 공개 주소가 변경됐습니다. 대시보드에서 추가 주소를 확인해 주세요.');
      for(const item of current.filter(d=>d.enabled)){await guard();await set(item,false);}
      if((await read()).some(d=>d.enabled))throw new PublishError('미디어 공개 차단이 아직 반영되지 않았습니다. 게시 종료를 다시 시도해 주세요.');
    },
    async enableConfigured(){
      const host=new URL(config.mediaOrigin).hostname;
      const item=(await read()).find(d=>d.domain===host);
      if(!item)throw new PublishError('미디어 도메인이 해당 R2 버킷에 연결되어 있지 않습니다.');
      if(!item.enabled)await set(item,true);
      if(!(await read()).some(d=>d.domain===host&&d.enabled))throw new PublishError('미디어 공개 설정 반영을 확인하지 못했습니다. 다시 시도해 주세요.');
    },
  };
}
module.exports={createPublicAccess};

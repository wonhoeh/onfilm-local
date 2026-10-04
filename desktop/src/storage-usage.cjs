const fs=require('node:fs/promises');
const path=require('node:path');
async function measure(directory){
  let bytes=0,count=0,skipped=0;const files=[];
  async function visit(relative){
    if(++count>200000)throw new Error('파일 수가 많아 계산을 중단했습니다.');
    const target=path.join(directory,relative);let stat;
    try{stat=await fs.lstat(target);}catch(e){if(e.code==='ENOENT'){skipped++;return;}throw e;}
    if(stat.isSymbolicLink()){skipped++;return;}
    if(stat.isDirectory())for(const name of await fs.readdir(target))await visit(path.join(relative,name));
    else if(stat.isFile()){bytes+=stat.size;files.push(relative.split(path.sep).join('/'));}
    else skipped++;
  }
  await visit('');return {bytes,files,skipped};
}
async function storageUsage(dataDir){
  const root=await fs.realpath(dataDir),groups=[];
  for(const [directory,label] of [['database','DB·프로필·사진'],['media','원본·인코딩 영상'],['exports','공개본·ZIP 캐시·부분 파일']]){
    const result=await measure(path.join(root,directory));groups.push({label,bytes:result.bytes,files:result.files.length,skipped:result.skipped});
  }
  return {groups,total:groups.reduce((sum,g)=>sum+g.bytes,0)};
}
module.exports={measure,storageUsage};

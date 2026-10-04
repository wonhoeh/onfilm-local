const fs=require('node:fs/promises');
const {createReadStream,createWriteStream}=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {Readable,Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const yauzl=require('yauzl');
const lock=require('./windows-runtime-lock.json');
const {checkRuntime,runtimeRoot}=require('./check-windows-runtime.cjs');
async function sha256(file){const hash=crypto.createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
function safeEntry(name,attributes=0){
  const parts=name.replace(/\/$/,'').split('/');
  if(!name||name.includes('\\')||parts.some(p=>!p||p==='.'||p==='..'||/[<>:"|?*\x00-\x1f]/.test(p)||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))throw new Error('안전하지 않은 ZIP 경로');
  const type=(attributes>>>16)&0xf000;
  if(type&&type!==0x8000&&type!==0x4000)throw new Error('ZIP 링크/특수 파일은 허용하지 않습니다.');
  return parts.join('/');
}
async function extract(zipFile,destination){
  await fs.mkdir(destination);
  await new Promise((resolve,reject)=>{
    yauzl.open(zipFile,{lazyEntries:true,strictFileNames:true},(error,zip)=>{
      if(error)return reject(error);
      let total=0,count=0;const seen=new Set();
      const fail=e=>{zip.close();reject(e);};zip.on('error',fail);zip.on('end',resolve);
      zip.on('entry',entry=>{void(async()=>{
        const relative=safeEntry(entry.fileName,entry.externalFileAttributes),key=relative.toLowerCase();
        if(seen.has(key)||++count>20000||(total+=entry.uncompressedSize)>3*1024**3)throw new Error('ZIP 크기/중복 제한');seen.add(key);
        const target=path.join(destination,relative);
        if(entry.fileName.endsWith('/'))await fs.mkdir(target,{recursive:true});
        else{
          await fs.mkdir(path.dirname(target),{recursive:true});
          const input=await new Promise((yes,no)=>zip.openReadStream(entry,(e,s)=>e?no(e):yes(s)));
          await pipeline(input,createWriteStream(target,{flags:'wx'}));
        }
        zip.readEntry();
      })().catch(fail);});zip.readEntry();
    });
  });
  const entries=await fs.readdir(destination,{withFileTypes:true});
  if(entries.length!==1||!entries[0].isDirectory())throw new Error('배포 ZIP의 최상위 폴더가 하나여야 합니다.');
  return path.join(destination,entries[0].name);
}
async function download(spec,destination){
  const response=await fetch(spec.url,{signal:AbortSignal.timeout(300000)});
  if(!response.ok||!response.body||!response.url.startsWith('https://'))throw new Error('배포 ZIP 다운로드 실패');
  let bytes=0;
  await pipeline(Readable.fromWeb(response.body),new Transform({transform(chunk,encoding,done){bytes+=chunk.length;done(bytes>750*1024**2?new Error('다운로드 크기 초과'):null,chunk);}}),createWriteStream(destination,{flags:'wx'}));
  if(await sha256(destination)!==spec.sha256)throw new Error('배포 ZIP SHA-256 불일치: '+spec.version);
}
async function prepare(jar){
  // Do not replace an existing bundle, even if it appears incomplete.
  if(await fs.lstat(runtimeRoot).catch(e=>{if(e.code!=='ENOENT')throw e;}))throw new Error('runtime/windows-x64가 이미 있습니다. 기존 결과는 덮어쓰지 않습니다.');
  if(!(await fs.stat(jar)).isFile())throw new Error('API JAR를 먼저 빌드해 주세요.');
  const parent=path.dirname(runtimeRoot);await fs.mkdir(parent,{recursive:true});
  const stage=await fs.mkdtemp(path.join(parent,'prepare-windows-'));
  console.log('준비 폴더:',stage);
  const bundle=path.join(stage,'bundle');await fs.mkdir(bundle);
  for(const [name,spec] of Object.entries(lock)){
    console.log(name+' '+spec.version+' 다운로드·검증');
    const archive=path.join(stage,name+'.zip');await download(spec,archive);
    const extracted=await extract(archive,path.join(stage,name));
    await fs.rename(extracted,path.join(bundle,name));
  }
  await fs.mkdir(path.join(bundle,'api'));await fs.copyFile(jar,path.join(bundle,'api/onfilm-local.jar'));
  await fs.writeFile(path.join(bundle,'THIRD-PARTY-NOTICES.txt'),
    'Development/testing bundle; redistribution compliance review is not complete.\n'+
    'Eclipse Temurin Java 21: see java/legal and java/NOTICE. https://adoptium.net/\n'+
    'Gyan FFmpeg essentials (includes libx264), GPLv3: see ffmpeg/LICENSE and ffmpeg/README.txt.\n'+
    'https://www.gyan.dev/ffmpeg/builds/ https://ffmpeg.org/legal.html\n'+
    'Before distribution, review corresponding-source/build-instruction and third-party license obligations.\n');
  const files=[];
  async function scan(relative=''){
    for(const entry of (await fs.readdir(path.join(bundle,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      const name=relative?relative+'/'+entry.name:entry.name;
      if(entry.isDirectory())await scan(name);
      else if(entry.isFile())files.push({path:name,sha256:await sha256(path.join(bundle,name))});
      else throw new Error('동봉 링크/특수 파일 거부');
    }
  }
  await scan();await fs.writeFile(path.join(bundle,'runtime-manifest.json'),JSON.stringify({platform:'win32',arch:'x64',sources:lock,files},null,2)+'\n');
  checkRuntime(bundle);
  // mkdir reservation prevents a competing preparation from being overwritten.
  await fs.mkdir(runtimeRoot);
  for(const entry of await fs.readdir(bundle))await fs.rename(path.join(bundle,entry),path.join(runtimeRoot,entry));
  console.log('준비 완료:',runtimeRoot,'(다운로드 원본은 준비 폴더에 보존)');
}
if(require.main===module){const jar=path.resolve(process.argv[2]||path.join(__dirname,'../../backend/build-verification/libs/onfilm-local.jar'));prepare(jar).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={sha256,safeEntry,extract,download,prepare};

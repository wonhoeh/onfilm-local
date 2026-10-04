const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const runtimeRoot=path.resolve(__dirname,'../../runtime/windows-x64');
function checkRuntime(root=runtimeRoot){
  if(fs.lstatSync(root,{throwIfNoEntry:false})?.isSymbolicLink())throw new Error('런타임 루트에 링크를 사용할 수 없습니다.');
  const required=['api/onfilm-local.jar','java/bin/java.exe','java/bin/server/jvm.dll','java/release','ffmpeg/bin/ffmpeg.exe','ffmpeg/bin/ffprobe.exe','THIRD-PARTY-NOTICES.txt'];
  for(const name of required){
    const stat=fs.lstatSync(path.join(root,name),{throwIfNoEntry:false});
    if(!stat?.isFile()||stat.isSymbolicLink()||!stat.size)throw new Error('Windows 동봉 파일이 없거나 올바르지 않습니다: '+name);
  }
  const release=fs.readFileSync(path.join(root,'java/release'),'utf8');
  if(!/^JAVA_VERSION="21(?:\.|\")/m.test(release)||!/^OS_ARCH="(?:amd64|x86_64)"/m.test(release))throw new Error('Windows x64 Java 21 런타임을 준비해 주세요.');
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'runtime-manifest.json'),'utf8'));
  if(manifest.platform!=='win32'||manifest.arch!=='x64'||!Array.isArray(manifest.files))throw new Error('런타임 manifest 형식이 올바르지 않습니다.');
  const actual=[];
  function scan(relative=''){
    for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){
      const name=relative?relative+'/'+entry.name:entry.name;
      if(!relative&&!['api','java','ffmpeg','THIRD-PARTY-NOTICES.txt','runtime-manifest.json'].includes(entry.name))throw new Error('허용되지 않은 동봉 항목: '+name);
      if(/(?:\.mv\.db|\.trace\.db|\.log)$|^\.env(?:\.|$)/i.test(entry.name))throw new Error('사용자 데이터/환경 파일은 동봉할 수 없습니다.');
      if(entry.isSymbolicLink())throw new Error('동봉 폴더에 링크를 사용할 수 없습니다: '+name);
      if(entry.isDirectory())scan(name);
      else if(entry.isFile()&&name!=='runtime-manifest.json')actual.push(name);
      else if(!entry.isFile())throw new Error('지원하지 않는 동봉 파일: '+name);
    }
  }
  scan();
  const listed=new Set();
  for(const file of manifest.files){
    if(typeof file.path!=='string'||!actual.includes(file.path)||listed.has(file.path)||!/^[a-f0-9]{64}$/.test(file.sha256))throw new Error('manifest 파일 목록이 올바르지 않습니다.');
    listed.add(file.path);
    const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file.path))).digest('hex');
    if(hash!==file.sha256)throw new Error('동봉 파일 해시 불일치: '+file.path);
  }
  if(listed.size!==actual.length)throw new Error('manifest에 기록하지 않은 파일이 있습니다.');
  if(!manifest.sources?.java||!manifest.sources?.ffmpeg)throw new Error('Java/FFmpeg 배포 출처를 기록해 주세요.');
  return {files:actual.length};
}
if(require.main===module){try{console.log('Windows runtime checked:',checkRuntime());}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={checkRuntime,runtimeRoot};

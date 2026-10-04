const fs=require('node:fs');
const path=require('node:path');

// Executables must remain outside app.asar. Never fall back to a machine-wide runtime.
function bundledRuntime(resourcesPath,platform=process.platform,arch=process.arch){
  if(platform!=='win32'||arch!=='x64')throw new Error('현재 설치형 앱은 Windows x64 구성만 준비되어 있습니다.');
  if(!resourcesPath||!path.isAbsolute(resourcesPath))throw new Error('앱 리소스 경로를 확인할 수 없습니다.');
  const root=path.join(resourcesPath,'runtime');
  const paths={jar:path.join(root,'api','onfilm-local.jar'),java:path.join(root,'java','bin','java.exe'),
    ffmpeg:path.join(root,'ffmpeg','bin','ffmpeg.exe'),ffprobe:path.join(root,'ffmpeg','bin','ffprobe.exe')};
  for(const [name,file] of Object.entries(paths)){
    if(!fs.statSync(file,{throwIfNoEntry:false})?.isFile())throw new Error(`앱 구성 파일(${name})이 없습니다. 사용자 데이터는 그대로 두고 앱을 다시 설치해 주세요.`);
  }
  return paths;
}
module.exports={bundledRuntime};

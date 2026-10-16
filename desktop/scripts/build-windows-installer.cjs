const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {checkRuntime,runtimeRoot}=require('./check-windows-runtime.cjs');
const {prepare,sha256}=require('./prepare-windows-runtime.cjs');

function run(file,args,options={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(file,args,{...options,shell:false,stdio:'inherit'});
    child.once('error',reject);
    child.once('exit',(code,signal)=>code===0?resolve():reject(new Error(`${path.basename(file)} 실패 (${signal||code})`)));
  });
}
function javaPaths(home){
  if(!home||!path.isAbsolute(home))throw new Error('개발 PC의 JAVA_HOME을 JDK 21 설치 폴더로 지정해 주세요. 최종 사용자는 Java 설치가 필요 없습니다.');
  return {java:path.join(home,'bin','java.exe'),javac:path.join(home,'bin','javac.exe')};
}
function wrapperArgs(home,backend){
  return [`-Dorg.gradle.java.home=${home}`,'-classpath',path.join(backend,'gradle/wrapper/gradle-wrapper.jar'),
    'org.gradle.wrapper.GradleWrapperMain','--no-daemon',`-Dorg.gradle.java.home=${home}`,
    '-PverificationBuild','check','bootJar'];
}
async function stageBundle(source,jar,destination){
  checkRuntime(source); // Never repair an unverified bundle by rewriting its manifest.
  const jarStat=await fs.lstat(jar);
  if(!jarStat.isFile()||jarStat.isSymbolicLink()||!jarStat.size)throw new Error('빌드된 API JAR가 올바르지 않습니다.');
  await fs.mkdir(destination); // Refuse to overwrite a previous build.
  await fs.cp(source,destination,{recursive:true,errorOnExist:true,force:false});
  await fs.copyFile(jar,path.join(destination,'api/onfilm-local.jar'));
  const manifestPath=path.join(destination,'runtime-manifest.json');
  const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
  const api=manifest.files.find(file=>file.path==='api/onfilm-local.jar');
  if(!api)throw new Error('manifest에 API JAR가 없습니다.');
  api.sha256=await sha256(jar);
  await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  checkRuntime(destination);
}
async function build(){
  if(process.platform!=='win32'||process.arch!=='x64')throw new Error('이 명령은 Windows x64 개발 PC에서 실행해 주세요.');
  const desktop=path.resolve(__dirname,'..'),backend=path.resolve(desktop,'../backend');
  const home=process.env.JAVA_HOME,{java,javac}=javaPaths(home);
  const release=await fs.readFile(path.join(home,'release'),'utf8');
  if(!/^JAVA_VERSION="21(?:\.|\")/m.test(release))throw new Error('빌드용 JAVA_HOME은 JDK 21이어야 합니다.');
  await fs.access(javac);await run(java,['-version']);
  const dist=path.join(desktop,'dist');await fs.mkdir(dist,{recursive:true});
  const lock=path.join(dist,'.windows-release.lock');
  let handle;
  try{handle=await fs.open(lock,'wx');}catch(error){if(error.code==='EEXIST')throw new Error('다른 설치 파일 빌드가 진행 중이거나 중단 흔적이 있습니다. 진행 중인 빌드가 없는지 확인한 뒤 desktop/dist/.windows-release.lock을 제거해 주세요.');throw error;}
  try{
    console.log('[1/5] 백엔드 검사·빌드 (검증 전용 JAR)');
    const env={...process.env,JAVA_HOME:home};
    await run(java,wrapperArgs(home,backend),{cwd:backend,env});
    console.log('[2/5] 데스크톱 테스트');
    // npm/node shell shims are not executed; pass test paths directly to Node.
    const tests=(await fs.readdir(path.join(desktop,'test'))).filter(name=>name.endsWith('.test.cjs')).sort().map(name=>path.join('test',name));
    await run(process.execPath,['--test',...tests],{cwd:desktop,env});
    const jar=path.join(backend,'build-verification/libs/onfilm-local.jar');
    console.log('[3/5] Windows Java·FFmpeg 확인 (최초 실행만 다운로드)');
    if(!await fs.lstat(runtimeRoot).catch(error=>{if(error.code!=='ENOENT')throw error;}))await prepare(jar);
    checkRuntime(runtimeRoot);
    const output=await fs.mkdtemp(path.join(dist,'windows-release-'));
    console.log('이번 빌드 폴더:',output);
    console.log('[4/5] 최신 JAR와 검증된 런타임으로 별도 번들 생성');
    const bundle=path.join(output,'runtime');await stageBundle(runtimeRoot,jar,bundle);
    console.log('[5/5] Windows 설치 파일 생성');
    await run(process.execPath,[require.resolve('electron-builder/cli.js'),'--config','electron-builder.cjs',
      '--win','nsis','--x64','--publish','never',`--config.directories.output=${path.join(output,'installer')}`],
      {cwd:desktop,env:{...env,ONFILM_WINDOWS_RUNTIME_ROOT:bundle}});
    const files=await fs.readdir(path.join(output,'installer'));
    const installers=files.filter(name=>name.endsWith('-Setup.exe'));
    if(installers.length!==1)throw new Error('설치 파일을 하나로 확인할 수 없습니다. 빌드 폴더를 확인해 주세요.');
    console.log('\n설치 파일:',path.join(output,'installer',installers[0]));
    console.log('사용자에게는 위 Setup.exe만 전달합니다. 사용자 PC에는 JDK/Node/Electron/FFmpeg 별도 설치가 필요 없습니다.');
    console.log('외부 배포 전 라이선스 의무·코드 서명·깨끗한 Windows 설치 테스트를 확인해 주세요.');
  }finally{await handle.close();await fs.unlink(lock);}
}
if(require.main===module)build().catch(error=>{console.error('\n설치 파일 생성 중단:',error.message);process.exitCode=1;});
module.exports={run,javaPaths,wrapperArgs,stageBundle,build};

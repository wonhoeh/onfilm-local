const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {stageBundle,wrapperArgs,javaPaths,run}=require('../scripts/build-windows-installer.cjs');
const {sha256}=require('../scripts/prepare-windows-runtime.cjs');
const {checkRuntime}=require('../scripts/check-windows-runtime.cjs');
async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'onfilm-release-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const source=path.join(root,'source'),manifest={platform:'win32',arch:'x64',sources:{java:'fixture',ffmpeg:'fixture'},files:[]};
  for(const name of ['api/onfilm-local.jar','java/bin/java.exe','java/bin/server/jvm.dll','java/release','ffmpeg/bin/ffmpeg.exe','ffmpeg/bin/ffprobe.exe','THIRD-PARTY-NOTICES.txt']){
    const file=path.join(source,name);await fs.mkdir(path.dirname(file),{recursive:true});
    await fs.writeFile(file,name==='java/release'?'JAVA_VERSION="21.0.1"\nOS_ARCH="amd64"':'old fixture');
    manifest.files.push({path:name,sha256:await sha256(file)});
  }
  await fs.writeFile(path.join(source,'runtime-manifest.json'),JSON.stringify(manifest));
  const jar=path.join(root,'new.jar');await fs.writeFile(jar,'latest API');
  return {root,source,jar};
}
test('release stages latest JAR without changing verified cache or previous builds',async t=>{
  const {root,source,jar}=await fixture(t),dest=path.join(root,'bundle');
  const previous=await fs.readFile(path.join(source,'runtime-manifest.json'),'utf8');
  await stageBundle(source,jar,dest);
  assert.equal(checkRuntime(dest).files,7);
  assert.equal(await fs.readFile(path.join(dest,'api/onfilm-local.jar'),'utf8'),'latest API');
  assert.equal(await fs.readFile(path.join(source,'api/onfilm-local.jar'),'utf8'),'old fixture');
  assert.equal(await fs.readFile(path.join(source,'runtime-manifest.json'),'utf8'),previous);
  await assert.rejects(stageBundle(source,jar,dest),/EEXIST/);
});
test('release refuses tampered runtime rather than blessing it with a new hash',async t=>{
  const {root,source,jar}=await fixture(t);
  await fs.writeFile(path.join(source,'ffmpeg/bin/ffmpeg.exe'),'changed');
  await assert.rejects(stageBundle(source,jar,path.join(root,'bundle')),/해시 불일치/);
  await assert.rejects(fs.stat(path.join(root,'bundle')),/ENOENT/);
});
test('wrapper pins Java explicitly and preserves paths containing spaces as individual arguments',()=>{
  const home=path.resolve('JDK 21'),backend=path.resolve('한글 backend');
  assert.equal(javaPaths(home).java,path.join(home,'bin','java.exe'));
  assert.throws(()=>javaPaths(''),/JAVA_HOME/);
  const args=wrapperArgs(home,backend);
  assert.equal(args[0],`-Dorg.gradle.java.home=${home}`);
  assert(args.includes(path.join(backend,'gradle/wrapper/gradle-wrapper.jar')));
  assert(args.includes('-PverificationBuild'));assert(args.includes('check'));assert(args.includes('bootJar'));
});
test('release command stops on child failure',async()=>{
  await assert.rejects(run(process.execPath,['-e','process.exit(7)']),/실패 \(7\)/);
});

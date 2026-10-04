const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {configuration}=require('../src/config.cjs');
const {bundledRuntime}=require('../src/bundled-runtime.cjs');
test('packaged Windows runtime uses bundled absolute paths and ignores developer overrides',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'onfilm-runtime-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const resourcesPath=path.join(root,'설치 폴더','resources'),dataDir=path.join(root,'사용자 데이터');
  const options={packaged:true,resourcesPath,platform:'win32',arch:'x64',java:'wrong-java',jar:'wrong.jar',ffmpeg:'wrong-ffmpeg'};
  assert.throws(()=>configuration(dataDir,options),/다시 설치/);
  assert.equal(fs.existsSync(dataDir),false);
  for(const name of ['api/onfilm-local.jar','java/bin/java.exe','ffmpeg/bin/ffmpeg.exe','ffmpeg/bin/ffprobe.exe']){
    const file=path.join(resourcesPath,'runtime',name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'fixture only');
  }
  const config=configuration(dataDir,options);
  assert.equal(config.command,path.join(resourcesPath,'runtime/java/bin/java.exe'));
  assert.deepEqual(config.args,['-jar',path.join(resourcesPath,'runtime/api/onfilm-local.jar')]);
  assert.equal(config.env.ONFILM_FFMPEG,path.join(resourcesPath,'runtime/ffmpeg/bin/ffmpeg.exe'));
  assert.equal(config.env.ONFILM_FFPROBE,path.join(resourcesPath,'runtime/ffmpeg/bin/ffprobe.exe'));
  assert.equal(config.cwd,dataDir);
  fs.unlinkSync(config.env.ONFILM_FFPROBE);
  assert.throws(()=>configuration(dataDir,options),/ffprobe/);
  assert.throws(()=>bundledRuntime(resourcesPath,'win32','arm64'),/x64/);
  assert.throws(()=>bundledRuntime(resourcesPath,'darwin','arm64'),/Windows/);
});

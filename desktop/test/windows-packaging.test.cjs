const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {checkRuntime}=require('../scripts/check-windows-runtime.cjs');
test('packaging gate rejects missing, changed and unlisted runtime files',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'onfilm-package-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  assert.throws(()=>checkRuntime(root),/동봉 파일/);
  const manifest={platform:'win32',arch:'x64',sources:{java:'test fixture',ffmpeg:'test fixture'},files:[]};
  for(const name of ['api/onfilm-local.jar','java/bin/java.exe','java/bin/server/jvm.dll','java/release','ffmpeg/bin/ffmpeg.exe','ffmpeg/bin/ffprobe.exe','THIRD-PARTY-NOTICES.txt']){
    const content=name==='java/release'?'JAVA_VERSION="21.0.1"\nOS_ARCH="amd64"':'fixture, not an executable';
    const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);
    manifest.files.push({path:name,sha256:crypto.createHash('sha256').update(content).digest('hex')});
  }
  fs.writeFileSync(path.join(root,'runtime-manifest.json'),JSON.stringify(manifest));
  assert.equal(checkRuntime(root).files,7);
  fs.writeFileSync(path.join(root,'api','extra.jar'),'extra');assert.throws(()=>checkRuntime(root),/기록하지 않은/);
  fs.unlinkSync(path.join(root,'api','extra.jar'));
  fs.writeFileSync(path.join(root,'api','onfilm.mv.db'),'private');assert.throws(()=>checkRuntime(root),/사용자 데이터/);
  fs.unlinkSync(path.join(root,'api','onfilm.mv.db'));
  fs.writeFileSync(path.join(root,'api','onfilm-local.jar'),'changed');assert.throws(()=>checkRuntime(root),/해시 불일치/);
});
test('installer keeps user data and limits bundled application source',()=>{
  const config=require('../electron-builder.cjs');
  assert.equal(config.nsis.deleteAppDataOnUninstall,false);
  assert.equal(config.nsis.runAfterFinish,false);
  assert.deepEqual(config.files,['src/**/*','package.json']);
  assert.equal(config.extraResources[0].to,'runtime');
  assert.deepEqual(config.win.target[0].arch,['x64']);
});

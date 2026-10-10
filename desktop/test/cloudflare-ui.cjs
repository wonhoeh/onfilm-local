const {app} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const assert = require('node:assert/strict');
const {randomBytes,createCipheriv,createDecipheriv} = require('node:crypto');
const {setTimeout:delay} = require('node:timers/promises');
const {configuration} = require('../src/config.cjs');
const {ApiProcess} = require('../src/api-process.cjs');
const {createWindow} = require('../src/window.cjs');
const {assetHash} = require('../src/cloudflare/publication-client.cjs');

// Isolated GUI workflow test: no real credentials, OS keychain prompt or Cloudflare calls.
const key = randomBytes(32);
const encryption = {
  isEncryptionAvailable:() => true,
  encryptString(text) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm',key,iv);
    const result = Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);
    return Buffer.concat([iv,cipher.getAuthTag(),result]);
  },
  decryptString(buffer) {
    const cipher = createDecipheriv('aes-256-gcm',key,buffer.subarray(0,12));
    cipher.setAuthTag(buffer.subarray(12,28));
    return Buffer.concat([cipher.update(buffer.subarray(28)),cipher.final()]).toString('utf8');
  },
};
let win, backend;
const root = require('node:fs').mkdtempSync(path.join(os.tmpdir(),'onfilm-cloudflare-ui-'));
require('node:fs').mkdirSync(path.join(root,'electron'),{recursive:true});
app.setPath('userData',path.join(root,'electron'));
app.on('window-all-closed',() => {});
async function waitFor(script) {
  const until = Date.now()+60000;
  while (Date.now()<until) { try { if (await win.webContents.executeJavaScript(script)) return; } catch {} await delay(100); }
  throw new Error('Cloudflare UI timeout');
}
async function capture(name){
  // Screenshot artifacts are optional on macOS sessions whose compositor is unavailable.
  // UI/IPC assertions below still run and failures must fail the test.
  try{await delay(300);await fs.writeFile(path.join(root,name),(await win.webContents.capturePage()).toPNG());}
  catch(error){if(error.message!=='UnknownVizError')throw error;console.warn('Screenshot unavailable (UnknownVizError): '+name);}
}
async function run() {
  await app.whenReady();
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0,'127.0.0.1',resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const testJar=process.env.ONFILM_TEST_JAR?path.join(root,'test-api.jar'):undefined;
  if(testJar)await fs.copyFile(process.env.ONFILM_TEST_JAR,testJar);
  const config = configuration(path.join(root,'data'),{port,jar:testJar,java:process.env.ONFILM_JAVA_PATH});
  config.env.LOGGING_LEVEL_ROOT = 'WARN';
  backend = new ApiProcess(config);
  let checks = 0;
  let publishCreates=0,publishMarker,publishConfirmations=0;
  const publicationOptions={confirm:async()=>{publishConfirmations++;return true;},makeClient:()=>({
    project:async()=>({branch:'production'}),
    uploadMedia:async(_plan,progress)=>{progress({completed:1,total:2,bytes:1,totalBytes:2});await delay(1600);},
    uploadPages:async plan=>{assert(plan.files.some(file=>file.name==='/won-ho_01/index.html'));await assetHash(plan.files[0]);return {};},
    deploy:async(_plan,_manifest,_branch,marker)=>{publishCreates++;publishMarker=marker;throw new Error('simulated lost response');},
    findDeployment:async marker=>{assert.equal(marker,publishMarker);return {id:'published-test'};},
    waitDeployment:async()=> 'success',
  })};
  const open = async () => {
    win = createWindow({origin:config.origin,backend,token:config.env.ONFILM_TOKEN,dataDir:config.env.ONFILM_DATA_DIR,
      partition:'cloudflare-ui-test',connectionEncryption:encryption,publicationOptions,connectionCheck:async saved => {
        checks++; assert.equal(saved.bucket,'onfilm-media');
        return [{service:'r2',ok:true,message:'R2 조회 확인'},{service:'pages',ok:false,message:'Pages 권한을 확인해 주세요.'}];
      }});
    await waitFor("document.getElementById('status')?.textContent === '저장된 프로필을 불러왔습니다.' || document.getElementById('viewStatus')?.textContent === '저장된 프로필입니다.'");
    await win.loadURL(config.origin+'/export.html');
    await win.webContents.executeJavaScript("document.querySelector('a[href=\"/cloudflare.html\"]').click()");
    await waitFor("document.getElementById('connectionStatus') && !document.getElementById('connectionFields').disabled");
  };
  await open();
  assert.equal(await win.webContents.executeJavaScript("typeof require"),'undefined');
  assert.equal(await win.webContents.executeJavaScript("document.getElementById('checkConnection').disabled"),true);
  for (const invalid of ['Wonhoe','ab','ab/cd','media','assets','a'.repeat(31)]) {
    await win.webContents.executeJavaScript(`document.getElementById('publicSlug').value=${JSON.stringify(invalid)};document.getElementById('publicSlug').dispatchEvent(new Event('input',{bubbles:true}));`);
    assert.equal(await win.webContents.executeJavaScript("document.getElementById('publicSlug').checkValidity()"),false);
    assert.equal(await win.webContents.executeJavaScript("document.getElementById('publicSlugError').textContent.length>0"),true);
  }
  const values = {accountId:'a'.repeat(32),bucket:'onfilm-media',project:'onfilm-test',siteOrigin:'https://onfilm.co.kr',mediaOrigin:'https://media.onfilm.co.kr',publicSlug:'won-ho_01',accessKeyId:'b'.repeat(32),secretAccessKey:'c'.repeat(64),pagesToken:'d'.repeat(40)};
  await win.webContents.executeJavaScript(`for (const [id,value] of Object.entries(${JSON.stringify(values)})) {document.getElementById(id).value=value;document.getElementById(id).dispatchEvent(new Event('input',{bubbles:true}));} document.getElementById('saveConnection').click();`);
  await waitFor("document.getElementById('connectionStatus').textContent.includes('설정을 저장했습니다')");
  assert.equal(await win.webContents.executeJavaScript("document.getElementById('publicUrlPreview').textContent"),'https://onfilm.co.kr/won-ho_01');
  assert.equal(await win.webContents.executeJavaScript("document.getElementById('publicSlug').checkValidity()"),true);
  assert.equal(await win.webContents.executeJavaScript("[...document.querySelectorAll('input[type=password]')].every(input=>input.value==='')"),true);
  assert.equal(await win.webContents.executeJavaScript("document.getElementById('checkConnection').disabled"),false);
  await win.webContents.executeJavaScript("document.getElementById('checkConnection').click()");
  await waitFor("document.querySelectorAll('.connection-result').length===2");
  assert.equal(checks,1);
  assert.equal(await win.webContents.executeJavaScript("document.querySelectorAll('[data-ok=false]').length"),1);
  await capture('cloudflare-settings.png');
  await win.webContents.executeJavaScript("document.getElementById('project').value='updated-project';document.getElementById('project').dispatchEvent(new Event('input',{bubbles:true}));");
  assert.equal(await win.webContents.executeJavaScript("document.getElementById('checkConnection').disabled"),true);
  await win.webContents.executeJavaScript("document.getElementById('saveConnection').click()");
  await waitFor("document.getElementById('connectionStatus').textContent.includes('설정을 저장했습니다')");
  win.destroy(); await open();
  assert.equal(await win.webContents.executeJavaScript("document.getElementById('project').value"),'updated-project');
  assert.equal(await win.webContents.executeJavaScript("document.getElementById('publicSlug').value"),'won-ho_01');
  assert.equal(await win.webContents.executeJavaScript("document.getElementById('publicUrlPreview').textContent"),'https://onfilm.co.kr/won-ho_01');
  assert.equal(await win.webContents.executeJavaScript("[...document.querySelectorAll('input[type=password]')].every(input=>!input.value)"),true);
  // Publish a real export from temporary file H2; only the cloud transport and confirmation are mocked.
  await win.webContents.executeJavaScript(`(async()=>{
    const profile=await fetch('/api/profile').then(r=>r.json());
    const response=await fetch('/api/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'게시 테스트',oneLineIntro:'프로필',version:profile.version})});
    if(!response.ok)throw new Error('fixture profile');
    const exported=await fetch('/api/exports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({includeVisibleProfile:true})});
    if(!exported.ok)throw new Error('fixture export');
  })()`);
  await win.loadURL(config.origin+'/export.html');
  await waitFor("document.querySelector('[data-action=publish]') && document.getElementById('publishedUrl').textContent.includes('won-ho_01')");
  await win.webContents.executeJavaScript("document.querySelector('[data-action=publish]').click()");
  await waitFor("document.getElementById('publishProgress').hidden===false");
  assert.equal(await win.webContents.executeJavaScript("document.querySelector('[data-action=trash]').disabled"),true);
  assert.equal(await win.webContents.executeJavaScript("document.getElementById('publishProgress').value"),50);
  await waitFor("!document.getElementById('checkPublication').hidden && !document.getElementById('checkPublication').disabled");
  assert.equal(publishCreates,1);
  assert.equal(await win.webContents.executeJavaScript("document.getElementById('publishStatus').textContent.includes('이미 게시됐을 수')"),true);
  win.destroy();await open();await win.loadURL(config.origin+'/export.html');
  await waitFor("!document.getElementById('checkPublication').hidden");
  await win.webContents.executeJavaScript("document.getElementById('checkPublication').click()");
  await waitFor("document.getElementById('publishStatus').textContent.includes('게시되었습니다')");
  assert.equal(publishCreates,1);assert.equal(publishConfirmations,1);
  assert.equal(await win.webContents.executeJavaScript("document.getElementById('publishedUrl').textContent.includes('최근 게시: https://onfilm.co.kr/won-ho_01/')"),true);
  await capture('publication-complete.png');
  await win.loadURL(config.origin+'/cloudflare.html');
  await waitFor("document.getElementById('connectionStatus') && !document.getElementById('connectionFields').disabled");
  await win.webContents.executeJavaScript("document.querySelector('details').open=true;document.getElementById('clearConnection').click()");
  assert.equal(await win.webContents.executeJavaScript("document.getElementById('clearConfirm').hidden"),false);
  await win.webContents.executeJavaScript("document.getElementById('cancelClear').click()");
  assert.equal(await win.webContents.executeJavaScript("document.getElementById('savedBadge').textContent"),'저장됨');
  await win.webContents.executeJavaScript("document.getElementById('clearConnection').click();document.getElementById('confirmClear').click()");
  await waitFor("document.getElementById('connectionStatus').textContent.includes('설정을 삭제했습니다')");
  assert.equal(await win.webContents.executeJavaScript("document.getElementById('publicSlug').value"),'');
  assert.equal(await win.webContents.executeJavaScript("document.getElementById('publicUrlPreview').textContent"),'공개 주소 이름을 입력해 주세요.');
  assert.equal(await win.webContents.executeJavaScript("document.getElementById('checkConnection').disabled"),true);
  await win.loadURL(config.origin+'/export.html');
  assert.equal(await win.webContents.executeJavaScript("typeof onfilmCloudflare"),'undefined');
  console.log('Cloudflare UI passed: settings, real export publication UI, progress, lost response, restart/reconcile without duplicate, receipt, clear, bridge scope. Screenshots: '+root);
}
run().then(async () => {win?.destroy();await backend?.stop();app.exit(0);}).catch(async error => {
  console.error(error);win?.destroy();await backend?.stop();app.exit(1);
});

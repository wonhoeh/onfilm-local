const {app,BrowserWindow,dialog,shell} = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {setTimeout:delay} = require('node:timers/promises');
const {configuration} = require('../src/config.cjs');
const {ApiProcess} = require('../src/api-process.cjs');
const {createWindow} = require('../src/window.cjs');
const {preparePublication} = require('../src/cloudflare/publication-files.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(),'onfilm-local-e2e-'));
// Keep an immutable test runtime: rebuilding the developer JAR must not invalidate a running JVM.
const testJar=process.env.ONFILM_TEST_JAR?path.join(directory,'test-api.jar'):undefined;
if(testJar)fs.copyFileSync(process.env.ONFILM_TEST_JAR,testJar);
app.setPath('userData',path.join(directory,'electron'));
// Keep the test runner alive between the first and second windows.
app.on('window-all-closed', () => {});
let backend;
let window;
async function waitFor(fn) {
  const end = Date.now()+90000;
  while (Date.now()<end) { try { if(await fn()) return; } catch {} await delay(100); }
  throw new Error('Timed out waiting for UI');
}
async function launch() {
  const listener=net.createServer();
  await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
  const port=listener.address().port;
  await new Promise(resolve=>listener.close(resolve));
  const config=configuration(path.join(directory,'한글 data'),{port,java:process.env.ONFILM_JAVA_PATH,jar:testJar});
  config.env.LOGGING_LEVEL_ROOT='WARN';
  backend=new ApiProcess(config);
  window=createWindow({origin:config.origin,backend,token:config.env.ONFILM_TOKEN,dataDir:config.env.ONFILM_DATA_DIR,show:true,partition:`e2e-${port}`});
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('status')?.textContent === '저장된 프로필을 불러왔습니다.' || document.getElementById('viewStatus')?.textContent === '저장된 프로필입니다.'"));
  return config;
}
async function close() { window?.destroy(); await backend?.stop(); }
async function verifyStaticPortfolio(site, published=false) {
  const requests=[];
  let hideContact=false;
  const plan=published?await preparePublication(path.resolve(site,'../../..'),path.basename(path.dirname(site)),{
    accountId:'a'.repeat(32),project:'onfilm-test',bucket:'media-test',siteOrigin:'https://onfilm.example',
    mediaOrigin:'https://media.onfilm.example',publicSlug:'actor_01'},new AbortController().signal):null;
  let mediaServer,mediaOrigin;
  if(published){
    mediaServer=http.createServer((req,res)=>{
      try{
        const name=new URL(req.url,'http://localhost').pathname.slice(('/'+plan.prefix+'/').length);
        const entry=plan.media.find(item=>item.path===name);if(!entry){res.writeHead(404).end();return;}
        requests.push('R2:'+req.url);res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Content-Type',entry.contentType);
        fs.createReadStream(path.join(site,name)).pipe(res);
      }catch{res.writeHead(404).end();}
    });
    await new Promise(resolve=>mediaServer.listen(0,'127.0.0.1',resolve));mediaOrigin='http://127.0.0.1:'+mediaServer.address().port;
  }
  const server=http.createServer((req,res)=>{
    try{
      if(published){
        const pathname=new URL(req.url,'http://localhost').pathname;
        requests.push(req.url);
        if(pathname.startsWith('/actor_01/media/')){res.writeHead(302,{Location:mediaOrigin+'/'+plan.prefix+'/'+pathname.slice('/actor_01/'.length)}).end();return;}
        const name=pathname==='/actor_01/'?'/actor_01/index.html':pathname;
        const asset=plan.files.find(file=>file.name===name);if(!asset){res.writeHead(404).end();return;}
        res.setHeader('Content-Type',asset.contentType);
        if(hideContact&&name.endsWith('/portfolio.json')){const data=JSON.parse(asset.data);data.profile.contact={};res.end(JSON.stringify(data));return;}
        res.end(asset.data);return;
      }
      requests.push(req.url);const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html';
      const file=path.resolve(site,name);if(!file.startsWith(site+path.sep)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
      const types={'.html':'text/html','.json':'application/json','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.ts':'video/mp2t','.m3u8':'application/vnd.apple.mpegurl'};
      res.setHeader('Content-Type',types[path.extname(file)]||'text/plain');
      if(hideContact&&name==='portfolio.json'){const data=JSON.parse(fs.readFileSync(file,'utf8'));data.profile.contact={};res.end(JSON.stringify(data));return;}
      fs.createReadStream(file).pipe(res);
    }catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const viewer=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,partition:'static-'+Date.now(),autoplayPolicy:'no-user-gesture-required'}});
  viewer.webContents.session.webRequest.onBeforeRequest((details,cb)=>cb({cancel:details.url.startsWith('http')&&!details.url.startsWith(origin+'/')&&!(mediaOrigin&&details.url.startsWith(mediaOrigin+'/'))}));
  try{
    const entry=published?'/actor_01/':'/index.html';
    await viewer.loadURL(origin+entry);
    await waitFor(()=>viewer.webContents.executeJavaScript("document.getElementById('publicStatus')?.textContent === ''"));
    const exportedFilms=JSON.parse(fs.readFileSync(path.join(site,'portfolio.json'),'utf8')).films;
    assert.deepEqual(await viewer.webContents.executeJavaScript("[...document.querySelectorAll('#filmSlider .film-meta')].map(el=>el.textContent)"),exportedFilms.map(film=>[film.year,...film.roles.flatMap(role=>role==='ACTOR'?['배우',film.characterName?.trim()]:[{DIRECTOR:'감독',WRITER:'작가'}[role]])].filter(Boolean).join(' · ')));
    assert.equal(await viewer.webContents.executeJavaScript("document.getElementById('profileName').textContent"),'배우 재시작 테스트');
    assert.equal(await viewer.webContents.executeJavaScript("document.getElementById('contactEmailDisplay').textContent"),'actor@example.com');
    assert.equal(await viewer.webContents.executeJavaScript("document.getElementById('contactPhoneDisplay')"),null);
    assert.equal(await viewer.webContents.executeJavaScript("document.querySelectorAll('input,button[data-action],.profile-settings-btn').length"),0);
    await waitFor(()=>viewer.webContents.executeJavaScript("[...document.querySelectorAll('#profilePhoto,.film-poster')].every(image=>image.complete&&image.naturalWidth>0)"));
    await delay(300);
    fs.writeFileSync(path.join(directory,published?'published-portfolio.png':'public-portfolio.png'),(await viewer.webContents.capturePage()).toPNG());
    await viewer.webContents.executeJavaScript("document.querySelector('#filmSlider a').dispatchEvent(new MouseEvent('mouseenter'))");
    await waitFor(()=>viewer.webContents.executeJavaScript("document.querySelector('.movie-popup video')?.currentTime>.2"));
    assert.equal(await viewer.webContents.executeJavaScript("document.querySelector('.movie-popup video').muted"),true);
    await viewer.webContents.executeJavaScript("OnfilmPreview.close()");
    await viewer.webContents.executeJavaScript("document.querySelector('#filmSlider a').click()");
    await waitFor(()=>viewer.webContents.executeJavaScript("document.getElementById('video')?.currentTime > 0.2"));
    assert.ok(requests.some(url=>url.includes('segment-')));
    if(published)assert.ok(requests.some(url=>url.startsWith('R2:')&&url.includes('segment-')));
    assert.ok(requests.every(url=>!url.startsWith('/api/')));
    await viewer.webContents.executeJavaScript("document.getElementById('backBtn').click()");
    await waitFor(()=>viewer.webContents.executeJavaScript("document.getElementById('publicStatus')?.textContent === ''"));
    hideContact=true;await viewer.loadURL(origin+entry+'?emptyContact=1');
    await waitFor(()=>viewer.webContents.executeJavaScript("document.getElementById('publicStatus')?.textContent === ''"));
    assert.equal(await viewer.webContents.executeJavaScript("document.getElementById('contactSection').hidden"),true);
  } finally {viewer.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));if(mediaServer){mediaServer.closeAllConnections();await new Promise(resolve=>mediaServer.close(resolve));}}
}
async function pressKey(keyCode) {
  window.webContents.sendInputEvent({type:'keyDown',keyCode});
  window.webContents.sendInputEvent({type:'keyUp',keyCode});
  await delay(100);
}
async function uploadVideo(name='연기 영상.mp4',valid=true) {
  await window.webContents.executeJavaScript(`{
    const bytes=new Uint8Array(1024*1024*7);bytes[3]=24;
    if(${valid})bytes.set([102,116,121,112],4);
    const transfer=new DataTransfer();transfer.items.add(new File([bytes],${JSON.stringify(name)},{type:'video/mp4'}));
    const input=document.querySelector('.video-file-input');input.files=transfer.files;input.dispatchEvent(new Event('change'));
  }`);
}
async function uploadThumbnail(width=4032,height=3024) {
  await window.webContents.executeJavaScript(`new Promise(resolve=>{
    const canvas=document.createElement('canvas');canvas.width=${width};canvas.height=${height};
    canvas.getContext('2d').fillRect(0,0,canvas.width,canvas.height);
    canvas.toBlob(blob=>{const transfer=new DataTransfer();transfer.items.add(new File([blob],'film.png',{type:'image/png'}));
      const input=document.querySelector('.thumb-file-input');input.files=transfer.files;input.dispatchEvent(new Event('change'));resolve();},'image/png');
  })`);
}
async function uploadPortrait(width=4032,height=3024,drop=false) {
  await window.webContents.executeJavaScript(`new Promise(resolve=>{
    const canvas=document.createElement('canvas');canvas.width=${width};canvas.height=${height};
    canvas.getContext('2d').fillRect(0,0,canvas.width,canvas.height);
    canvas.toBlob(blob=>{const transfer=new DataTransfer();transfer.items.add(new File([blob],'portrait.png',{type:'image/png'}));
      if(${drop})document.getElementById('photoSection').dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}));
      else{const input=document.getElementById('profileFileInput');input.files=transfer.files;input.dispatchEvent(new Event('change'));}resolve();},'image/png');
  })`);
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('photoStatus').textContent === '사진을 저장했습니다.'"));
}
app.whenReady().then(async()=>{
  let config=await launch();
  assert.equal((await fetch(`${config.origin}/api/profile`)).status,403);
  const headers={'X-Onfilm-Token':config.env.ONFILM_TOKEN,'Content-Type':'application/json'};
  assert.equal((await fetch(`${config.origin}/api/profile`,{headers:{...headers,Origin:'https://evil.example'}})).status,403);
  assert.equal((await fetch(`${config.origin}/api/profile`,{method:'PUT',headers,body:JSON.stringify({name:' ',oneLineIntro:'',version:0})})).status,400);
  console.log('PASS: unauthenticated, foreign origin and invalid profile rejected');
  const globals=await window.webContents.executeJavaScript('({node:typeof require,process:typeof process,bridge:typeof onfilmDesktop})');
  assert.deepEqual(globals,{node:'undefined',process:'undefined',bridge:'undefined'});
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('photoSection').hidden"),true);
  assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('#contactPhone,#publicEmail,#publicPhone').length"),0);
  await window.webContents.executeJavaScript("document.getElementById('contactEmail').value='actor@example.com'");
  await window.webContents.executeJavaScript(`
    document.getElementById('actorName').value='배우 재시작 테스트';
    document.getElementById('bioInput').value='꺼도 남는 소개';
    document.getElementById('birthYear').value='1995';
    document.getElementById('birthMonth').value='01';
    document.getElementById('birthDay').value='01';
    document.getElementById('addSnsBtn').click();
    document.querySelector('#snsList input').value='https://instagram.com/actor';
    document.getElementById('tagInput').value='액션';
    document.getElementById('addTagBtn').click();
    document.getElementById('birthPlace').value='서울';
    document.getElementById('editProfileForm').dispatchEvent(new Event('input',{bubbles:true}));
    document.getElementById('editProfileForm').requestSubmit();
  `);
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('viewStatus')?.textContent === '저장된 프로필입니다.'"));
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('profileName').textContent"), '배우 재시작 테스트');
  assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('#filmographySection,#profilePhoto').length"), 2);
  await waitFor(()=>window.webContents.executeJavaScript("!document.getElementById('galleryEmpty').classList.contains('hidden')"));
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('#filmEmpty .empty-cta-link').textContent"), '첫 작품 등록하기');
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('#galleryEmpty .empty-cta-link').textContent"), '첫 사진 등록하기');
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('profilePhoto').naturalWidth > 0"));
  window.setSize(1280, 1400);
  await delay(300);
  fs.writeFileSync(path.join(directory,'profile-empty.png'), (await window.webContents.capturePage()).toPNG());
  window.setSize(1280, 900);
  console.log('PASS: actual Electron form saved into file H2');
  await window.webContents.executeJavaScript("document.querySelector('#filmEmpty .empty-cta-link').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('addFilmBtn')?.disabled === false"));
  await window.webContents.executeJavaScript(`
    document.getElementById('addFilmBtn').click();
    const title=document.querySelector('[data-field=title]');title.value='로컬 영화';title.dispatchEvent(new Event('input'));
    document.querySelector('.role-option input[value=ACTOR]').click();
    for(const [key,value] of [['year','2026'],['characterName','민수']]){const input=document.querySelector('[data-field='+key+']');input.value=value;input.dispatchEvent(new Event('input'));}
  `);
  const addGenre=async(value,composing=false)=>window.webContents.executeJavaScript(`{
    const input=document.querySelector('.genre-chip-input');input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true,isComposing:${composing}}));
  }`);
  const genreCount=()=>window.webContents.executeJavaScript("document.querySelectorAll('.genre-chip-box .chip').length");
  await addGenre('   ');assert.equal(await genreCount(),0);
  await addGenre('액션',true);assert.equal(await genreCount(),0);
  await addGenre('액션');await addGenre(' 액션 ');assert.equal(await genreCount(),1);
  await addGenre('드라마');assert.equal(await genreCount(),2);
  assert.equal(new URL(window.webContents.getURL()).pathname,'/edit-filmography.html');
  await addGenre('가'.repeat(31));assert.equal(await genreCount(),2);
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.genre-status').textContent.includes('30자')"),true);
  await addGenre('테스트');
  await addGenre('초과');assert.equal(await genreCount(),3);
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.genre-status').textContent.includes('최대 3개')"),true);
  await window.webContents.executeJavaScript("{document.querySelector('.genre-chip-box .chip:last-child button').click();const g=document.querySelector('.genre-chip-input');g.value='미확정';g.dispatchEvent(new Event('input'));document.getElementById('filmographyForm').requestSubmit();}");
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('filmStatus').textContent.includes('Enter로 추가')"),true);
  await window.webContents.executeJavaScript("{const g=document.querySelector('.genre-chip-input');g.value='';g.dispatchEvent(new Event('input'));}");
  assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('.upload-drop-icon[role=img]').length"),3);
  await uploadThumbnail();
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.thumbnail-preview')?.naturalWidth===2048 && !document.getElementById('saveFilms').disabled"));
  assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('.thumb-dropzone .field-hint, .video-dropzone .field-hint').length"),0);
  assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('.thumb-dropzone .upload-drop-icon').length"),0);
  assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('.video-dropzone .upload-drop-icon').length"),1);
  assert.equal(await window.webContents.executeJavaScript("(()=>{const rows=[...document.querySelectorAll('.role-option')].map(el=>Math.round(el.getBoundingClientRect().top));return new Set(rows).size;})()"),1);
  assert.equal(await window.webContents.executeJavaScript("(()=>{const rows=[...document.querySelectorAll('.thumb-dropzone .media-actions button')].map(el=>Math.round(el.getBoundingClientRect().top));return new Set(rows).size;})()"),1);
  await uploadVideo();
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.encoding-start')?.disabled===false && !document.getElementById('saveFilms').disabled"));
  assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('.thumb-dropzone .upload-drop-icon, .video-dropzone .upload-drop-icon').length"),0);
  assert.equal(await window.webContents.executeJavaScript("(()=>{const rows=[...document.querySelectorAll('.video-dropzone .media-actions button:not([hidden])')].map(el=>Math.round(el.getBoundingClientRect().top));return new Set(rows).size;})()"),1);
  assert.equal(await window.webContents.executeJavaScript("fetch('/api/filmography').then(r=>r.json()).then(d=>d.items.length)"),0);
  await window.webContents.executeJavaScript("document.querySelector('.encoding-start').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.encoding-state')?.textContent.includes('인코딩 실패')"));
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('[data-field=title]').value"),'로컬 영화');
  assert.deepEqual(await window.webContents.executeJavaScript("[...document.querySelectorAll('.form-footer > a, .form-footer > button')].map(el=>[getComputedStyle(el).alignItems,getComputedStyle(el).justifyContent])"),[['center','center'],['center','center']]);
  let saveUnloadPrompts=0;
  assert.equal(await window.webContents.executeJavaScript("(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;})()"),true,'unsaved edits still require confirmation');
  const trackSaveUnload=()=>{saveUnloadPrompts++;};
  window.webContents.on('will-prevent-unload',trackSaveUnload);
  await window.webContents.executeJavaScript("document.getElementById('filmographyForm').requestSubmit()");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('#filmSlider .film-title')?.textContent === '로컬 영화'"));
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('#filmSlider .film-meta').textContent"),'2026 · 배우 · 민수');
  // Observe the transient save toast before spending time on hover-card assertions.
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.save-toast.show')?.textContent === '저장되었습니다.'"));
  await window.webContents.executeJavaScript("document.querySelector('#filmSlider .film-card').dispatchEvent(new MouseEvent('mouseenter'))");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.movie-popup.show')!==null"));
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.popup-mute-btn').hidden && !document.querySelector('.movie-popup video').hasAttribute('src')"),true);
  await window.webContents.executeJavaScript("OnfilmPreview.close()");
  assert.equal(saveUnloadPrompts,0,'successful save must not prompt to discard changes');
  window.webContents.removeListener('will-prevent-unload',trackSaveUnload);
  await waitFor(()=>window.webContents.executeJavaScript("!document.querySelector('.save-toast')"));
  await window.webContents.executeJavaScript("document.querySelector('#filmSlider .film-card').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('localNotice').open"));
  await window.webContents.executeJavaScript("document.getElementById('noticeClose').click()");
  assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('input[type=file]').length"), 0);
  assert.equal((await fetch(`${config.origin}/api/profile`,{method:'PUT',headers,body:JSON.stringify({name:'stale',oneLineIntro:'',version:0})})).status,409);
  await close();
  config=await launch();
  assert.equal(new URL(window.webContents.getURL()).pathname, '/profile.html');
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('#filmSlider .film-title')?.textContent === '로컬 영화'"));
  await window.webContents.executeJavaScript("document.getElementById('profileSettingsBtn').click();document.querySelector('[data-action=filmography]').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('addFilmBtn')?.disabled === false"));
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('[data-field=title]').value"),'로컬 영화');
  assert.deepEqual(await window.webContents.executeJavaScript("[...document.querySelectorAll('.genre-chip-box .chip > span:first-child')].map(el=>el.textContent)"),['액션','드라마']);
  fs.writeFileSync(path.join(directory,'genre-chips.png'),(await window.webContents.capturePage()).toPNG());
  console.log('PASS: genre Enter chips, IME guard, blank/duplicate/length/count checks, removal, pending-input guard and restart persistence');
  await uploadThumbnail();
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.thumbnail-preview')?.naturalWidth === 2048 && document.getElementById('filmStatus').textContent.includes('섬네일을 준비했습니다.')"));
  await window.webContents.executeJavaScript("const bad=new DataTransfer();bad.items.add(new File(['invalid'],'bad.png',{type:'image/png'}));const input=document.querySelector('.thumb-file-input');input.files=bad.files;input.dispatchEvent(new Event('change'))");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('filmStatus').textContent.includes('다시 선택') && !document.getElementById('saveFilms').disabled"));
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('saveFilms')?.disabled === false && document.querySelector('.thumbnail-preview')?.naturalWidth === 2048"));
  fs.writeFileSync(path.join(directory,'filmography-editor.png'), (await window.webContents.capturePage()).toPNG());
  await uploadVideo();
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.video-info')?.textContent.includes('연기 영상.mp4') && !document.getElementById('saveFilms').disabled"));
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.encoding-start')?.disabled === false"));
  await window.webContents.executeJavaScript("document.querySelector('.encoding-start').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.encoding-state')?.textContent.includes('인코딩 실패')"));
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.encoding-start').textContent"),'인코딩 재시도');
  await uploadVideo('잘못된 영상.mp4',false);
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('filmStatus').textContent.includes('다시 선택') && !document.getElementById('saveFilms').disabled"));
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.video-info')?.textContent.includes('연기 영상.mp4') && !document.getElementById('saveFilms').disabled"));
  await window.webContents.executeJavaScript(`
    document.getElementById('addFilmBtn').click();
    const title=document.querySelector('#filmList article:last-child [data-field=title]');title.value='두 번째 영화';title.dispatchEvent(new Event('input'));
    document.querySelector('#filmList article:last-child .film-card-actions button').click();
    window.originalFetch=window.fetch;
    window.fetch=async(...args)=>{const response=await window.originalFetch(...args);if(args[1]?.method==='PUT')throw new Error('lost response after commit');return response;};
    document.getElementById('filmographyForm').requestSubmit();
  `);
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('filmStatus')?.textContent.includes('응답이 유실')"));
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('saveFilms').disabled"),true);
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('[data-field=title]').value"),'두 번째 영화');
  await window.webContents.executeJavaScript("window.fetch=window.originalFetch;window.confirm=()=>true;document.getElementById('reloadFilms').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('saveFilms')?.disabled === false"));
  assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('#filmList article').length"),2);
  await window.webContents.executeJavaScript("document.getElementById('filmographyForm').requestSubmit()");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('#filmSlider .film-title')?.textContent === '두 번째 영화'"));
  await window.webContents.executeJavaScript("document.getElementById('moreFilmography').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('filmGroups')?.hidden === false"));
  window.show();window.focus();
  assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('#videoFilms .film-card').length"),1);
  assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('#experienceFilms .film-card').length"),1);
  fs.writeFileSync(path.join(directory,'filmography-view.png'),(await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript("document.querySelector('#experienceFilms .film-card').focus()");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.movie-popup')?.hidden === false"));
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.popup-action-row').hidden"),true);
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.popup-title').textContent"),'두 번째 영화');
  fs.writeFileSync(path.join(directory,'experience-popup.png'),(await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript("document.querySelector('#experienceFilms .film-card').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('filmDetails')?.open"));
  await window.webContents.executeJavaScript("document.getElementById('closeDetails').click();document.querySelector('#videoFilms .film-card').focus()");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.movie-popup')?.hidden === false && document.querySelector('.popup-title').textContent === '로컬 영화'"));
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.popup-action-row').hidden"),false);
  await window.webContents.executeJavaScript("window.savedFilmsFetch=window.fetch;window.fetch=async(...args)=>args[0]==='/api/filmography'?new Response('',{status:503}):window.savedFilmsFetch(...args);document.getElementById('retryFilms').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('retryFilms')?.hidden === false"));
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('filmGroups').hidden"),true);
  await window.webContents.executeJavaScript("window.fetch=async(...args)=>args[0]==='/api/filmography'?new Response(JSON.stringify({items:[],videos:[],trailers:[],thumbnailIds:[],version:0})):window.savedFilmsFetch(...args);document.getElementById('retryFilms').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('filmGroups')?.hidden === false"));
  assert.equal(await window.webContents.executeJavaScript("!document.getElementById('videoEmpty').hidden && !document.getElementById('experienceEmpty').hidden"),true);
  await window.webContents.executeJavaScript("window.fetch=window.savedFilmsFetch;document.getElementById('retryFilms').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelectorAll('#experienceFilms .film-card').length === 1"));
  await window.webContents.executeJavaScript("document.getElementById('backToProfile').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('#filmSlider .film-title')?.textContent === '두 번째 영화'"));
  console.log('PASS: full filmography groups, experience popup without play, keyboard details and profile return');
  await window.webContents.executeJavaScript("document.getElementById('profileSettingsBtn').click();document.querySelector('[data-action=filmography]').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('addFilmBtn')?.disabled === false"));
  await window.webContents.executeJavaScript("window.confirm=()=>true;document.querySelector('.delete-film-btn').click();document.getElementById('filmographyForm').requestSubmit()");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('#filmSlider .film-title')?.textContent === '로컬 영화'"));
  assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('#filmSlider .film-card').length"),1);
  console.log('PASS: filmography creation, restart, ordering, deletion and lost-response recovery without duplication');
  for(const count of [3,4,5]){
    await window.webContents.executeJavaScript(`{
      window.filmTestFetch ||= window.fetch;
      window.fetch=async(...args)=>{const r=await window.filmTestFetch(...args);if(args[0]!=='/api/filmography')return r;const d=await r.json();d.items=Array.from({length:${count}},(_,i)=>({...d.items[0],id:'slider-'+i,title:'슬라이더 '+i}));d.videos=[];d.thumbnailIds=[];return new Response(JSON.stringify(d),{status:200});};
      [...document.querySelectorAll('#filmographySection button')].find(b=>b.textContent==='필모그래피 다시 읽기').click();
    }`);
    await waitFor(()=>window.webContents.executeJavaScript(`document.querySelectorAll('#filmSlider .film-card').length===${count}`));
    await waitFor(()=>window.webContents.executeJavaScript(`document.getElementById('filmNextBtn').hidden===${count<=3}`)).catch(async error=>{console.error('Carousel state',await window.webContents.executeJavaScript("JSON.stringify({count:document.querySelectorAll('#filmSlider .film-card').length,hidden:document.getElementById('filmNextBtn').hidden,width:document.querySelector('.film-slider-wrapper').clientWidth,scroll:document.querySelector('.film-slider-wrapper').scrollWidth,visibility:document.visibilityState})"));throw error;});
    assert.equal(await window.webContents.executeJavaScript("document.getElementById('filmPrevBtn').hidden"),true);
    if(count>3){
      assert.equal(await window.webContents.executeJavaScript("getComputedStyle(document.getElementById('filmNextBtn')).display"),'flex');
      for(let i=0;i<count-3;i++){
        await window.webContents.executeJavaScript("document.getElementById('filmNextBtn').click()");
        await new Promise(resolve=>setTimeout(resolve,600));
        console.log('Carousel forward',count,await window.webContents.executeJavaScript("JSON.stringify({left:document.querySelector('.film-slider-wrapper').scrollLeft,width:document.querySelector('.film-slider-wrapper').clientWidth,total:document.querySelector('.film-slider-wrapper').scrollWidth,next:document.getElementById('filmNextBtn').hidden,visibility:document.visibilityState})"));
      }
      await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('filmNextBtn').hidden && !document.getElementById('filmPrevBtn').hidden"));
      for(let i=0;i<count-3;i++){
        await window.webContents.executeJavaScript("document.getElementById('filmPrevBtn').click()");
        await new Promise(resolve=>setTimeout(resolve,600));
      }
      await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('filmPrevBtn').hidden && !document.getElementById('filmNextBtn').hidden"));
    }
  }
  await window.webContents.executeJavaScript("window.fetch=window.filmTestFetch;[...document.querySelectorAll('#filmographySection button')].find(b=>b.textContent==='필모그래피 다시 읽기').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('#filmSlider .film-title')?.textContent==='로컬 영화'"));
  console.log('PASS: original-style film arrows hidden for 3, visible for 4/5, single-card forward/back and edge hiding');
  await window.webContents.executeJavaScript("document.getElementById('profileSettingsBtn').click();document.getElementById('editProfileLink').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('status')?.textContent === '저장된 프로필을 불러왔습니다.'"));
  const saved=await window.webContents.executeJavaScript("({name:document.getElementById('actorName').value,intro:document.getElementById('bioInput').value})");
  assert.deepEqual(saved,{name:'배우 재시작 테스트',intro:'꺼도 남는 소개'});
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('birthYear').value"), '1995');
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('birthPlace').value"), '서울');
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('#snsList input').value"), 'https://instagram.com/actor');
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('#tagList button').textContent"), '#액션');
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('contactEmail').value"),'actor@example.com');
  assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('#contactPhone,#publicEmail,#publicPhone').length"),0);
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('photoSection').hidden"),false);
  await window.webContents.executeJavaScript("document.getElementById('bioInput').value='사진 변경 중 초안';document.getElementById('editProfileForm').dispatchEvent(new Event('input',{bubbles:true}))");
  await uploadPortrait();
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('profilePreview').naturalWidth===2048"));
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('bioInput').value"),'사진 변경 중 초안');
  await uploadPortrait(800,1000,true);
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('profilePreview').naturalWidth===800"));
  fs.writeFileSync(path.join(directory,'profile-edit-portrait.png'),(await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript("{const transfer=new DataTransfer();transfer.items.add(new File(['invalid'],'bad.png',{type:'image/png'}));const input=document.getElementById('profileFileInput');input.files=transfer.files;input.dispatchEvent(new Event('change'));}");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('photoStatus').textContent.includes('처리 결과')"));
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('fields').disabled"),true);
  await window.webContents.executeJavaScript("window.confirm=()=>true;document.getElementById('reload').click()");
  await waitFor(()=>window.webContents.executeJavaScript("!document.getElementById('fields').disabled"));
  await window.webContents.executeJavaScript("document.getElementById('deleteProfileBtn').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('photoStatus').textContent==='사진을 삭제했습니다.'"));
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('deleteProfileBtn').disabled"),true);
  await uploadPortrait(800,1000);
  console.log('PASS: original portrait column, selection/drop/resize/replacement/deletion, draft preservation and failed-upload recovery');
  console.log('PASS: original-style profile form, SNS and tags survive restart');
  await window.webContents.executeJavaScript("document.getElementById('bioInput').value='수정 후 소개';document.getElementById('editProfileForm').dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('editProfileForm').requestSubmit()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('bioDisplay')?.textContent === '수정 후 소개'"));
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('contactEmailDisplay').textContent"),'actor@example.com');
  await window.webContents.executeJavaScript("window.contactFetch=window.fetch;window.fetch=async(...args)=>{const res=await window.contactFetch(...args);if(String(args[0])==='/api/profile'){const data=await res.json();data.contact={email:''};return new Response(JSON.stringify(data));}return res;};document.getElementById('retryProfile').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('contactSection').hidden"));
  await window.webContents.executeJavaScript("window.fetch=window.contactFetch;document.getElementById('retryProfile').click()");
  await waitFor(()=>window.webContents.executeJavaScript("!document.getElementById('contactSection').hidden"));
  // Simulate a failed read; it must show a retry instead of treating it as an empty profile.
  await window.webContents.executeJavaScript("window.originalFetch=window.fetch;window.fetch=async()=>{throw new Error('offline')};document.getElementById('retryProfile').click()");
  await waitFor(()=>window.webContents.executeJavaScript("!document.getElementById('retryProfile').hidden"));
  await window.webContents.executeJavaScript("window.fetch=window.originalFetch;document.getElementById('retryProfile').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('viewStatus').textContent === '저장된 프로필입니다.'"));
  console.log('PASS: initial save, startup routing, edit-save-view and load failure retry');
  await window.webContents.executeJavaScript("document.querySelector('#galleryEmpty .empty-cta-link').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('gallery-save')?.disabled === false"));
  await window.webContents.executeJavaScript(`new Promise(resolve => {
    const canvas=document.createElement('canvas'); canvas.width=4032; canvas.height=3024;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#334155';ctx.fillRect(0,0,4032,3024);ctx.fillStyle='#e4aa65';ctx.fillRect(0,0,2016,1512);
    canvas.toBlob(blob => {
      const transfer=new DataTransfer();
      transfer.items.add(new File([blob], 'one.png', {type:'image/png'}));
      transfer.items.add(new File([blob], 'two.png', {type:'image/png'}));
      transfer.items.add(new File([blob], 'three.png', {type:'image/png'}));
      transfer.items.add(new File([blob], 'four.png', {type:'image/png'}));
      document.getElementById('gallery-files').files=transfer.files;
      document.getElementById('gallery-files').dispatchEvent(new Event('change')); resolve();
    });
  })`);
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelectorAll('#gallery img').length===4 && !document.getElementById('gallery-save').disabled"));
  await waitFor(()=>window.webContents.executeJavaScript("[...document.querySelectorAll('#gallery img')].every(img=>img.naturalWidth===2048 && img.naturalHeight===1536)"));
  const galleryOrder=()=>window.webContents.executeJavaScript("[...document.querySelectorAll('#gallery img')].map(img=>new URL(img.src).pathname)");
  const dragPhoto=async(from,to,mode='drop')=>window.webContents.executeJavaScript(`{
    const cards=[...document.querySelectorAll('#gallery .photo-card')],source=cards[${from}].querySelector('.photo-preview'),target=cards[${to}],transfer=new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:transfer}));
    target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer}));
    ${mode==='drop'?"target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));":""}
    source.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:transfer}));
  }`);
  const initialGalleryOrder=await galleryOrder();
  await dragPhoto(3,0);
  assert.deepEqual(await galleryOrder(),[initialGalleryOrder[3],...initialGalleryOrder.slice(0,3)]);
  await dragPhoto(0,3);
  assert.deepEqual(await galleryOrder(),initialGalleryOrder);
  await dragPhoto(2,2);await dragPhoto(3,0,'cancel');
  assert.deepEqual(await galleryOrder(),initialGalleryOrder);
  assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('#gallery .dragging,#gallery .drop-before,#gallery .drop-after').length"),0);
  // An OS file drop on a photo must not reorder or trigger an upload.
  await window.webContents.executeJavaScript("{const t=new DataTransfer();t.items.add(new File(['invalid'],'external.png',{type:'image/png'}));document.querySelector('#gallery .photo-card').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:t}));}");
  assert.deepEqual(await galleryOrder(),initialGalleryOrder);
  await window.webContents.executeJavaScript("{const original=window.confirm;try{window.confirm=()=>true;for(let i=0;i<2;i++)document.querySelector('#gallery .photo-card:last-child [data-action=delete]').click();}finally{window.confirm=original;}}");
  const draftOrder = await window.webContents.executeJavaScript("[...document.querySelectorAll('#gallery img')].map(img=>new URL(img.src).pathname).reverse()");
  await window.webContents.executeJavaScript("document.querySelector('#gallery figure').querySelectorAll('button')[1].click()");
  assert.deepEqual(await window.webContents.executeJavaScript("[...document.querySelectorAll('#gallery img')].map(img=>new URL(img.src).pathname)"),draftOrder);
  await dragPhoto(0,1);
  assert.deepEqual(await galleryOrder(),[...draftOrder].reverse());
  await dragPhoto(1,0);
  assert.deepEqual(await galleryOrder(),draftOrder);
  await window.webContents.executeJavaScript("document.querySelector('#gallery [data-action=rotate]').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('#gallery img').style.transform.includes('90deg')"));
  fs.writeFileSync(path.join(directory,'gallery-rotation.png'),(await window.webContents.capturePage()).toPNG());
  assert.equal(await window.webContents.executeJavaScript("fetch('/api/gallery').then(r=>r.json()).then(d=>d.ids.length)"),0);
  // A bad image does not publish the draft or discard earlier prepared photos.
  await window.webContents.executeJavaScript("const t=new DataTransfer(); t.items.add(new File(['invalid'],'bad.png',{type:'image/png'})); document.getElementById('gallery-files').files=t.files;document.getElementById('gallery-files').dispatchEvent(new Event('change'))");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('gallery-status').textContent.includes('다시 선택')"));
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('gallery-status').textContent.includes('JPEG 또는 PNG')"), true);
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('browseBtn').disabled"), false);
  fs.writeFileSync(path.join(directory,'gallery-editor.png'),(await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript("document.getElementById('gallery-save').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelectorAll('#galleryGrid img').length===2 && document.querySelector('#galleryGrid img').naturalWidth===1536 && document.querySelector('#galleryGrid img').naturalHeight===2048"));
  const order=await window.webContents.executeJavaScript("[...document.querySelectorAll('#galleryGrid img')].map(img=>new URL(img.src).pathname)");
  await window.webContents.executeJavaScript("document.getElementById('profileSettingsBtn').click();document.getElementById('editGalleryLink').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('gallery-save')?.disabled===false"));
  const galleryVersion=await window.webContents.executeJavaScript("fetch('/api/gallery').then(r=>r.json()).then(d=>d.version)");
  await dragPhoto(1,0);
  assert.deepEqual(await galleryOrder(),[...order].reverse());
  assert.deepEqual(await window.webContents.executeJavaScript("fetch('/api/gallery').then(r=>r.json()).then(d=>d.ids.map(id=>'/api/gallery/'+id+'/image'))"),order);
  await dragPhoto(0,1);
  await window.webContents.executeJavaScript("document.querySelector('#gallery [data-action=rotate]').click()");
  await window.webContents.executeJavaScript("window.confirm=()=>true;document.querySelectorAll('#gallery [data-action=delete]')[1].click()");
  const galleryConfirm=dialog.showMessageBoxSync;
  try{
    dialog.showMessageBoxSync=()=>1;
    await window.webContents.executeJavaScript("document.querySelector('.form-actions a').click()");
    await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('#galleryGrid img')?.naturalWidth===1536"));
  }finally{dialog.showMessageBoxSync=galleryConfirm;}
  assert.equal(await window.webContents.executeJavaScript("fetch('/api/gallery').then(r=>r.json()).then(d=>d.version)"),galleryVersion);
  assert.equal(await window.webContents.executeJavaScript("fetch('/api/gallery').then(r=>r.json()).then(d=>d.ids.length)"),2);
  // If save commits but its response is lost, block duplicate submission and recover via read.
  await window.webContents.executeJavaScript("document.getElementById('profileSettingsBtn').click();document.getElementById('editGalleryLink').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('gallery-save')?.disabled===false"));
  await window.webContents.executeJavaScript(`{
    for(let i=0;i<4;i++)document.querySelector('#gallery [data-action=rotate]').click();
    window.galleryFetch=window.fetch;
    window.fetch=async(...args)=>{const res=await window.galleryFetch(...args);if(args[0]==='/api/gallery/edit')throw new Error('lost save response');return res;};
    document.getElementById('gallery-save').click();
  }`);
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('gallery-status').textContent.includes('저장 결과를 확인하지 못했습니다.')"));
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('gallery-save').disabled"),true);
  await window.webContents.executeJavaScript("window.fetch=window.galleryFetch;window.confirm=()=>true;document.getElementById('gallery-retry').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('gallery-save').disabled===false && document.querySelectorAll('#gallery img').length===2"));
  await window.webContents.executeJavaScript("document.querySelector('.form-actions a').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelectorAll('#galleryGrid img').length===2"));
  console.log('PASS: gallery drag reorder (last/first, self-drop, cancel, external file), staging, rotation, cancel preserves saved photos, and lost-save-response recovery');
  await close(); config=await launch();
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('profilePhoto')?.naturalWidth===800"));
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('#filmSlider .film-poster')?.naturalWidth === 2048"));
  await window.webContents.executeJavaScript("document.getElementById('profileSettingsBtn').click();document.querySelector('[data-action=filmography]').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('saveFilms')?.disabled === false"));
  await uploadThumbnail(800,600);
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.video-info').textContent.includes('연기 영상.mp4')"),true);
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.thumbnail-preview')?.naturalWidth === 800 && document.getElementById('filmStatus').textContent.includes('섬네일을 준비했습니다.')"));
  await window.webContents.executeJavaScript("window.confirm=()=>true;document.querySelector('.thumb-dropzone .delete-film-btn').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('filmStatus').textContent.includes('섬네일 삭제를 준비했습니다.')"));
  assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('.thumb-dropzone .upload-drop-icon').length"),1);
  assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('.thumbnail-preview').length"),0);
  await uploadVideo('교체 영상.mov');
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.video-info')?.textContent.includes('교체 영상.mov') && !document.getElementById('saveFilms').disabled"));
  fs.writeFileSync(path.join(directory,'video-editor.png'), (await window.webContents.capturePage()).toPNG());
  const realVideo=path.join(directory,'encoding-fixture.mp4');
  execFileSync(process.env.ONFILM_FFMPEG || 'ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','testsrc=size=160x120:rate=10','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','12','-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-c:a','aac',realVideo],{timeout:20000});
  const realBytes=fs.readFileSync(realVideo).toString('base64');
  await window.webContents.executeJavaScript(`{
    const bytes=Uint8Array.from(atob(${JSON.stringify(realBytes)}),c=>c.charCodeAt(0));
    const files=new DataTransfer();files.items.add(new File([bytes],'실제 영상.mp4',{type:'video/mp4'}));
    const input=document.querySelector('.video-file-input');input.files=files.files;input.dispatchEvent(new Event('change'));
  }`);
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.video-info')?.textContent.includes('실제 영상.mp4') && document.querySelector('.encoding-start')?.disabled === false"));
  await window.webContents.executeJavaScript("document.querySelector('.encoding-start').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.encoding-state')?.textContent.includes('HLS 변환 완료')"));
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.encoding-toast.show')?.textContent.includes('인코딩 완료')"));
  await delay(300);
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.encoding-toast').getBoundingClientRect().top>=0"),true);
  fs.writeFileSync(path.join(directory,'encoding-complete-toast.png'),(await window.webContents.capturePage()).toPNG());
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.encoding-progress').value"),100);
  await window.webContents.executeJavaScript("window.progressFetch=window.fetch;window.fetch=async(...args)=>{const response=await window.progressFetch(...args);if(args[0]!=='/api/encoding')return response;const jobs=await response.json();return new Response(JSON.stringify(jobs.map(job=>({...job,status:'RUNNING',progress:42}))),{status:200});};void 0");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.encoding-state').textContent.includes('42%') && document.querySelector('.encoding-progress').value===42"));
  await window.webContents.executeJavaScript("window.fetch=window.progressFetch;void 0");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.encoding-progress').value===100"));
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.encoding-start').disabled"),true);
  fs.writeFileSync(path.join(directory,'encoding-complete.png'), (await window.webContents.capturePage()).toPNG());
  console.log('PASS: invalid-video failure and real FFmpeg HLS encoding through Electron');
  const playbackVideoId=await window.webContents.executeJavaScript("document.querySelector('.encoding-watch').dataset.videoId");
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.encoding-watch').hidden"),true);
  await window.webContents.executeJavaScript(`{
    const bytes=Uint8Array.from(atob(${JSON.stringify(realBytes)}),c=>c.charCodeAt(0));
    const files=new DataTransfer();files.items.add(new File([bytes],'트레일러.mp4',{type:'video/mp4'}));
    const input=document.querySelector('.trailer-file-input');input.files=files.files;input.dispatchEvent(new Event('change'));
  }`);
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.trailer-dropzone .encoding-start')?.disabled===false && !document.getElementById('saveFilms').disabled"));
  await window.webContents.executeJavaScript("document.querySelector('.trailer-dropzone .encoding-start').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.trailer-dropzone .encoding-state')?.textContent.includes('HLS 변환 완료')"));
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.notification-badge').textContent==='2'"));
  await window.webContents.executeJavaScript("document.querySelector('.notification-bell').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelectorAll('.notification-item').length===2"));
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.notification-item p').textContent.startsWith('트레일러 인코딩 완료')"),true);
  fs.writeFileSync(path.join(directory,'encoding-notifications.png'),(await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript("document.querySelector('.notification-read').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.notification-badge').hidden"));
  await window.webContents.executeJavaScript("document.querySelector('.notification-bell').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('notificationPanel').hidden"),true);
  assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('.trailer-dropzone .upload-drop-icon').length"),0);
  await window.webContents.executeJavaScript("document.getElementById('filmographyForm').requestSubmit()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('viewStatus')?.textContent === '저장된 프로필입니다.'"));
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('#filmSlider .film-card')!==null"));
  await window.webContents.executeJavaScript("document.querySelector('#filmSlider .film-card').dispatchEvent(new MouseEvent('mouseenter'))");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.movie-popup.show video')?.currentTime>.2 && !document.querySelector('.popup-mute-btn').hidden"));
  await window.webContents.executeJavaScript("document.querySelector('.movie-popup').dispatchEvent(new MouseEvent('mouseleave'));document.querySelector('#filmSlider .film-card').dispatchEvent(new MouseEvent('mouseenter'))");
  await delay(300);
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.movie-popup').hidden"),false);
  await waitFor(()=>window.webContents.executeJavaScript("getComputedStyle(document.querySelector('.popup-thumb')).opacity==='0'"));
  fs.writeFileSync(path.join(directory,'trailer-popup-muted.png'),(await window.webContents.capturePage()).toPNG());
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.movie-popup video').muted"),true);
  const soundIcons = () => window.webContents.executeJavaScript("['.popup-sound-on','.popup-sound-off'].map(selector=>getComputedStyle(document.querySelector(selector)).display!=='none')");
  assert.deepEqual(await soundIcons(),[false,true]);
  await window.webContents.executeJavaScript("document.querySelector('.popup-sound-off path').dispatchEvent(new MouseEvent('click',{bubbles:true}))");
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.movie-popup video').muted"),false);
  assert.deepEqual(await soundIcons(),[true,false]);
  assert.equal(new URL(window.webContents.getURL()).pathname,'/profile.html');
  fs.writeFileSync(path.join(directory,'trailer-popup.png'),(await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript("document.querySelector('.popup-sound-on path').dispatchEvent(new MouseEvent('click',{bubbles:true}))");
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.movie-popup video').muted"),true);
  assert.deepEqual(await soundIcons(),[false,true]);
  await window.webContents.executeJavaScript("document.querySelector('.movie-popup').dispatchEvent(new MouseEvent('mouseleave'))");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.movie-popup').hidden && document.querySelector('.movie-popup video').paused && !document.querySelector('.movie-popup video').hasAttribute('src')"));
  await window.webContents.executeJavaScript("window.previewFetch=window.fetch;window.fetch=(...args)=>String(args[0]).endsWith('/playback')?Promise.resolve(new Response('',{status:404})):window.previewFetch(...args);document.querySelector('#filmSlider .film-card').dispatchEvent(new MouseEvent('mouseenter'))");
  await delay(300);
  assert.equal(await window.webContents.executeJavaScript("!document.querySelector('.movie-popup').hidden && document.querySelector('.popup-mute-btn').hidden && document.querySelector('.popup-thumb').style.opacity==='1'"),true);
  await window.webContents.executeJavaScript("window.fetch=window.previewFetch;OnfilmPreview.close()");
  console.log('PASS: independent trailer staging/encoding/save and original popup muted preview, sound SVG toggle and cleanup');
  await window.webContents.executeJavaScript("document.getElementById('profileSettingsBtn').click();document.querySelector('[data-action=filmography]').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.video-dropzone .encoding-watch')?.hidden===false"));
  await window.webContents.executeJavaScript("document.querySelector('.video-dropzone .encoding-watch').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('video')?.readyState >= 2 && document.getElementById('playerStatus').hidden"));
  const playerUrl=window.webContents.getURL();
  assert.ok(await window.webContents.executeJavaScript("document.getElementById('video').duration >= 11"));
  assert.equal((await fetch(config.origin+'/api/videos/'+playbackVideoId+'/hls/index.m3u8')).status,403);
  const ranged=await window.webContents.executeJavaScript(`(async()=>{const r=await fetch('/api/videos/${playbackVideoId}/hls/segment-00000.ts',{headers:{Range:'bytes=0-99'}});return {status:r.status,size:(await r.arrayBuffer()).byteLength,type:r.headers.get('content-type')};})()`);
  assert.deepEqual(ranged,{status:206,size:100,type:'video/mp2t'});
  // Opening the player starts audible playback without a second click.
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('video').currentTime > 0.3 && !document.getElementById('video').paused"));
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('video').muted"),false);
  await pressKey('Space');
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('video').paused"),true);
  await pressKey('Space');
  await waitFor(()=>window.webContents.executeJavaScript("!document.getElementById('video').paused"));
  await pressKey('Space');
  await pressKey('Right');
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('video').currentTime >= 5 && !document.getElementById('video').seeking"));
  await pressKey('Left');
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('video').currentTime < 2 && !document.getElementById('video').seeking"));
  await pressKey('M');assert.equal(await window.webContents.executeJavaScript("document.getElementById('video').muted"),true);
  await pressKey('M');assert.equal(await window.webContents.executeJavaScript("document.getElementById('video').muted"),false);
  await pressKey('Down');assert.equal(await window.webContents.executeJavaScript("document.getElementById('video').volume"),0.95);
  await pressKey('Up');assert.equal(await window.webContents.executeJavaScript("document.getElementById('video').volume"),1);
  await pressKey('F');
  await waitFor(()=>window.webContents.executeJavaScript("document.fullscreenElement !== null"));
  await pressKey('F');
  await waitFor(()=>window.webContents.executeJavaScript("document.fullscreenElement === null"));
  const previewPosition=await window.webContents.executeJavaScript("document.getElementById('video').currentTime");
  await window.webContents.executeJavaScript("{const t=document.getElementById('timeline'),r=t.getBoundingClientRect();t.dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+r.width*0.5}));}");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('timelinePreview').classList.contains('ready') && document.getElementById('previewVideo').currentTime > 5"));
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('previewVideo').muted && document.getElementById('previewVideo').paused"),true);
  await window.webContents.executeJavaScript("{const t=document.getElementById('timeline'),r=t.getBoundingClientRect();for(const ratio of [.1,.9,.3,.8])t.dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+r.width*ratio}));}");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('timelinePreview').classList.contains('ready') && Math.abs(document.getElementById('previewVideo').currentTime-9.6)<0.2"));
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('video').currentTime"),previewPosition);
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('video').paused"),true);
  fs.writeFileSync(path.join(directory,'timeline-preview.png'),(await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript("document.getElementById('timeline').dispatchEvent(new PointerEvent('pointerleave'))");
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('timelinePreview').hidden"),true);
  // Focused control handles Space once; bubbling must not toggle it a second time.
  await window.webContents.executeJavaScript("document.getElementById('playPause').focus()");
  await pressKey('Space');assert.equal(await window.webContents.executeJavaScript("document.getElementById('video').paused"),false);
  await pressKey('Space');assert.equal(await window.webContents.executeJavaScript("document.getElementById('video').paused"),true);
  await window.webContents.executeJavaScript("document.activeElement.blur();document.getElementById('forward10').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('video').currentTime >= 10 && !document.getElementById('video').seeking"));
  await window.webContents.executeJavaScript("document.querySelector('[data-speed=\"1.5\"]').click()");
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('video').playbackRate"),1.5);
  await window.webContents.executeJavaScript("document.getElementById('back10').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('video').currentTime < 2 && !document.getElementById('video').seeking"));
  fs.writeFileSync(path.join(directory,'video-player.png'), (await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript("document.getElementById('backBtn').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('#filmSlider .film-card') !== null"));
  const cardBefore=await window.webContents.executeJavaScript("{const c=document.querySelector('#filmSlider .film-card'),r=c.getBoundingClientRect();({border:getComputedStyle(c).borderColor,x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)})}");
  window.webContents.sendInputEvent({type:'mouseMove',x:cardBefore.x,y:cardBefore.y});await delay(200);
  assert.equal(await window.webContents.executeJavaScript("getComputedStyle(document.querySelector('#filmSlider .film-card')).borderColor"),cardBefore.border);
  await window.webContents.executeJavaScript("document.querySelector('#filmSlider .film-card').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('video')?.readyState >= 2 && !document.getElementById('video').paused"));
  console.log('PASS: audible autoplay from editor/card, Space/arrow/mute/volume keys, isolated hover preview, no colored hover border');
  await window.webContents.executeJavaScript("document.getElementById('backBtn').click()");
  await waitFor(()=>window.webContents.executeJavaScript("location.pathname === '/profile.html' && document.getElementById('moreFilmography') !== null"));
  await window.webContents.executeJavaScript("document.getElementById('moreFilmography').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('#videoFilms .film-card') !== null"));
  await window.webContents.executeJavaScript("document.querySelector('#videoFilms .film-card').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('video')?.readyState >= 2"));
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('backBtn').getAttribute('aria-label')"),'필모그래피로 돌아가기');
  await window.webContents.executeJavaScript("document.getElementById('backBtn').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
  await waitFor(()=>window.webContents.executeJavaScript("location.pathname === '/filmography.html' && document.querySelector('#videoFilms .film-card') !== null"));
  // Hover-popup play uses the same entry-point-aware callback.
  await window.webContents.executeJavaScript("document.querySelector('#videoFilms .film-card').dispatchEvent(new MouseEvent('mouseenter'))");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelector('.movie-popup')?.hidden === false"));
  await window.webContents.executeJavaScript("document.querySelector('.popup-play-btn-circle').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('video')?.readyState >= 2"));
  await window.webContents.executeJavaScript("document.getElementById('backBtn').click()");
  await waitFor(()=>window.webContents.executeJavaScript("location.pathname === '/filmography.html' && document.getElementById('filmGroups')?.hidden === false"));
  await window.loadURL(playerUrl+'&from=https://example.com');
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('backBtn') !== null"));
  await window.webContents.executeJavaScript("document.getElementById('backBtn').click()");
  await waitFor(()=>window.webContents.executeJavaScript("location.pathname === '/profile.html'"));
  console.log('PASS: player returns to profile or full filmography for card/popup entry; arbitrary return destination rejected');
  // Missing result is recoverable. Move only our test-generated manifest and restore it.
  const completed=await window.webContents.executeJavaScript(`fetch('/api/encoding').then(r=>r.json()).then(j=>j.find(x=>x.videoId==='${playbackVideoId}'))`);
  const manifest=path.join(directory,'한글 data','media','encoded',completed.id,'attempt-'+completed.attempts,'index.m3u8');
  fs.renameSync(manifest,manifest+'.test-backup');
  try {
    await window.loadURL(playerUrl);
    await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('retryPlayback')?.hidden === false"));
    assert.equal(await window.webContents.executeJavaScript("document.getElementById('playerMessage').textContent.includes('재생 가능한 영상이 없습니다')"),true);
  } finally { fs.renameSync(manifest+'.test-backup',manifest); }
  await window.webContents.executeJavaScript("document.getElementById('retryPlayback').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('video').readyState >= 2 && document.getElementById('playerStatus').hidden"));
  await window.webContents.executeJavaScript("document.getElementById('backBtn').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('viewStatus')?.textContent === '저장된 프로필입니다.'"));
  await window.webContents.executeJavaScript("document.getElementById('profileSettingsBtn').click();document.querySelector('[data-action=filmography]').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('saveFilms')?.disabled === false"));
  console.log('PASS: local HLS playback, protected segment Range, 10-second seek across segments, speed, profile entry and missing-file retry');
  await window.webContents.executeJavaScript("document.querySelector('.back-link').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('viewStatus')?.textContent === '저장된 프로필입니다.'"));
  await window.webContents.executeJavaScript("document.getElementById('profileSettingsBtn').click();document.getElementById('exportLink').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('exportStatus')?.textContent.includes('아직 만든')"));
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('createExport').disabled"),true);
  await window.webContents.executeJavaScript("document.getElementById('confirmExport').click();document.getElementById('createExport').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelectorAll('#exportsList a').length === 1"));
  await waitFor(()=>window.webContents.executeJavaScript("!document.getElementById('createExport').disabled"));
  assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('.export-row .export-actions > *').length"),4);
  fs.writeFileSync(path.join(directory,'export-redesign.png'),(await window.webContents.capturePage()).toPNG());
  const toolsMinimumSize=window.getMinimumSize();window.setMinimumSize(400,600);
  window.setSize(430,900);await delay(200);
  assert.equal(await window.webContents.executeJavaScript("document.documentElement.scrollWidth<=innerWidth"),true);
  fs.writeFileSync(path.join(directory,'export-narrow.png'),(await window.webContents.capturePage()).toPNG());
  window.setSize(1280,900);window.setMinimumSize(...toolsMinimumSize);
  const exported=await window.webContents.executeJavaScript("fetch('/api/exports').then(r=>r.json())");
  const copy=exported.items[0],site=path.join(exported.directory,copy.id,'site');
  const contactData=JSON.parse(fs.readFileSync(path.join(site,'portfolio.json'),'utf8'));
  assert.deepEqual(contactData.profile.contact,{email:'actor@example.com'});
  const originalSave=dialog.showSaveDialog,originalOpen=shell.openPath;
  try{
    dialog.showSaveDialog=async()=>({canceled:true});
    assert.equal((await window.webContents.executeJavaScript(`onfilmExports.saveZip('${copy.id}')`)).status,'cancelled');
    const destination=path.join(directory,'공개 포트폴리오.zip');
    dialog.showSaveDialog=async()=>({canceled:false,filePath:destination});
    assert.equal((await window.webContents.executeJavaScript(`onfilmExports.saveZip('${copy.id}')`)).status,'saved');
    assert.deepEqual(fs.readFileSync(destination),fs.readFileSync(path.join(exported.directory,copy.id,'portfolio.zip')));
    assert.equal((await window.webContents.executeJavaScript(`onfilmExports.saveZip('${copy.id}')`)).status,'error');
    let opened; shell.openPath=async value=>{opened=value;return '';};
    assert.equal((await window.webContents.executeJavaScript(`onfilmExports.openFolder('${copy.id}')`)).status,'opened');
    assert.equal(opened,fs.realpathSync(site));
    console.log('PASS: native export ZIP, cancel, existing-file protection and folder target');
  }finally{dialog.showSaveDialog=originalSave;shell.openPath=originalOpen;}
  assert.ok(site.startsWith(directory+path.sep));
  const publicJson=fs.readFileSync(path.join(site,'portfolio.json'),'utf8');
  assert.ok(!publicJson.includes(playbackVideoId)&&!publicJson.includes('실제 영상.mp4')&&!publicJson.includes(directory));
  assert.ok(copy.bytes>0&&copy.fileCount>20);
  await window.webContents.executeJavaScript("document.querySelector('#exportsList a').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('publicStatus')?.textContent === ''"));
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.local-preview-exit').textContent"),'로컬 미리보기 종료');
  await verifyStaticPortfolio(site);
  await verifyStaticPortfolio(site,true);
  console.log('PASS: published slug assets, cross-origin R2 redirects, images, trailer hover, HLS playback and return navigation');
  await window.webContents.executeJavaScript("document.querySelector('.local-preview-exit').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelectorAll('#exportsList a').length === 1"));
  await window.webContents.executeJavaScript("document.getElementById('readStorage').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('storageStatus').textContent.includes('합계:')"));
  assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('.storage-item').length>0"),true);
  const originalTrash=shell.trashItem,originalMessage=dialog.showMessageBox;
  try{
    dialog.showMessageBox=async()=>({response:0});
    await window.webContents.executeJavaScript("document.querySelector('[data-action=trash]').click()");
    await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('exportStatus').textContent==='작업을 취소했습니다.'"));
    assert.ok(fs.existsSync(site));
    dialog.showMessageBox=async()=>({response:1});
    shell.trashItem=async folder=>{assert.equal(folder,fs.realpathSync(path.dirname(site)));fs.renameSync(folder,path.join(directory,'test-trash'));};
    await window.webContents.executeJavaScript("document.querySelector('[data-action=trash]').click()");
    await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('exportStatus').textContent.includes('휴지통으로 이동했습니다.')"));
    assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('#exportsList a').length"),0);
    assert.ok(fs.existsSync(path.join(directory,'test-trash/site/index.html')));
    assert.ok(fs.existsSync(path.join(directory,'공개 포트폴리오.zip')));
    console.log('PASS: storage usage, cancelled cleanup and selected export-only recoverable move (OS trash mocked)');
  }finally{shell.trashItem=originalTrash;dialog.showMessageBox=originalMessage;}
  await window.webContents.executeJavaScript("document.querySelector('.back-link').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('viewStatus')?.textContent === '저장된 프로필입니다.'"));
  await window.webContents.executeJavaScript("document.getElementById('profileSettingsBtn').click();document.querySelector('[data-action=filmography]').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('saveFilms')?.disabled === false"));
  console.log('PASS: explicit export confirmation, file count/size, protected preview and independent static-host profile/HLS playback without local API');
  await window.webContents.executeJavaScript("window.confirm=()=>true;void 0");
  await window.webContents.executeJavaScript("document.querySelector('.video-dropzone button.ghost-btn').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('filmStatus').textContent.includes('영상 연결 해제를 준비했습니다.')"));
  assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('.video-dropzone .upload-drop-icon').length"),1);
  assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('.video-info').length"),0);
  await window.webContents.executeJavaScript("document.getElementById('filmographyForm').requestSubmit()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('viewStatus')?.textContent === '저장된 프로필입니다.'"));
  await window.webContents.executeJavaScript("document.getElementById('profileSettingsBtn').click();document.querySelector('[data-action=filmography]').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('saveFilms')?.disabled===false"));
  assert.equal(await window.webContents.executeJavaScript(`fetch('/api/videos/${playbackVideoId}/hls/index.m3u8').then(r=>r.status)`),404);
  console.log('PASS: streamed 7MB video selection, invalid file recovery, metadata preservation, restart, replacement and unlink (container fixture, not playback)');
  await window.webContents.executeJavaScript("document.querySelector('.back-link').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('viewStatus')?.textContent === '저장된 프로필입니다.'"));
  console.log('PASS: thumbnail auto-resize, invalid image recovery, metadata preservation, restart, replacement and deletion');
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelectorAll('#galleryGrid img').length === 2"));
  assert.deepEqual(await window.webContents.executeJavaScript("[...document.querySelectorAll('#galleryGrid img')].map(img=>new URL(img.src).pathname)"), order);
  await window.webContents.executeJavaScript("document.getElementById('profileSettingsBtn').click();document.getElementById('editGalleryLink').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelectorAll('#gallery figure').length === 2"));
  await window.webContents.executeJavaScript("window.confirm=()=>true; document.querySelector('#gallery [data-action=delete]').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelectorAll('#gallery figure').length === 1"));
  await window.webContents.executeJavaScript("document.getElementById('gallery-save').click()");
  await waitFor(()=>window.webContents.executeJavaScript("document.querySelectorAll('#galleryGrid img').length === 1"));
  console.log('PASS: separate original-style gallery editor, upload, reorder, rejection recovery, restart and delete');
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('galleryEmpty').classList.contains('hidden')"), true);
  await window.webContents.executeJavaScript("document.querySelector('#galleryGrid .gallery-item-wrap').click()");
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('lightbox').hidden"), false);
  await window.webContents.executeJavaScript("document.getElementById('closeLightbox').click()");
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('lightbox').hidden"), true);
  console.log('PASS: original profile structure, empty CTA, settings overlay and photo lightbox');
  fs.writeFileSync(path.join(directory,'profile.png'), (await window.webContents.capturePage()).toPNG());
  const before=window.webContents.getURL();
  await window.webContents.executeJavaScript("location.href='https://example.com'");
  await delay(200); assert.equal(window.webContents.getURL(),before);
  console.log('PASS: new Java process and new Electron window reloaded saved profile; external navigation blocked');
  await window.webContents.executeJavaScript("document.getElementById('profileSettingsBtn').click();document.getElementById('backupLink').click()");
  await waitFor(()=>window.webContents.executeJavaScript("typeof window.onfilmBackup==='object'"));
  await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('createBackup')!==null"));
  window.setMinimumSize(400,600);window.setSize(430,900);await delay(200);
  assert.equal(await window.webContents.executeJavaScript("document.documentElement.scrollWidth<=innerWidth"),true);
  assert.equal(await window.webContents.executeJavaScript("getComputedStyle(document.querySelector('.tools-grid')).gridTemplateColumns.split(' ').length"),1);
  fs.writeFileSync(path.join(directory,'backup-narrow.png'),(await window.webContents.capturePage()).toPNG());
  window.setSize(1280,900);window.setMinimumSize(...toolsMinimumSize);await delay(200);
  fs.writeFileSync(path.join(directory,'backup-screen.png'),(await window.webContents.capturePage()).toPNG());
  const nativeOpen=dialog.showOpenDialog,nativeConfirm=dialog.showMessageBox;
  const backupParent=path.join(directory,'백업 보관');fs.mkdirSync(backupParent);
  try{
    dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});
    await window.webContents.executeJavaScript("document.getElementById('createBackup').click()");
    await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('backupStatus').textContent==='취소했습니다.' && !document.getElementById('createBackup').disabled"));
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[backupParent]});
    await window.webContents.executeJavaScript("document.getElementById('createBackup').click()");
    await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('backupStatus').dataset.state==='success' && !document.getElementById('createBackup').disabled"));
    const savedBackup={location:await window.webContents.executeJavaScript("document.getElementById('backupLocationPath').textContent")};
    assert.equal(await window.webContents.executeJavaScript("document.getElementById('backupLocation').hidden"),false);
    const snapshot=JSON.parse(fs.readFileSync(path.join(savedBackup.location,'onfilm-backup.json'),'utf8'));
    assert.ok(snapshot.files.some(f=>f.path==='database/onfilm.mv.db'));
    assert.ok(snapshot.files.some(f=>f.path.startsWith('media/videos/')));
    assert.ok(snapshot.files.some(f=>f.path.endsWith('index.m3u8')));
    const updateResult=await window.webContents.executeJavaScript("(async()=>{const data=await (await fetch('/api/profile')).json();data.name='백업 이후 변경';return (await fetch('/api/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})).status;})()");
    assert.equal(updateResult,200);
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[savedBackup.location]});
    dialog.showMessageBox=async()=>({response:0});assert.equal((await window.webContents.executeJavaScript('onfilmBackup.restore()')).status,'cancelled');
    dialog.showMessageBox=async()=>({response:1});
    await window.webContents.executeJavaScript("document.getElementById('restoreBackup').click()");
    await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('backupStatus').textContent.startsWith('복원했습니다.') && !document.getElementById('restoreBackup').disabled"));
    const restored={location:await window.webContents.executeJavaScript("document.getElementById('backupLocationPath').textContent")};
    assert.ok(fs.existsSync(path.join(restored.location,'database','onfilm.mv.db')));
    assert.equal(await window.webContents.executeJavaScript("fetch('/api/profile').then(r=>r.json()).then(p=>p.name)"),'배우 재시작 테스트');
    await window.webContents.executeJavaScript("document.getElementById('back').click()");
    await waitFor(()=>window.webContents.executeJavaScript("document.getElementById('profilePhoto')?.naturalWidth===800"));
    await waitFor(()=>window.webContents.executeJavaScript("document.querySelectorAll('#galleryGrid img').length===1"));
    console.log('PASS: native backup/restore IPC, real stopped H2 snapshot, media hashes, cancellation, restart and previous-data preservation');
  }finally{dialog.showOpenDialog=nativeOpen;dialog.showMessageBox=nativeConfirm;}
}).then(async()=>{await close();console.log(`Test-only data: ${directory}`);app.exit(0);},async(error)=>{
  console.error(error);await close();console.log(`Test-only data: ${directory}`);app.exit(1);
});

const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises');
const syncFs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {setTimeout:delay}=require('node:timers/promises');
const {preparePublication}=require('../src/cloudflare/publication-files.cjs');
const root=syncFs.mkdtempSync(path.join(os.tmpdir(),'onfilm-published-playback-'));
app.setPath('userData',path.join(root,'electron'));
app.on('window-all-closed',()=>{});
let viewer,siteServer,mediaServer;
async function waitFor(script){
  const end=Date.now()+30000;
  while(Date.now()<end){if(await viewer.webContents.executeJavaScript(script))return;await delay(100);}
  throw new Error('Published playback timeout: '+script);
}
async function run(){
  await app.whenReady();
  const id=randomUUID(),dataDir=path.join(root,'data'),site=path.join(dataDir,'exports',id,'site');
  const resources=path.resolve(__dirname,'../../backend/src/main/resources');
  const assets=['css/common.css','css/actor-detail.css','css/local-detail.css','css/video-player.css','css/local-player.css','css/filmography-view.css',
    'video-player.js','timeline-preview.js','film-preview.js','vendor/hls.js/hls.min.js','vendor/hls.js/LICENSE',
    'images/profile-placeholder.png','images/film-placeholder.png','icons/instagram.svg','icons/youtube.svg','icons/tiktok.svg','icons/link.svg',
    'icons/simple-icons-LICENSE.txt','icons/bootstrap-icons-LICENSE.txt'];
  for(const name of assets){await fs.mkdir(path.dirname(path.join(site,name)),{recursive:true});await fs.copyFile(path.join(resources,'static',name),path.join(site,name));}
  for(const name of ['index.html','public-profile.js','public.css','filmography.html','public-filmography.js','public-film-card.js'])await fs.copyFile(path.join(resources,'public-portfolio',name),path.join(site,name));
  const player=(await fs.readFile(path.join(resources,'static/video-player.html'),'utf8'))
    .replace('<html lang="ko">','<html lang="ko" data-public-portfolio="true">').replaceAll('href="/','href="').replaceAll('src="/','src="');
  await fs.writeFile(path.join(site,'video-player.html'),player);
  const media=path.join(site,'media');await fs.mkdir(path.join(media,'film-0'),{recursive:true});
  await fs.copyFile(path.join(site,'images/profile-placeholder.png'),path.join(media,'portrait.png'));
  await fs.copyFile(path.join(site,'images/film-placeholder.png'),path.join(media,'film-0.png'));
  execFileSync(process.env.ONFILM_FFMPEG||'ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','testsrc=size=160x120:rate=10',
    '-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','6','-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-c:a','aac',
    '-g','10','-f','hls','-hls_time','1','-hls_list_size','0','-hls_segment_filename',path.join(media,'film-0','segment-%05d.ts'),path.join(media,'film-0','index.m3u8')],{timeout:20000});
  await fs.cp(path.join(media,'film-0'),path.join(media,'film-0-trailer'),{recursive:true});
  await fs.writeFile(path.join(site,'portfolio.json'),JSON.stringify({profile:{name:'게시 재생 테스트',intro:'',portrait:'media/portrait.png',sns:[],tags:[],contact:{}},photos:['media/portrait.png','media/film-0.png','media/portrait.png'],
    films:[{id:'film-0',title:'테스트 영상',year:2026,genres:[],roles:['ACTOR'],characterName:'주인공',thumbnail:'media/film-0.png',
      manifestUrl:'media/film-0/index.m3u8',trailerUrl:'media/film-0-trailer/index.m3u8'},
      {id:'film-1',title:'영상 없는 작품',year:2025,genres:['드라마'],roles:['ACTOR'],castType:'LEAD',characterName:'민수',thumbnail:'media/film-0.png'}]}));
  const files=[];
  async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){
    const name=path.join(dir,entry.name);if(entry.isDirectory())await walk(name);else files.push({path:path.relative(site,name).split(path.sep).join('/'),bytes:(await fs.stat(name)).size});
  }}
  await walk(site);await fs.writeFile(path.join(site,'..','result.json'),JSON.stringify({id,files}));
  const plan=await preparePublication(dataDir,id,{accountId:'a'.repeat(32),project:'test',bucket:'test',siteOrigin:'https://onfilm.example',mediaOrigin:'https://media.onfilm.example',publicSlug:'actor_01'},new AbortController().signal);
  const requests=[];
  mediaServer=http.createServer((req,res)=>{
    const name=new URL(req.url,'http://localhost').pathname.slice(('/'+plan.prefix+'/').length),entry=plan.media.find(item=>item.path===name);
    if(!entry){res.writeHead(404).end();return;}
    requests.push(name);res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Content-Type',entry.contentType);
    syncFs.createReadStream(path.join(site,name)).pipe(res);
  });
  await new Promise(resolve=>mediaServer.listen(0,'127.0.0.1',resolve));
  const mediaOrigin='http://127.0.0.1:'+mediaServer.address().port;
  let portfolioMode='normal';
  siteServer=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/'||pathname==='/actor_01'){res.writeHead(302,{Location:'/actor_01/'}).end();return;}
    if(pathname.startsWith('/actor_01/media/')){res.writeHead(302,{Location:mediaOrigin+'/'+plan.prefix+'/'+pathname.slice('/actor_01/'.length)}).end();return;}
    const name=pathname==='/actor_01/'?'/actor_01/index.html':pathname;
    const asset=plan.files.find(file=>file.name===name);if(!asset){res.writeHead(404).end();return;}
    if(name.endsWith('/portfolio.json')&&portfolioMode==='failure'){res.writeHead(503).end();return;}
    if(name.endsWith('/portfolio.json')&&portfolioMode==='single-photo'){const data=JSON.parse(asset.data);data.photos=data.photos.slice(0,1);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return;}
    if(name.endsWith('/portfolio.json')&&portfolioMode==='empty'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({profile:{name:'빈 필모그래피'},films:[]}));return;}
    res.setHeader('Content-Type',asset.contentType);res.end(asset.data);
  });
  await new Promise(resolve=>siteServer.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+siteServer.address().port;
  viewer=new BrowserWindow({show:true,width:1280,height:900,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,autoplayPolicy:'no-user-gesture-required'}});
  viewer.webContents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:details.url.startsWith('http')&&!details.url.startsWith(origin+'/')&&!details.url.startsWith(mediaOrigin+'/')}));
  await viewer.loadURL(origin+'/actor_01');
  await waitFor("document.getElementById('publicStatus')?.textContent === ''");
  assert.equal(await viewer.webContents.executeJavaScript('location.pathname'),'/actor_01/');
  await viewer.webContents.executeJavaScript("document.querySelector('.gallery-item-wrap').focus();document.querySelector('.gallery-item-wrap').click()");
  await waitFor("!document.getElementById('lightbox').hidden&&document.getElementById('lightboxImage').naturalWidth>0");
  assert.deepEqual(await viewer.webContents.executeJavaScript("['previousPhoto','nextPhoto'].map(id=>document.getElementById(id).hidden)"),[true,false]);
  await viewer.webContents.executeJavaScript("document.getElementById('nextPhoto').click()");
  assert.deepEqual(await viewer.webContents.executeJavaScript("['previousPhoto','nextPhoto'].map(id=>document.getElementById(id).hidden)"),[false,false]);
  assert.match(await viewer.webContents.executeJavaScript("document.getElementById('lightboxImage').src"),/film-0\.png$/);
  await viewer.webContents.executeJavaScript("document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight'}))");
  assert.deepEqual(await viewer.webContents.executeJavaScript("['previousPhoto','nextPhoto'].map(id=>document.getElementById(id).hidden)"),[false,true]);
  await viewer.webContents.executeJavaScript("document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight'}));document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft'}))");
  assert.match(await viewer.webContents.executeJavaScript("document.getElementById('lightboxImage').src"),/film-0\.png$/);
  await viewer.webContents.executeJavaScript("document.getElementById('previousPhoto').click();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))");
  assert.equal(await viewer.webContents.executeJavaScript("document.getElementById('lightbox').hidden&&!document.querySelector('.page-root').inert&&document.activeElement===document.querySelector('.gallery-item-wrap')"),true);
  await viewer.webContents.executeJavaScript("document.querySelector('.gallery-item-wrap').click();document.getElementById('lightboxImage').click()");
  assert.equal(await viewer.webContents.executeJavaScript("document.getElementById('lightbox').hidden"),true);
  await viewer.webContents.executeJavaScript("document.querySelector('.gallery-item-wrap').click();document.getElementById('closeLightbox').click()");
  assert.equal(await viewer.webContents.executeJavaScript("document.getElementById('lightbox').hidden"),true);
  portfolioMode='single-photo';await viewer.reload();
  await waitFor("document.getElementById('publicStatus')?.textContent === ''");
  await viewer.webContents.executeJavaScript("document.querySelector('.gallery-item-wrap').click()");
  assert.deepEqual(await viewer.webContents.executeJavaScript("['previousPhoto','nextPhoto'].map(id=>document.getElementById(id).hidden)"),[true,true]);
  await viewer.webContents.executeJavaScript("document.getElementById('lightbox').click()");
  assert.equal(await viewer.webContents.executeJavaScript("document.getElementById('lightbox').hidden"),true);
  portfolioMode='normal';
  await waitFor("[...document.querySelectorAll('#profilePhoto,.film-poster')].every(image=>image.naturalWidth>0)");
  await viewer.webContents.executeJavaScript("document.querySelector('#filmSlider a').dispatchEvent(new MouseEvent('mouseenter'))");
  await waitFor("document.querySelector('.movie-popup video')?.currentTime > .2");
  assert.equal(await viewer.webContents.executeJavaScript("document.querySelector('.movie-popup video').muted"),true);
  await viewer.webContents.executeJavaScript("OnfilmPreview.close();document.querySelector('#filmSlider a').click()");
  await waitFor("document.getElementById('video')?.currentTime > .2");
  assert(requests.some(name=>name.includes('film-0/segment-')));assert(requests.some(name=>name.includes('film-0-trailer/segment-')));
  await viewer.webContents.executeJavaScript("document.getElementById('backBtn').click()");
  await waitFor("document.getElementById('publicStatus')?.textContent === ''");
  await viewer.webContents.executeJavaScript("document.getElementById('moreFilmography').click()");
  await waitFor("document.getElementById('filmsStatus')?.textContent === ''");
  assert.equal(await viewer.webContents.executeJavaScript('location.pathname'),'/actor_01/filmography.html');
  assert.deepEqual(await viewer.webContents.executeJavaScript("['videoFilms','experienceFilms'].map(id=>document.getElementById(id).children.length)"),[1,1]);
  await viewer.reload();
  await waitFor("document.getElementById('filmsStatus')?.textContent === ''");
  await viewer.webContents.executeJavaScript("document.querySelector('#experienceFilms .film-card').dispatchEvent(new MouseEvent('mouseenter'))");
  await waitFor("document.querySelector('.movie-popup.experience-preview .popup-action-row')?.hidden===true");
  assert.match(await viewer.webContents.executeJavaScript("document.querySelector('.popup-participation').textContent"),/주연.*민수/);
  await viewer.webContents.executeJavaScript("OnfilmPreview.close();document.querySelector('#experienceFilms .film-card').click()");
  await waitFor("document.getElementById('details')?.open");
  assert.match(await viewer.webContents.executeJavaScript("document.getElementById('detailsText').textContent"),/민수/);
  await viewer.webContents.executeJavaScript("document.getElementById('detailsClose').click();document.querySelector('#videoFilms a').click()");
  await waitFor("document.getElementById('video')?.currentTime > .2");
  await viewer.webContents.executeJavaScript("document.getElementById('backBtn').click()");
  await waitFor("document.getElementById('filmsStatus')?.textContent === ''");
  assert.equal(await viewer.webContents.executeJavaScript('location.pathname'),'/actor_01/filmography.html');
  await viewer.webContents.executeJavaScript("document.getElementById('backToProfile').click()");
  await waitFor("document.getElementById('publicStatus')?.textContent === ''");
  portfolioMode='failure';await viewer.loadURL(origin+'/actor_01/filmography.html');
  await waitFor("document.getElementById('retryFilms')?.hidden===false");
  portfolioMode='empty';await viewer.webContents.executeJavaScript("document.getElementById('retryFilms').click()");
  await waitFor("document.getElementById('filmsStatus')?.textContent === ''");
  assert.equal(await viewer.webContents.executeJavaScript("!document.getElementById('videoEmpty').hidden&&!document.getElementById('experienceEmpty').hidden"),true);
  portfolioMode='normal';await viewer.reload();
  await waitFor("document.querySelector('#experienceFilms .film-card')!==null");
  viewer.setSize(375,800);
  await waitFor("innerWidth<=375");
  assert.equal(await viewer.webContents.executeJavaScript("document.documentElement.scrollWidth<=innerWidth"),true);
  try{await fs.writeFile(path.join(root,'published-filmography-mobile.png'),(await viewer.webContents.capturePage()).toPNG());}catch(error){console.warn('Screenshot unavailable: '+error.message);}
  viewer.setSize(1280,900);await viewer.loadURL(origin+'/actor_01/');
  await waitFor("document.getElementById('publicStatus')?.textContent === ''");
  assert.equal((await fetch(origin+'/absent')).status,404);
  try{await fs.writeFile(path.join(root,'published-profile.png'),(await viewer.webContents.capturePage()).toPNG());}catch(error){console.warn('Screenshot unavailable: '+error.message);}
  console.log('Published playback passed: actual public assets, /slug canonical path, cross-origin media redirects, images, trailer, HLS segments, back navigation, 404. Temporary data: '+root);
}
async function cleanup(){viewer?.destroy();for(const server of [siteServer,mediaServer])if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
run().then(async()=>{await cleanup();app.exit(0);}).catch(async error=>{console.error(error);await cleanup();app.exit(1);});

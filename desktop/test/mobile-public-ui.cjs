// Static fixture only: no user database, media or cloud credentials.
const {app,BrowserWindow}=require('electron');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../backend/src/main/resources');
let server,win;
app.whenReady().then(async()=>{
  const film={id:'film-0',title:'아주 긴 작품 제목을 모바일에서도 읽을 수 있습니다',roles:['ACTOR'],characterName:'주인공',castType:'LEAD',year:2026,genres:['드라마'],thumbnail:'fixture.svg',thumbnailPosition:{x:20,y:30},mobileThumbnailPosition:{x:80,y:70},manifestUrl:'media/film-0/index.m3u8'};
  const fixture={profile:{name:'배우 이름',intro:'소개 문구입니다.',portrait:'fixture.svg',sns:[],tags:['연기','긴태그'.repeat(20)],contact:{email:'long-address@example.com'}},films:[film,{...film,id:'film-1',category:'MINOR',manifestUrl:null},{...film,id:'film-2',category:'DIRECTING',manifestUrl:null}],photos:['fixture.svg','fixture.svg']};
  Object.assign(fixture.profile,{heightCm:175.5,weightKg:65,birthDate:'1995-01-01',birthPlace:'서울',intro:'첫 번째 소개 문장입니다.\n두 번째 소개 문장입니다.'});
  fixture.profile.sns=['INSTAGRAM','YOUTUBE','TIKTOK'].map(type=>({type,url:'https://example.com/'}));
  server=http.createServer((req,res)=>{
    const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
    if(name==='portfolio.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(fixture));}
    if(name==='fixture.svg'){res.setHeader('Content-Type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#765b89"/></svg>');}
    if(name.includes('..')){res.writeHead(404);return res.end();}
    const file=['public-portfolio','static'].map(dir=>path.join(root,dir,name)).find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
    if(!file){res.writeHead(404);return res.end();}
    res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html');
    const content=fs.readFileSync(file);res.end(name==='video-player.html'?content.toString().replace('<html lang="ko">','<html lang="ko" data-public-portfolio="true">'):content);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  win=new BrowserWindow({show:false,width:390,height:844,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  const origin=`http://127.0.0.1:${server.address().port}`;
  const js=s=>win.webContents.executeJavaScript(s);
  async function ready(){for(let i=0;i<100;i++){if(await js("!!document.querySelector('.film-card')"))return;await new Promise(r=>setTimeout(r,50));}throw Error('fixture not loaded');}
  for(const width of [320,390,760,1280]){
    win.setContentSize(width,844);await win.loadURL(origin);await ready();
    assert(await js('document.documentElement.scrollWidth<=innerWidth'),`overflow at ${width}`);
    if(width<=760){
      assert.equal(await js("getComputedStyle(document.querySelector('.profile-header')).display"),'grid');
      assert(await js("document.querySelector('.profile-photo').getBoundingClientRect().right<document.querySelector('.profile-core').getBoundingClientRect().left"));
      assert(await js("document.getElementById('snsRow').getBoundingClientRect().left>document.querySelector('.profile-photo').getBoundingClientRect().right"));
      assert(await js("document.getElementById('bioDisplay').getBoundingClientRect().top>=document.querySelector('.profile-photo').getBoundingClientRect().bottom"));
      assert(await js("document.getElementById('bioDisplay').getBoundingClientRect().width>innerWidth*.8"));
      assert.equal(await js("getComputedStyle(document.getElementById('bioDisplay')).whiteSpace"),'normal');
      assert.deepEqual(await js("[...document.querySelectorAll('#profileMeta span')].map(el=>el.textContent)"),['1995-01-01','서울','175.5 cm','65 kg']);
      assert(await js("new Set([...document.querySelectorAll('#profileMeta span')].map(el=>el.getBoundingClientRect().top)).size===2"));
      assert.equal(await js("getComputedStyle(document.querySelector('.gallery-grid')).gridTemplateColumns.split(' ').length"),3);
      assert.equal(await js("document.getElementById('snsRow').previousElementSibling.textContent"),'SNS');
      assert(await js("document.getElementById('copyContactEmail').getBoundingClientRect().right<=document.getElementById('contactEmailDisplay').getBoundingClientRect().left"));
      await js("document.querySelector('.film-card').click()");
      assert(await js("document.getElementById('details').open"));
      assert(await js("document.querySelector('#details .popup-participation').textContent.includes('2026 · 배우')"));
      assert(await js("[...document.querySelector('#details .popup-info').children].map(el=>el.className).join(',')==='popup-title,popup-meta,popup-participation,popup-action-row'"));
      assert(await js("document.querySelector('.details-play').getAttribute('href').includes('videoId=film-0')"));
      assert(await js("!!document.querySelector('.details-play svg')&&!document.getElementById('detailsClose')"));
      assert(await js("!document.querySelector('#details .popup-age')"));
      await js("document.getElementById('detailsTitle').click()");assert(await js("document.getElementById('details').open"));
      await js("(()=>{const d=document.getElementById('details');d.dispatchEvent(new PointerEvent('pointerdown',{clientX:1,clientY:1}));d.dispatchEvent(new MouseEvent('click',{clientX:1,clientY:1}));})()");
      assert(await js("!document.getElementById('details').open"));
      await js("document.querySelectorAll('.film-card')[1].click()");
      assert(await js("document.getElementById('details').open&&!document.querySelector('.details-play')"));
      assert(await js("!document.querySelector('#details .popup-action-row')"));
    }else {
      assert.equal(await js("getComputedStyle(document.querySelector('.profile-header')).flexDirection"),'row');
      assert.equal(await js("getComputedStyle(document.getElementById('bioDisplay')).whiteSpace"),'pre-line');
      assert(await js("new Set([...document.querySelectorAll('#profileMeta span')].map(el=>el.getBoundingClientRect().top)).size===1"));
      assert.equal(await js("getComputedStyle(document.querySelector('.profile-meta-line+.profile-meta-line'),'::before').content"),'"·"');
      await js("document.querySelector('.film-card').dispatchEvent(new MouseEvent('mouseenter'))");
      assert(await js("document.querySelector('.movie-popup .popup-participation').textContent.includes('2026 · 배우')"));
      assert(await js("document.querySelector('.movie-popup .popup-participation').nextElementSibling.classList.contains('popup-action-row')"));
      const playableHeight=await js("document.querySelector('.movie-popup').offsetHeight");
      await js("document.querySelectorAll('.film-card')[1].dispatchEvent(new MouseEvent('mouseenter'))");
      assert(await js("document.querySelector('.movie-popup .popup-action-row').hidden"));
      assert((await js("document.querySelector('.movie-popup').offsetHeight"))<playableHeight,'experience popup must shrink without play controls');
    }
  }
  win.setContentSize(390,844);await win.loadURL(origin+'/filmography.html');await ready();
  assert.deepEqual(await js("['video','directing','experience'].map(group=>document.getElementById(group+'Films').children.length)"),[1,1,1]);
  assert.equal(await js("getComputedStyle(document.querySelector('.film-grid')).gridTemplateColumns.split(' ').length"),3);
  assert(await js("(()=>{const r=document.querySelector('.film-poster-frame').getBoundingClientRect();return Math.abs(r.width/r.height-4/5)<0.03;})()"));
  assert.equal(await js("getComputedStyle(document.querySelector('.film-poster')).objectPosition"),'80% 70%');
  assert.equal(await js("getComputedStyle(document.querySelector('.film-body')).display"),'none');
  await js("document.querySelector('.film-card').click()");assert(await js("document.querySelector('.details-play').href.includes('from=filmography')"));
  assert(await js('document.documentElement.scrollWidth<=innerWidth'));
  win.setContentSize(1280,844);await new Promise(r=>setTimeout(r,100));
  assert.equal(await js("getComputedStyle(document.querySelector('.film-poster')).objectPosition"),'20% 30%');
  for(const [width,height] of [[320,640],[390,844],[844,390]]){
    win.setContentSize(width,height);await win.loadURL(origin+'/video-player.html');
    assert(await js("!!document.querySelector('#fullscreenBtn svg.fullscreen-icon') && document.querySelector('#fullscreenBtn path').getAttribute('fill')==='none' && document.querySelector('#fullscreenBtn path').getAttribute('stroke')==='#fff'"));
    await js("document.getElementById('timeline').focus()");
    assert.equal(await js("getComputedStyle(document.getElementById('timeline')).outlineStyle"),'none');
    assert(await js("!document.querySelector('#skipLeft span')&&!document.querySelector('#skipRight span')"));
    assert(await js("[...document.querySelectorAll('.bottom-bar [role=button]')].every(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;})"),`player bounds ${width}`);
  }
  console.log('PASS: mobile profile, three-column portrait thumbnails, independent responsive positions, popup metadata and desktop layout');
}).catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{win?.destroy();server?.close();app.exit(process.exitCode||0);});

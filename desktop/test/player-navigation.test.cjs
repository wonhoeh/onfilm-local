const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../backend/src/main/resources/static/video-player.js'), 'utf8');
function player(search, publicPortfolio = false, environment = {}) {
  const documentListeners={};
  const nodes = new Map();
  const timers = new Map();let sequence=0;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      listeners: {}, attributes: {}, style: {}, volume: 1, paused:true,
      classList:{values:new Set(),add(v){this.values.add(v);},remove(v){this.values.delete(v);},contains(v){return this.values.has(v);}},
      querySelector(){return null;},
      addEventListener(type, listener) { this.listeners[type] = listener; },
      setAttribute(name, value) { this.attributes[name] = value; },
      toggleAttribute(name,value){if(value)this.attributes[name]='';else delete this.attributes[name];},
      removeAttribute() {}, pause() {}, load() {},
    });
    return nodes.get(id);
  };
  const location = { search, href: '' };
  const doc={getElementById:node,querySelector:node,querySelectorAll:()=>[],documentElement:{dataset:{publicPortfolio:String(publicPortfolio)}},addEventListener(type,listener){documentListeners[type]=listener;},...environment.document};
  vm.runInNewContext(source, {
    URLSearchParams, location, setTimeout: (fn,ms) => {timers.set(++sequence,{fn,ms});return sequence;}, clearTimeout(id) {timers.delete(id);},
    fetch:()=>new Promise(()=>{}),
    document: doc,
    window: { createTimelinePreview: () => ({ destroy() {} }), addEventListener() {},...environment.window },
  });
  return { back: node('backBtn'), location,node,doc,documentListeners,idle(){const entry=[...timers].find(([,t])=>t.ms===3000);if(entry){timers.delete(entry[0]);entry[1].fn();}} };
}

test('volume click toggles mute; desktop hover opens slider and touch hover does not',()=>{
  const p=player(''),v=p.node('video');v.muted=false;
  p.node('volumeBtn').listeners.click();assert.equal(v.muted,true);
  p.node('volumeBtn').listeners.click();assert.equal(v.muted,false);
  p.node('volumeBtn').listeners.mouseenter();assert(p.node('volumePopup').classList.contains('show'));
  const mobile=player('',false,{window:{matchMedia:()=>({matches:true})}});
  mobile.node('volumeBtn').listeners.mouseenter();assert(!mobile.node('volumePopup').classList.contains('show'));
  mobile.node('volumeBtn').listeners.click();assert.equal(mobile.node('video').muted,true);
});

test('touch double tap seeks ten seconds, clamps and ignores swipes, mouse and opposite sides',()=>{
  const p=player('?videoId=11111111-1111-1111-1111-111111111111'),v=p.node('video');
  v.duration=100;v.currentTime=50;v.getBoundingClientRect=()=>({left:0,width:400});
  const tap=(x,time,extra={})=>{const e={pointerType:'touch',isPrimary:true,pointerId:1,clientX:x,clientY:100,timeStamp:time,preventDefault(){},...extra};v.listeners.pointerdown(e);v.listeners.pointerup({...e,timeStamp:time+30});};
  tap(60,0);assert.equal(v.currentTime,50);tap(60,150);assert.equal(v.currentTime,40);assert(p.node('skipLeft').classList.contains('show'));
  tap(330,1000);tap(330,1150);assert.equal(v.currentTime,50);assert(p.node('skipRight').classList.contains('show'));
  tap(60,2000);tap(330,2150);assert.equal(v.currentTime,50);
  tap(60,3000,{pointerType:'mouse'});tap(60,3150,{pointerType:'mouse'});assert.equal(v.currentTime,50);
  tap(60,4000);tap(60,4500);assert.equal(v.currentTime,50);
  v.currentTime=4;tap(60,5000);tap(60,5150);assert.equal(v.currentTime,0);
  v.currentTime=96;tap(330,6000);tap(330,6150);assert.equal(v.currentTime,100);
  v.currentTime=50;tap(60,7000);v.listeners.pointercancel();tap(60,7150);assert.equal(v.currentTime,50);
  v.listeners.pointerdown({pointerType:'touch',isPrimary:true,pointerId:1,clientX:60,clientY:100,timeStamp:8000});
  v.listeners.pointerup({pointerType:'touch',pointerId:1,clientX:150,clientY:100,timeStamp:8050});tap(150,8150);assert.equal(v.currentTime,50);
});

test('arrow seek flashes icons both on document and focused timeline',()=>{
  const p=player('?videoId=11111111-1111-1111-1111-111111111111');p.node('video').duration=100;p.node('video').currentTime=30;
  const event=key=>({key,target:{},preventDefault(){this.defaultPrevented=true;}});
  p.documentListeners.keydown(event('ArrowRight'));
  assert.equal(p.node('video').currentTime,35);assert(p.node('skipRight').classList.contains('show'));
  const e=event('ArrowLeft');p.node('timeline').listeners.keydown(e);p.documentListeners.keydown(e);
  assert.equal(p.node('video').currentTime,30);assert(p.node('skipLeft').classList.contains('show'));
});
test('mobile fullscreen locks landscape, unlocks on exit, tolerates unsupported lock',async()=>{
  let locks=0,unlocks=0;
  const p=player('',true,{window:{matchMedia:()=>({matches:true}),screen:{orientation:{async lock(value){assert.equal(value,'landscape');locks++;},unlock(){unlocks++;}}}}});
  p.node('.player-container').requestFullscreen=async()=>{p.doc.fullscreenElement={};};
  p.doc.exitFullscreen=async()=>{p.doc.fullscreenElement=null;};
  await p.node('fullscreenBtn').listeners.click();assert.equal(locks,1);
  await p.node('fullscreenBtn').listeners.click();assert.equal(unlocks,1);
  const unsupported=player('',true,{window:{matchMedia:()=>({matches:true}),screen:{orientation:{async lock(){throw Error('unsupported');}}}}});
  unsupported.node('.player-container').requestFullscreen=async()=>{unsupported.doc.fullscreenElement={};};
  await unsupported.node('fullscreenBtn').listeners.click();assert(unsupported.doc.fullscreenElement);
});

test('player hides after inactivity, restores on activity and keeps paused/menu UI visible',()=>{
  const p=player(''),container=p.node('.player-container'),video=p.node('video');
  p.node('playerStatus').hidden=true;video.paused=false;
  container.listeners.pointermove();p.idle();assert(container.classList.contains('ui-idle'));
  container.listeners.pointermove();assert(!container.classList.contains('ui-idle'));
  p.node('speedMenu').classList.add('open');p.idle();assert(!container.classList.contains('ui-idle'));
  p.node('speedMenu').classList.remove('open');video.paused=true;container.listeners.pointermove();p.idle();assert(!container.classList.contains('ui-idle'));
});

for (const [name, search, publicPortfolio, expected, label] of [
  ['profile entry', '', false, '/profile.html', '프로필로 돌아가기'],
  ['filmography entry', '?from=filmography', false, '/filmography.html', '필모그래피로 돌아가기'],
  ['editor entry', '?from=edit-filmography', false, '/edit-filmography.html', '필모 편집으로 돌아가기'],
  ['public cannot return to editor', '?from=edit-filmography', true, 'index.html', '프로필로 돌아가기'],
  ['untrusted destination', '?from=https://example.com', false, '/profile.html', '프로필로 돌아가기'],
  ['public profile', '', true, 'index.html', '프로필로 돌아가기'],
  ['public filmography', '?from=filmography', true, 'filmography.html', '필모그래피로 돌아가기'],
  ['public untrusted destination', '?from=https://example.com', true, 'index.html', '프로필로 돌아가기'],
]) {
  test(`player return: ${name}, including failed playback`, () => {
    const { back, location } = player(search, publicPortfolio);
    assert.equal(back.attributes['aria-label'], label);
    back.listeners.click();
    assert.equal(location.href, expected);
    location.href = '';
    back.listeners.keydown({ key: 'Enter', preventDefault() {} });
    assert.equal(location.href, expected);
  });
}

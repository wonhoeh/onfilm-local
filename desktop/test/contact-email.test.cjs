const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../backend/src/main/resources/static/contact-email.js'),'utf8');
function setup(email,{writeText,legacy=true,hidden=false}={}) {
 let click,copied,removed=false,focused=false;
 const classes=new Set(),timers=[];
 const button={hidden,disabled:false,addEventListener(_name,fn){click=fn;}},status={textContent:'',classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v)}};
 const document={getElementById:id=>({copyContactEmail:button,contactCopyStatus:status,contactEmailDisplay:{textContent:email}}[id]),
 activeElement:{focus(){focused=true;}},body:{append(input){copied=input.value;}},
 createElement:()=>({select(){},remove(){removed=true;}}),execCommand:()=>legacy};
 vm.runInNewContext(source,{document,navigator:{clipboard:writeText?{writeText}:undefined},setTimeout(fn){timers.push(fn);return fn;},clearTimeout(fn){const i=timers.indexOf(fn);if(i>=0)timers.splice(i,1);}});
 return {click,button,status,tick(){timers.shift()?.();},get copied(){return copied;},get removed(){return removed;},get focused(){return focused;}};
}
test('email copy trims address, reports success, and avoids blank/hidden contacts',async()=>{
 let value;const a=setup(' actor@example.com ',{writeText:async email=>{value=email;}});await a.click();
 assert.equal(value,'actor@example.com');assert.equal(a.status.textContent,'복사되었습니다.');assert.equal(a.button.disabled,false);
 assert(a.status.classList.contains('show'));a.tick();assert(!a.status.classList.contains('show'));assert.equal(a.status.textContent,'복사되었습니다.');a.tick();assert.equal(a.status.textContent,'');
 for(const [email,hidden] of [['   ',false],['actor@example.com',true]]){const b=setup(email,{hidden,writeText:()=>{throw Error('must not run');}});await b.click();assert.equal(b.status.textContent,'');assert.equal(b.copied,undefined);}
});
test('clipboard denial falls back to user gesture copy, restores focus and reports failure honestly',async()=>{
 const a=setup('actor@example.com',{writeText:async()=>{throw Error('denied');}});await a.click();assert.equal(a.copied,'actor@example.com');assert(a.removed&&a.focused);assert.equal(a.status.textContent,'복사되었습니다.');
 const b=setup('actor@example.com',{legacy:false});await b.click();assert.match(b.status.textContent,/복사하지 못했습니다/);assert(b.removed&&b.focused);assert.equal(b.button.disabled,false);
});
test('local and public views hide copy by default and toggle with email, include shared script',()=>{
 const root=path.join(__dirname,'../../backend/src/main/resources');
 for(const [html,js]of [['static/profile.html','static/profile.js'],['public-portfolio/index.html','public-portfolio/public-profile.js']]){
  const h=fs.readFileSync(path.join(root,html),'utf8'),s=fs.readFileSync(path.join(root,js),'utf8');
  assert.match(h,/<button id="copyContactEmail"[^>]* hidden>/);assert(h.includes('contact-email.js'));assert(s.includes("$('copyContactEmail').hidden=!contact.email?.trim()"));
 }
});

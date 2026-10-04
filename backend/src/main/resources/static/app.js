const byId = id => document.getElementById(id);
const form = byId('editProfileForm'), fields = byId('fields'), status = byId('status');
let version = null, dirty = false, busy = false, tags = [], hasPortrait=false;
function markDirty() { dirty=true; status.textContent='아직 저장하지 않은 변경이 있습니다.'; }
function lock(value) {
  busy=value; fields.disabled=value || version===null; byId('reload').disabled=value;
  for(const id of ['chooseProfilePhoto','selectProfileBtn','profileFileInput'])byId(id).disabled=value||version===null;
  byId('deleteProfileBtn').disabled=value||version===null||!hasPortrait;
}
function renderPortrait() { byId('profilePreview').src=hasPortrait?'/api/profile/portrait?v='+version:'/images/profile-placeholder.png'; }
async function changePortrait(file,remove=false) {
  if(busy||version===null||byId('photoSection').hidden)return;
  if(!remove&&(!file||!['image/jpeg','image/png'].includes(file.type)||file.size>5*1024*1024)){
    byId('photoStatus').textContent='JPG 또는 PNG, 최대 5MB 파일을 선택해 주세요.';return;
  }
  if(remove&&!confirm('프로필 사진을 삭제할까요?'))return;
  lock(true);byId('photoStatus').textContent='사진을 저장하는 중입니다.';
  try{
    const body=new FormData();body.append('version',String(version));if(file)body.append('file',file);
    const response=await fetch('/api/profile/portrait'+(remove?'?version='+version:''),remove?{method:'DELETE'}:{method:'POST',body});
    if(!response.ok)throw new Error();
    version++;hasPortrait=!remove;renderPortrait();
    byId('photoStatus').textContent=remove?'사진을 삭제했습니다.':'사진을 저장했습니다.';
  }catch{
    version=null;byId('photoStatus').textContent='처리 결과를 확인하지 못했습니다. 파일 형식·크기를 확인하고 다시 읽어 주세요. 응답 유실 시 저장됐을 수 있습니다.';
    status.textContent='저장된 내용 다시 읽기로 확인한 뒤 편집을 계속해 주세요.';
  }finally{byId('profileFileInput').value='';lock(false);}
}
for(const id of ['chooseProfilePhoto','selectProfileBtn'])byId(id).onclick=()=>byId('profileFileInput').click();
byId('profileFileInput').onchange=event=>void changePortrait(event.target.files[0]);
byId('deleteProfileBtn').onclick=()=>void changePortrait(null,true);
for(const name of ['dragover','dragleave','drop'])byId('photoSection').addEventListener(name,event=>{
  event.preventDefault();byId('profilePreview').classList.toggle('drop-hover',name==='dragover'&&!busy&&version!==null);
  if(name==='drop'&&event.dataTransfer.files.length===1)void changePortrait(event.dataTransfer.files[0]);
});
function addSns(entry={type:'INSTAGRAM', url:''}) {
  if (byId('snsList').children.length>=10) throw new Error('SNS는 최대 10개까지 등록할 수 있습니다.');
  const row=document.createElement('div'); row.className='sns-row';
  const select=document.createElement('select'); select.className='select-input'; select.setAttribute('aria-label','SNS 종류');
  for(const [value,label] of [['INSTAGRAM','Instagram'],['YOUTUBE','YouTube'],['TIKTOK','TikTok'],['ETC','기타']]) select.add(new Option(label,value));
  select.value=entry.type;
  const input=document.createElement('input'); input.className='text-input'; input.maxLength=2048; input.placeholder='https://www.example.com/...'; input.value=entry.url; input.setAttribute('aria-label','SNS 주소');
  const remove=document.createElement('button'); remove.type='button'; remove.className='sns-remove-btn'; remove.textContent='×'; remove.setAttribute('aria-label','SNS 삭제');
  remove.addEventListener('click',()=>{row.remove(); markDirty();});
  row.append(select,input,remove); byId('snsList').append(row);
}
function renderTags() {
  byId('tagList').replaceChildren();
  tags.forEach((tag,index)=>{
    const button=document.createElement('button'); button.type='button'; button.className='tag-chip'; button.textContent='#'+tag; button.setAttribute('aria-label',tag+' 태그 삭제');
    button.addEventListener('click',()=>{tags.splice(index,1);renderTags();markDirty();}); byId('tagList').append(button);
  });
}
function addTag() {
  const tag=byId('tagInput').value.normalize('NFKC').trim().replace(/^#+/,'').trim().replace(/\s+/g,' ');
  if(!tag || tag.length>30 || tags.length>=20 || tags.some(t=>t.toLowerCase()===tag.toLowerCase())) throw new Error('태그는 중복 없이 30자 이하, 최대 20개까지 입력해 주세요.');
  tags.push(tag);byId('tagInput').value='';renderTags();markDirty();
}
function apply(data) {
  byId('contactEmail').value=data.contact?.email||'';
  byId('actorName').value=data.name; byId('bioInput').value=data.oneLineIntro; byId('birthPlace').value=data.birthPlace || '';
  const parts=(data.birthDate || '').split('-'); ['birthYear','birthMonth','birthDay'].forEach((id,i)=>byId(id).value=parts[i] || '');
  byId('snsList').replaceChildren(); (data.snsList || []).forEach(addSns);
  tags=[...(data.rawTags || [])]; renderTags(); byId('tagInput').value=''; version=data.version; dirty=false;
  byId('backToProfile').hidden = !data.name?.trim();
  byId('photoSection').hidden=!data.name?.trim();byId('profileCard').classList.toggle('with-photo',!!data.name?.trim());
  hasPortrait=data.hasPortrait;renderPortrait();byId('photoStatus').textContent='';
  document.querySelector('.header-title').textContent=data.name?.trim()?'프로필 편집':'프로필 입력';
}
async function load() {
  if(busy || (dirty && !confirm('저장하지 않은 변경을 버리고 다시 읽을까요?'))) return;
  lock(true);
  try {
    const response=await fetch('/api/profile'); if(!response.ok) throw new Error();
    const data=await response.json();
    apply(data);
    if (data.name?.trim() && !new URLSearchParams(location.search).has('edit')) {
      lock(false); location.replace('/profile.html'); return;
    }
    status.textContent='저장된 프로필을 불러왔습니다.';
  }
  catch {status.textContent='프로필을 불러오지 못했습니다. 다시 읽기를 눌러 주세요.';}
  finally {lock(false);}
}
function birthDate() {
  const parts=['birthYear','birthMonth','birthDay'].map(id=>byId(id).value.trim());
  if(parts.every(part=>!part)) return null;
  if(!/^\d{4}$/.test(parts[0]) || !/^\d{1,2}$/.test(parts[1]) || !/^\d{1,2}$/.test(parts[2]) || +parts[0]<1) throw new Error('출생일의 연·월·일을 모두 입력해 주세요.');
  const value=parts[0]+'-'+parts[1].padStart(2,'0')+'-'+parts[2].padStart(2,'0');
  const date=new Date(value+'T00:00:00Z');
  const now=new Date(); const today=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
  if(!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==value || value>today) throw new Error('미래가 아닌 올바른 출생일을 입력해 주세요.');
  return value;
}
form.addEventListener('input',markDirty); form.addEventListener('change',markDirty);
byId('addSnsBtn').addEventListener('click',()=>{try {addSns();markDirty();}catch(error){status.textContent=error.message;}});
byId('addTagBtn').addEventListener('click',()=>{try{addTag();}catch(error){status.textContent=error.message;}});
byId('tagInput').addEventListener('keydown',event=>{if(event.key==='Enter' && !event.isComposing){event.preventDefault();byId('addTagBtn').click();}});
form.addEventListener('submit',async event=>{
  event.preventDefault(); if(busy || version===null) return;
  try {
    if(byId('tagInput').value.trim()) addTag();
    const payload={name:byId('actorName').value.trim(),oneLineIntro:byId('bioInput').value.trim(),birthPlace:byId('birthPlace').value.trim(),birthDate:birthDate(),version,rawTags:tags,
      snsList:[...byId('snsList').children].map(row=>({type:row.querySelector('select').value,url:row.querySelector('input').value.trim()})).filter(s=>s.url)};
    payload.contact={email:byId('contactEmail').value.trim()};
    if(!payload.name) throw new Error('이름을 입력해 주세요.');
    lock(true);
    const response=await fetch('/api/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!response.ok) throw new Error(response.status===409 ? '다른 변경이 저장됐습니다. 다시 읽은 뒤 수정해 주세요.' : '저장 실패: 입력값·연락처·SNS 주소(http/https)를 확인해 주세요.');
    apply(await response.json());status.textContent='이 PC에 저장했습니다.';
    lock(false); location.assign('/profile.html');
  } catch(error){status.textContent=error.message || '연결 실패. 다시 읽기로 저장 여부를 확인해 주세요.';}
  finally{lock(false);}
});
byId('reload').addEventListener('click',load);
window.addEventListener('beforeunload',event=>{if(dirty || busy){event.preventDefault();event.returnValue='';}});
void load();

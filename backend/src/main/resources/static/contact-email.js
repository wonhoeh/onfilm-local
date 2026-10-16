(() => {
  'use strict';
  const button=document.getElementById('copyContactEmail');
  if(!button)return;
  const status=document.getElementById('contactCopyStatus');
  let timer, clearTimer;
  button.addEventListener('click',async()=>{
    const email=document.getElementById('contactEmailDisplay').textContent.trim();
    if(!email||button.hidden||button.disabled)return;
    button.disabled=true;clearTimeout(timer);clearTimeout(clearTimer);status.classList.remove('show');status.textContent='';
    try {
      if(navigator.clipboard?.writeText) {
        try {await navigator.clipboard.writeText(email);}
        catch {legacyCopy(email);}
      } else legacyCopy(email);
      status.textContent='복사되었습니다.';
    } catch {status.textContent='복사하지 못했습니다. 이메일을 직접 선택해 복사해 주세요.';}
    finally {
      button.disabled=false;
      // Commit the off-screen position before animating the live announcement.
      void status.offsetWidth;
      status.classList.add('show');
      timer=setTimeout(()=>{
        status.classList.remove('show');
        clearTimer=setTimeout(()=>{status.textContent='';},300);
      },3000);
    }
  });
  // Electron denies general clipboard permissions; user-triggered copy needs no read permission.
  function legacyCopy(email) {
    const focused=document.activeElement,input=document.createElement('textarea');
    input.value=email;input.readOnly=true;input.className='contact-copy-helper';
    document.body.append(input);
    try {input.select();if(!document.execCommand('copy'))throw new Error('Copy denied');}
    finally {input.remove();focused?.focus({preventScroll:true});}
  }
})();

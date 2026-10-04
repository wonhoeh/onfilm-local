(() => {
  const input = document.getElementById('gallery-files');
  const reload = document.getElementById('gallery-reload');
  const status = document.getElementById('gallery-status');
  const list = document.getElementById('gallery');
  const browse = document.getElementById('browseBtn');
  const area = document.getElementById('uploadArea');
  let state = null, busy = false;
  function lock(value) {
    busy = value; input.disabled = value || !state || state.ids.length >= 12; reload.disabled = value;
    browse.disabled = input.disabled;
    list.querySelectorAll('button').forEach(button => { button.disabled = value || !state || button.dataset.edge === 'true'; });
  }
  function render(next) {
    state = next; list.replaceChildren();
    document.getElementById('photoCountText').textContent = `사진 ${state.ids.length}/12장`;
    document.getElementById('emptyHint').hidden = state.ids.length !== 0;
    state.ids.forEach((id, index) => {
      const card = document.createElement('figure'); card.className = 'photo-card';
      const image = document.createElement('img'); image.src = `/api/gallery/${id}/image`; image.alt = `갤러리 사진 ${index+1}`; image.width = 160; image.loading = 'lazy';
      image.className = 'photo-thumb';
      image.addEventListener('error', () => { image.alt = '사진을 읽지 못했습니다. 다시 읽기를 눌러 주세요.'; });
      const actions = document.createElement('div'); actions.className = 'photo-actions';
      card.append(image, actions);
      for (const [label, offset] of [['앞으로', -1], ['뒤로', 1], ['삭제', 0]]) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
        button.className = 'btn';
        button.setAttribute('aria-label', `${index+1}번 사진 ${label}`);
        button.dataset.edge = String(offset !== 0 && (index+offset < 0 || index+offset >= state.ids.length));
        button.addEventListener('click', () => void mutate(async () => {
          if (!offset) {
            if (!confirm('갤러리에서 삭제할까요? 원본 파일은 삭제하지 않습니다.')) return;
            return request(`/api/gallery/${id}?version=${state.version}`, {method:'DELETE'});
          }
          const ids = [...state.ids]; [ids[index], ids[index+offset]] = [ids[index+offset], ids[index]];
          return request('/api/gallery/order', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({version:state.version, ids})});
        })); actions.append(button);
      }
      list.append(card);
    });
  }
  async function request(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      const safeCodes = new Set(['EMPTY_IMAGE', 'IMAGE_TOO_LARGE', 'IMAGE_BUSY', 'UNSUPPORTED_IMAGE', 'UNSAFE_IMAGE_DIMENSIONS', 'INVALID_IMAGE']);
      const message = safeCodes.has(error?.code) ? error.message : response.status === 409 ? '사진 수 제한 또는 다른 변경이 있습니다. 다시 읽기를 눌러 주세요.' : response.status === 413 ? '파일 용량은 5MB 이하여야 합니다.' : `저장 요청에 실패했습니다(HTTP ${response.status}). 다시 읽기로 상태를 확인해 주세요.`;
      throw new Error(message);
    }
    return response.json();
  }
  async function mutate(action) {
    if (busy || !state) return;
    lock(true);
    try { const next = await action(); if (next) { render(next); status.textContent = '갤러리를 저장했습니다.'; } }
    catch (error) { state = null; status.textContent = `${error.message} 저장 여부 확인을 위해 다시 읽기를 눌러 주세요.`; }
    finally { lock(false); }
  }
  async function load() {
    if (busy) return; lock(true);
    try {
      const profile = await request('/api/profile');
      if (!profile.name?.trim()) { lock(false); location.replace('/index.html?edit=1'); return; }
      render(await request('/api/gallery')); status.textContent = '갤러리를 불러왔습니다.';
    }
    catch { state = null; status.textContent = '불러오기에 실패했습니다. 다시 읽기를 눌러 주세요.'; }
    finally { lock(false); }
  }
  async function upload(files) {
    if (!files.length || busy || !state) return;
    if (state.ids.length+files.length > 12) { status.textContent = '총 12장까지만 추가할 수 있습니다.'; input.value=''; return; }
    lock(true); let completed=0;
    try {
      for (const file of files) {
        if (file.size > 5*1024*1024) throw new Error('5MB를 초과하는 파일이 있습니다.');
        status.textContent = `${completed+1}/${files.length}장 저장 중…`;
        const body = new FormData(); body.append('file', file);
        render(await request(`/api/gallery?version=${state.version}`, {method:'POST', body})); lock(true); completed++;
      }
      status.textContent = `${completed}장을 저장했습니다.`;
    } catch (error) { state = null; status.textContent = `${completed}장 저장 확인. 나머지 업로드를 중단했습니다. ${error.message} 응답 유실 시 저장됐을 수 있으니 다시 읽기로 확인해 주세요.`; }
    finally { input.value=''; lock(false); }
  }
  input.addEventListener('change', () => void upload([...input.files]));
  browse.addEventListener('click', () => input.click());
  for (const name of ['dragover', 'drop']) window.addEventListener(name, event => event.preventDefault());
  area.addEventListener('dragover', () => { if (!input.disabled) area.classList.add('dragover'); });
  area.addEventListener('dragleave', () => area.classList.remove('dragover'));
  area.addEventListener('drop', event => { area.classList.remove('dragover'); if (!input.disabled) void upload([...event.dataTransfer.files]); });
  reload.addEventListener('click', load);
  window.addEventListener('beforeunload', event => { if (busy) { event.preventDefault(); event.returnValue=''; } });
  void load();
})();

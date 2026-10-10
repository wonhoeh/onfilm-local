(() => {
  const $ = id => document.getElementById(id);
  const bridge = window.onfilmCloudflare;
  const fields = ['accountId','bucket','project','siteOrigin','mediaOrigin','publicSlug'];
  const secrets = ['accessKeyId','secretAccessKey','pagesToken'];
  let configured = false, busy = false, dirty = false, available = false;
  let reservedSlugs = [];
  function updatePublicAddress() {
    const input = $('publicSlug'), slug = input.value.trim();
    let error = '';
    if (!slug) error = '공개 주소 이름을 입력해 주세요.';
    else if (!/^[a-z0-9_-]{3,30}$/.test(slug)) error = '영문 소문자·숫자·하이픈(-)·언더바(_)로 3~30자 입력해 주세요.';
    else if (reservedSlugs.includes(slug)) error = '앱에서 사용하는 주소 이름입니다. 다른 이름을 입력해 주세요.';
    input.setCustomValidity(error);
    input.setAttribute('aria-invalid',String(Boolean(error && input.value)));
    $('publicSlugError').textContent = input.value ? error : '';
    const preview = $('publicUrlPreview');
    if (error) { preview.textContent = slug ? '주소 이름을 확인해 주세요.' : error; return; }
    try {
      const url = new URL($('siteOrigin').value.trim());
      if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash
          || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(url.hostname)) throw new Error();
      preview.textContent = `${url.origin}/${slug}`;
    } catch { preview.textContent = '프로필 도메인을 확인해 주세요.'; }
  }
  function controls() {
    $('connectionFields').disabled = busy || !available;
    $('saveConnection').disabled = busy || !available;
    $('checkConnection').disabled = busy || !configured || dirty || !available;
    for (const id of ['clearConnection','confirmClear','cancelClear']) $(id).disabled = busy || !bridge;
    $('savedBadge').textContent = dirty ? '저장 전' : configured ? '저장됨' : '미연결';
  }
  function clearSecrets() { for (const key of secrets) $(key).value = ''; }
  function apply(result) {
    configured = result.configured;
    for (const key of fields) if (result[key] !== undefined) $(key).value = result[key];
    for (const key of secrets) $(key).placeholder = configured ? '저장된 값 유지 · 변경할 때만 입력' : '';
    dirty = false; updatePublicAddress();
  }
  async function run(task) {
    if (busy) return;
    busy = true; controls();
    try { await task(); }
    catch { $('connectionStatus').textContent = '작업 결과를 확인하지 못했습니다. 화면을 다시 열어 저장 상태를 확인해 주세요.'; }
    finally { busy = false; controls(); }
  }
  $('connectionForm').addEventListener('input', () => {
    updatePublicAddress();
    dirty = true; $('connectionResults').replaceChildren();
    $('connectionStatus').textContent = '변경한 설정을 저장한 뒤 연결을 확인해 주세요.';
    controls();
  });
  $('connectionForm').onsubmit = event => {
    event.preventDefault();
    if (!bridge || !available) return;
    void run(async () => {
      $('connectionStatus').textContent = '연결 정보를 저장하고 있습니다.';
      const input = Object.fromEntries([...fields,...secrets].map(key => [key,$(key).value]));
      try {
        const result = await bridge.save(input);
        if (result.status !== 'saved') { $('connectionStatus').textContent = result.message; return; }
        apply(result); clearSecrets(); $('connectionResults').replaceChildren();
        $('connectionStatus').textContent = '설정을 저장했습니다. 연결 확인을 눌러 주세요.';
      } finally { for (const key of secrets) input[key] = ''; }
    });
  };
  $('checkConnection').onclick = () => void run(async () => {
    $('connectionResults').replaceChildren(); $('connectionStatus').textContent = 'Cloudflare 연결을 확인하고 있습니다…';
    const result = await bridge.check();
    if (result.status !== 'checked') { $('connectionStatus').textContent = result.message; return; }
    for (const check of result.checks) {
      const card = document.createElement('div'), title = document.createElement('strong'), message = document.createElement('span');
      card.className = 'connection-result'; card.dataset.ok = String(check.ok);
      title.textContent = (check.service === 'r2' ? 'R2' : 'Pages') + (check.ok ? ' · 확인 완료' : ' · 확인 필요');
      message.textContent = check.message; card.append(title,message); $('connectionResults').append(card);
    }
    $('connectionStatus').textContent = result.checks.every(check => check.ok) ? '두 서비스의 조회 연결을 확인했습니다. 공개본 화면에서 게시할 수 있습니다. 쓰기 권한은 실제 게시 시 확인됩니다.' : '확인하지 못한 항목을 수정한 뒤 다시 시도해 주세요.';
  });
  $('clearConnection').onclick = () => { $('clearConfirm').hidden = false; };
  $('cancelClear').onclick = () => { $('clearConfirm').hidden = true; };
  $('confirmClear').onclick = () => void run(async () => {
    const result = await bridge.clear();
    if (result.status !== 'cleared') { $('connectionStatus').textContent = result.message; return; }
    $('connectionForm').reset(); clearSecrets(); apply(result); available = result.encryptionAvailable;
    $('clearConfirm').hidden = true; $('connectionResults').replaceChildren();
    $('connectionStatus').textContent = '이 PC의 연결 설정을 삭제했습니다.';
  });
  window.addEventListener('beforeunload', event => { if (busy || dirty) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('pagehide', clearSecrets);
  if (!bridge) { $('desktopOnly').hidden = false; $('connectionStatus').textContent = ''; controls(); return; }
  void run(async () => {
    const result = await bridge.load();
    if (result.status !== 'loaded') { $('connectionStatus').textContent = result.message; return; }
    reservedSlugs = result.reservedSlugs || [];
    available = result.encryptionAvailable; apply(result);
    $('connectionStatus').textContent = !available ? '이 PC의 보안 저장소를 사용할 수 없습니다. 운영체제 로그인·키체인을 확인해 주세요.' : configured ? '저장된 설정을 불러왔습니다. 비밀 키는 화면에 다시 표시하지 않습니다.' : '발급한 연결 정보를 입력해 주세요.';
  });
})();

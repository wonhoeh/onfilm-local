(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const video = $('video');
  const container = document.querySelector('.player-container');
  const videoId = new URLSearchParams(location.search).get('videoId') || '';
  const publicPortfolio = document.documentElement.dataset.publicPortfolio === 'true';
  // Accept only a known entry point, never a user-supplied redirect URL.
  const fromFilmography = new URLSearchParams(location.search).get('from') === 'filmography';
  const backUrl = publicPortfolio ? (fromFilmography ? 'filmography.html' : 'index.html') : fromFilmography ? '/filmography.html' : '/profile.html';
  const preview = window.createTimelinePreview(video);
  let autoplayPending = false;
  let hls = null, generation = 0, timeout = null, failed = false;

  function status(message, retry = false) {
    $('playerMessage').textContent = message;
    $('playerStatus').hidden = !message;
    $('retryPlayback').hidden = !retry;
  }
  function fail(message) {
    failed = true;
    clearTimeout(timeout);
    video.pause();
    preview.destroy();
    if (hls) { hls.destroy(); hls = null; }
    status(message, true);
  }
  function dispose() {
    clearTimeout(timeout);
    preview.destroy();
    if (hls) { hls.destroy(); hls = null; }
    video.pause(); video.removeAttribute('src'); video.load();
  }
  async function load() {
    const current = ++generation;
    failed = false; dispose(); autoplayPending = true;
    status('영상을 불러오고 있습니다.');
    if (!(publicPortfolio ? /^film-[0-9]+$/ : /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i).test(videoId)) {
      fail('잘못된 영상 주소입니다. 뒤로 가서 작품을 다시 선택해 주세요.'); return;
    }
    timeout = setTimeout(() => fail('영상을 불러오지 못했습니다. 다시 읽기를 눌러 주세요.'), 20000);
    try {
      const res = await fetch(publicPortfolio ? 'portfolio.json' : '/api/videos/' + videoId + '/playback');
      if (current !== generation || failed) return;
      if (!res.ok) throw new Error('재생 가능한 영상이 없습니다. 편집 화면에서 인코딩 상태와 파일을 확인해 주세요.');
      const data = await res.json();
      const info = publicPortfolio ? data.films.find(film => film.id === videoId && film.manifestUrl) : data;
      if (!info) throw new Error('공개본에 해당 영상이 없습니다.');
      if (current !== generation || failed) return;
      document.querySelector('.video-title').textContent = info.title;
      document.title = info.title + ' · OnFilm';
      // Never accept a remote/user-supplied source URL.
      const source = publicPortfolio ? 'media/' + videoId + '/index.m3u8' : '/api/videos/' + videoId + '/hls/index.m3u8';
      if (info.manifestUrl !== source) throw new Error('영상 주소를 확인할 수 없습니다.');
      preview.setSource(source);
      if (window.Hls?.isSupported()) {
        // Same-frame network requests retain the Electron session's restricted token injection.
        hls = new Hls({ enableWorker: false, maxBufferLength: 20, backBufferLength: 30 });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (current === generation && data.fatal) fail('재생을 중단했습니다. 영상 파일이 없거나 읽을 수 없습니다. 다시 읽기를 눌러 주세요.');
        });
        hls.loadSource(source); hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = source;
      } else throw new Error('이 실행 환경에서 HLS 재생을 지원하지 않습니다.');
    } catch (error) {
      if (current === generation && !failed) fail(error.message || '영상을 불러오지 못했습니다.');
    }
  }

  function button(id, label, action) {
    const el = $(id); el.setAttribute('role', 'button'); el.tabIndex = 0; el.setAttribute('aria-label', label);
    el.addEventListener('click', action);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!e.repeat) action(); } });
  }
  async function toggle() {
    if (failed || video.readyState < 2) return;
    if (!video.paused) video.pause();
    else try { await video.play(); } catch { status('재생 버튼을 다시 눌러 주세요.'); }
  }
  const duration = () => Number.isFinite(video.duration) ? video.duration : 0;
  const seek = time => { if (!failed && duration()) video.currentTime = Math.max(0, Math.min(duration(), time)); };
  function flash(id) { const el = $(id); el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 500); }
  button('backBtn', fromFilmography ? '필모그래피로 돌아가기' : '프로필로 돌아가기', () => { location.href = backUrl; });
  button('playPause', '재생', toggle);
  $('playPause').title = '재생/일시정지 (Space 또는 K)';
  $('playPause').setAttribute('aria-keyshortcuts', 'Space K');
  $('timeline').title = '클릭하여 이동 · ←/→ 5초 이동';
  button('back10', '10초 뒤로', () => { seek(video.currentTime - 10); flash('skipLeft'); });
  button('forward10', '10초 앞으로', () => { seek(video.currentTime + 10); flash('skipRight'); });
  button('volumeBtn', '볼륨 조절', () => { $('volumePopup').classList.toggle('show'); });
  button('speedBtn', '재생 속도 선택', () => { $('speedMenu').classList.toggle('open'); });
  button('fullscreenBtn', '전체 화면 전환', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await container.requestFullscreen(); }
    catch { status('전체 화면으로 전환할 수 없습니다. 재생 버튼으로 계속 볼 수 있습니다.'); }
  });
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.isComposing
        || e.target.closest?.('input,textarea,select,button,a,[contenteditable="true"]')) return;
    const key = e.key.toLowerCase();
    if (e.code === 'Space' || key === ' ' || key === 'k') {
      e.preventDefault(); if (!e.repeat) void toggle();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault(); seek(video.currentTime + (e.key === 'ArrowLeft' ? -5 : 5));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault(); video.volume = Math.max(0, Math.min(1, video.volume + (e.key === 'ArrowUp' ? 0.05 : -0.05))); video.muted = false;
    } else if (e.code === 'KeyF' || key === 'f' || key === 'ㄹ') {
      e.preventDefault(); if (!e.repeat) $('fullscreenBtn').click();
    } else if (e.code === 'KeyM' || key === 'm' || key === 'ㅡ') {
      e.preventDefault(); if (!e.repeat) video.muted = !video.muted;
    }
  });
  $('fullscreenBtn').title = '전체 화면 (F)';
  $('fullscreenBtn').setAttribute('aria-keyshortcuts', 'F');
  $('volumeBtn').title = '볼륨 조절 · M 음소거 · ↑/↓ 볼륨';
  document.querySelectorAll('.speed-option').forEach((el, index) => {
    el.id = 'speedOption' + index;
    button(el.id, el.textContent + ' 재생', () => { video.playbackRate = Number(el.dataset.speed); $('speedBtn').textContent = el.textContent; $('speedMenu').classList.remove('open'); });
  });
  $('volumeVertical').addEventListener('input', e => { video.volume = Number(e.target.value); video.muted = false; });
  function volume() {
    const value = video.muted ? 0 : video.volume;
    $('volumeFill').style.height = value * 100 + '%'; $('volumeVertical').value = value;
    $('icon-sound-on').hidden = value === 0; $('icon-sound-off').hidden = value !== 0;
  }
  video.addEventListener('volumechange', volume); volume();
  function time(value) {
    const seconds = Math.floor(value || 0);
    return [Math.floor(seconds / 60), seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
  }
  function progress() {
    const total = duration(), current = video.currentTime || 0;
    $('timeDisplay').textContent = time(current) + ' / ' + time(total);
    $('timelineProgress').style.width = (total ? current / total * 100 : 0) + '%';
    $('timeline').setAttribute('aria-valuemax', total);
    $('timeline').setAttribute('aria-valuenow', current);
    $('timeline').setAttribute('aria-valuetext', time(current) + ' / ' + time(total));
  }
  ['timeupdate', 'durationchange', 'loadedmetadata'].forEach(event => video.addEventListener(event, progress));
  $('timeline').addEventListener('click', e => { const box = $('timeline').getBoundingClientRect(); seek((e.clientX - box.left) / box.width * duration()); });
  $('timeline').addEventListener('keydown', e => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      e.preventDefault(); seek(e.key === 'Home' ? 0 : e.key === 'End' ? duration() : video.currentTime + (e.key === 'ArrowLeft' ? -5 : 5));
    }
  });
  video.addEventListener('click', toggle);
  video.addEventListener('canplay', () => {
    if (failed) return;
    clearTimeout(timeout); status('');
    // Once per opening/retry, not every seek or rebuffer (which would undo an intentional pause).
    if (autoplayPending) {
      autoplayPending = false;
      const current = generation;
      video.play().catch(() => { if (current === generation && !failed) status('자동재생이 차단됐습니다. 재생 버튼을 눌러 주세요.'); });
    }
  });
  video.addEventListener('playing', () => { if (!failed) status(''); });
  for (const event of ['play', 'pause', 'ended']) video.addEventListener(event, () => {
    $('playPause').textContent = video.paused ? '▶' : 'Ⅱ';
    $('playPause').setAttribute('aria-label', video.paused ? '재생' : '일시정지');
    $('centerIndicator').textContent = video.paused ? 'Ⅱ' : '▶'; flash('centerIndicator');
  });
  video.addEventListener('error', () => { if (!failed && video.error) fail('영상을 해석하지 못했습니다. 다시 읽기를 눌러 주세요.'); });
  $('retryPlayback').addEventListener('click', load);
  window.addEventListener('pagehide', () => { ++generation; dispose(); });
  void load();
})();

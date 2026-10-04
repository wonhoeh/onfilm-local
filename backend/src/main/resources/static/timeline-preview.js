/* Independent paused HLS decoder: hovering never seeks or pauses the main video. */
window.createTimelinePreview = function(mainVideo) {
  'use strict';
  const bar = document.getElementById('timeline');
  const box = document.getElementById('timelinePreview');
  const video = document.getElementById('previewVideo');
  const message = document.getElementById('previewMessage');
  const label = document.getElementById('previewTime');
  let source = null, hls = null, initialized = false, hovered = false, broken = false;
  let target = 0, debounce = null, deadline = null;
  video.muted = true;

  function hide() {
    hovered = false; box.hidden = true;
    clearTimeout(debounce); clearTimeout(deadline);
    if (hls) hls.stopLoad();
  }
  function failure() {
    broken = true; clearTimeout(deadline); box.classList.remove('ready');
    message.textContent = '미리보기를 읽을 수 없습니다.';
    if (hls) { hls.destroy(); hls = null; }
    // Preview errors do not affect main playback; retry when the pointer re-enters.
  }
  function reset() {
    hide();
    if (hls) { hls.destroy(); hls = null; }
    video.removeAttribute('src'); video.load();
    initialized = false; broken = false; box.classList.remove('ready');
  }
  function seekLatest() {
    if (!hovered || broken || !video.duration || video.seeking) return;
    const position = Math.min(target, Math.max(0, video.duration - 0.1));
    if (Math.abs(video.currentTime - position) > 0.12) { video.currentTime = position; return; }
    if (video.readyState >= 2) {
      box.classList.add('ready'); clearTimeout(deadline);
    }
  }
  function initialize() {
    initialized = true;
    if (window.Hls?.isSupported()) {
      hls = new Hls({ enableWorker: false, maxBufferLength: 4, maxMaxBufferLength: 8, backBufferLength: 0 });
      hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) failure(); });
      hls.loadSource(source); hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) video.src = source;
    else failure();
  }
  function hover(event) {
    if (!source || !Number.isFinite(mainVideo.duration) || mainVideo.duration <= 0) return;
    const entering = !hovered;
    if (entering && broken) reset();
    hovered = true;
    const rect = bar.getBoundingClientRect();
    target = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * mainVideo.duration;
    target = Math.min(target, Math.max(0, mainVideo.duration - 0.1));
    label.textContent = [Math.floor(target / 60), Math.floor(target % 60)].map(n => String(n).padStart(2, '0')).join(':');
    box.hidden = false; box.classList.remove('ready');
    box.style.left = Math.max(8, Math.min(rect.width - 200, event.clientX - rect.left - 96)) + 'px';
    message.textContent = broken ? '미리보기를 읽을 수 없습니다.' : '불러오는 중';
    clearTimeout(debounce); clearTimeout(deadline);
    if (broken) return;
    deadline = setTimeout(failure, 10000);
    if (entering && hls) hls.startLoad(target);
    // Coalesce rapid pointer moves, then finish an active seek before applying the latest target.
    debounce = setTimeout(() => { if (!initialized) initialize(); else seekLatest(); }, 100);
  }
  bar.addEventListener('pointermove', hover);
  bar.addEventListener('pointerleave', hide);
  for (const event of ['loadedmetadata', 'loadeddata', 'seeked', 'canplay']) video.addEventListener(event, seekLatest);
  video.addEventListener('error', () => { if (video.error && initialized) failure(); });
  return {
    setSource(value) { reset(); source = value; },
    destroy() { source = null; reset(); },
  };
};

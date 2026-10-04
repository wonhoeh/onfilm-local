const params = new URLSearchParams(window.location.search);
document.getElementById('server').textContent = params.get('server') || '';
if (params.get('mode') === 'managed') {
  document.getElementById('message').textContent = '로컬 API를 시작하고 있습니다. 최대 90초 정도 기다려 주세요.';
  document.getElementById('instructions').textContent = '별도 DB나 Kafka 실행은 필요하지 않습니다. Java 21, API 빌드 파일, 데이터 폴더 권한을 확인해 주세요.';
}
if (params.get('state') === 'error') {
  document.getElementById('title').textContent = '로컬 서버에 연결하지 못했어요.';
  document.getElementById('message').textContent = params.get('message') || '서버가 꺼져 있거나 응답이 지연되었거나 오류를 반환했습니다.';
  document.getElementById('help').hidden = false;
}
document.getElementById('retry').addEventListener('click', (event) => {
  event.currentTarget.disabled = true;
  window.onfilmDesktop.retry();
});

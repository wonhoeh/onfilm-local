const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function serverOrigin(value = 'http://localhost:8080') {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)
      || !LOOPBACK_HOSTS.has(url.hostname)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('ONFILM_SERVER_URL은 경로 없이 localhost/127.0.0.1/[::1] 주소만 지정하세요.');
  }
  return url.origin;
}

function isAppUrl(value, origin) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol)
      && url.origin === origin && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isPlayerFullscreen(permission, requestingUrl, isMainFrame, origin) {
  return permission === 'fullscreen' && isMainFrame === true && isAppUrl(requestingUrl, origin)
    && /^\/(?:api\/exports\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/site\/)?video-player\.html$/.test(new URL(requestingUrl).pathname);
}

module.exports = { serverOrigin, isAppUrl, isPlayerFullscreen };

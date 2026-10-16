const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');

class SettingsError extends Error {}
const fields = ['accountId', 'bucket', 'project', 'siteOrigin', 'mediaOrigin', 'publicSlug'];
const secrets = ['accessKeyId', 'secretAccessKey', 'pagesToken', 'r2ManagementToken'];
const reservedSlugs = ['api', 'assets', 'media', 'css', 'js', 'images', 'fonts', 'vendor',
  'filmography', 'video-player', 'cloudflare', '_headers', '_redirects', '_worker', '_routes'];

function authorizedCloudflareSender(event, contents, origin) {
  if (event.sender !== contents || event.senderFrame !== contents.mainFrame) return false;
  try {
    const url = new URL(event.senderFrame.url);
    return url.origin === origin && url.pathname === '/cloudflare.html' && !url.username && !url.password;
  } catch { return false; }
}

function normalize(input, previous = {}, {allowMissingSlug = false} = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new SettingsError('연결 정보를 입력해 주세요.');
  const config = {};
  for (const key of [...fields, ...secrets]) {
    if (input[key] !== undefined && typeof input[key] !== 'string') throw new SettingsError('입력값을 확인해 주세요.');
    const value = (input[key] || '').trim();
    if (value.length > 512) throw new SettingsError('입력값이 너무 깁니다.');
    config[key] = value;
  }
  if (!/^[a-f0-9]{32}$/i.test(config.accountId)) throw new SettingsError('Account ID는 32자리 영문·숫자 값입니다.');
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.bucket)) throw new SettingsError('R2 버킷 이름을 확인해 주세요.');
  if (!/^[a-z0-9][a-z0-9-]{0,56}[a-z0-9]$|^[a-z0-9]$/.test(config.project)) throw new SettingsError('Pages 프로젝트 이름을 입력해 주세요. 주소 전체를 넣지 마세요.');
  if (!(allowMissingSlug && !config.publicSlug)) {
    if (!/^[a-z0-9_-]{3,30}$/.test(config.publicSlug)) throw new SettingsError('공개 주소 이름은 영문 소문자·숫자·하이픈(-)·언더바(_)로 3~30자 입력해 주세요.');
    if (reservedSlugs.includes(config.publicSlug)) throw new SettingsError('앱에서 사용하는 주소 이름입니다. 다른 이름을 입력해 주세요.');
  }
  for (const key of ['siteOrigin', 'mediaOrigin']) {
    try {
      const url = new URL(config[key]);
      if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash
          || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(url.hostname)) throw new Error();
      config[key] = url.origin;
    } catch { throw new SettingsError('공개 주소는 https://도메인 형식으로 입력해 주세요. 경로는 넣지 마세요.'); }
  }
  if (config.siteOrigin === config.mediaOrigin) throw new SettingsError('프로필 주소와 미디어 주소는 서로 달라야 합니다.');
  // Do not silently reuse another account's keys when changing the account.
  const sameAccount = previous.accountId === config.accountId;
  if (sameAccount) {
    if (!config.r2ManagementToken) config.r2ManagementToken = previous.r2ManagementToken || '';
    if (!config.pagesToken) config.pagesToken = previous.pagesToken;
    if (!config.accessKeyId) config.accessKeyId = previous.accessKeyId;
    if (!config.secretAccessKey && config.accessKeyId === previous.accessKeyId) config.secretAccessKey = previous.secretAccessKey;
  }
  for (const key of secrets) {
    if (key === 'r2ManagementToken' && !config[key]) continue;
    if (typeof config[key] !== 'string' || !/^[A-Za-z0-9_\-+/=]{20,512}$/.test(config[key])) {
      throw new SettingsError('R2 Access Key ID·Secret Access Key와 Pages API 토큰을 모두 확인해 주세요. 계정을 바꾸면 키를 다시 입력해야 합니다.');
    }
  }
  if(!config.r2ManagementToken)delete config.r2ManagementToken;
  return config;
}

function publicSettings(config) {
  return config ? {configured:true, ...Object.fromEntries(fields.map(key => [key, config[key]])),
    publicUrl:config.publicSlug ? `${config.siteOrigin}/${config.publicSlug}` : null, hasCredentials:true,
    hasR2ManagementToken:Boolean(config.r2ManagementToken)} : {configured:false};
}

function createConnectionStore({directory, encryption}) {
  const file = path.join(directory, 'cloudflare.enc');
  function available() {
    return encryption.isEncryptionAvailable() && encryption.getSelectedStorageBackend?.() !== 'basic_text';
  }
  function requireEncryption() {
    if (!available()) throw new SettingsError('이 PC의 보안 저장소를 사용할 수 없습니다. 운영체제 로그인·키체인 상태를 확인해 주세요.');
  }
  async function read() {
    let stat;
    try { stat = await fs.lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32 * 1024) throw new Error('Invalid settings file');
    requireEncryption();
    const record = JSON.parse(encryption.decryptString(await fs.readFile(file)));
    if (record.version !== 1) throw new Error('Unsupported settings');
    // Older settings contain valid keys but no address name. Load without rewriting them.
    return normalize(record.config, {}, {allowMissingSlug:record.config?.publicSlug === undefined});
  }
  async function write(config) {
    requireEncryption();
    const encrypted = encryption.encryptString(JSON.stringify({version:1, config}));
    await fs.mkdir(directory, {recursive:true, mode:0o700});
    if ((await fs.lstat(directory)).isSymbolicLink()) throw new Error('Invalid settings directory');
    const temporary = path.join(directory, randomUUID()+'.partial');
    let created = false;
    try {
      const handle = await fs.open(temporary, 'wx', 0o600); created = true;
      try { await handle.writeFile(encrypted); await handle.sync(); } finally { await handle.close(); }
      await fs.rename(temporary, file);
    } finally { if (created) await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  return {available, read, write, async clear() { await fs.unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; }); }};
}

function createConnectionActions({store, check}) {
  let busy = false, disposed = false;
  let controller;
  return {
    get busy() { return busy; },
    async run(action, input) {
      if (disposed || busy) return {status:'error', message:'다른 연결 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.'};
      busy = true;
      try {
        if (action === 'clear') { await store.clear(); return {status:'cleared', configured:false, encryptionAvailable:store.available()}; }
        if (!['load', 'save', 'check'].includes(action)) throw new SettingsError('지원하지 않는 작업입니다.');
        const previous = await store.read();
        if (action === 'load') return {status:'loaded', ...publicSettings(previous), encryptionAvailable:store.available(), reservedSlugs:[...reservedSlugs]};
        if (action === 'save') {
          const config = normalize(input, previous || {});
          await store.write(config);
          return {status:'saved', ...publicSettings(config)};
        }
        if (!previous) throw new SettingsError('연결 정보를 먼저 저장해 주세요.');
        controller = new AbortController();
        const timeout = setTimeout(() => controller?.abort(), 20000); timeout.unref?.();
        try {
          const checks = await check(previous, controller.signal);
          return {status:'checked', checks};
        } finally { clearTimeout(timeout); controller = undefined; }
      } catch (error) {
        return {status:'error', message:error instanceof SettingsError ? error.message : '연결 설정을 처리하지 못했습니다. 보안 저장소·파일 권한을 확인해 주세요. 저장된 키를 읽을 수 없다면 이 PC의 연결 설정을 삭제하고 다시 입력해 주세요.'};
      } finally { busy = false; }
    },
    dispose() { disposed = true; controller?.abort(); },
  };
}
module.exports = {authorizedCloudflareSender, normalize, publicSettings, createConnectionStore, createConnectionActions};

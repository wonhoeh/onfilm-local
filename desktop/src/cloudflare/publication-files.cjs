const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {validId} = require('../export-actions.cjs');

class PublishError extends Error {}
const sha256 = value => createHash('sha256').update(value).digest('hex');
const mime = name => ({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png',
  '.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp',
  '.m3u8':'application/vnd.apple.mpegurl','.ts':'video/mp2t','.woff2':'font/woff2'}[path.extname(name)] || 'text/plain; charset=utf-8');
const safeName = name => typeof name === 'string' && name.length < 240 &&
  name.split('/').every(part => /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(part) && !part.includes('..'));
const allowed = name => /^(index\.html|filmography\.html|video-player\.html|portfolio\.json|public-profile\.js|public-filmography\.js|public-film-card\.js|public\.css|video-player\.js|timeline-preview\.js|film-preview\.js)$/.test(name)
  || /^(css|images|icons|fonts|vendor)\//.test(name) && /\.(css|png|svg|jpg|jpeg|webp|woff2|js)$|\/LICENSE$|\/[^/]+-LICENSE\.txt$/.test(name)
  || /^media\/((?:portrait|photo-[0-9]+|film-[0-9]+)\.(?:png|jpg)|film-[0-9]+(?:-trailer)?\/(index\.m3u8|segment-[0-9]{5,10}\.ts))$/.test(name);

async function regularFile(root, name, maxBytes) {
  if (!safeName(name)) throw new PublishError('공개본 파일 경로가 올바르지 않습니다. 새 공개본을 만들어 주세요.');
  const file = path.join(root, ...name.split('/'));
  if (await fs.realpath(file) !== file) throw new PublishError('링크된 파일은 게시할 수 없습니다.');
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) throw new PublishError('공개본 파일 형식 또는 크기를 확인해 주세요.');
  return {file, stat};
}

async function readEntry(site, entry) {
  const {file, stat} = await regularFile(site, entry.path, entry.media ? 256*1024*1024 : 25*1024*1024);
  if (stat.size !== entry.bytes) throw new PublishError('공개본 파일이 변경됐습니다. 새 공개본을 만들어 주세요.');
  const data = await fs.readFile(file);
  if (sha256(data) !== entry.hash) throw new PublishError('공개본 파일이 변경됐습니다. 새 공개본을 만들어 주세요.');
  return data;
}

async function preparePublication(dataDir, id, config, signal) {
  if (!validId(id)) throw new PublishError('완료된 공개본을 선택해 주세요.');
  const base = await fs.realpath(dataDir), root = path.join(base,'exports'), folder = path.join(root,id), site = path.join(folder,'site');
  for (const dir of [root,folder,site]) {
    if (await fs.realpath(dir) !== dir || !(await fs.lstat(dir)).isDirectory()) throw new PublishError('공개본 폴더를 확인해 주세요.');
  }
  const {file} = await regularFile(folder, 'result.json', 8*1024*1024);
  const record = JSON.parse(await fs.readFile(file,'utf8'));
  if (record.id !== id || !Array.isArray(record.files) || record.files.length > 100000) throw new PublishError('공개본 완료 기록을 확인해 주세요.');
  const entries = [], names = new Set();let staticBytes=0,staticCount=0;
  for (const item of record.files) {
    signal.throwIfAborted();
    if (!safeName(item.path) || !allowed(item.path) || names.has(item.path) || !Number.isSafeInteger(item.bytes) || item.bytes < 0) throw new PublishError('공개용 파일이 아닌 항목이 포함되어 있습니다. 새 공개본을 만들어 주세요.');
    names.add(item.path);
    const media = item.path.startsWith('media/');
    if(!media && (++staticCount>19999 || (staticBytes+=item.bytes)>64*1024*1024))throw new PublishError('공개 화면 파일이 너무 많거나 큽니다. 새 공개본을 만들어 주세요.');
    const {file: source, stat} = await regularFile(site,item.path,media ? 256*1024*1024 : 25*1024*1024);
    if (stat.size !== item.bytes) throw new PublishError('공개본 파일 크기가 변경됐습니다. 새 공개본을 만들어 주세요.');
    // One file at a time: do not load an entire portfolio's videos into memory.
    const data = await fs.readFile(source);
    const entry = {path:item.path, bytes:item.bytes, hash:sha256(data), media, contentType:mime(item.path)};
    if (!media) entry.data = data;
    if (item.path.endsWith('.m3u8')) {
      const lines = data.toString('utf8').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
      if (!lines.includes('#EXT-X-ENDLIST') || lines.some(line=>line.startsWith('#') ? /URI\s*=/i.test(line) : !/^segment-[0-9]{5,10}\.ts$/.test(line))) throw new PublishError('공개본 영상 파일을 확인해 주세요.');
      entry.segments = lines.filter(line=>!line.startsWith('#')).map(line=>path.posix.dirname(item.path)+'/'+line);
    }
    entries.push(entry);
  }
  for (const required of ['index.html','portfolio.json','public-profile.js','video-player.html','video-player.js']) if (!names.has(required)) throw new PublishError('필수 공개본 파일이 없습니다. 새 공개본을 만들어 주세요.');
  for (const entry of entries) if (entry.segments?.some(segment=>!names.has(segment))) throw new PublishError('영상 조각 파일이 누락됐습니다. 새 공개본을 만들어 주세요.');
  const portfolio = JSON.parse(entries.find(entry=>entry.path==='portfolio.json').data.toString('utf8'));
  const references = [portfolio.profile?.portrait, ...(portfolio.photos||[]), ...(portfolio.films||[]).flatMap(film=>[film.thumbnail,film.manifestUrl,film.trailerUrl])].filter(Boolean);
  if (references.some(ref=> !names.has(ref))) throw new PublishError('공개본에서 사용하는 사진·영상이 누락됐습니다.');
  entries.sort((a,b)=>a.path.localeCompare(b.path,'en'));
  const media = entries.filter(entry=>entry.media), assets = entries.filter(entry=>!entry.media);
  // Content-addressed immutable release: retries and profile-only edits reuse the same R2 objects.
  const mediaDigest = sha256(JSON.stringify(media.map(entry=>[entry.path,entry.hash])));
  const prefix = 'onfilm/v1/'+mediaDigest;
  const slug = config.publicSlug;
  const redirects = `/${slug}/media/* ${config.mediaOrigin}/${prefix}/media/:splat 302\n/ /${slug}/ 302\n/${slug} /${slug}/ 302\n`;
  const headers = '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Cache-Control: no-cache\n';
  const files = assets.map(entry=>({name:`/${slug}/${entry.path}`,data:entry.data,contentType:entry.contentType}));
  files.push({name:'/404.html',data:Buffer.from('<!doctype html><html lang="ko"><meta charset="utf-8"><title>페이지 없음</title><h1>페이지를 찾을 수 없습니다.</h1></html>'),contentType:mime('404.html')});
  const release = sha256(JSON.stringify([config.accountId,config.project,config.bucket,config.siteOrigin,config.mediaOrigin,slug,entries.map(entry=>[entry.path,entry.hash])]));
  return {site,id,media,files,prefix,release,redirects,headers,bytes:media.reduce((sum,item)=>sum+item.bytes,0),url:`${config.siteOrigin}/${slug}/`};
}

module.exports = {preparePublication,readEntry,PublishError,sha256,mime};

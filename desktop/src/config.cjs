const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');

function configuration(dataDir, options = {}) {
  const runtime=options.packaged ? require('./bundled-runtime.cjs').bundledRuntime(options.resourcesPath,options.platform,options.arch) : options;
  if (!path.isAbsolute(dataDir) || /[;\r\n]/.test(dataDir)) throw new Error('데이터 폴더는 세미콜론·줄바꿈 없는 절대 경로여야 합니다.');
  if(fs.existsSync(require('./backup-store.cjs').journalPath(dataDir)))throw new Error('중단된 복원이 있습니다. 데이터 보호를 위해 자동 시작을 중단했습니다. 데이터 폴더 옆 .restore-pending.json과 onfilm-before-restore 폴더를 보존하고 복구를 요청해 주세요.');
  const port = Number(options.port || 18765);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('포트는 1024~65535 사이 정수여야 합니다.');
  const jar = runtime.jar || path.resolve(__dirname, '../../backend/build/libs/onfilm-local.jar');
  if (!fs.statSync(jar, {throwIfNoEntry:false})?.isFile()) throw new Error('API 파일이 없습니다. backend에서 ./gradlew bootJar를 실행해 주세요.');
  fs.mkdirSync(dataDir, {recursive:true, mode:0o700});
  // Do not inherit DB_URL, SPRING_*, JAVA_TOOL_OPTIONS, or old service secrets.
  const env = {};
  for (const key of ['PATH','HOME','USERPROFILE','SystemRoot','WINDIR','TEMP','TMP','TMPDIR','LANG']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  Object.assign(env, { ONFILM_DATA_DIR:dataDir, ONFILM_PORT:String(port),
    ONFILM_TOKEN:randomBytes(32).toString('hex'), ONFILM_INSTANCE_ID:randomUUID() });
  for(const [key,option] of [['ONFILM_FFMPEG','ffmpeg'],['ONFILM_FFPROBE','ffprobe']]) {
    const executable=runtime[option] || (!options.packaged && process.env[key]);
    if(executable) env[key]=executable;
  }
  return { origin:`http://127.0.0.1:${port}`, command:runtime.java || 'java',
    args:['-jar',jar], cwd:dataDir, env };
}
module.exports = {configuration};

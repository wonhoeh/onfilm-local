const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { BrowserWindow, ipcMain, dialog, shell, safeStorage } = require('electron');
const {createConnectionStore,createConnectionActions,authorizedCloudflareSender} = require('./cloudflare/connection.cjs');
const {createConnectionChecker} = require('./cloudflare/check.cjs');
const {createPublicationActions} = require('./cloudflare/publication.cjs');
const {createExportActions,authorizedExportSender} = require('./export-actions.cjs');
const {createBackupActions,authorizedBackupSender}=require('./backup-actions.cjs');
const { isAppUrl, isPlayerFullscreen } = require('./policy.cjs');

const statusFile = path.join(__dirname, 'status.html');
const statusUrl = pathToFileURL(statusFile).href;

function createWindow({ origin, backend, token, dataDir, show = true, timeoutMs = 15000, partition = 'onfilm-local',
  connectionEncryption = safeStorage, connectionCheck = createConnectionChecker(), publicationOptions = {} }) {
  const win = new BrowserWindow({
    width: 1280, height: 900, minWidth: 900, minHeight: 640,
    title: 'OnFilm Local', backgroundColor: '#15161b', show,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      webSecurity: true, webviewTag: false, partition,
      // Only our protected local renderer can navigate here. Start selected videos with sound.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  const contents = win.webContents;
  // Kept beside dataDir so profile exports and portable data backups never contain credentials.
  const connectionStore=createConnectionStore({directory:dataDir+'.connections', encryption:connectionEncryption});
  const cloudflare = createConnectionActions({
    store:connectionStore,
    check:connectionCheck,
  });
  ipcMain.handle('onfilm:cloudflare', (event, action, input) =>
    authorizedCloudflareSender(event, contents, origin) ? (publisher.busy ? {status:'error',message:'게시 작업이 끝난 뒤 연결 설정을 변경해 주세요.'} : cloudflare.run(action, input))
      : {status:'error', message:'Cloudflare 연결 화면에서만 사용할 수 있습니다.'});
  const backups=createBackupActions({dataDir,backend,
    ensureIdle:async()=>{
      const response=await fetch(origin+'/api/encoding',{headers:{'X-Onfilm-Token':token},signal:AbortSignal.timeout(5000),redirect:'error'});
      if(!response.ok)throw new Error('영상 작업 상태를 확인하지 못했습니다.');
      const jobs=await response.json();if(jobs.some(job=>['RUNNING','QUEUED'].includes(job.status)))throw new Error('영상 인코딩과 대기 작업이 모두 끝난 뒤 백업·복원해 주세요.');
    },
    chooseFolder:action=>dialog.showOpenDialog(win,{title:action==='create'?'백업을 저장할 폴더 선택':'OnFilm 백업 폴더 선택',properties:['openDirectory','createDirectory']}),
    confirmRestore:async()=>{const result=await dialog.showMessageBox(win,{type:'warning',title:'백업 복원',message:'직접 만든 신뢰할 수 있는 OnFilm 백업인가요? 현재 편집 데이터를 백업 시점으로 교체합니다.',detail:'기존 데이터는 별도 폴더에 보관합니다. 복원 중 앱을 종료하지 마세요.',buttons:['취소','복원'],defaultId:0,cancelId:0});return result.response===1;},
  });
  ipcMain.handle('onfilm:backup',(event,action)=>authorizedBackupSender(event,contents,origin)?(publisher.busy ? {status:'error',message:'게시 작업이 끝난 뒤 백업·복원해 주세요.'}:backups.run(action)):{status:'error',message:'백업 화면에서만 실행할 수 있습니다.'});
  win.on('close',event=>{if(backups.busy || cloudflare.busy || publisher.busy)event.preventDefault();});
  const exports=createExportActions({dataDir,origin,token,
    chooseDestination:defaultPath=>dialog.showSaveDialog(win,{title:'공개본 ZIP 저장',defaultPath,filters:[{name:'ZIP 압축 파일',extensions:['zip']}],properties:['createDirectory','showOverwriteConfirmation']}),
    openDirectory:directory=>shell.openPath(directory),
    confirmTrash:async({id,bytes})=>{const result=await dialog.showMessageBox(win,{type:'warning',title:'공개본 정리',message:'선택한 공개본을 휴지통으로 이동할까요?',detail:id+' · '+(bytes/1024/1024).toFixed(2)+' MB\n이 공개본과 앱 내부 ZIP 캐시만 이동합니다. DB·원본 영상·외부에 저장한 ZIP·백업·게시된 사이트는 변경하지 않습니다. 휴지통을 비우기 전까지 OS에서 복구할 수 있습니다.',buttons:['취소','휴지통으로 이동'],defaultId:0,cancelId:0});return result.response===1;},
    trashDirectory:directory=>shell.trashItem(directory),
  });
  const publisher=createPublicationActions({dataDir,store:connectionStore,
    confirm:async({url,project,bytes})=>{
      const result=await dialog.showMessageBox(win,{type:'question',title:'온라인 게시',
        message:'선택한 공개본을 온라인에 게시할까요?',
        detail:`${url}\nPages 프로젝트: ${project}\n사진·영상: ${(bytes/1024/1024).toFixed(2)} MB\n\n이 프로젝트의 기존 사이트 전체가 선택한 공개본으로 교체됩니다. 공개 주소 이름을 바꾸면 이전 경로는 사라집니다. 프로필·사진·작품·이메일이 공개되며 R2 이용량에 따라 비용이 발생할 수 있습니다. 이전 R2 파일은 자동 삭제하지 않습니다.`,
        buttons:['취소','게시'],defaultId:0,cancelId:0});return result.response===1;
    },...publicationOptions});
  ipcMain.handle('onfilm:publish',async(event,action,id)=>{
    if(!authorizedExportSender(event,contents,origin))return {status:'error',message:'공개본 관리 화면에서만 사용할 수 있습니다.'};
    if(action==='status')return publisher.status();
    if(action==='cancel')return publisher.cancel();
    if(action!=='publish')return {status:'error',message:'지원하지 않는 작업입니다.'};
    if(backups.busy||cloudflare.busy||exports.busy)return {status:'error',message:'다른 파일·연결 작업이 끝난 뒤 게시해 주세요.'};
    return publisher.publish(id);
  });
  for(const [channel,action] of [['onfilm:export-save','save'],['onfilm:export-open','open'],['onfilm:export-usage','usage'],['onfilm:export-trash','trash']]) {
    ipcMain.handle(channel,(event,id)=>authorizedExportSender(event,contents,origin)
      ? (publisher.busy ? {status:'error',message:'게시 작업이 끝난 뒤 파일을 관리해 주세요.'} : exports[action](id)) : {status:'error',message:'공개본 관리 화면에서만 사용할 수 있습니다.'});
  }
  const appSession = contents.session;
  // Token lives only in the main process; renderer cannot read it through a bridge.
  contents.session.webRequest.onBeforeSendHeaders({urls:[`${origin}/*`]}, (details, callback) => {
    if (details.webContentsId !== contents.id || !isAppUrl(details.url, origin)) return callback({cancel:true});
    callback({requestHeaders:{...details.requestHeaders, 'X-Onfilm-Token':token}});
  });
  contents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {type:'question', buttons:['계속 편집','변경 버리기'],
      defaultId:0, cancelId:0, message:'저장하지 않은 변경을 버릴까요?'});
    if (choice === 1) event.preventDefault();
  });
  contents.session.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(wc === contents && isPlayerFullscreen(permission, details.requestingUrl, details.isMainFrame, origin));
  });
  contents.session.setPermissionCheckHandler((wc, permission, requestingOrigin, details) =>
    wc === contents && isAppUrl(requestingOrigin, origin)
      && isPlayerFullscreen(permission, details.requestingUrl, details.isMainFrame, origin));
  // External navigation remains blocked; the export bridge opens only a validated local directory.
  contents.setWindowOpenHandler(({ url }) => {
    if (!backups.busy&&isAppUrl(url, origin)) void contents.loadURL(url).catch(() => {});
    return { action: 'deny' };
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
  for (const eventName of ['will-navigate', 'will-redirect']) {
    contents.on(eventName, (event, url) => {
      if (backups.busy || !isAppUrl(url, origin)) event.preventDefault();
    });
  }
  contents.on('will-frame-navigate', (event) => {
    if (!isAppUrl(event.url, origin)) event.preventDefault();
  });

  let timer;
  let attempting = false;
  let errorVisible = false;
  const clearTimer = () => { clearTimeout(timer); timer = undefined; };

  async function status(state, message = '') {
    if (win.isDestroyed()) return;
    try {
      await win.loadFile(statusFile, { query: { state, server: origin, mode: backend ? 'managed' : 'external', message } });
    } catch (error) {
      if (!win.isDestroyed() && error.code !== 'ERR_ABORTED' && error.errno !== -3) {
        console.error('Status page failed:', error.message);
      }
    }
  }

  async function fail(error) {
    if (backups.busy || win.isDestroyed() || errorVisible) return;
    errorVisible = true;
    attempting = false;
    clearTimer();
    contents.stop();
    await status('error', error?.message || '');
  }

  async function connect() {
    if (win.isDestroyed() || attempting) return;
    attempting = true;
    errorVisible = false;
    await status('loading');
    if (win.isDestroyed()) return;
    try {
      // The backend enforces its own startup timeout and shares concurrent starts.
      if (backend) await backend.start();
      if (win.isDestroyed()) return;
      timer = setTimeout(() => void fail(), timeoutMs);
      await win.loadURL(`${origin}/`);
      clearTimer();
      attempting = false;
    } catch (error) {
      await fail(backend ? error : undefined);
    }
  }

  contents.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && isAppUrl(url, origin)) void fail();
  });
  contents.on('did-navigate', (_event, url, responseCode) => {
    if (isAppUrl(url, origin) && responseCode >= 400) void fail();
  });
  contents.on('render-process-gone', () => void fail());

  const retry = (event) => {
    if(backups.busy)return;
    if (win.isDestroyed() || event.sender !== contents
        || event.senderFrame !== contents.mainFrame) return;
    const frameUrl = event.senderFrame?.url;
    if (frameUrl && frameUrl.split('?')[0] === statusUrl) void connect();
  };
  ipcMain.on('onfilm:retry', retry);
  const backendFailed = (error) => { if(!backups.busy)void fail(error); };
  backend?.on('failed', backendFailed);
  win.on('closed', () => {
    publisher.dispose();ipcMain.removeHandler('onfilm:publish');
    cloudflare.dispose();
    ipcMain.removeHandler('onfilm:cloudflare');
    ipcMain.removeHandler('onfilm:backup');
    exports.dispose();
    ipcMain.removeHandler('onfilm:export-save');ipcMain.removeHandler('onfilm:export-open');
    ipcMain.removeHandler('onfilm:export-usage');ipcMain.removeHandler('onfilm:export-trash');
    clearTimer();
    appSession.webRequest.onBeforeSendHeaders(null);
    ipcMain.removeListener('onfilm:retry', retry);
    backend?.removeListener('failed', backendFailed);
  });
  void connect();
  return win;
}

module.exports = { createWindow };

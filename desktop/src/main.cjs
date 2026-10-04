const {app, dialog} = require('electron');
const path = require('node:path');
const {configuration} = require('./config.cjs');
const {ApiProcess} = require('./api-process.cjs');
const {createWindow} = require('./window.cjs');

app.setName('OnFilm Local');
let window;
let backend;
let stopping = false;
let exitReady = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (window && !window.isDestroyed()) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
  });
  app.whenReady().then(() => {
    const config = configuration(process.env.ONFILM_LOCAL_DATA_DIR || path.join(app.getPath('userData'), 'data'),
      {java:process.env.ONFILM_JAVA_PATH, port:process.env.ONFILM_LOCAL_PORT,
        packaged:app.isPackaged,resourcesPath:process.resourcesPath});
    backend = new ApiProcess(config);
    window = createWindow({origin:config.origin, backend, token:config.env.ONFILM_TOKEN, dataDir:config.env.ONFILM_DATA_DIR, partition:'onfilm-local'});
  }).catch((error) => { dialog.showErrorBox('OnFilm Local 시작 실패',error.message); app.quit(); });
  app.on('window-all-closed', () => app.quit());
  // Stop after windows have accepted closing, so cancelling unsaved-edit confirmation keeps API alive.
  app.on('will-quit', (event) => {
    if (!backend || exitReady) return;
    event.preventDefault();
    if (stopping) return;
    stopping = true;
    void backend.stop().finally(() => { exitReady = true; app.quit(); });
  });
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => app.quit());
}

const { contextBridge, ipcRenderer } = require('electron');
if(window.location.protocol==='http:'&&window.location.hostname==='127.0.0.1'&&window.location.pathname==='/backup.html'){
  contextBridge.exposeInMainWorld('onfilmBackup',{create:()=>ipcRenderer.invoke('onfilm:backup','create'),restore:()=>ipcRenderer.invoke('onfilm:backup','restore')});
}

// Status-page retry and export-page actions are scoped separately; main verifies the sender.
if (window.location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('onfilmDesktop', {
    retry: () => ipcRenderer.send('onfilm:retry'),
  });
}
if (window.location.protocol === 'http:' && window.location.hostname === '127.0.0.1' && window.location.pathname === '/export.html') {
  contextBridge.exposeInMainWorld('onfilmExports', {
    saveZip: id => ipcRenderer.invoke('onfilm:export-save',id),
    openFolder: id => ipcRenderer.invoke('onfilm:export-open',id),
    storageUsage: () => ipcRenderer.invoke('onfilm:export-usage'),
    trash: id => ipcRenderer.invoke('onfilm:export-trash',id),
  });
}

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pulseLogin', {
  login: (username, password) => ipcRenderer.invoke('pulse:login', username, password),
  quit: () => ipcRenderer.send('pulse:quit-from-login'),
})

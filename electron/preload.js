/* Preload: exposes the smallest possible bridge to the app page.
   No Node APIs leak into the page; just a flag and one sender. */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("LQ", {
  isElectron: true,
  openPlayer: (url) => ipcRenderer.send("open-player", String(url || "")),
  openMeet: (url) => ipcRenderer.send("open-meet", String(url || "")),
  openTimer: () => ipcRenderer.send("open-timer"),
  tickSend: (data) => ipcRenderer.send("timer-tick", data || {}),
  onTick: (cb) => ipcRenderer.on("timer-tick", (_e, data) => cb(data))
});

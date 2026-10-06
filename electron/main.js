/* LifeQuest desktop shell (Electron). Free, offline-first:
   the app and results pages load from local files, all data
   stays in the app's own storage on this machine. */
const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");

let appWin = null;
let resultsWin = null;

function openAppWindow() {
  if (appWin && !appWin.isDestroyed()) { appWin.focus(); return; }
  appWin = new BrowserWindow({
    width: 1320,
    height: 900,
    title: "LifeQuest",
    autoHideMenuBar: false
  });
  appWin.loadFile(path.join(__dirname, "..", "lifequest-app", "index.html"));
  appWin.on("closed", () => { appWin = null; });
}

function openResultsWindow() {
  if (resultsWin && !resultsWin.isDestroyed()) { resultsWin.focus(); return; }
  resultsWin = new BrowserWindow({
    width: 1180,
    height: 900,
    title: "LifeQuest — Progress Report",
    autoHideMenuBar: false
  });
  resultsWin.loadFile(path.join(__dirname, "..", "results", "index.html"));
  resultsWin.on("closed", () => { resultsWin = null; });
}

app.whenReady().then(() => {
  const menu = Menu.buildFromTemplate([
    {
      label: "LifeQuest",
      submenu: [
        { label: "Open App", click: openAppWindow },
        { label: "Open Progress Report", click: openResultsWindow },
        { type: "separator" },
        { role: "reload" },
        { role: "quit" }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);
  openAppWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) openAppWindow();
});

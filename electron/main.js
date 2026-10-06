/* LifeQuest desktop shell (Electron). Free, offline-first:
   the app and results pages load from local files, all data
   stays in the app's own storage on this machine. */
const { app, BrowserWindow, Menu, ipcMain, session } = require("electron");
const path = require("path");

let appWin = null;
let resultsWin = null;
let playerWin = null;
let meetWin = null;

function openAppWindow() {
  if (appWin && !appWin.isDestroyed()) { appWin.focus(); return; }
  appWin = new BrowserWindow({
    width: 1320,
    height: 900,
    title: "LifeQuest",
    autoHideMenuBar: false,
    webPreferences: { preload: path.join(__dirname, "preload.js") }
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

/* System overlay player: small, resizable, always on top of every app. */
function playerTarget() {
  return path.join(__dirname, "..", "lifequest-app", "music.html");
}

function openPlayerWindow(url) {
  const hash = "u=" + encodeURIComponent(url || "");
  if (playerWin && !playerWin.isDestroyed()) {
    playerWin.loadFile(playerTarget(), { hash });
    playerWin.focus();
    return;
  }
  playerWin = new BrowserWindow({
    width: 400,
    height: 330,
    title: "Focus tunes",
    alwaysOnTop: true,
    autoHideMenuBar: true
  });
  playerWin.setMenu(null);
  playerWin.loadFile(playerTarget(), { hash: "u=" + encodeURIComponent(url || "") });
  playerWin.on("closed", () => { playerWin = null; });
}

/* Meet overlay: the live call in a small always-on-top window.
   Meet blocks iframes, so this loads the real call page (camera/mic
   granted below). Log in with Google once; it persists in the app. */
function openMeetWindow(url) {
  if (!/^https:\/\/meet\.google\.com\//.test(url || "")) return;
  if (meetWin && !meetWin.isDestroyed()) {
    meetWin.loadURL(url);
    meetWin.focus();
    return;
  }
  meetWin = new BrowserWindow({
    width: 520,
    height: 400,
    title: "Study Meet",
    alwaysOnTop: true,
    autoHideMenuBar: true
  });
  meetWin.setMenu(null);
  meetWin.loadURL(url);
  meetWin.on("closed", () => { meetWin = null; });
}

app.whenReady().then(() => {
  ipcMain.on("open-player", (_e, url) => openPlayerWindow(url));
  ipcMain.on("open-meet", (_e, url) => openMeetWindow(url));
  // camera/mic for Meet (and nothing else gets a free pass)
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (permission === "media" && details && details.requestingUrl &&
        details.requestingUrl.startsWith("https://meet.google.com/")) {
      callback(true);
    } else if (permission === "notifications") {
      callback(true);
    } else {
      callback(false);
    }
  });
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
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "togglefullscreen" },
        { type: "separator" },
        { role: "zoomIn", label: "Bigger interface" },
        { role: "zoomOut", label: "Smaller interface" },
        { role: "resetZoom", label: "Actual size" }
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

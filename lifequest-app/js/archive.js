/* ============================================================
   LifeQuest archive — one file per day + one final file
   - Folder mode (Chromium): showDirectoryPicker -> writes
     lifequest-YYYY-MM-DD.json (day snapshot) and
     lifequest-final.json (full state, updated daily/on change)
   - Fallback everywhere: localStorage snapshot
     lifequest_daily_YYYY-MM-DD + one-click downloads.
   ============================================================ */
"use strict";

const Archive = {
  dirHandle: null,
  _saveT: null,
  SUBDIR: "lifequest-data",
  DB: "lifequest-archive",
  /* Everyday JSON lives in a folder named lifequest-data,
     created inside the directory the user picks. */

  dayKey(date) {
    try { return localISO(date); } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  },

  dayFileName(date) { return `lifequest-${this.dayKey(date)}.json`; },
  finalFileName() { return "lifequest-final.json"; },
  dailyStorageKey(date) { return `lifequest_daily_${this.dayKey(date)}`; },

  buildDaySnapshot(currentState, date) {
    const s = currentState || (typeof state !== "undefined" ? state : null);
    const key = this.dayKey(date);
    const daySessions = (s.sessions || []).filter((x) => {
      try { return localISO(new Date(x.endedAt)) === key; } catch (e) { return false; }
    });
    const dayTasks = (s.tasks || []).filter((t) => {
      try {
        return (t.completedAt && localISO(new Date(t.completedAt)) === key) ||
          (t.createdAt && localISO(new Date(t.createdAt)) === key);
      } catch (e) { return false; }
    });
    return {
      app: "LifeQuest",
      kind: "day",
      date: key,
      sessions: daySessions,
      tasksDone: dayTasks.filter((t) => t.done),
      coinsEarned: daySessions.reduce((sum, x) => sum + (x.coins || 0), 0),
      focusSec: daySessions.reduce((sum, x) => sum + (x.durationSec || 0), 0),
      streak: (s.profile && s.profile.streak) || null,
      exportedAt: new Date().toISOString()
    };
  },

  /* Always-safe fallback: one localStorage snapshot per day. */
  snapshotLocal(currentState) {
    try {
      const snap = this.buildDaySnapshot(currentState);
      localStorage.setItem(this.dailyStorageKey(), JSON.stringify(snap));
      // The final file's local mirror is the main key itself
      // (lifequest_v2), already written by saveState().
      return snap;
    } catch (e) { return null; }
  },

  /* Called from saveState() on every change. Debounced folder write. */
  afterChange(currentState) {
    this.snapshotLocal(currentState);
    if (!this.dirHandle) return;
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => { this.writeFolder(currentState); }, 1500);
  },

  async pickFolder() {
    if (!window.showDirectoryPicker) {
      throw new Error("Folder picker not supported here. Use the download buttons instead.");
    }
    const picked = await window.showDirectoryPicker({ mode: "readwrite" });
    // everyday files live in a folder created in that directory
    this.dirHandle = await picked.getDirectoryHandle(this.SUBDIR, { create: true });
    await this.rememberHandle(this.dirHandle);
    return this.dirHandle;
  },

  async writeFile(handle, name, text) {
    const fh = await handle.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(text);
    await w.close();
  },

  async writeFolder(currentState) {
    if (!this.dirHandle) throw new Error("No folder chosen yet");
    const s = currentState || (typeof state !== "undefined" ? state : null);
    const day = this.buildDaySnapshot(s);
    await this.writeFile(this.dirHandle, this.dayFileName(), JSON.stringify(day, null, 2));
    await this.writeFile(this.dirHandle, this.finalFileName(), JSON.stringify(s, null, 2));
    return { day: this.dayFileName(), final: this.finalFileName() };
  },

  async saveNow() {
    const s = (typeof state !== "undefined") ? state : null;
    this.snapshotLocal(s);
    if (this.dirHandle) {
      return await this.writeFolder(s);
    }
    // No folder: fall back to downloads so the user still gets files.
    this.downloadDay();
    this.downloadFinal();
    return { day: this.dayFileName(), final: this.finalFileName(), via: "downloads" };
  },

  download(name, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
  },

  downloadDay() {
    this.download(this.dayFileName(), this.buildDaySnapshot());
  },

  downloadFinal() {
    const s = (typeof state !== "undefined") ? state : null;
    this.download(this.finalFileName(), s);
  },

  status(text) {
    const el = document.getElementById("dailyStatus");
    if (el) el.textContent = text;
  },

  /* Remember the folder across restarts (handle kept in IndexedDB,
     file contents stay on disk, nothing uploaded anywhere). */
  rememberHandle(handle) {
    return new Promise((resolve) => {
      try {
        if (!window.indexedDB) return resolve(false);
        const req = window.indexedDB.open(this.DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore("handles");
        req.onsuccess = () => {
          try {
            const tx = req.result.transaction("handles", "readwrite");
            tx.objectStore("handles").put(handle, "dir");
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
          } catch (e) { resolve(false); }
        };
        req.onerror = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  },

  loadRememberedHandle() {
    return new Promise((resolve) => {
      try {
        if (!window.indexedDB) return resolve(null);
        const req = window.indexedDB.open(this.DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore("handles");
        req.onsuccess = () => {
          try {
            const tx = req.result.transaction("handles", "readonly");
            const get = tx.objectStore("handles").get("dir");
            get.onsuccess = () => resolve(get.result || null);
            get.onerror = () => resolve(null);
          } catch (e) { resolve(null); }
        };
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  },

  /* Reconnect the remembered folder on boot when the browser still
     allows it, so everyday files keep saving with zero clicks. */
  async boot() {
    try {
      const handle = await this.loadRememberedHandle();
      if (!handle || !handle.queryPermission) return false;
      const perm = await handle.queryPermission({ mode: "readwrite" });
      if (perm !== "granted") {
        this.status("Daily folder remembered. Hit Save day + final once to re-allow it.");
        return false;
      }
      this.dirHandle = handle;
      this.status(`Auto-saving into ${this.SUBDIR}/ every day.`);
      return true;
    } catch (e) { return false; }
  }
};

window.Archive = Archive;

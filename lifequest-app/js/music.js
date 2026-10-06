/* ============================================================
   LifeQuest music — YouTube focus tunes (free, no API key)
   Uses the YT IFrame Player API; supports video + playlist links.
   ============================================================ */
"use strict";

const Music = {
  player: null,
  ready: false,
  apiLoading: false,

  ensureApi() {
    if (window.YT && window.YT.Player) return Promise.resolve(true);
    if (this.apiLoading) {
      return new Promise((resolve) => {
        const t = setInterval(() => {
          if (window.YT && window.YT.Player) { clearInterval(t); resolve(true); }
        }, 200);
        setTimeout(() => { clearInterval(t); resolve(!!(window.YT && window.YT.Player)); }, 8000);
      });
    }
    this.apiLoading = true;
    return new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prev === "function") prev();
        resolve(true);
      };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
      setTimeout(() => resolve(!!(window.YT && window.YT.Player)), 9000);
    });
  },

  parse(url) {
    const raw = (url || "").trim();
    if (!raw) return null;
    // bare id
    if (/^[\w-]{11}$/.test(raw)) return { videoId: raw };
    try {
      const u = new URL(raw);
      const host = u.hostname.replace(/^www\./, "");
      if (host === "youtu.be") {
        const id = u.pathname.slice(1).split("/")[0];
        if (id) return { videoId: id };
      }
      if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
        const list = u.searchParams.get("list");
        const v = u.searchParams.get("v");
        if (u.pathname === "/watch" && v) return list ? { videoId: v, listId: list } : { videoId: v };
        if (u.pathname.startsWith("/playlist") && list) return { listId: list };
        if (u.pathname.startsWith("/shorts/")) {
          const id = u.pathname.split("/")[2];
          if (id) return { videoId: id };
        }
        if (list) return { listId: list };
      }
    } catch (e) { /* not a URL */ }
    return null;
  },

  async load(url) {
    const parsed = this.parse(url);
    if (!parsed) {
      if (window.UI) UI.toast("That does not look like a YouTube link");
      return false;
    }
    const ok = await this.ensureApi();
    if (!ok) {
      if (window.UI) UI.toast("Could not load YouTube player (offline?)");
      return false;
    }

    const dock = document.getElementById("musicDock");
    const frame = document.getElementById("musicFrame");
    dock.hidden = false;
    frame.innerHTML = '<div id="ytPlayer"></div>';

    const vars = {
      rel: 0, modestbranding: 1,
      origin: location.origin && location.origin !== "null" ? location.origin : undefined
    };

    const mount = () => new Promise((resolve) => {
      this.player = new YT.Player("ytPlayer", {
        height: "100%", width: "100%",
        videoId: parsed.videoId,
        playerVars: { ...vars, list: parsed.listId, listType: parsed.listId && !parsed.videoId ? "playlist" : undefined },
        events: {
          onReady: () => { this.ready = true; resolve(true); },
          onError: () => { if (window.UI) UI.toast("YouTube refused that video, try another link"); resolve(false); }
        }
      });
    });

    const done = await mount();
    if (done) {
      state.settings.musicUrl = url;
      saveState();
      const vol = toNumber(state.settings.musicVolume, 55);
      try { this.player.setVolume(vol); } catch (e) { /* ignore */ }
      if (window.UI) UI.toast("Music player ready 🎵");
      const note = document.getElementById("musicDockNote");
      if (note) note.textContent = "Loaded. Player sits bottom right.";
    }
    return done;
  },

  playPause() {
    if (!this.player || !this.ready) return;
    try {
      const st = this.player.getPlayerState();
      if (st === 1) this.player.pauseVideo();
      else this.player.playVideo();
    } catch (e) { /* ignore */ }
  },

  next() {
    if (!this.player || !this.ready) return;
    try {
      if (typeof this.player.nextVideo === "function") this.player.nextVideo();
      else this.player.playVideo();
    } catch (e) { /* ignore */ }
  },

  setVolume(v) {
    if (this.player && this.ready) {
      try { this.player.setVolume(v); } catch (e) { /* ignore */ }
    }
  },

  close() {
    const dock = document.getElementById("musicDock");
    if (dock) dock.hidden = true;
    const frame = document.getElementById("musicFrame");
    if (frame) frame.innerHTML = "";
    this.player = null;
    this.ready = false;
  },

  bind() {
    const play = document.getElementById("musicPlay");
    const next = document.getElementById("musicNext");
    const close = document.getElementById("musicClose");
    const load = document.getElementById("musicLoadBtn");
    const vol = document.getElementById("musicVolume");
    const urlInput = document.getElementById("musicUrl");

    if (play) play.addEventListener("click", () => this.playPause());
    if (next) next.addEventListener("click", () => this.next());
    if (close) close.addEventListener("click", () => this.close());
    if (load) {
      load.addEventListener("click", () => {
        const url = (urlInput && urlInput.value) || state.settings.musicUrl;
        this.load(url);
      });
    }
    if (urlInput) {
      urlInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); this.load(urlInput.value); }
      });
    }
    if (vol) {
      vol.addEventListener("input", () => {
        const v = toNumber(vol.value, 55);
        state.settings.musicVolume = v;
        this.setVolume(v);
      });
      vol.value = toNumber(state.settings.musicVolume, 55);
    }
  }
};

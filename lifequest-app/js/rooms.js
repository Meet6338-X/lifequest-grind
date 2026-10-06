/* ============================================================
   LifeQuest rooms — friend collaboration, local-first.
   No server, no key, no account. Friends exchange small
   room-progress JSON files (export / import below) and the
   room leaderboard adds up everyone's focus + coins.
   Google Meet links attach to sessions (meet.new, no API key).
   ============================================================ */
"use strict";

const Rooms = {
  /* ---------- friends ---------- */
  addFriend(name) {
    const n = (name || "").trim().slice(0, 40);
    if (!n) return null;
    if (state.friends.some((f) => f.name.toLowerCase() === n.toLowerCase())) return null;
    const f = { id: uid(), name: n, addedAt: new Date().toISOString() };
    state.friends.unshift(f);
    saveState();
    return f;
  },

  removeFriend(id) {
    state.friends = state.friends.filter((f) => f.id !== id);
    saveState();
  },

  /* ---------- rooms ---------- */
  makeCode() {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  },

  createRoom(name, goalCoins) {
    const n = (name || "").trim().slice(0, 50) || "Study room";
    let code = this.makeCode();
    while (state.rooms.some((r) => r.code === code)) code = this.makeCode();
    const room = {
      id: uid(), code, name: n,
      goalCoins: Math.max(50, toNumber(goalCoins, 500) || 500),
      createdAt: new Date().toISOString()
    };
    state.rooms.unshift(room);
    saveState();
    return room;
  },

  joinRoom(code) {
    const c = (code || "").trim().toUpperCase();
    if (!c) return null;
    if (state.rooms.some((r) => r.code === c)) return null;
    const room = {
      id: uid(), code: c, name: "Joined room " + c,
      goalCoins: 500, createdAt: new Date().toISOString()
    };
    state.rooms.unshift(room);
    saveState();
    return room;
  },

  deleteRoom(id) {
    const room = state.rooms.find((r) => r.id === id);
    state.rooms = state.rooms.filter((r) => r.id !== id);
    if (room && state.roomProgress) delete state.roomProgress[room.code];
    saveState();
  },

  /* ---------- progress ---------- */
  myContribution(room) {
    const since = new Date(room.createdAt).getTime();
    const mine = (state.sessions || []).filter((s) => {
      try { return new Date(s.endedAt).getTime() >= since; } catch (e) { return false; }
    });
    return {
      seconds: mine.reduce((sum, s) => sum + (s.durationSec || 0), 0),
      coins: mine.reduce((sum, s) => sum + (s.coins || 0), 0)
    };
  },

  leaderboard(room) {
    const me = state.profile.name || "You";
    const rows = [{ name: me, you: true, ...this.myContribution(room) }];
    const stored = (state.roomProgress && state.roomProgress[room.code]) || {};
    Object.entries(stored).forEach(([name, p]) => {
      if (name.toLowerCase() === me.toLowerCase()) return;
      rows.push({ name, you: false, seconds: p.seconds || 0, coins: p.coins || 0 });
    });
    // friends with no import yet still show up, at zero
    state.friends.forEach((f) => {
      if (!rows.some((r) => r.name.toLowerCase() === f.name.toLowerCase())) {
        rows.push({ name: f.name, you: false, seconds: 0, coins: 0 });
      }
    });
    return rows.sort((a, b) => b.coins - a.coins);
  },

  buildProgressFile(room) {
    const me = state.profile.name || "You";
    const c = this.myContribution(room);
    return {
      app: "LifeQuest",
      kind: "room-progress",
      code: room.code,
      roomName: room.name,
      member: me,
      seconds: c.seconds,
      coins: c.coins,
      exportedAt: new Date().toISOString()
    };
  },

  importProgressFile(data) {
    if (!data || data.kind !== "room-progress" || !data.code || !data.member) {
      throw new Error("Not a room-progress file");
    }
    const code = String(data.code).toUpperCase();
    const room = state.rooms.find((r) => r.code === code);
    if (!room) throw new Error(`Room ${code} is not on this device. Join it first.`);
    if (!state.roomProgress) state.roomProgress = {};
    if (!state.roomProgress[code]) state.roomProgress[code] = {};
    state.roomProgress[code][String(data.member).slice(0, 40)] = {
      seconds: toNumber(data.seconds, 0) || 0,
      coins: toNumber(data.coins, 0) || 0,
      updatedAt: new Date().toISOString()
    };
    saveState();
    return room;
  },

  /* ---------- rendering ---------- */
  roomBlock(room) {
    const rows = this.leaderboard(room);
    const totalCoins = rows.reduce((s, r) => s + r.coins, 0);
    const pct = Math.min(100, Math.round((totalCoins / Math.max(1, room.goalCoins)) * 100));
    const esc = (window.UI && UI.esc) || ((v) => String(v ?? ""));
    return `
      <div class="room">
        <div class="room-head">
          <div>
            <div class="strong">${esc(room.name)}</div>
            <div class="session-meta">code <b>${esc(room.code)}</b> · goal ${room.goalCoins} coins · ${pct}%</div>
          </div>
          <div class="row">
            <button class="btn btn-teal btn-sm" data-room-export="${room.id}" type="button">Export mine</button>
            <button class="btn btn-ghost btn-sm" data-room-import="${room.code}" type="button">Import friend</button>
            <button class="icon-btn" data-room-del="${room.id}" title="delete room">✕</button>
          </div>
        </div>
        <div class="xp-bar" style="margin:8px 0"><div class="xp-fill" style="width:${pct}%"></div></div>
        <div class="stack">
          ${rows.map((r, i) => `
            <div class="task">
              <span class="strong">${i === 0 ? "🏆 " : ""}${esc(r.name)}${r.you ? " (you)" : ""}</span>
              <span class="session-meta">${Math.round(r.seconds / 60)}m focus</span>
              <span class="reward-pill">+${r.coins} coins</span>
            </div>`).join("")}
        </div>
      </div>`;
  },

  render() {
    const me = document.getElementById("profileName");
    if (me && !me.value) me.value = state.profile.name || "";
    const fl = document.getElementById("friendList");
    if (fl) {
      const esc = (window.UI && UI.esc) || ((v) => String(v ?? ""));
      fl.innerHTML = state.friends.length
        ? state.friends.map((f) => `
          <span class="tag friend-tag">${esc(f.name)}
            <button class="icon-btn" data-friend-del="${f.id}" title="remove">✕</button>
          </span>`).join("")
        : `<span class="muted small">No friends yet. Add them above, then share room codes.</span>`;
    }
    const rl = document.getElementById("roomList");
    if (rl) {
      rl.innerHTML = state.rooms.length
        ? state.rooms.map((r) => this.roomBlock(r)).join("")
        : `<div class="empty">No rooms yet. Create one or join with a friend's code.</div>`;
    }
    this.renderMeet();
  },

  /* ---------- Google Meet (link based, no API key) ---------- */
  normalizeMeet(input) {
    const v = (input || "").trim();
    if (!v) return null;
    if (/^https?:\/\//i.test(v)) return v;
    const code = v.replace(/\s+/g, "");
    if (/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(code)) {
      return `https://meet.google.com/${code.toLowerCase()}`;
    }
    return null;
  },

  renderMeet() {
    const inp = document.getElementById("meetUrl");
    if (inp && !inp.value && state.currentMeet) inp.value = state.currentMeet;
    const st = document.getElementById("meetStatus");
    if (st) {
      st.textContent = state.currentMeet ? `In Meet: ${state.currentMeet}` : "No Meet linked";
    }
    const box = document.getElementById("meetAttach");
    if (box) box.checked = state.settings.meetAttach !== false;
  }
};

window.Rooms = Rooms;

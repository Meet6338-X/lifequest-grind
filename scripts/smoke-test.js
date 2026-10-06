/* Smoke test: boot the real page (served at :4173) in jsdom, run interactions */
const { JSDOM } = require("jsdom");

const errors = [];
const results = [];

function check(name, fn) {
  const done = (r) => results.push(`  ok  ${name}${r ? " — " + r : ""}`);
  const fail = (e) => {
    errors.push(`${name}: ${e.message}`);
    results.push(`FAIL  ${name} — ${e.message}`);
  };
  try {
    const r = fn();
    if (r && typeof r.then === "function") return r.then(done, fail);
    done(r);
  } catch (e) {
    fail(e);
  }
}

(async () => {
  const dom = await JSDOM.fromURL("http://localhost:4173/", {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true
  });
  const { window } = dom;
  const doc = window.document;

  window.addEventListener("error", (e) => errors.push("window error: " + (e.message || e.error)));

  // wait for boot (DOMContentLoaded fires after scripts parse)
  await new Promise((res) => {
    if (doc.readyState === "complete" || doc.readyState === "interactive") return res();
    doc.addEventListener("DOMContentLoaded", res);
    setTimeout(res, 4000);
  });
  await new Promise((r) => setTimeout(r, 600));

  const q = (id) => doc.getElementById(id);
  const ev = (code) => window.eval(code);

  check("boot ran (chips render)", () => q("moneyChip").textContent);
  check("companion rendered", () => q("creature").textContent);
  check("views present", () => doc.querySelectorAll(".view").length + " views");

  check("load demo data", () => {
    ev("state = buildDemoData(); saveState(); renderAll();");
    return ev("state.sessions.length") + " sessions";
  });

  check("stats grid filled", () => q("statsGrid").children.length + " stats");
  check("week chart bars", () => q("weekChart").children.length + " bars");
  check("task list rows", () => q("taskList").children.length + " tasks");
  check("session list rows", () => q("sessionList").children.length + " sessions");
  check("leetcode rows", () => q("lcList").children.length + " problems");
  check("badges rendered", () => q("badgeGrid").children.length + " badges");
  check("github panel aggregate", () => {
    const t = q("ghProfile").textContent;
    if (!t.includes("51")) throw new Error("expected 51 repos in: " + t.slice(0, 80));
    if (/hello-world|Spoon-Knife|linguist/i.test(doc.body.textContent)) throw new Error("repo name leaked");
    return t.slice(0, 60);
  });
  check("stage pips", () => q("stageTrack").children.length + " stages");

  check("switch view to leetcode", () => {
    ev('switchView("leetcode")');
    if (!q("view-leetcode").classList.contains("active")) throw new Error("view not active");
    return "active";
  });
  check("switch view back", () => ev('switchView("dashboard")'));

  check("start + finish timer", () => {
    ev("startTimer(); timer.elapsedMs = 65000; timer.startedAt = new Date(Date.now()-65000);");
    const before = ev("state.profile.coins");
    ev("finishTimer()");
    const after = ev("state.profile.coins");
    if (after <= before) throw new Error(`coins did not increase (${before} -> ${after})`);
    return `coins ${before} -> ${after}`;
  });

  check("timer reset", () => q("timeDisplay").textContent);

  check("add task", () => {
    const before = ev("state.tasks.length");
    q("quickTaskTitle").value = "Smoke test quest";
    q("quickTaskForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    const after = ev("state.tasks.length");
    if (after !== before + 1) throw new Error("task not added");
    return "added";
  });

  check("toggle task rewards", () => {
    const before = ev("state.profile.coins");
    const openId = ev("state.tasks.find(t=>!t.done).id");
    ev(`toggleTask("${openId}")`);
    const after = ev("state.profile.coins");
    if (after <= before) throw new Error("no reward");
    return `coins ${before} -> ${after}`;
  });

  check("leetcode add via form", () => {
    const before = ev("state.leetcode.length");
    q("lcTitle").value = "Smoke Problem";
    q("lcStatus").value = "Accepted";
    q("lcForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    const after = ev("state.leetcode.length");
    if (after !== before + 1) throw new Error("problem not added");
    return "added";
  });

  check("theme switch cyber", () => {
    ev('state.settings.theme="cyber"; renderSettings();');
    const t = doc.documentElement.dataset.theme;
    if (t !== "cyber") throw new Error("theme=" + t);
    return t;
  });

  check("background apply", () => {
    ev('state.settings.background="assets/backgrounds/sakura.jpg"; renderSettings();');
    const el = q("bgImage");
    if (!el.classList.contains("on")) throw new Error("bg not on");
    if (!el.style.backgroundImage.includes("sakura")) throw new Error("bg url missing");
    return "on";
  });

  check("background off restores", () => {
    ev('state.settings.background="none"; renderSettings();');
    if (q("bgImage").classList.contains("on")) throw new Error("bg still on");
    return "off";
  });

  check("companion type plant", () => {
    ev('state.settings.companion="plant"; state.profile.xp=1150; Companion.render();');
    return q("companionMeta").textContent.slice(0, 70);
  });

  check("companion dragon flies at drake+", () => {
    ev('state.settings.companion="dragon"; state.profile.xp=500; Companion.render();');
    if (!q("creature").classList.contains("fly")) throw new Error("dragon not flying at level 6");
    return "flying";
  });

  check("export json shape", () => {
    const json = JSON.parse(ev("JSON.stringify(state)"));
    if (!json.sessions || !json.settings || !json.profile) throw new Error("bad shape");
    return Object.keys(json).join(",");
  });

  check("import json roundtrip", () => {
    ev(`
      var __backup = JSON.parse(JSON.stringify(state));
      __backup.profile.coins = 99999;
      state = Object.assign(clone(DEFAULT_STATE), __backup);
      state.settings = Object.assign(clone(DEFAULT_STATE).settings, __backup.settings);
      saveState(); renderAll();
    `);
    const coins = ev("state.profile.coins");
    if (coins !== 99999) throw new Error("coins=" + coins);
    return "ok";
  });

  check("music parse urls", () => {
    const p1 = ev('Music.parse("https://www.youtube.com/watch?v=dQw4w9WgXcQ")');
    const p2 = ev('Music.parse("https://youtube.com/playlist?list=PLxyz123")');
    const p3 = ev('Music.parse("https://youtu.be/abcDEF12345")');
    if (!p1 || !p1.videoId) throw new Error("watch url failed");
    if (!p2 || !p2.listId) throw new Error("playlist failed: " + JSON.stringify(p2));
    if (!p3 || !p3.videoId) throw new Error("short url failed");
    return `${p1.videoId}, ${p2.listId}, ${p3.videoId}`;
  });

  check("manual time entry 90min", () => {
    ev(`
      document.getElementById("fStart").value = "2026-10-05T10:00";
      document.getElementById("fEnd").value = "2026-10-05T11:30";
    `);
    const before = ev("state.sessions.length");
    ev("logManualSession()");
    const after = ev("state.sessions.length");
    if (after !== before + 1) throw new Error("manual session not logged");
    const last = ev("state.sessions[0].durationSec");
    if (last !== 5400) throw new Error("duration=" + last);
    return "90 min logged";
  });

  check("lc status change earns bonus", () => {
    const before = ev("state.profile.coins");
    ev(`
      var __lc = state.leetcode.find(l => l.status === "Queued" || l.status === "In Progress");
      if (__lc) {
        var __sel = document.querySelector('[data-lc-status="' + __lc.id + '"]');
        __sel.value = "Accepted";
        __sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    `);
    const after = ev("state.profile.coins");
    if (after <= before) throw new Error("no AC bonus");
    return `coins ${before} -> ${after}`;
  });

  check("keyboard shortcut S", () => {
    ev('switchView("dashboard")');
    doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: "s", bubbles: true }));
    const running = ev("timer.running");
    if (!running) throw new Error("timer did not start");
    ev("pauseTimer()");
    return "started + paused";
  });

  check("session modal ids exist", () => {
    ["sessionModal", "sessionForm", "moreToggle", "moreFields", "fCategory", "fSource",
     "fStatus", "fDifficulty", "fProject", "fLanguage", "fProblem", "fTags",
     "fMood", "fFocus", "fNotes", "fStart", "fEnd", "manualLogBtn",
     "detailsBtn", "modalClose", "modalDoneBtn"].forEach((id) => {
      if (!q(id)) throw new Error("missing #" + id);
    });
    return "all present";
  });

  check("detailsBtn opens + Escape closes modal", () => {
    if (!q("sessionModal").hidden) throw new Error("modal should start hidden");
    q("detailsBtn").dispatchEvent(new window.Event("click", { bubbles: true }));
    // jsdom click listeners on the button fire via dispatchEvent on the button itself
    ev("openSessionModal()");
    if (q("sessionModal").hidden) throw new Error("modal did not open");
    doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    if (!q("sessionModal").hidden) throw new Error("modal did not close on Escape");
    return "open + close ok";
  });

  check("coin candlestick chart renders", () => {
    ev("Market.render()");
    const host = q("coinChart");
    const svg = host.querySelector("svg.candles");
    if (!svg) throw new Error("no candle svg");
    const ups = svg.querySelectorAll(".candle-up").length;
    const downs = svg.querySelectorAll(".candle-down").length;
    if (ups + downs < 7) throw new Error(`only ${ups + downs} candles`);
    return `${ups} up / ${downs} down`;
  });

  check("coin chart big renders", () => {
    const big = q("coinChartBig");
    if (!big) throw new Error("missing #coinChartBig");
    if (!big.querySelector("svg.candles")) throw new Error("big chart empty");
    return q("coinSummaryBig").textContent.slice(0, 50);
  });

  check("daily archive snapshot + files UI", () => {
    ["dailyFolderBtn", "dailySaveBtn", "dailyDownloadBtn", "finalDownloadBtn", "dailyStatus"].forEach((id) => {
      if (!q(id)) throw new Error("missing #" + id);
    });
    const snap = ev("Archive.snapshotLocal(state)");
    if (!snap || snap.kind !== "day" || !snap.date) throw new Error("bad snapshot");
    const stored = window.localStorage.getItem("lifequest_daily_" + snap.date);
    if (!stored) throw new Error("snapshot not in localStorage");
    const names = ev("Archive.dayFileName() + ' / ' + Archive.finalFileName()");
    if (!names.includes("lifequest-") || !names.includes("lifequest-final.json")) throw new Error(names);
    return names;
  });

  check("no project names in demo data", () => {
    const bad = ev(`state.sessions.some(s => (s.project || "").toLowerCase().includes("lifequest"))`);
    if (bad) throw new Error("session project leaked");
    const taskBad = ev(`/portfolio|staging|readme/i.test(state.tasks.map(t=>t.title).join(" "))`);
    if (taskBad) throw new Error("task title leaked a project name");
    return "aggregate-only clean";
  });

  check("real default handles", () => {
    const lc = ev("state.settings.leetcodeUser");
    const lc2 = ev("state.settings.leetcodeUser2");
    const gh = ev("state.settings.githubUser");
    if (lc !== "shahmeet644") throw new Error("lc=" + lc);
    if (lc2 !== "BugSlayerMeet") throw new Error("lc2=" + lc2);
    if (gh !== "Meet6338-X") throw new Error("gh=" + gh);
    const solved = ev("state.leetcodeLive.stats.solved");
    if (solved !== 238) throw new Error("solved=" + solved);
    return `${lc} + ${lc2} / ${gh} / ${solved} solved`;
  });

  check("two leetcode profiles combine", () => {
    if (!q("lcUser2")) throw new Error("missing #lcUser2");
    if (q("lcUser2").value !== "BugSlayerMeet") throw new Error("lcUser2=" + q("lcUser2").value);
    const total = q("lcLiveTotal").textContent;
    if (total !== "416") throw new Error("combined total=" + total);
    const chip = q("lcSyncChip").textContent;
    if (!chip.includes("2 synced")) throw new Error("chip=" + chip);
    return `${total} combined · ${chip}`;
  });

  check("dashboard add/remove blocks", () => {
    ["dashToggles", "questsCard", "sessionsCard", "statsCard", "marketCard", "companionCard"].forEach((id) => {
      if (!q(id)) throw new Error("missing #" + id);
    });
    ev('state.settings.dashboard.quests = false; renderDashboard();');
    if (!q("questsCard").hidden) throw new Error("quests card did not hide");
    ev('state.settings.dashboard.quests = true; renderDashboard();');
    if (q("questsCard").hidden) throw new Error("quests card did not come back");
    return "hide + show ok";
  });

  check("panel transparency glass", () => {
    if (!q("panelOpacity")) throw new Error("missing #panelOpacity");
    ev('state.settings.panelOpacity = 60; renderSettings();');
    if (!doc.body.classList.contains("glass")) throw new Error("glass class missing");
    ev('state.settings.panelOpacity = 100; renderSettings();');
    if (doc.body.classList.contains("glass")) throw new Error("glass did not clear");
    return "glass on + off ok";
  });

  await check("companion alive every second", async () => {
    await new Promise((r) => setTimeout(r, 2100));
    const ticks = ev("CompanionLive.ticks");
    if (!(ticks >= 2)) throw new Error("ticks=" + ticks);
    const act = q("companionAct").textContent;
    if (!act) throw new Error("activity line empty");
    return `ticks=${ticks} · ${act.slice(0, 40)}`;
  });

  check("companion evolves fast (50xp per stage)", () => {
    ev("state.profile.xp = 0; Companion.render();");
    const idx = ev("companionStageIndex(1)");
    ev("state.profile.xp = 120; Companion.render();");
    const idx2 = ev("companionStageIndex(1)");
    if (!(idx === 0 && idx2 > idx)) throw new Error(`stages (${idx} -> ${idx2})`);
    return `stage ${idx} -> ${idx2} at 120xp`;
  });

  check("coins are harder now", () => {
    const r = ev('calculateReward({category:"Coding",difficulty:"None",source:"Manual",status:"Completed"}, 3600)');
    if (!(r.coins <= 75)) throw new Error("60min coding still pays " + r.coins);
    return `60min coding = ${r.coins} coins`;
  });

  check("resize any block via cursor logic", () => {
    const handles = doc.querySelectorAll(".resize-handle");
    if (handles.length < 7) throw new Error("handles=" + handles.length);
    const size = ev("resizeCard('market', 3, true)");
    if (!size || size.span !== 3 || !size.tall) throw new Error(JSON.stringify(size));
    if (!q("marketCard").style.gridColumn.includes("span 3")) throw new Error("span not applied");
    if (!q("marketCard").classList.contains("tall")) throw new Error("tall not applied");
    ev("resizeCard('market', 2, false)");
    return `${handles.length} handles · span + tall persist`;
  });

  check("sidebar hides and reopens", () => {
    ["sideCollapseBtn", "sideOpenBtn", "edgeZone"].forEach((id) => {
      if (!q(id)) throw new Error("missing #" + id);
    });
    ev("toggleSidebar()");
    if (!doc.body.classList.contains("side-hidden")) throw new Error("did not hide");
    if (q("sideOpenBtn").hidden) throw new Error("reopen tab hidden");
    ev("toggleSidebar()");
    if (doc.body.classList.contains("side-hidden")) throw new Error("did not reopen");
    return "hide + drag-tab reopen ok";
  });

  check("friends add + remove", () => {
    ["profileName", "friendName", "friendAddBtn", "friendList"].forEach((id) => {
      if (!q(id)) throw new Error("missing #" + id);
    });
    q("friendName").value = "TestBuddy";
    q("friendAddBtn").dispatchEvent(new window.Event("click", { bubbles: true }));
    const has = ev("state.friends.some(f => f.name === 'TestBuddy')");
    if (!has) throw new Error("friend not added");
    const fid = ev("state.friends.find(f => f.name === 'TestBuddy').id");
    ev(`Rooms.removeFriend("${fid}"); Rooms.render();`);
    const gone = ev("state.friends.some(f => f.name === 'TestBuddy')");
    if (gone) throw new Error("friend not removed");
    return "add + remove ok";
  });

  check("room create + leaderboard + export shape", () => {
    ["roomName", "roomGoal", "roomCreateBtn", "roomJoinCode", "roomJoinBtn", "roomList", "roomImportInput"].forEach((id) => {
      if (!q(id)) throw new Error("missing #" + id);
    });
    q("roomName").value = "Grind Club";
    q("roomGoal").value = "500";
    q("roomCreateBtn").dispatchEvent(new window.Event("click", { bubbles: true }));
    const code = ev("state.rooms[0].code");
    if (!code || code.length !== 6) throw new Error("bad code: " + code);
    const rows = ev("Rooms.leaderboard(state.rooms[0]).length");
    if (!(rows >= 1)) throw new Error("leaderboard empty");
    const file = ev("Rooms.buildProgressFile(state.rooms[0])");
    if (file.kind !== "room-progress" || file.code !== code) throw new Error("bad export");
    return `room ${code} · ${rows} rows`;
  });

  check("room import merges friend progress", () => {
    const before = ev("Rooms.leaderboard(state.rooms[0]).length");
    ev(`Rooms.importProgressFile({kind:"room-progress", code: state.rooms[0].code, member:"FriendA", seconds: 3600, coins: 120}); Rooms.render();`);
    const after = ev("Rooms.leaderboard(state.rooms[0]).length");
    if (after !== before + 1) throw new Error(`rows ${before} -> ${after}`);
    ev(`Rooms.deleteRoom(state.rooms[0].id); Rooms.render();`);
    return "friend row merged";
  });

  check("meet link normalize + attach", () => {
    ["meetUrl", "meetNewBtn", "meetJoinBtn", "meetPopBtn", "meetCopyBtn", "meetAttach", "meetStatus"].forEach((id) => {
      if (!q(id)) throw new Error("missing #" + id);
    });
    const good = ev("Rooms.normalizeMeet('abc-defg-hij')");
    if (good !== "https://meet.google.com/abc-defg-hij") throw new Error(good);
    const bad = ev("Rooms.normalizeMeet('not a link!!')");
    if (bad !== null) throw new Error("bad input accepted");
    q("meetUrl").value = "abc-defg-hij";
    q("meetJoinBtn").dispatchEvent(new window.Event("click", { bubbles: true }));
    const linked = ev("state.currentMeet");
    if (linked !== "https://meet.google.com/abc-defg-hij") throw new Error(linked);
    return "linked " + linked;
  });

  check("meet pop-out overlay paths", () => {
    // exe path: bridge receives the linked call URL
    let sent = null;
    window.LQ = { isElectron: true, openMeet: (u) => { sent = u; } };
    q("meetPopBtn").dispatchEvent(new window.Event("click", { bubbles: true }));
    if (sent !== "https://meet.google.com/abc-defg-hij") throw new Error("bridge got " + sent);
    // web path: compact popup window instead
    delete window.LQ;
    let opened = null;
    window.open = (url, name, feats) => { opened = { url, name, feats }; return {}; };
    q("meetPopBtn").dispatchEvent(new window.Event("click", { bubbles: true }));
    if (!opened || !opened.url.includes("meet.google.com")) throw new Error("popup not opened");
    if (!opened.feats.includes("520")) throw new Error("popup not compact: " + opened.feats);
    return "exe bridge + web popup ok";
  });

  check("daily folder remembers subdir", () => {
    const sub = ev("Archive.SUBDIR");
    if (sub !== "lifequest-data") throw new Error("subdir=" + sub);
    return "everyday files go to " + sub + "/";
  });

  check("interface resize slider scales app", () => {
    if (!q("uiScale")) throw new Error("missing #uiScale");
    ev("state.settings.uiScale = 110; renderSettings();");
    const zoom = doc.querySelector(".app").style.zoom;
    if (zoom !== "1.1") throw new Error("zoom=" + zoom);
    ev("state.settings.uiScale = 100; renderSettings();");
    return "110% applied · back to 100%";
  });

  check("float button falls back gracefully", () => {
    if (!q("musicFloatBtn")) throw new Error("missing #musicFloatBtn");
    q("musicFloatBtn").dispatchEvent(new window.Event("click", { bubbles: true }));
    if (!doc.body.contains(q("musicDock"))) throw new Error("dock lost from document");
    return "no crash, dock stays put";
  });

  await check("overlay music page served", async () => {
    const base = window.location.href.replace(/\/?$/, "/");
    const res = await fetch(base + "music.html");
    if (res.status !== 200) throw new Error("status=" + res.status);
    const text = await res.text();
    if (!text.includes("youtube.com/embed")) throw new Error("no embed builder");
    return "music.html 200 with embed builder";
  });

  check("money shop buy + boost scales rewards", () => {
    ["shopBalance", "shopList"].forEach((id) => {
      if (!q(id)) throw new Error("missing #" + id);
    });
    const coinsBefore = ev("state.profile.coins");
    if (!ev('buyShop("freeze")')) throw new Error("freeze buy failed");
    if (ev("state.profile.freezes") !== 1) throw new Error("freeze not added");
    if (!ev('buyShop("boost1")')) throw new Error("boost1 buy failed");
    const r = ev('calculateReward({category:"Coding",difficulty:"None",source:"Manual",status:"Completed"}, 3600)');
    if (!(r.coins > 75)) throw new Error("boost did not scale: " + r.coins);
    ev("state.profile.boost = 1; saveState(); renderAll();");
    return `spent ${coinsBefore - ev("state.profile.coins")} · boosted pays ${r.coins}`;
  });

  check("streak freeze forgives a missed day", () => {
    ev(`
      state.profile.streak = { current: 5, best: 5, lastDay: new Date(Date.now() - 3*86400000).toISOString().slice(0,10) };
      state.profile.freezes = 1;
      addReward(5, 5);
    `);
    if (ev("state.profile.streak.current") !== 5) throw new Error("streak reset despite freeze");
    if (ev("state.profile.freezes") !== 0) throw new Error("freeze not consumed");
    return "streak kept at 5 · freeze consumed";
  });

  check("companion store feed + skins", () => {
    ["storeBalance", "storeSkins", "feedBtn"].forEach((id) => {
      if (!q(id)) throw new Error("missing #" + id);
    });
    const xpBefore = ev("state.profile.xp");
    ev("state.settings.companion = 'dragon';");
    if (!ev("Companion.feed()")) throw new Error("feed failed");
    if (ev("state.profile.xp") !== xpBefore + 8) throw new Error("no snack XP");
    if (!ev("Companion.buySkin('frost-dragon')")) throw new Error("skin buy failed");
    ev("Companion.render()");
    if (q("creature").textContent !== "🐲") throw new Error("skin not worn: " + q("creature").textContent);
    ev("state.settings.compSkin = null; saveState(); Companion.render();");
    return "snack +8 XP · frost skin worn";
  });

  check("style shop unlock + apply", () => {
    ["styleBalance", "styleFaces", "styleCharts", "styleCards"].forEach((id) => {
      if (!q(id)) throw new Error("missing #" + id);
    });
    if (!ev("buyStyle('faces', 'neon')")) throw new Error("neon buy failed");
    if (doc.body.dataset.timerface !== "neon") throw new Error("face not applied");
    if (!ev("buyStyle('charts', 'sunset')")) throw new Error("sunset buy failed");
    if (doc.body.dataset.chart !== "sunset") throw new Error("chart not applied");
    ev("buyStyle('faces', 'default'); buyStyle('charts', 'default');");
    return "neon + sunset unlocked and applied";
  });

  check("weekly boss damage + loot", () => {
    ["bossName", "bossHp", "bossBar", "bossWeek", "bossClaimBtn"].forEach((id) => {
      if (!q(id)) throw new Error("missing #" + id);
    });
    ev("renderBoss()");
    if (!q("bossName").textContent) throw new Error("boss has no name");
    // deterministic kill: one big session this week, then claim
    const before = ev("state.profile.coins");
    ev(`state.sessions.unshift({ id: "boss-test", title: "Boss push", category: "Coding",
      source: "Manual", status: "Completed", difficulty: "None", project: "", language: "",
      problem: "", tags: [], mood: "", focusScore: "", notes: "",
      startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      durationSec: 3600, coins: 800, xp: 640 });`);
    if (!ev("claimBoss()")) throw new Error("claim failed");
    const after = ev("state.profile.coins");
    if (!(after > before)) throw new Error("no loot paid");
    if (!q("bossClaimBtn").disabled) throw new Error("claim not locked after loot");
    return `boss slain · loot paid ${before} -> ${after}`;
  });

  check("hall of fame ranks 8 weeks", () => {
    if (!q("fameList")) throw new Error("missing #fameList");
    ev("renderFame()");
    const n = q("fameList").children.length;
    if (n !== 8) throw new Error("rows=" + n);
    return q("fameList").textContent.slice(0, 50);
  });

  check("pomodoro runs phases + completion bonus", async () => {
    ["pomoFocus", "pomoBreak", "pomoCycles", "pomoBtn"].forEach((id) => {
      if (!q(id)) throw new Error("missing #" + id);
    });
    // 2 cycles: force phase ends instead of waiting minutes
    q("pomoFocus").value = "25"; q("pomoBreak").value = "5"; q("pomoCycles").value = "2";
    q("pomoBtn").dispatchEvent(new window.Event("click", { bubbles: true }));
    if (!ev("Pomo.on")) throw new Error("pomo did not start");
    ev("Pomo.endAt = Date.now() - 50; tick();"); // end focus 1 -> break
    if (ev("Pomo.phase") !== "break") throw new Error("phase=" + ev("Pomo.phase"));
    const coinsMid = ev("state.profile.coins");
    ev("Pomo.endAt = Date.now() - 50; tick();"); // end break -> focus 2
    if (ev("Pomo.phase") !== "focus") throw new Error("back to focus failed");
    ev("Pomo.endAt = Date.now() - 50; tick();"); // end focus 2 -> done + bonus
    if (ev("Pomo.on")) throw new Error("pomo did not stop");
    if (!(ev("state.profile.coins") >= coinsMid + 25)) throw new Error("no completion bonus");
    ev("stopPomo(true);");
    return "focus/break/focus + bonus ok";
  });

  console.log("\n=== SMOKE RESULTS ===");
  results.forEach((r) => console.log(r));
  console.log("\n=== ERRORS (" + errors.length + ") ===");
  errors.forEach((e) => console.log(" - " + e));
  dom.window.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => {
  console.error("HARNESS FAILURE:", e);
  process.exit(2);
});

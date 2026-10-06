/* ============================================================
   LifeQuest results — reads lifequest_v2 JSON, renders report
   Pure vanilla JS. Demo data fallback. Count-ups. Confetti burst.
   ============================================================ */
"use strict";

const STORAGE_KEY = "lifequest_v2";
const REF_TOTALS = { Easy: 969, Medium: 2124, Hard: 980 };

const BADGE_CATALOG = [
  { id: "first-session", ico: "🎯", name: "First Session" },
  { id: "task-dozer", ico: "🚜", name: "Task Dozer" },
  { id: "week-fire", ico: "🔥", name: "Week Fire" },
  { id: "iron-month", ico: "🧊", name: "Iron Month" },
  { id: "lc-10", ico: "🧩", name: "LC Rookie" },
  { id: "lc-100", ico: "🏆", name: "LC Century" },
  { id: "level-5", ico: "⭐", name: "Rising Star" },
  { id: "level-10", ico: "🚀", name: "Level Ten" },
  { id: "coin-1000", ico: "💰", name: "Coin Hoarder" },
  { id: "git-star", ico: "🐙", name: "Repo Wrangler" }
];

let data = null;
let isDemo = true;

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function localISO(date) {
  const d = date ? new Date(date) : new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function levelFromXp(xp) { return Math.floor((xp || 0) / 100) + 1; }

/* ---------- weekly boss + hall of fame (same rules as the app) ---------- */
const BOSS_MAX_HP = 750;
const BOSS_NAMES = ["Procrastination Imp", "Distraction Goblin", "Scope Creep", "Bug Hydra", "Burnout Dragon", "Deadline Demon"];
const BOSS_EMOJI = ["👺", "👹", "🌊", "🐲", "🐉", "😈"];

function weekKey(date) {
  const d = date ? new Date(date) : new Date();
  const monday = new Date(d);
  const day = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - day);
  monday.setHours(0, 0, 0, 0);
  return localISO(monday);
}

function weekDamage(week) {
  return data.sessions
    .filter((x) => { try { return weekKey(new Date(x.endedAt)) === week; } catch (e) { return false; } })
    .reduce((s, x) => s + (x.coins || 0), 0);
}

function renderBoss() {
  const week = weekKey();
  const damage = weekDamage(week);
  let n = 0;
  for (let i = 0; i < week.length; i++) n = (n * 31 + week.charCodeAt(i)) % 997;
  const i = n % BOSS_NAMES.length;
  const defeated = damage >= BOSS_MAX_HP;
  $("bossName").textContent = `${BOSS_EMOJI[i]} ${BOSS_NAMES[i]}`;
  $("bossHp").textContent = defeated ? "DEFEATED" : `${Math.max(0, BOSS_MAX_HP - damage)} HP`;
  $("bossBar").style.width = `${Math.min(100, Math.round((damage / BOSS_MAX_HP) * 100))}%`;
  const claimed = data.bossLoot && data.bossLoot.week === week;
  $("bossWeek").textContent = defeated
    ? (claimed ? `Slain with ${damage} damage. Loot claimed.` : `Slain with ${damage} damage. Claim loot in the app.`)
    : `You dealt ${damage} damage (goal ${BOSS_MAX_HP})`;
}

function renderFame() {
  const now = new Date();
  const seen = {};
  for (let i = 55; i >= 0; i -= 7) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = weekKey(d);
    if (!seen[key]) seen[key] = new Date(key + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  const weeks = Object.entries(seen).map(([key, label]) => {
    const rows = data.sessions.filter((x) => {
      try { return weekKey(new Date(x.endedAt)) === key; } catch (e) { return false; }
    });
    return {
      key, label,
      seconds: rows.reduce((s, x) => s + (x.durationSec || 0), 0),
      xp: rows.reduce((s, x) => s + (x.xp || 0), 0)
    };
  }).sort((a, b) => b.xp - a.xp).slice(0, 8);
  const medals = ["🥇", "🥈", "🥉"];
  $("fameList").innerHTML = weeks.map((w, i) => `
    <div class="fame-row">
      <span><b>${medals[i] || `#${i + 1}`}</b> <span class="muted small">w/c ${esc(w.label)}</span></span>
      <span class="stars">${w.xp} XP</span>
    </div>`).join("");
}

function humanFocus(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function toast(text, gold) {
  const host = $("toastHost");
  const el = document.createElement("div");
  el.className = "toast" + (gold ? " gold" : "");
  el.textContent = text;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 320);
  }, 2600);
}

function burst(x, y) {
  const colors = ["#ff5b57", "#12b3a4", "#ffc531", "#6b5be6", "#3aa0ff"];
  for (let i = 0; i < 22; i++) {
    const p = document.createElement("span");
    p.className = "burst";
    const ang = (Math.PI * 2 * i) / 22 + Math.random() * 0.4;
    const dist = 80 + Math.random() * 110;
    p.style.left = x + "px";
    p.style.top = y + "px";
    p.style.background = colors[i % colors.length];
    p.style.setProperty("--bx", Math.cos(ang) * dist + "px");
    p.style.setProperty("--by", Math.sin(ang) * dist + "px");
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1150);
  }
}

/* count-up animation */
function countUp(el, target, format) {
  const fmt = format || ((n) => String(Math.round(n)));
  const dur = 900;
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt(target * eased);
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = fmt(target);
  }
  requestAnimationFrame(step);
}

/* ---------- demo dataset ---------- */
function buildDemoData() {
  // deterministic pseudo-random for stable screenshots
  let seed = 20261005;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  const now = Date.now();
  const cats = ["Coding", "LeetCode", "Study", "Work", "Fitness", "Creative"];
  const sessions = [];
  for (let i = 0; i < 36; i++) {
    const daysAgo = Math.floor(rnd() * 7);
    const end = new Date(now - daysAgo * 86400000 - Math.floor(rnd() * 10 * 3600000));
    const dur = (10 + Math.floor(rnd() * 70)) * 60;
    const cat = cats[Math.floor(rnd() * cats.length)];
    sessions.push({
      id: "demo-s" + i,
      title: ["Morning focus block", "Solved Two Sum", "Studied DP patterns", "Deep work session", "Workout", "Reading notes"][i % 6],
      category: cat,
      source: i % 5 === 0 ? "WakaTime" : i % 3 === 0 ? "LeetCode" : "Manual",
      status: i % 4 === 0 ? "Accepted" : "Completed",
      difficulty: i % 3 === 0 ? "Medium" : "None",
      project: "",
      language: ["TypeScript", "Python", "Rust", "Go"][i % 4],
      problem: "", tags: [], notes: "",
      startedAt: new Date(end.getTime() - dur * 1000).toISOString(),
      endedAt: end.toISOString(),
      durationSec: dur,
      coins: Math.round((dur / 60) * 2),
      xp: Math.round((dur / 60) * 1.6)
    });
  }
  sessions.sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt));

  const taskTitles = [
    "Morning workout", "Review open quests", "Write week reflection", "Finish DP module",
    "Apply to 3 roles", "Clean up inbox", "Gym session", "Update resume bullets",
    "Mock interview", "Evening walk", "Read one chapter", "Plan top 3",
    "Fix flaky test", "Update study notes", "Water the plant", "Call mentor",
    "Refactor notes", "Tidy desk"
  ];
  const tasks = taskTitles.map((t, i) => ({
    id: "demo-t" + i,
    title: t,
    done: i < 14,
    priority: ["high", "med", "low"][i % 3],
    reward: 6,
    createdAt: new Date(now - (7 - (i % 7)) * 86400000).toISOString(),
    completedAt: i < 14 ? new Date(now - (i % 5) * 86400000).toISOString() : null
  }));

  const lcSeeds = [
    ["Two Sum", "Easy", "Accepted"], ["Add Two Numbers", "Medium", "Accepted"],
    ["Longest Substring", "Medium", "Accepted"], ["Median of Two Arrays", "Hard", "Wrong Answer"],
    ["Valid Parentheses", "Easy", "Accepted"], ["Merge Two Lists", "Easy", "Accepted"],
    ["Coin Change", "Medium", "Accepted"], ["LRU Cache", "Medium", "Accepted"],
    ["Trapping Rain Water", "Hard", "Needs Review"], ["Binary Search", "Easy", "Accepted"],
    ["Course Schedule", "Medium", "Accepted"], ["Word Break", "Medium", "In Progress"],
    ["Min Stack", "Easy", "Accepted"], ["Number of Islands", "Medium", "Accepted"],
    ["Merge K Lists", "Hard", "TLE"], ["Climbing Stairs", "Easy", "Accepted"],
    ["Rotate Array", "Easy", "Mastered"], ["Group Anagrams", "Medium", "Accepted"],
    ["Spiral Matrix", "Medium", "Queued"], ["Jump Game", "Medium", "Accepted"],
    ["Set Matrix Zeroes", "Medium", "Accepted"], ["Candy", "Hard", "Wrong Answer"],
    ["Unique Paths", "Medium", "Accepted"], ["Longest Palindrome", "Easy", "Accepted"],
    ["Decode Ways", "Medium", "Accepted"], ["Clone Graph", "Medium", "Accepted"],
    ["Populating Next Right", "Medium", "Needs Review"], ["Max Subarray", "Easy", "Accepted"],
    ["Edit Distance", "Medium", "Accepted"], ["Search Rotated Array", "Medium", "Accepted"],
    ["Permutations", "Medium", "In Progress"], ["Combination Sum", "Medium", "Accepted"],
    ["First Missing Positive", "Hard", "Queued"], ["Product of Array", "Easy", "Accepted"],
    ["Sliding Window Max", "Hard", "Accepted"], ["Longest Consecutive", "Medium", "Accepted"],
    ["Insert Interval", "Medium", "Accepted"], ["Minimum Window", "Hard", "Accepted"],
    ["Merge Intervals", "Medium", "Accepted"], ["Jump Game II", "Medium", "Accepted"]
  ];
  const leetcode = lcSeeds.map(([title, difficulty, status], i) => {
    const solved = status === "Accepted" || status === "Mastered";
    const minutes = 6 + Math.floor(rnd() * 50);
    return {
      id: "demo-l" + i,
      title, difficulty, status,
      language: ["TypeScript", "Python", "Rust", "Go"][i % 4],
      tags: ["dsa"], url: "", notes: "",
      attempts: solved ? 1 + (i % 3) : 2 + (i % 2),
      timeSpentSec: minutes * 60,
      lastTried: new Date(now - (i % 6) * 86400000).toISOString(),
      solvedAt: solved ? new Date(now - (i % 5) * 86400000).toISOString() : null
    };
  });

  return {
    version: 2,
    profile: {
      name: "Player",
      coins: 4820,
      xp: 1150,
      streak: { current: 12, best: 21, lastDay: localISO() },
      badges: {
        "first-session": new Date(now - 12 * 86400000).toISOString(),
        "task-dozer": new Date(now - 5 * 86400000).toISOString(),
        "week-fire": new Date(now - 1 * 86400000).toISOString(),
        "lc-10": new Date(now - 6 * 86400000).toISOString(),
        "level-5": new Date(now - 8 * 86400000).toISOString(),
        "coin-1000": new Date(now - 4 * 86400000).toISOString()
      }
    },
    settings: { theme: "memphis", taskReward: 12, leetcodeBonus: 25, rates: {} },
    sessions,
    tasks,
    leetcode,
    leetcodeLive: {
      username: "shahmeet644",
      lastSync: new Date().toISOString(),
      stats: { solved: 238, easy: 87, medium: 111, hard: 40, ranking: 698114, acceptance: 80.3 }
    },
    // Second profile: verified total only, no invented difficulty split.
    leetcodeLive2: {
      username: "BugSlayerMeet",
      lastSync: new Date().toISOString(),
      stats: { solved: 178, easy: 0, medium: 0, hard: 0, ranking: null, acceptance: null }
    },
    // Aggregate GitHub totals only. No repo names anywhere.
    github: {
      username: "Meet6338-X",
      lastSync: new Date().toISOString(),
      profile: { public_repos: 51, followers: 42, totalStars: 1 },
      repos: []
    }
  };
}

/* ---------- data loading ---------- */
function normalize(parsed) {
  if (!parsed || typeof parsed !== "object") throw new Error("not an object");
  if (!Array.isArray(parsed.sessions)) throw new Error("missing sessions array");
  return {
    version: parsed.version || 2,
    profile: Object.assign(
      { name: "Player", coins: 0, xp: 0, streak: { current: 0, best: 0, lastDay: "" }, badges: {} },
      parsed.profile || {},
      { streak: Object.assign({ current: 0, best: 0, lastDay: "" }, (parsed.profile || {}).streak || {}) },
      { badges: (parsed.profile || {}).badges || {} }
    ),
    settings: parsed.settings || {},
    sessions: parsed.sessions || [],
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    leetcode: Array.isArray(parsed.leetcode) ? parsed.leetcode : [],
    leetcodeLive: parsed.leetcodeLive || null,
    leetcodeLive2: parsed.leetcodeLive2 || null,
    bossLoot: parsed.bossLoot || null,
    github: parsed.github || null
  };
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalize(JSON.parse(raw));
  } catch (e) {
    console.warn("LifeQuest results: bad local data", e);
    return null;
  }
}

/* ---------- rendering ---------- */
function renderKpis() {
  const p = data.profile;
  const level = levelFromXp(p.xp);
  const money = (p.coins / 100).toFixed(2);
  const totalSec = data.sessions.reduce((s, x) => s + (x.durationSec || 0), 0);
  const today = localISO();
  const todaySec = data.sessions
    .filter((x) => localISO(new Date(x.endedAt)) === today)
    .reduce((s, x) => s + (x.durationSec || 0), 0);

  countUp($("kpiLevel"), level);
  countUp($("kpiMoney"), Number(money), (n) => "$" + n.toFixed(2));
  countUp($("kpiStreak"), p.streak.current || 0);
  countUp($("kpiFocus"), totalSec / 3600, (n) => n.toFixed(1) + "h");

  $("kpiXp").textContent = `${p.xp} XP · ${p.xp % 100}/100 to next`;
  $("kpiCoins").textContent = `${p.coins} coins`;
  $("kpiBest").textContent = `best ${p.streak.best || 0} days`;
  $("kpiToday").textContent = `today ${humanFocus(todaySec)}`;
}

function renderHeroArt() {
  const days = last7();
  const max = Math.max(...days.map((d) => d.sec), 60);
  const colors = ["#ffc531", "#ff5b57", "#6b5be6", "#12b3a4", "#3aa0ff", "#ff5b57", "#12b3a4"];
  $("artBars").innerHTML = days
    .map((d, i) => {
      const h = Math.max(8, Math.round((d.sec / max) * 100));
      return `<i style="height:${h}%;background:${colors[i]};animation-delay:${i * 70}ms"></i>`;
    })
    .join("");

  const streak = data.profile.streak.current || 0;
  const badge = $("artBadge");
  if (streak >= 14) { badge.textContent = "🔥 unstoppable"; badge.style.background = "#ff5b57"; }
  else if (streak >= 7) { badge.textContent = "🔥 on fire"; badge.style.background = "#ff5b57"; }
  else if (streak >= 3) { badge.textContent = "⚡ warming up"; badge.style.background = "#6b5be6"; }
  else { badge.textContent = "🌱 fresh start"; badge.style.background = "#12b3a4"; }
}

function last7() {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = localISO(d);
    const sec = data.sessions
      .filter((x) => localISO(new Date(x.endedAt)) === key)
      .reduce((s, x) => s + (x.durationSec || 0), 0);
    out.push({ key, label: d.toLocaleDateString(undefined, { weekday: "short" }), sec });
  }
  return out;
}

function renderWeekChart() {
  const days = last7();
  const max = Math.max(...days.map((d) => d.sec), 60);
  const colors = ["#ffc531", "#ff5b57", "#6b5be6", "#12b3a4", "#3aa0ff", "#ff5b57", "#12b3a4"];
  const total = days.reduce((s, d) => s + d.sec, 0);
  $("weekTotal").textContent = `${humanFocus(total)} total`;

  $("weekChart").innerHTML = days
    .map((d, i) => {
      const h = Math.max(6, Math.round((d.sec / max) * 100));
      const mins = Math.round(d.sec / 60);
      return `
        <div class="bar-wrap" title="${d.label}: ${mins} min">
          <div class="bar" style="height:${h}%;background:${colors[i]};animation-delay:${i * 65}ms"></div>
          <div class="lbl">${d.label}</div>
          <div class="mins">${mins}m</div>
        </div>`;
    })
    .join("");
}

function renderLeetCode() {
  const live = data.leetcodeLive && data.leetcodeLive.stats ? data.leetcodeLive.stats : null;
  const live2 = data.leetcodeLive2 && data.leetcodeLive2.stats ? data.leetcodeLive2.stats : null;

  let easy, medium, hard, total;
  if (live) {
    easy = live.easy + (live2 ? live2.easy || 0 : 0);
    medium = live.medium + (live2 ? live2.medium || 0 : 0);
    hard = live.hard + (live2 ? live2.hard || 0 : 0);
    total = live.solved + (live2 ? live2.solved || 0 : 0);
    $("lcChip").textContent = live2
      ? `${data.leetcodeLive.username} + ${data.leetcodeLive2.username}`
      : "@" + data.leetcodeLive.username;
    $("lcChip").className = "chip chip-violet";
    $("lcAcc").textContent = live.acceptance != null ? live.acceptance + "%" : "—";
  } else {
    const acc = data.leetcode.filter((l) => l.status === "Accepted" || l.status === "Mastered");
    easy = acc.filter((l) => l.difficulty === "Easy").length;
    medium = acc.filter((l) => l.difficulty === "Medium").length;
    hard = acc.filter((l) => l.difficulty === "Hard").length;
    total = acc.length;
    $("lcChip").textContent = "manual data";
    $("lcChip").className = "chip chip-mustard";
    const all = data.leetcode.filter((l) => l.status === "Accepted" || l.status === "Mastered").length;
    const attempted = data.leetcode.filter((l) => l.status !== "Not Started").length;
    $("lcAcc").textContent = attempted ? Math.round((all / attempted) * 100) + "%" : "0%";
  }

  countUp($("lcTotal"), total);

  const rows = [
    { cls: "lc-easy", name: "Easy", n: easy, ref: REF_TOTALS.Easy },
    { cls: "lc-med", name: "Medium", n: medium, ref: REF_TOTALS.Medium },
    { cls: "lc-hard", name: "Hard", n: hard, ref: REF_TOTALS.Hard }
  ];
  $("lcRows").innerHTML = rows
    .map((r) => {
      const pct = Math.min(100, Math.max(2, (r.n / r.ref) * 100));
      return `
        <div>
          <div class="lc-row-top"><span>${r.name}</span><span>${r.n} / ${r.ref}</span></div>
          <div class="lc-bar ${r.cls}"><i style="width:${pct}%"></i></div>
        </div>`;
    })
    .join("");

  // accepted this week + avg solve time (manual array)
  const weekAgo = Date.now() - 7 * 86400000;
  const weekAc = data.leetcode.filter(
    (l) => (l.status === "Accepted" || l.status === "Mastered") &&
      l.solvedAt && new Date(l.solvedAt).getTime() >= weekAgo
  ).length;
  $("lcWeek").textContent = String(weekAc);

  const solved = data.leetcode.filter((l) => l.timeSpentSec && (l.status === "Accepted" || l.status === "Mastered"));
  const avg = solved.length
    ? solved.reduce((s, l) => s + l.timeSpentSec, 0) / solved.length
    : 0;
  $("lcAvg").textContent = avg > 0 ? Math.round(avg / 60) + "m" : "—";
}

function renderGitHub() {
  const gh = data.github;
  if (!gh || !gh.profile) {
    $("ghChip").textContent = "not connected";
    $("ghChip").className = "chip chip-mustard";
    $("repoList").innerHTML = `<div class="lang">Connect GitHub in the app to see repo stars here.</div>`;
    return;
  }
  $("ghChip").textContent = "@" + gh.username;
  $("ghChip").className = "chip chip-teal";

  countUp($("ghRepos"), gh.profile.public_repos || 0);
  countUp($("ghStars"), gh.profile.totalStars || 0);
  countUp($("ghFollowers"), gh.profile.followers || 0);

  // Aggregate totals only. No repo names are rendered anywhere.
  $("repoList").innerHTML =
    `<div class="lang">Aggregate totals only: ${gh.profile.public_repos || 0} repos, ` +
    `${gh.profile.totalStars || 0} stars, ${gh.profile.followers || 0} followers. No repo names stored.</div>`;
}

function renderTasks() {
  const done = data.tasks.filter((t) => t.done).length;
  const total = data.tasks.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  countUp($("taskPct"), pct, (n) => Math.round(n) + "%");
  $("taskCount").textContent = `${done} / ${total}`;

  const circ = 2 * Math.PI * 50; // 314.16
  const fg = $("ringFg");
  fg.style.strokeDasharray = String(circ);
  fg.style.strokeDashoffset = String(circ);
  setTimeout(() => {
    fg.style.strokeDashoffset = String(circ * (1 - pct / 100));
  }, 150);
}

function renderStreak() {
  const s = data.profile.streak || { current: 0, best: 0 };
  countUp($("streakNum"), s.current || 0);
  $("streakBest").textContent = String(s.best || 0);
  $("streakFlame").textContent = (s.current || 0) >= 7 ? "🔥" : (s.current || 0) >= 3 ? "⚡" : "🌱";

  const dots = Math.min(14, Math.max(7, s.best || 7));
  const on = Math.min(s.current || 0, dots);
  $("streakDots").innerHTML = Array.from({ length: dots }, (_, i) =>
    `<i class="${i < on ? "on" : ""}"></i>`
  ).join("");
}

function renderBadges() {
  const unlocked = data.profile.badges || {};
  const count = BADGE_CATALOG.filter((b) => unlocked[b.id]).length;
  $("badgeCount").textContent = `${count} / ${BADGE_CATALOG.length}`;
  $("badgeGrid").innerHTML = BADGE_CATALOG.map((b) => {
    const at = unlocked[b.id];
    const date = at ? new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
    return `
      <div class="badge ${at ? "unlocked" : "locked"}">
        <span class="ico">${b.ico}</span>
        <div class="nm">${b.name}</div>
        ${at ? `<div class="dt">${date}</div>` : `<div class="dt">locked</div>`}
      </div>`;
  }).join("");
}

function renderAll() {
  renderKpis();
  renderHeroArt();
  renderLeetCode();
  renderGitHub();
  renderWeekChart();
  renderBoss();
  renderFame();
  renderTasks();
  renderStreak();
  renderBadges();

  const chip = $("dataChip");
  chip.textContent = isDemo ? "Showing demo data" : "Showing your data";
  chip.className = isDemo ? "chip chip-mustard" : "chip chip-teal";
}

/* ---------- actions ---------- */
function handleFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      data = normalize(parsed);
      isDemo = false;
      renderAll();
      toast("Backup imported", true);
      const r = $("loadBtn").getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + r.height / 2);
    } catch (e) {
      toast("Import failed: " + e.message);
    }
  };
  reader.readAsText(file);
}

function loadMine() {
  const fresh = loadFromStorage();
  if (!fresh) {
    toast("No LifeQuest data in this browser yet");
    return;
  }
  data = fresh;
  isDemo = false;
  renderAll();
  toast("Your data loaded", true);
  const r = $("loadBtn").getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2);
}

function bind() {
  $("loadBtn").addEventListener("click", loadMine);
  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) handleFile(f);
    e.target.value = "";
  });
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) loadMine();
  });
}

/* ---------- boot ---------- */
(function boot() {
  const fresh = loadFromStorage();
  if (fresh) {
    data = fresh;
    isDemo = false;
  } else {
    data = buildDemoData();
    isDemo = true;
  }
  bind();
  renderAll();
})();

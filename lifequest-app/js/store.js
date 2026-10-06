/* ============================================================
   LifeQuest store — JSON local-first state + reward engine
   ============================================================ */
"use strict";

const STORAGE_KEY = "lifequest_v2";

const DEFAULT_STATE = {
  version: 2,
  profile: {
    name: "Player",
    coins: 0,
    xp: 0,
    boost: 1,
    freezes: 0,
    streak: { current: 0, best: 0, lastDay: "" },
    badges: {}
  },
  settings: {
    theme: "memphis",
    background: "none",
    bgVeil: 55,
    companion: "dragon",
    companionName: "Ember",
    musicUrl: "",
    musicVolume: 55,
    wakaKey: "",
    leetcodeUser: "shahmeet644",
    leetcodeUser2: "BugSlayerMeet",
    githubUser: "Meet6338-X",
    taskReward: 6,
    leetcodeBonus: 12,
    meetAttach: true,
    sidebar: true,
    cardSizes: {},
    dashboard: { companion: true, stats: true, market: true, quests: true, sessions: true },
    panelOpacity: 100,
    rates: { Coding: 1, LeetCode: 1.5, Work: 0.6, Study: 0.8, Fitness: 0.5, Creative: 0.6, Other: 0.5 }
  },
  sessions: [],
  tasks: [],
  leetcode: [],
  leetcodeLive: null,
  leetcodeLive2: null,
  github: null,
  friends: [],
  rooms: [],
  roomProgress: {},
  currentMeet: ""
};

const BADGES = [
  { id: "first-session", ico: "🎯", name: "First Session", desc: "Finish one session" },
  { id: "task-dozer", ico: "🚜", name: "Task Dozer", desc: "Complete 10 quests" },
  { id: "week-fire", ico: "🔥", name: "Week Fire", desc: "7 day streak" },
  { id: "iron-month", ico: "🧊", name: "Iron Month", desc: "30 day streak" },
  { id: "lc-10", ico: "🧩", name: "LC Rookie", desc: "10 problems accepted" },
  { id: "lc-100", ico: "🏆", name: "LC Century", desc: "100 problems accepted" },
  { id: "level-5", ico: "⭐", name: "Rising Star", desc: "Reach level 5" },
  { id: "level-10", ico: "🚀", name: "Level Ten", desc: "Reach level 10" },
  { id: "coin-1000", ico: "💰", name: "Coin Hoarder", desc: "Hold 1000 coins" },
  { id: "git-star", ico: "🐙", name: "Repo Wrangler", desc: "Connect GitHub" },
  { id: "deep-work", ico: "🧠", name: "Deep Work", desc: "One session over 60 min" },
  { id: "polyglot", ico: "🗣", name: "Polyglot", desc: "Log 4 different languages" }
];

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

function loadState() {
  const base = clone(DEFAULT_STATE);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object") return base;
    return {
      ...base,
      ...saved,
      profile: {
        ...base.profile,
        ...(saved.profile || {}),
        streak: { ...base.profile.streak, ...((saved.profile || {}).streak || {}) },
        badges: { ...((saved.profile || {}).badges || {}) }
      },
      settings: {
        ...base.settings,
        ...(saved.settings || {}),
        rates: { ...base.settings.rates, ...((saved.settings || {}).rates || {}) },
        dashboard: { ...base.settings.dashboard, ...(((saved.settings || {}).dashboard) || {}) }
      },
      sessions: Array.isArray(saved.sessions) ? saved.sessions : [],
      tasks: Array.isArray(saved.tasks) ? saved.tasks : [],
      leetcode: Array.isArray(saved.leetcode) ? saved.leetcode : [],
      friends: Array.isArray(saved.friends) ? saved.friends : [],
      rooms: Array.isArray(saved.rooms) ? saved.rooms : [],
      roomProgress: (saved.roomProgress && typeof saved.roomProgress === "object") ? saved.roomProgress : {},
      currentMeet: typeof saved.currentMeet === "string" ? saved.currentMeet : ""
    };
  } catch (e) {
    console.warn("LifeQuest: corrupt state, starting fresh", e);
    return base;
  }
}

let state = loadState();
let hasLocalData = (() => {
  try { return !!localStorage.getItem(STORAGE_KEY); } catch (e) { return false; }
})();

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    hasLocalData = true;
    const chip = document.getElementById("saveChip");
    if (chip) {
      chip.textContent = "JSON saved";
      clearTimeout(saveState._t);
      saveState._t = setTimeout(() => { chip.textContent = "JSON local"; }, 1200);
    }
    // Daily snapshot hook: one localStorage snapshot per day + folder
    // auto-save when the user picked a folder (see js/archive.js).
    if (typeof window !== "undefined" && window.Archive && typeof window.Archive.afterChange === "function") {
      try { window.Archive.afterChange(state); } catch (e) { /* never break saving */ }
    }
  } catch (e) {
    console.warn("LifeQuest: save failed", e);
  }
}

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(16).slice(2);
}

function localISO(date) {
  const d = date ? new Date(date) : new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function escapeHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/* ---------- time formatting ---------- */
function formatClock(totalSeconds) {
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(Math.floor(totalSeconds % 60)).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/* ---------- rewards ---------- */
function calculateReward(session, seconds) {
  const minutes = seconds / 60;
  const rates = state.settings.rates;
  const perMinute = rates[session.category] != null ? rates[session.category] : rates.Other;

  let coins = minutes * perMinute;

  const difficultyBonus = { None: 0, Easy: 2, Medium: 5, Hard: 10 }[session.difficulty] || 0;
  coins += difficultyBonus;

  if (session.source === "LeetCode" && session.status === "Accepted") {
    coins += state.settings.leetcodeBonus;
  }
  if (seconds >= 3600) coins += 15; // deep work bonus

  coins = Math.max(1, Math.round(coins));
  // owned coin boosters multiply the final payout
  const boost = toNumber(state.profile.boost, 1) || 1;
  coins = Math.max(1, Math.round(coins * boost));
  const xp = Math.max(1, Math.round(coins * 0.8));
  return { coins, xp };
}

function levelFromXp(xp) { return Math.floor(xp / 100) + 1; }

function addReward(coins, xp) {
  state.profile.coins += coins;
  state.profile.xp += xp;

  const today = localISO();
  const yesterday = localISO(new Date(Date.now() - 86400000));
  const st = state.profile.streak;
  if (st.lastDay !== today) {
    if (st.lastDay === yesterday) {
      st.current += 1;
    } else if (st.lastDay && toNumber(state.profile.freezes, 0) > 0) {
      // streak freeze: one missed day forgiven, streak kept
      state.profile.freezes -= 1;
      if (window.UI) UI.toast("🧊 Streak freeze used! Streak kept.", "gold");
    } else {
      st.current = st.lastDay ? 1 : st.current + 1;
    }
    st.lastDay = today;
    st.best = Math.max(st.best, st.current);
  }
  checkBadges();
  saveState();
}

/* ---------- badges ---------- */
function unlockedCount() { return Object.keys(state.profile.badges).length; }

function unlockBadge(id) {
  if (state.profile.badges[id]) return false;
  state.profile.badges[id] = new Date().toISOString();
  const b = BADGES.find((x) => x.id === id);
  if (b && window.UI) UI.toast(`🏆 Achievement unlocked: ${b.name}`, "gold");
  return true;
}

function checkBadges() {
  const p = state.profile;
  const level = levelFromXp(p.xp);
  const doneTasks = state.tasks.filter((t) => t.done).length;
  const lcAccepted = state.leetcode.filter((l) => l.status === "Accepted" || l.status === "Mastered").length;
  const langs = new Set(state.sessions.map((s) => s.language).filter(Boolean));
  const deep = state.sessions.some((s) => s.durationSec >= 3600);

  if (state.sessions.length >= 1) unlockBadge("first-session");
  if (doneTasks >= 10) unlockBadge("task-dozer");
  if (p.streak.current >= 7) unlockBadge("week-fire");
  if (p.streak.current >= 30) unlockBadge("iron-month");
  if (lcAccepted >= 10) unlockBadge("lc-10");
  if (lcAccepted >= 100) unlockBadge("lc-100");
  if (level >= 5) unlockBadge("level-5");
  if (level >= 10) unlockBadge("level-10");
  if (p.coins >= 1000) unlockBadge("coin-1000");
  if (state.github) unlockBadge("git-star");
  if (deep) unlockBadge("deep-work");
  if (langs.size >= 4) unlockBadge("polyglot");
}

/* ---------- stats helpers ---------- */
function todaySessions() {
  const today = localISO();
  return state.sessions.filter((s) => localISO(new Date(s.endedAt)) === today);
}

function lastNDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({ key: localISO(d), label: d.toLocaleDateString(undefined, { weekday: "short" }) });
  }
  return days;
}

function focusByDay(days) {
  return days.map((day) => ({
    ...day,
    seconds: state.sessions
      .filter((s) => localISO(new Date(s.endedAt)) === day.key)
      .reduce((sum, s) => sum + (s.durationSec || 0), 0)
  }));
}

function lcStreakDays() {
  const days = new Set(state.leetcode
    .filter((l) => l.solvedAt && (l.status === "Accepted" || l.status === "Mastered"))
    .map((l) => localISO(new Date(l.solvedAt))));
  // walk back from today (or yesterday)
  let cursor = new Date();
  if (!days.has(localISO(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (days.has(localISO(cursor))) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

/* ---------- seed / demo data ---------- */
function buildDemoData() {
  const s = clone(DEFAULT_STATE);
  const now = Date.now();
  const cats = ["Coding", "LeetCode", "Study", "Work", "Fitness", "Creative"];
  const langs = ["TypeScript", "Python", "Rust", "Go"];

  for (let i = 0; i < 34; i++) {
    const daysAgo = Math.floor(Math.random() * 7);
    const end = new Date(now - daysAgo * 86400000 - Math.floor(Math.random() * 10 * 3600000));
    const dur = (8 + Math.floor(Math.random() * 70)) * 60;
    const cat = cats[i % cats.length];
    const coins = Math.round((dur / 60) * (s.settings.rates[cat] || 1));
    s.sessions.push({
      id: uid(),
      title: ["Morning focus block", "Solved Two Sum", "Studied DP patterns", "Deep work session", "Workout", "Reading notes"][i % 6],
      category: cat,
      source: i % 5 === 0 ? "WakaTime" : i % 3 === 0 ? "LeetCode" : "Manual",
      status: i % 4 === 0 ? "Accepted" : "Completed",
      difficulty: i % 3 === 0 ? "Medium" : "None",
      project: "",
      language: langs[i % langs.length],
      problem: "", tags: [], notes: "",
      startedAt: new Date(end.getTime() - dur * 1000).toISOString(),
      endedAt: end.toISOString(),
      durationSec: dur,
      coins, xp: Math.round(coins * 0.8)
    });
  }
  s.sessions.sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt));

  const taskTitles = [
    "Morning workout", "Review open quests", "Write week reflection", "Finish DP module",
    "Apply to 3 roles", "Clean up inbox", "Gym session", "Rewrite resume bullet points",
    "Mock interview with friend", "Evening walk", "Read one chapter", "Plan tomorrow's top 3",
    "Fix flaky test", "Update study notes", "Water the plant", "Call mentor",
    "Refactor notes", "Tidy desk"
  ];
  taskTitles.forEach((t, i) => {
    const done = i < 14;
    s.tasks.push({
      id: uid(), title: t, done,
      priority: ["high", "med", "low"][i % 3],
      reward: 6,
      createdAt: new Date(now - (7 - (i % 7)) * 86400000).toISOString(),
      completedAt: done ? new Date(now - (i % 5) * 86400000).toISOString() : null
    });
  });

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
    ["Trapping Rain II", "Hard", "Queued"], ["Unique Paths", "Medium", "Accepted"],
    ["Longest Palindrome", "Easy", "Accepted"], ["Decode Ways", "Medium", "Accepted"],
    ["Clone Graph", "Medium", "Accepted"], ["Populating Next Right", "Medium", "Needs Review"],
    ["Max Subarray", "Easy", "Accepted"], ["Edit Distance", "Medium", "Accepted"],
    ["Search in Rotated Array", "Medium", "Accepted"], ["Permutations", "Medium", "In Progress"],
    ["Combination Sum", "Medium", "Accepted"], ["First Missing Positive", "Hard", "Queued"],
    ["Product of Array", "Easy", "Accepted"], ["Sliding Window Max", "Hard", "Accepted"],
    ["Longest Consecutive", "Medium", "Accepted"], ["Insert Interval", "Medium", "Accepted"],
    ["Minimum Window", "Hard", "Accepted"], ["Merge Intervals", "Medium", "Accepted"]
  ];
  lcSeeds.forEach(([title, diff, status], i) => {
    const solved = status === "Accepted" || status === "Mastered";
    const minutes = 5 + Math.floor(Math.random() * 55);
    s.leetcode.push({
      id: uid(), title, difficulty: diff, status,
      language: langs[i % langs.length],
      tags: ["dsa"], url: "", notes: "",
      attempts: solved ? 1 + (i % 3) : 2 + (i % 2),
      timeSpentSec: minutes * 60,
      lastTried: new Date(now - (i % 6) * 86400000).toISOString(),
      solvedAt: solved ? new Date(now - (i % 5) * 86400000).toISOString() : null
    });
  });

  s.profile.coins = 4820;
  s.profile.xp = 1150;
  s.profile.streak = { current: 12, best: 21, lastDay: localISO() };
  s.settings.leetcodeUser = "shahmeet644";
  s.settings.githubUser = "Meet6338-X";
  s.leetcodeLive = {
    username: "shahmeet644",
    lastSync: new Date().toISOString(),
    stats: { solved: 238, easy: 87, medium: 111, hard: 40, ranking: 698114, acceptance: 80.3 }
  };
  // Second profile: verified total only, no invented difficulty split.
  s.leetcodeLive2 = {
    username: "BugSlayerMeet",
    lastSync: new Date().toISOString(),
    stats: { solved: 178, easy: 0, medium: 0, hard: 0, ranking: null, acceptance: null }
  };
  // Aggregate GitHub totals only. No repo names are stored or shown.
  s.github = {
    username: "Meet6338-X",
    lastSync: new Date().toISOString(),
    profile: { public_repos: 51, followers: 42, totalStars: 1 },
    repos: []
  };
  checkBadges();
  return s;
}

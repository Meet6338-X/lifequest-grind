/* ============================================================
   LifeQuest app — UI, timer, rendering, wiring
   ============================================================ */
"use strict";

/* ---------- tiny UI helpers ---------- */
const UI = {
  toast(text, kind) {
    const host = document.getElementById("toastHost");
    if (!host) return;
    const el = document.createElement("div");
    el.className = "toast" + (kind === "gold" ? " gold" : "");
    el.textContent = text;
    host.appendChild(el);
    setTimeout(() => {
      el.classList.add("out");
      setTimeout(() => el.remove(), 350);
    }, 2600);
  },

  burst(x, y) {
    const colors = ["#ff5b57", "#12b3a4", "#ffc531", "#6b5be6", "#3aa0ff"];
    for (let i = 0; i < 18; i++) {
      const p = document.createElement("span");
      p.className = "burst";
      const ang = (Math.PI * 2 * i) / 18 + Math.random() * 0.5;
      const dist = 70 + Math.random() * 90;
      p.style.left = x + "px";
      p.style.top = y + "px";
      p.style.background = colors[i % colors.length];
      p.style.border = "2px solid #17140d";
      p.style.setProperty("--bx", Math.cos(ang) * dist + "px");
      p.style.setProperty("--by", Math.sin(ang) * dist + "px");
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 1100);
    }
  },

  esc: escapeHtml
};
window.UI = UI;

/* ---------- view switching ---------- */
function switchView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  const view = document.getElementById("view-" + name);
  const btn = document.querySelector(`.nav-btn[data-view="${name}"]`);
  if (view) view.classList.add("active");
  if (btn) btn.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------- pomodoro: focus/break cycles on top of the master timer ----------
   Focus phases finish through the normal finishTimer path (real coins,
   real sessions). Break phases count down and are discarded. */
const Pomo = { on: false, phase: "focus", cyclesLeft: 0, cyclesTotal: 0, endAt: 0, focusSec: 0, breakSec: 0 };

function pomoLabel() {
  const left = Math.max(0, Math.ceil((Pomo.endAt - Date.now()) / 1000));
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  return Pomo.phase === "focus"
    ? `🍅 focus ${mm}:${ss} left · cycle ${Pomo.cyclesTotal - Pomo.cyclesLeft + 1}/${Pomo.cyclesTotal}`
    : `☕ break ${mm}:${ss} · next cycle ${Pomo.cyclesTotal - Pomo.cyclesLeft + 1}/${Pomo.cyclesTotal}`;
}

function startPomo() {
  const focusMin = Math.max(0.05, toNumber(document.getElementById("pomoFocus").value, 25) || 25);
  const breakMin = Math.max(0.05, toNumber(document.getElementById("pomoBreak").value, 5) || 5);
  const cycles = Math.min(12, Math.max(1, Math.round(toNumber(document.getElementById("pomoCycles").value, 4) || 4)));
  Pomo.on = true;
  Pomo.phase = "focus";
  Pomo.cyclesLeft = cycles;
  Pomo.cyclesTotal = cycles;
  Pomo.focusSec = Math.round(focusMin * 60);
  Pomo.breakSec = Math.round(breakMin * 60);
  resetTimer();
  startTimer();
  Pomo.endAt = Date.now() + Pomo.focusSec * 1000;
  const hint = document.getElementById("timerHint");
  if (hint) hint.textContent = pomoLabel();
  const btn = document.getElementById("pomoBtn");
  if (btn) btn.textContent = "Stop 🍅";
  UI.toast(`Pomodoro started: ${cycles} x ${focusMin}m`);
  Companion.react("start");
}

function stopPomo(silent) {
  Pomo.on = false;
  if (timer.running) pauseTimer();
  resetTimer();
  const btn = document.getElementById("pomoBtn");
  if (btn) btn.textContent = "Pomodoro";
  if (!silent) {
    const hint = document.getElementById("timerHint");
    if (hint) hint.textContent = "Press Start to begin a session";
  }
}

/* called from tick(): advances phases when a countdown hits zero */
function pomoTick() {
  if (!Pomo.on || !timer.running) return;
  if (Date.now() < Pomo.endAt) {
    const hint = document.getElementById("timerHint");
    if (hint && timer.running) hint.textContent = pomoLabel();
    return;
  }
  if (Pomo.phase === "focus") {
    finishTimer();
    Pomo.cyclesLeft -= 1;
    if (Pomo.cyclesLeft <= 0) {
      stopPomo(true);
      addReward(25, 25);
      UI.toast("🍅 All pomodoros done! +25 bonus coins", "gold");
      Companion.react("level");
      renderAll();
      return;
    }
    Pomo.phase = "break";
    resetTimer();
    startTimer();
    Pomo.endAt = Date.now() + Pomo.breakSec * 1000;
    UI.toast("Focus logged. Break time ☕");
  } else {
    Pomo.phase = "focus";
    resetTimer();
    startTimer();
    Pomo.endAt = Date.now() + Pomo.focusSec * 1000;
    UI.toast("Break over. Back to focus 🍅");
    Companion.react("start");
  }
  renderAll();
}

/* ---------- timer engine ---------- */
const timer = {
  elapsedMs: 0,
  running: false,
  startedAt: null,
  lastTs: 0,
  interval: null
};

function renderTime() {
  const el = document.getElementById("timeDisplay");
  if (el) el.textContent = formatClock(Math.floor(timer.elapsedMs / 1000));
  const earn = document.getElementById("liveEarn");
  if (earn && timer.running) {
    const session = readSessionForm();
    const r = calculateReward(session, Math.floor(timer.elapsedMs / 1000));
    earn.textContent = `+${r.coins} coins so far · +${r.xp} XP`;
  }
}

function tick() {
  if (!timer.running) return;
  const now = Date.now();
  timer.elapsedMs += now - timer.lastTs;
  timer.lastTs = now;
  renderTime();
  pomoTick();
}

function setTimerUi(running) {
  const start = document.getElementById("startBtn");
  const pause = document.getElementById("pauseBtn");
  const finish = document.getElementById("finishBtn");
  const stateChip = document.getElementById("timerState");
  const display = document.getElementById("timeDisplay");
  const earn = document.getElementById("liveEarn");

  start.textContent = running ? "Running..." : timer.elapsedMs > 0 ? "Resume" : "Start";
  pause.disabled = !running;
  finish.disabled = !(running || timer.elapsedMs > 0);
  if (stateChip) stateChip.textContent = running ? "in progress" : timer.elapsedMs > 0 ? "paused" : "idle";
  if (display) display.classList.toggle("running", running);
  if (earn) earn.hidden = !running;
}

function startTimer() {
  if (timer.running) return;
  timer.running = true;
  if (!timer.startedAt) timer.startedAt = new Date();
  timer.lastTs = Date.now();
  timer.interval = setInterval(tick, 300);
  setTimerUi(true);
  Companion.react("start");
  const hint = document.getElementById("timerHint");
  if (hint) hint.textContent = "Tracking. Stay in it.";
}

function pauseTimer() {
  if (!timer.running) return;
  tick();
  timer.running = false;
  clearInterval(timer.interval);
  setTimerUi(false);
  const hint = document.getElementById("timerHint");
  if (hint) hint.textContent = "Paused. Resume whenever.";
}

function readSessionForm() {
  const val = (id) => (document.getElementById(id) || {}).value || "";
  return {
    id: uid(),
    title: val("fTitle").trim(),
    category: val("fCategory") || "Other",
    source: val("fSource") || "Manual",
    status: val("fStatus") || "Completed",
    difficulty: val("fDifficulty") || "None",
    project: val("fProject").trim(),
    language: val("fLanguage").trim(),
    problem: val("fProblem").trim(),
    tags: val("fTags").split(",").map((t) => t.trim()).filter(Boolean),
    mood: val("fMood"),
    focusScore: val("fFocus"),
    notes: val("fNotes").trim()
  };
}

function finishTimer() {
  if (timer.running) {
    tick();
    timer.running = false;
    clearInterval(timer.interval);
  }
  const seconds = Math.floor(timer.elapsedMs / 1000);
  if (seconds < 5) {
    UI.toast("Track at least 5 seconds to earn rewards");
    return;
  }

  const session = readSessionForm();
  const reward = calculateReward(session, seconds);
  const endedAt = new Date();
  const startedAt = timer.startedAt || new Date(endedAt.getTime() - seconds * 1000);

  Object.assign(session, {
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationSec: seconds,
    coins: reward.coins,
    xp: reward.xp
  });

  // linked Google Meet goes on the session when enabled
  if (state.settings.meetAttach !== false && state.currentMeet) {
    session.meet = state.currentMeet;
    session.notes = (session.notes ? session.notes + "\n" : "") + "Meet: " + state.currentMeet;
  }

  const beforeLevel = levelFromXp(state.profile.xp);
  state.sessions.unshift(session);
  addReward(reward.coins, reward.xp);
  const afterLevel = levelFromXp(state.profile.xp);

  // LeetCode convenience: log accepted problem straight into tracker
  if (session.category === "LeetCode" && session.status === "Accepted" && session.problem) {
    state.leetcode.unshift({
      id: uid(),
      title: session.problem,
      difficulty: session.difficulty === "None" ? "Medium" : session.difficulty,
      status: "Accepted",
      language: session.language || "",
      tags: session.tags,
      url: session.problem.startsWith("http") ? session.problem : "",
      notes: session.notes,
      attempts: 1,
      timeSpentSec: seconds,
      lastTried: endedAt.toISOString(),
      solvedAt: endedAt.toISOString()
    });
  }

  resetTimer();
  ["fTitle", "fProblem", "fProject", "fLanguage", "fNotes", "fTags"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  const rect = document.getElementById("finishBtn").getBoundingClientRect();
  UI.burst(rect.left + rect.width / 2, rect.top + rect.height / 2);
  UI.toast(`+${reward.coins} coins · +${reward.xp} XP earned!`, "gold");

  if (afterLevel > beforeLevel) {
    setTimeout(() => UI.toast(`LEVEL UP! You are now level ${afterLevel}`, "gold"), 700);
    Companion.react("level");
  } else {
    Companion.react("finish");
  }

  renderAll();
}

function resetTimer() {
  timer.elapsedMs = 0;
  timer.startedAt = null;
  setTimerUi(false);
  renderTime();
  const hint = document.getElementById("timerHint");
  if (hint) hint.textContent = "Press Start to begin a session";
}

function logManualSession() {
  const sVal = document.getElementById("fStart").value;
  const eVal = document.getElementById("fEnd").value;
  if (!sVal || !eVal) { UI.toast("Pick both start and end times"); return; }
  const start = new Date(sVal), end = new Date(eVal);
  const seconds = Math.floor((end - start) / 1000);
  if (!(seconds > 0)) { UI.toast("End must be after start"); return; }

  const session = readSessionForm();
  const reward = calculateReward(session, seconds);
  Object.assign(session, {
    startedAt: start.toISOString(),
    endedAt: end.toISOString(),
    durationSec: seconds,
    coins: reward.coins,
    xp: reward.xp
  });
  if (state.settings.meetAttach !== false && state.currentMeet) {
    session.meet = state.currentMeet;
    session.notes = (session.notes ? session.notes + "\n" : "") + "Meet: " + state.currentMeet;
  }
  state.sessions.unshift(session);
  addReward(reward.coins, reward.xp);
  UI.toast(`Logged ${formatDuration(seconds)} · +${reward.coins} coins`, "gold");
  renderAll();
}

/* ---------- tasks ---------- */
function addTask(title, priority) {
  const t = (title || "").trim();
  if (!t) return;
  state.tasks.unshift({
    id: uid(),
    title: t,
    done: false,
    priority: priority || "med",
    reward: state.settings.taskReward,
    createdAt: new Date().toISOString(),
    completedAt: null
  });
  saveState();
  renderAll();
}

function toggleTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  if (!task.done) {
    task.done = true;
    task.completedAt = new Date().toISOString();
    const reward = task.reward != null ? task.reward : state.settings.taskReward;
    const beforeLevel = levelFromXp(state.profile.xp);
    addReward(reward, reward);
    const afterLevel = levelFromXp(state.profile.xp);
    UI.toast(`Quest cleared · +${reward} coins`, "gold");
    Companion.react(afterLevel > beforeLevel ? "level" : "finish");
  } else {
    task.done = false;
    task.completedAt = null;
    saveState();
  }
  renderAll();
}

function deleteTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  saveState();
  renderAll();
}

let taskFilter = "all";

function taskRow(t) {
  const prio = t.priority || "med";
  return `
    <div class="task ${t.done ? "done" : ""}">
      <button class="task-check ${t.done ? "on" : ""}" data-task-toggle="${t.id}" aria-label="toggle">✓</button>
      <span class="task-title">${UI.esc(t.title)}</span>
      <span class="prio prio-${prio}">${prio.toUpperCase()}</span>
      <span class="reward-pill">+${t.reward != null ? t.reward : state.settings.taskReward}</span>
      <button class="icon-btn" data-task-del="${t.id}" title="delete">✕</button>
    </div>`;
}

function renderTasks() {
  const open = state.tasks.filter((t) => !t.done).length;
  const done = state.tasks.length - open;

  const list = document.getElementById("taskList");
  if (list) {
    const filtered = state.tasks.filter((t) =>
      taskFilter === "all" ? true : taskFilter === "open" ? !t.done : t.done
    );
    list.innerHTML = filtered.length
      ? filtered.map(taskRow).join("")
      : `<div class="empty">No quests here yet. Add one above.</div>`;
  }

  const quick = document.getElementById("quickTaskList");
  if (quick) {
    const first = state.tasks.filter((t) => !t.done).slice(0, 5);
    quick.innerHTML = first.length
      ? first.map(taskRow).join("")
      : `<div class="empty">All clear. Add today's quests.</div>`;
  }

  const doneChip = document.getElementById("taskDoneChip");
  if (doneChip) doneChip.textContent = `${done} / ${state.tasks.length} done`;
  const rwChip = document.getElementById("taskRewardChip");
  if (rwChip) rwChip.textContent = `+${state.settings.taskReward} coins each`;

  const totalDone = document.getElementById("taskTotalDone");
  if (totalDone) totalDone.textContent = String(done);
  const taskCoins = document.getElementById("taskCoins");
  if (taskCoins) {
    const sum = state.tasks.filter((t) => t.done)
      .reduce((s, t) => s + (t.reward != null ? t.reward : state.settings.taskReward), 0);
    taskCoins.textContent = String(sum);
  }

  const pct = state.tasks.length ? Math.round((done / state.tasks.length) * 100) : 0;
  const num = document.getElementById("dailyBonusNum");
  if (num) num.textContent = pct + "%";
  const fill = document.getElementById("dailyBonusFill");
  if (fill) fill.style.width = pct + "%";
}

/* ---------- sessions ---------- */
function sessionRow(s) {
  const when = new Date(s.endedAt).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  });
  const bits = [s.category, s.source, s.status];
  if (s.difficulty && s.difficulty !== "None") bits.push(s.difficulty);
  return `
    <div class="session">
      <div style="min-width:0">
        <div class="strong">${UI.esc(s.title || s.category)}</div>
        <div class="session-meta">${when} · ${UI.esc(bits.join(" · "))}</div>
        ${s.project ? `<div class="session-meta">📁 ${UI.esc(s.project)}</div>` : ""}
        ${s.language ? `<div class="session-meta">⌨ ${UI.esc(s.language)}</div>` : ""}
        ${s.problem ? `<div class="session-meta">🧩 ${UI.esc(s.problem)}</div>` : ""}
        ${s.meet ? `<div class="session-meta">🎥 <a href="${UI.esc(s.meet)}" target="_blank" rel="noopener" style="color:inherit">Meet session</a></div>` : ""}
        ${s.tags && s.tags.length ? `<div class="row" style="margin-top:6px">${s.tags.map((t) => `<span class="tag">${UI.esc(t)}</span>`).join("")}</div>` : ""}
      </div>
      <div class="right">
        <div class="reward-pill">+${s.coins} coins</div>
        <div class="session-meta">${formatDuration(s.durationSec)}</div>
      </div>
    </div>`;
}

function renderSessions() {
  const list = document.getElementById("sessionList");
  if (!list) return;
  const count = document.getElementById("sessionCount");
  if (count) count.textContent = `${state.sessions.length} total`;
  list.innerHTML = state.sessions.length
    ? state.sessions.slice(0, 12).map(sessionRow).join("")
    : `<div class="empty">No sessions yet. Hit Start on the master timer.</div>`;
}

/* ---------- stats ---------- */
function renderHeader() {
  const money = document.getElementById("moneyChip");
  if (money) money.textContent = `$${(state.profile.coins / 100).toFixed(2)}`;
  const lvl = document.getElementById("levelChip");
  if (lvl) lvl.textContent = `Level ${levelFromXp(state.profile.xp)}`;
  const st = document.getElementById("streakChip");
  if (st) st.textContent = `${state.profile.streak.current} day streak`;
}

function statCard(label, value) {
  return `<div class="stat"><div class="muted small">${label}</div><div class="value">${value}</div></div>`;
}

function renderStats() {
  const grid = document.getElementById("statsGrid");
  const todaySeconds = todaySessions().reduce((sum, s) => sum + s.durationSec, 0);
  const wakaSeconds = state.sessions.filter((s) => s.source === "WakaTime")
    .reduce((sum, s) => sum + s.durationSec, 0);
  const lcAc = state.leetcode.filter((l) => l.status === "Accepted" || l.status === "Mastered").length;
  const tasksDone = state.tasks.filter((t) => t.done).length;
  const totalSeconds = state.sessions.reduce((sum, s) => sum + s.durationSec, 0);

  if (grid) {
    grid.innerHTML = [
      statCard("Today", formatDuration(todaySeconds)),
      statCard("Money", `$${(state.profile.coins / 100).toFixed(2)}`),
      statCard("Streak", `${state.profile.streak.current}d`),
      statCard("LeetCode AC", String(lcAc)),
      statCard("WakaTime", formatDuration(wakaSeconds)),
      statCard("Tasks done", String(tasksDone))
    ].join("");
  }

  const chip = document.getElementById("totalFocusChip");
  if (chip) chip.textContent = `${(totalSeconds / 3600).toFixed(1)}h focused`;

  const st = document.getElementById("lcStreakChip");
  if (st) st.textContent = `${lcStreakDays()} day grind`;
}

const CHART_COLORS = ["#ffc531", "#ff5b57", "#6b5be6", "#12b3a4", "#3aa0ff", "#ff5b57", "#12b3a4"];

function chartHtml(days, tall) {
  const max = Math.max(...days.map((d) => d.seconds), 60);
  return days.map((d, i) => {
    const minutes = Math.round(d.seconds / 60);
    const h = Math.max(6, Math.round((d.seconds / max) * 100));
    return `
      <div class="bar-wrap" title="${d.label}: ${minutes} min">
        <div class="bar" style="height:${h}%;background:${CHART_COLORS[i % CHART_COLORS.length]};animation-delay:${i * 60}ms"></div>
        <div class="bar-label">${d.label}</div>
        <div class="bar-val">${minutes}m</div>
      </div>`;
  }).join("");
}

function renderCharts() {
  const days = focusByDay(lastNDays(7));
  const a = document.getElementById("weekChart");
  if (a) a.innerHTML = chartHtml(days);
  const b = document.getElementById("weekChartBig");
  if (b) b.innerHTML = chartHtml(days, true);
}

function hbar(label, value, max, color) {
  const pct = max > 0 ? Math.max(3, Math.round((value / max) * 100)) : 0;
  return `
    <div class="hbar-row">
      <div class="hbar-top"><span>${UI.esc(label)}</span><span>${value}</span></div>
      <div class="hbar"><i style="width:${pct}%;background:${color}"></i></div>
    </div>`;
}

function renderCategoryBars() {
  const byCat = {};
  state.sessions.forEach((s) => {
    byCat[s.category] = (byCat[s.category] || 0) + s.durationSec;
  });
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const max = entries.length ? entries[0][1] : 0;
  const colors = ["#12b3a4", "#ff5b57", "#ffc531", "#6b5be6", "#3aa0ff", "#22c55e"];
  const el = document.getElementById("categoryBars");
  if (el) {
    el.innerHTML = entries.length
      ? entries.map(([k, v], i) => hbar(k, formatDuration(v), max, colors[i % colors.length])).join("")
      : `<div class="empty">No sessions yet.</div>`;
  }

  const byMoney = {};
  state.sessions.forEach((s) => { byMoney[s.category] = (byMoney[s.category] || 0) + (s.coins || 0); });
  const mEntries = Object.entries(byMoney).sort((a, b) => b[1] - a[1]);
  const mMax = mEntries.length ? mEntries[0][1] : 0;
  const mEl = document.getElementById("moneyBars");
  if (mEl) {
    mEl.innerHTML = mEntries.length
      ? mEntries.map(([k, v], i) => hbar(k, v + " ¢", mMax, colors[i % colors.length])).join("")
      : `<div class="empty">Earn some coins first.</div>`;
  }
}

/* ---------- LeetCode view ---------- */
function lcRow(l) {
  const diffCls = { Easy: "diff-easy", Medium: "diff-medium", Hard: "diff-hard" }[l.difficulty] || "";
  return `
    <div class="lc-row">
      <div style="min-width:0;flex:1">
        <div class="strong">
          ${l.url ? `<a href="${UI.esc(l.url)}" target="_blank" rel="noopener" style="color:inherit">${UI.esc(l.title)}</a>` : UI.esc(l.title)}
        </div>
        <div class="session-meta">
          ${UI.esc(l.status)} · ${UI.esc(l.language || "any lang")}
          ${l.attempts ? ` · ${l.attempts} attempt${l.attempts > 1 ? "s" : ""}` : ""}
          ${l.timeSpentSec ? ` · ${formatDuration(l.timeSpentSec)}` : ""}
        </div>
        ${l.notes ? `<div class="session-meta">${UI.esc(l.notes.slice(0, 120))}</div>` : ""}
        ${l.tags && l.tags.length ? `<div class="row" style="margin-top:6px">${l.tags.map((t) => `<span class="tag">${UI.esc(t)}</span>`).join("")}</div>` : ""}
      </div>
      <div class="row">
        <span class="mini-badge ${diffCls}">${l.difficulty}</span>
        <select class="input input-sm" data-lc-status="${l.id}">
          ${["Not Started", "Queued", "In Progress", "Accepted", "Wrong Answer", "TLE", "Needs Review", "Mastered"]
            .map((s) => `<option ${s === l.status ? "selected" : ""}>${s}</option>`).join("")}
        </select>
        <button class="icon-btn" data-lc-del="${l.id}" title="delete">✕</button>
      </div>
    </div>`;
}

function renderLeetCode() {
  const diffF = document.getElementById("lcFilterDiff");
  const stF = document.getElementById("lcFilterStatus");
  const df = diffF ? diffF.value : "";
  const sf = stF ? stF.value : "";

  const filtered = state.leetcode.filter((l) =>
    (!df || l.difficulty === df) && (!sf || l.status === sf));

  const list = document.getElementById("lcList");
  if (list) {
    list.innerHTML = filtered.length
      ? filtered.map(lcRow).join("")
      : `<div class="empty">No problems match. Add your first above.</div>`;
  }

  const review = document.getElementById("lcReview");
  if (review) {
    const queue = state.leetcode.filter((l) =>
      l.status === "Needs Review" || l.status === "Wrong Answer" || l.status === "TLE" ||
      (l.status === "Accepted" && daysSince(l.lastTried) >= 7 && l.status !== "Mastered"));
    const seen = new Set();
    const dedup = queue.filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true))).slice(0, 8);
    review.innerHTML = dedup.length
      ? dedup.map((l) => `
        <div class="lc-row">
          <div style="flex:1"><div class="strong">${UI.esc(l.title)}</div>
          <div class="session-meta">${UI.esc(l.status)}${l.lastTried ? ` · last tried ${new Date(l.lastTried).toLocaleDateString()}` : ""}</div></div>
          <button class="btn btn-violet btn-sm" data-lc-review="${l.id}">Mark reviewed</button>
        </div>`).join("")
      : `<div class="empty">Queue empty. Nothing due for review.</div>`;
  }

  const liveChip = document.getElementById("lcSyncChip");
  if (liveChip) liveChip.textContent = state.leetcodeLive2 ? "2 synced" : state.leetcodeLive ? "synced" : "manual";
  const live = document.getElementById("lcLiveTotal");
  if (live) {
    const a = state.leetcodeLive ? state.leetcodeLive.stats.solved : 0;
    const b = state.leetcodeLive2 ? state.leetcodeLive2.stats.solved : 0;
    live.textContent = state.leetcodeLive ? String(a + b) : "—";
    live.title = state.leetcodeLive2
      ? `${state.leetcodeLive.username}: ${a} + ${state.leetcodeLive2.username}: ${b}`
      : "";
  }

  const user = document.getElementById("lcUser");
  if (user && !user.value && state.settings.leetcodeUser) user.value = state.settings.leetcodeUser;
  const user2 = document.getElementById("lcUser2");
  if (user2 && !user2.value && state.settings.leetcodeUser2) user2.value = state.settings.leetcodeUser2;
}

function daysSince(iso) {
  if (!iso) return 999;
  return Math.floor((Date.now() - new Date(iso)) / 86400000);
}

/* ---------- badges ---------- */
function renderBadges() {
  const grid = document.getElementById("badgeGrid");
  if (!grid) return;
  grid.innerHTML = BADGES.map((b) => {
    const at = state.profile.badges[b.id];
    return `
      <div class="badge ${at ? "" : "locked"}">
        <span class="b-ico">${b.ico}</span>
        <div class="b-name">${b.name}</div>
        <div class="b-desc">${b.desc}</div>
        ${at ? `<div class="b-date">unlocked ${new Date(at).toLocaleDateString()}</div>` : `<div class="b-desc">locked</div>`}
      </div>`;
  }).join("");
}

/* ---------- GitHub panel (aggregate totals only, no repo names) ---------- */
function renderGitHub() {
  const box = document.getElementById("ghProfile");
  const repos = document.getElementById("ghRepos");
  const user = document.getElementById("ghUser");
  if (user && !user.value && state.settings.githubUser) user.value = state.settings.githubUser;
  if (!box) return;

  if (!state.github) {
    box.innerHTML = `<div class="empty">Not connected. Enter a username and hit Fetch.</div>`;
    if (repos) repos.innerHTML = "";
    return;
  }
  const p = state.github.profile;
  box.innerHTML = `
    <div class="stat-grid">
      ${statCard("Repos", p.public_repos)}
      ${statCard("Stars earned", p.totalStars)}
      ${statCard("Followers", p.followers)}
      ${statCard("Tracked", (state.github.repos || []).length)}
    </div>
    <div class="muted small" style="margin-top:8px">Aggregate totals only. No repo names stored.</div>`;
  if (repos) {
    repos.innerHTML = `<div class="muted small">Top languages and stars are folded into the totals above.</div>`;
  }
}

/* ---------- dashboard cards (add / remove blocks) ---------- */
const DASH_CARDS = {
  companion: "companionCard",
  stats: "statsCard",
  market: "marketCard",
  quests: "questsCard",
  sessions: "sessionsCard",
  rooms: "roomsCard"
};

// default column spans on wide screens (timer + market are double-wide, rooms full row)
const DEFAULT_CARD_SPANS = { timer: 2, companion: 1, stats: 1, market: 2, quests: 1, sessions: 1, rooms: 4 };
const CARD_IDS = { timer: "timerCard", ...DASH_CARDS };

function cardSize(key) {
  const saved = (state.settings && state.settings.cardSizes && state.settings.cardSizes[key]) || {};
  return {
    span: Math.min(4, Math.max(1, toNumber(saved.span, DEFAULT_CARD_SPANS[key] || 1))),
    tall: !!saved.tall
  };
}

/* Drag-to-resize any dashboard block: horizontal drag changes width
   (1-4 columns), dragging down makes it tall. Saved per block. */
function resizeCard(key, span, tall) {
  if (!CARD_IDS[key]) return null;
  if (!state.settings.cardSizes) state.settings.cardSizes = {};
  const size = {
    span: Math.min(4, Math.max(1, Math.round(span) || 1)),
    tall: !!tall
  };
  state.settings.cardSizes[key] = size;
  applyCardSizes();
  saveState();
  return size;
}

function applyCardSizes() {
  Object.keys(CARD_IDS).forEach((key) => {
    const el = document.getElementById(CARD_IDS[key]);
    if (!el) return;
    const size = cardSize(key);
    el.style.gridColumn = `span ${size.span}`;
    el.classList.toggle("tall", size.tall);
  });
}

function renderDashboard() {
  const vis = (state.settings && state.settings.dashboard) || {};
  Object.entries(DASH_CARDS).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.hidden = vis[key] === false;
  });
  document.querySelectorAll("#dashToggles [data-dash]").forEach((b) => {
    b.classList.toggle("active", vis[b.dataset.dash] !== false);
  });
  applyCardSizes();
}

/* ---------- sidebar (hide when not using, drag edge to open) ---------- */
function renderSidebar() {
  const hidden = state.settings && state.settings.sidebar === false;
  document.body.classList.toggle("side-hidden", hidden);
  const openBtn = document.getElementById("sideOpenBtn");
  if (openBtn) openBtn.hidden = !hidden;
}

function toggleSidebar() {
  const hidden = !(state.settings && state.settings.sidebar === false);
  state.settings.sidebar = !hidden;
  saveState();
  renderSidebar();
  return state.settings.sidebar;
}

/* ---------- settings ---------- */
function renderSettings() {
  document.documentElement.dataset.theme = state.settings.theme || "memphis";

  document.querySelectorAll("[data-theme-pick]").forEach((b) => {
    b.classList.toggle("active", b.dataset.themePick === (state.settings.theme || "memphis"));
  });

  const bg = state.settings.background || "none";
  document.querySelectorAll("[data-bg]").forEach((b) => {
    b.classList.toggle("active", b.dataset.bg === bg);
    if (b.dataset.bg !== "none" && !b.style.backgroundImage) {
      b.style.backgroundImage = `url("${b.dataset.bg}")`;
    }
  });
  applyBackground();

  const cs = document.getElementById("companionSelect");
  if (cs) cs.value = state.settings.companion;
  const cn = document.getElementById("companionName");
  if (cn && !cn.value) cn.value = state.settings.companionName || "";

  const mu = document.getElementById("musicUrl");
  if (mu && !mu.value) mu.value = state.settings.musicUrl || "";
  const mv = document.getElementById("musicVolume");
  if (mv) mv.value = toNumber(state.settings.musicVolume, 55);

  const wk = document.getElementById("wakaKey");
  if (wk && !wk.value) wk.value = state.settings.wakaKey || "";

  const tr = document.getElementById("setTaskReward");
  if (tr) tr.value = state.settings.taskReward;
  const lb = document.getElementById("setLcBonus");
  if (lb) lb.value = state.settings.leetcodeBonus;

  const veil = document.getElementById("bgVeil");
  if (veil) veil.value = toNumber(state.settings.bgVeil, 55);

  // panel transparency: slide left to enjoy the background through the blocks
  const pop = document.getElementById("panelOpacity");
  if (pop) pop.value = toNumber(state.settings.panelOpacity, 100);
  applyPanelOpacity();

  // interface size (resize the whole app shell)
  const uis = document.getElementById("uiScale");
  if (uis) uis.value = toNumber(state.settings.uiScale, 100);
  applyUiScale();

  renderDashboard();
  renderSidebar();

  const rateList = document.getElementById("rateList");
  if (rateList && !rateList.dataset.built) {
    rateList.dataset.built = "1";
    rateList.innerHTML = Object.keys(state.settings.rates).map((k) => `
      <label class="row small" style="justify-content:space-between">
        <span>${k} (coins/min)</span>
        <input class="input input-sm" style="width:90px" type="number" min="0" step="0.1" data-rate="${k}" value="${state.settings.rates[k]}" />
      </label>`).join("");
  } else if (rateList) {
    rateList.querySelectorAll("[data-rate]").forEach((i) => {
      i.value = state.settings.rates[i.dataset.rate];
    });
  }
}

function applyBackground() {
  const el = document.getElementById("bgImage");
  if (!el) return;
  const bg = state.settings.background || "none";
  const veil = toNumber(state.settings.bgVeil, 55);

  if (!bg || bg === "none") {
    el.classList.remove("on");
    el.style.backgroundImage = "";
    return;
  }

  // Veil color matches the current theme's background hue for readability
  const themeBg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#f5efe2";
  const rgb = hexToRgb(themeBg) || { r: 245, g: 239, b: 226 };
  const alpha = Math.min(0.92, Math.max(0.08, veil / 100));
  el.style.setProperty("--bg-veil", `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`);

  el.style.backgroundImage = `url("${bg}")`;
  el.classList.add("on");
}

function applyPanelOpacity() {
  const pct = Math.min(100, Math.max(25, toNumber(state.settings.panelOpacity, 100)));
  document.body.classList.toggle("glass", pct < 100);
  document.documentElement.style.setProperty("--panel-mix", pct + "%");
}

/* Interface resize: scales the whole app shell (web + exe alike). */
function applyUiScale() {
  const pct = Math.min(120, Math.max(80, toNumber(state.settings.uiScale, 100)));
  const shell = document.querySelector(".app");
  if (shell) shell.style.zoom = String(pct / 100);
}

/* Float the tunes over every application: exe pops a system overlay
   window, browsers use a floating picture-in-picture window. */
async function floatMusic() {
  const dock = document.getElementById("musicDock");
  const urlInput = document.getElementById("musicUrl");
  const url = (urlInput && urlInput.value.trim()) || state.settings.musicUrl || "";
  // dock hidden (no track loaded yet): load the saved track first
  // instead of dying silently — this was the "nothing happens" bug
  if (dock && dock.hidden) {
    if (!url) { UI.toast("Link a YouTube track first, then float it"); return; }
    UI.toast("Loading track, floating next…");
    const loaded = await Music.load(url);
    if (!loaded || dock.hidden) { UI.toast("Could not load that track"); return; }
  }
  if (window.LQ && window.LQ.isElectron) {
    window.LQ.openPlayer(state.settings.musicUrl || url);
    UI.toast("Tunes popped out over everything");
    return;
  }
  if (window.documentPictureInPicture && dock && !dock.hidden) {
    try {
      const home = dock.parentNode;
      const next = dock.nextSibling;
      // Rebuild the frame for the floating window first: moving the old
      // player reloads it under an opaque origin, and a stale origin=
      // parameter makes YouTube answer 153. Fresh no-origin embed = clean.
      const parsed = Music.parse(state.settings.musicUrl || url);
      if (parsed) Music.mountPlain(parsed, state.settings.musicUrl || url, { noOrigin: true, quiet: true });
      const win = await window.documentPictureInPicture.requestWindow({ width: 360, height: 320 });
      win.document.title = "Focus tunes";
      const css = win.document.createElement("style");
      css.textContent = "body{margin:0;background:#17140d;color:#f5efe2;font-family:sans-serif}" +
        ".music-dock{position:static !important;width:auto !important;margin:10px}" +
        ".music-frame{position:relative;width:100%;aspect-ratio:16/9;background:#000}" +
        ".music-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0}" +
        ".row{display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap}" +
        ".btn{border:2px solid #f5efe2;border-radius:10px;background:#12b3a4;color:#fff;padding:8px 12px;font-weight:800;cursor:pointer}";
      win.document.head.appendChild(css);
      win.document.body.appendChild(dock);
      win.addEventListener("pagehide", () => {
        if (home) home.insertBefore(dock, next);
      });
      UI.toast("Floating over other apps — tap Play if it paused");
      return;
    } catch (e) {
      UI.toast("Float failed (" + (e && e.message ? e.message : e) + "). The exe overlay always works.");
      return;
    }
  }
  UI.toast("System overlay lives in the LifeQuest exe (or Chrome PiP)");
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").replace(/\s/g, ""));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/* ---------- master render ---------- */
function renderAll() {
  renderHeader();
  renderTime();
  Companion.render();
  renderStats();
  renderCharts();
  renderCategoryBars();
  renderTasks();
  renderSessions();
  renderLeetCode();
  renderBadges();
  renderGitHub();
  renderSettings();
  if (typeof Rooms !== "undefined" && Rooms && typeof Rooms.render === "function") {
    try { Rooms.render(); } catch (e) { /* rooms never break render */ }
  }
  renderShop();
  applyStyles();
  renderStyles();
  renderBoss();
  renderFame();
  if (typeof Companion !== "undefined" && Companion && typeof Companion.renderStore === "function") {
    try { Companion.renderStore(); } catch (e) { /* store never breaks render */ }
  }
  if (typeof Market !== "undefined" && Market && typeof Market.render === "function") {
    try { Market.render(); } catch (e) { /* chart never breaks render */ }
  }
  updateBrief();
}

/* ---------- session details modal (main screen stays clean) ---------- */
function openSessionModal() {
  const m = document.getElementById("sessionModal");
  if (m) m.hidden = false;
}

function closeSessionModal() {
  const m = document.getElementById("sessionModal");
  if (m) m.hidden = true;
}

function updateBrief() {
  const brief = document.getElementById("sessionBrief");
  if (!brief) return;
  const cat = (document.getElementById("fCategory") || {}).value || "Other";
  const src = (document.getElementById("fSource") || {}).value || "Manual";
  brief.textContent = `${cat} · ${src}`;
}

/* ---------- money shop (spend coins, keep the grind honest) ---------- */
const SHOP_ITEMS = [
  { id: "boost1", name: "Coin Booster 1.5x", desc: "Permanent 1.5x on every coin payout", cost: 300 },
  { id: "boost2", name: "Coin Booster 2x", desc: "Permanent 2x on every coin payout", cost: 800, requires: "boost1" },
  { id: "freeze", name: "Streak Freeze", desc: "Forgives one missed day, keeps your streak", cost: 150, repeat: true }
];

function shopState(id) {
  const boost = toNumber(state.profile.boost, 1) || 1;
  if (id === "boost1") return boost >= 1.5 ? "owned" : "buy";
  if (id === "boost2") return boost >= 2 ? "owned" : boost >= 1.5 ? "buy" : "locked";
  return "buy"; // freeze is repeatable
}

function buyShop(id) {
  const item = SHOP_ITEMS.find((x) => x.id === id);
  if (!item) return false;
  if (shopState(id) !== "buy") return false;
  if (state.profile.coins < item.cost) {
    UI.toast(`Need ${item.cost} coins for ${item.name}`);
    return false;
  }
  state.profile.coins -= item.cost;
  if (id === "boost1") state.profile.boost = 1.5;
  if (id === "boost2") state.profile.boost = 2;
  if (id === "freeze") state.profile.freezes = toNumber(state.profile.freezes, 0) + 1;
  saveState();
  renderAll();
  UI.toast(`${item.name} unlocked!`, "gold");
  Companion.react("level");
  return true;
}

function renderShop() {
  const bal = document.getElementById("shopBalance");
  if (bal) bal.textContent = `${state.profile.coins} coins${state.profile.boost > 1 ? ` · ${state.profile.boost}x` : ""}${state.profile.freezes > 0 ? ` · 🧊${state.profile.freezes}` : ""}`;
  const list = document.getElementById("shopList");
  if (!list) return;
  list.innerHTML = SHOP_ITEMS.map((item) => {
    const st = shopState(item.id);
    const label = st === "owned" ? "Owned" : st === "locked" ? "Needs 1.5x first" : `Buy · ${item.cost}`;
    return `
      <div class="task">
        <div style="flex:1;min-width:0">
          <div class="strong">${UI.esc(item.name)}</div>
          <div class="session-meta">${UI.esc(item.desc)}</div>
        </div>
        <button class="btn btn-sm ${st === "buy" ? "btn-coral" : "btn-ghost"}" data-shop-buy="${item.id}" ${st === "buy" ? "" : "disabled"}>${label}</button>
      </div>`;
  }).join("");
}

/* ---------- cosmetic unlocks (timer faces, chart themes, card styles) ---------- */
const STYLE_CATALOG = {
  faces: [
    { key: "default", name: "Classic", cost: 0 },
    { key: "neon", name: "Neon", cost: 100 },
    { key: "chunky", name: "Chunky", cost: 100 }
  ],
  charts: [
    { key: "default", name: "Market", cost: 0 },
    { key: "mono", name: "Mono", cost: 100 },
    { key: "sunset", name: "Sunset", cost: 100 }
  ],
  cards: [
    { key: "rounded", name: "Rounded", cost: 0 },
    { key: "sharp", name: "Sharp", cost: 100 },
    { key: "soft", name: "Soft", cost: 100 }
  ]
};

function ownedStyles(kind) {
  if (!state.settings.styles) state.settings.styles = {};
  if (!state.settings.styles[kind]) state.settings.styles[kind] = [STYLE_CATALOG[kind][0].key];
  return state.settings.styles[kind];
}

function applyStyles() {
  const s = state.settings;
  document.body.dataset.timerface = s.timerFace || "default";
  document.body.dataset.chart = s.chartTheme || "default";
  document.body.dataset.cards = s.cardStyle || "rounded";
}

function buyStyle(kind, key) {
  const item = (STYLE_CATALOG[kind] || []).find((x) => x.key === key);
  if (!item) return false;
  const owned = ownedStyles(kind);
  if (owned.includes(key)) {
    if (kind === "faces") state.settings.timerFace = key;
    if (kind === "charts") state.settings.chartTheme = key;
    if (kind === "cards") state.settings.cardStyle = key;
    saveState();
    applyStyles();
    renderStyles();
    return true;
  }
  if (state.profile.coins < item.cost) {
    UI.toast(`Need ${item.cost} coins for ${item.name}`);
    return false;
  }
  state.profile.coins -= item.cost;
  owned.push(key);
  if (kind === "faces") state.settings.timerFace = key;
  if (kind === "charts") state.settings.chartTheme = key;
  if (kind === "cards") state.settings.cardStyle = key;
  saveState();
  applyStyles();
  renderAll();
  UI.toast(`${item.name} style unlocked!`, "gold");
  return true;
}

function renderStyles() {
  const bal = document.getElementById("styleBalance");
  if (bal) bal.textContent = `${state.profile.coins} coins`;
  [["faces", "styleFaces", "timerFace"], ["charts", "styleCharts", "chartTheme"], ["cards", "styleCards", "cardStyle"]].forEach(([kind, boxId, setKey]) => {
    const box = document.getElementById(boxId);
    if (!box) return;
    const owned = ownedStyles(kind);
    const current = state.settings[setKey] || STYLE_CATALOG[kind][0].key;
    box.innerHTML = STYLE_CATALOG[kind].map((s) => {
      const isOwned = owned.includes(s.key);
      const label = current === s.key ? "Active" : isOwned ? "Use" : `Buy · ${s.cost}`;
      return `<button class="chip chip-btn ${current === s.key ? "active" : ""}" data-style-kind="${kind}" data-style-key="${s.key}"
        ${!isOwned && state.profile.coins < s.cost ? "disabled" : ""}>${s.name} · ${label}</button>`;
    }).join("");
  });
}

/* ---------- weekly boss (your focus coins are the damage) ---------- */
const BOSS_MAX_HP = 750;
const BOSS_NAMES = ["Procrastination Imp", "Distraction Goblin", "Scope Creep", "Bug Hydra", "Burnout Dragon", "Deadline Demon"];
const BOSS_EMOJI = ["👺", "👹", "🌊", "🐲", "🐉", "😈"];

function weekKey(date) {
  const d = date ? new Date(date) : new Date();
  const monday = new Date(d);
  const day = (monday.getDay() + 6) % 7; // Monday = 0
  monday.setDate(monday.getDate() - day);
  monday.setHours(0, 0, 0, 0);
  return localISO(monday);
}

function weekDamage(week) {
  return state.sessions
    .filter((s) => { try { return weekKey(new Date(s.endedAt)) === week; } catch (e) { return false; } })
    .reduce((sum, s) => sum + (s.coins || 0), 0);
}

function bossFor(week) {
  let n = 0;
  for (let i = 0; i < week.length; i++) n = (n * 31 + week.charCodeAt(i)) % 997;
  const i = n % BOSS_NAMES.length;
  return { name: BOSS_NAMES[i], emoji: BOSS_EMOJI[i] };
}

function bossStatus() {
  const week = weekKey();
  const damage = weekDamage(week);
  const boss = bossFor(week);
  const defeated = damage >= BOSS_MAX_HP;
  const claimed = state.bossLoot && state.bossLoot.week === week;
  return { week, damage, boss, defeated, claimed, hp: Math.max(0, BOSS_MAX_HP - damage) };
}

function claimBoss() {
  const st = bossStatus();
  if (!st.defeated || st.claimed) return false;
  const loot = Math.max(25, Math.round(BOSS_MAX_HP * 0.1));
  state.bossLoot = { week: st.week };
  addReward(loot, loot);
  UI.toast(`☠️ ${st.boss.name} slain! Loot: +${loot} coins`, "gold");
  Companion.react("level");
  renderAll();
  return true;
}

function renderBoss() {
  const st = bossStatus();
  const name = document.getElementById("bossName");
  if (name) name.textContent = `${st.boss.emoji} ${st.boss.name}`;
  const hp = document.getElementById("bossHp");
  if (hp) hp.textContent = st.defeated ? "DEFEATED" : `${st.hp} HP left`;
  const bar = document.getElementById("bossBar");
  if (bar) bar.style.width = `${Math.min(100, Math.round((st.damage / BOSS_MAX_HP) * 100))}%`;
  const sub = document.getElementById("bossWeek");
  if (sub) sub.textContent = `This week you dealt ${st.damage} damage (goal ${BOSS_MAX_HP})`;
  const btn = document.getElementById("bossClaimBtn");
  if (btn) {
    btn.disabled = !st.defeated || !!st.claimed;
    btn.textContent = st.claimed ? "Loot claimed" : st.defeated ? "Claim loot" : "Not defeated yet";
  }
}

/* ---------- hall of fame: your own weeks, ranked ---------- */
function lastNWeeks(n) {
  const weeks = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const key = weekKey(d);
    const label = new Date(key + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
    if (!weeks.some((w) => w.key === key)) weeks.push({ key, label });
  }
  return weeks;
}

function focusByWeek(weeks) {
  return weeks.map((w) => {
    const rows = state.sessions.filter((s) => {
      try { return weekKey(new Date(s.endedAt)) === w.key; } catch (e) { return false; }
    });
    return {
      ...w,
      seconds: rows.reduce((sum, s) => sum + (s.durationSec || 0), 0),
      coins: rows.reduce((sum, s) => sum + (s.coins || 0), 0),
      xp: rows.reduce((sum, s) => sum + (s.xp || 0), 0)
    };
  });
}

function renderFame() {
  const el = document.getElementById("fameList");
  if (!el) return;
  const weeks = focusByWeek(lastNWeeks(8)).sort((a, b) => b.xp - a.xp);
  const medals = ["🥇", "🥈", "🥉"];
  el.innerHTML = weeks.map((w, i) => `
    <div class="task">
      <span class="strong">${medals[i] || `#${i + 1}`} <span class="muted small">w/c ${UI.esc(w.label)}</span></span>
      <span class="session-meta">${Math.round(w.seconds / 3600 * 10) / 10}h focus</span>
      <span class="reward-pill">${w.xp} XP</span>
    </div>`).join("");
}

/* ---------- events ---------- */
function bindEvents() {
  // nav
  document.getElementById("mainNav").addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-btn");
    if (btn) switchView(btn.dataset.view);
  });
  document.querySelectorAll("[data-goto]").forEach((b) => {
    b.addEventListener("click", () => switchView(b.dataset.goto));
  });

  // timer
  document.getElementById("startBtn").addEventListener("click", () => {
    timer.running ? pauseTimer() : startTimer();
  });
  document.getElementById("pauseBtn").addEventListener("click", pauseTimer);
  document.getElementById("finishBtn").addEventListener("click", finishTimer);
  document.getElementById("pomoBtn").addEventListener("click", () => {
    Pomo.on ? stopPomo() : startPomo();
  });
  document.getElementById("manualLogBtn").addEventListener("click", logManualSession);
  document.getElementById("sessionForm").addEventListener("submit", (e) => e.preventDefault());

  // session details modal: expanded form lives here, main screen stays clean
  document.getElementById("detailsBtn").addEventListener("click", openSessionModal);
  document.getElementById("modalClose").addEventListener("click", closeSessionModal);
  document.getElementById("modalDoneBtn").addEventListener("click", closeSessionModal);
  document.getElementById("sessionModal").addEventListener("click", (e) => {
    if (e.target && e.target.id === "sessionModal") closeSessionModal();
  });
  ["fCategory", "fSource"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", updateBrief);
  });

  // more fields toggle
  const more = document.getElementById("moreToggle");
  const moreFields = document.getElementById("moreFields");
  more.addEventListener("click", () => {
    const open = !moreFields.hidden;
    moreFields.hidden = open;
    more.setAttribute("aria-expanded", String(!open));
    more.textContent = open ? "+ More fields (status, difficulty, project, notes)" : "− Hide extra fields";
  });

  // tasks
  document.getElementById("taskForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const inp = document.getElementById("taskTitle");
    addTask(inp.value, document.getElementById("taskPriority").value);
    inp.value = "";
  });
  document.getElementById("quickTaskForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const inp = document.getElementById("quickTaskTitle");
    addTask(inp.value, "med");
    inp.value = "";
  });
  document.getElementById("taskFilters").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filter]");
    if (!btn) return;
    taskFilter = btn.dataset.filter;
    document.querySelectorAll("#taskFilters .chip-btn").forEach((c) => c.classList.toggle("active", c === btn));
    renderTasks();
  });

  // delegated list actions
  document.body.addEventListener("click", (e) => {
    const shop = e.target.closest("[data-shop-buy]");
    if (shop) { buyShop(shop.dataset.shopBuy); return; }
    const skin = e.target.closest("[data-skin]");
    if (skin) { Companion.buySkin(skin.dataset.skin); Companion.renderStore(); return; }
    const style = e.target.closest("[data-style-kind]");
    if (style) { buyStyle(style.dataset.styleKind, style.dataset.styleKey); return; }
    const tgl = e.target.closest("[data-task-toggle]");
    if (tgl) return toggleTask(tgl.dataset.taskToggle);
    const del = e.target.closest("[data-task-del]");
    if (del) return deleteTask(del.dataset.taskDel);
    const lcDel = e.target.closest("[data-lc-del]");
    if (lcDel) {
      state.leetcode = state.leetcode.filter((l) => l.id !== lcDel.dataset.lcDel);
      saveState(); renderLeetCode(); return;
    }
    const lcRev = e.target.closest("[data-lc-review]");
    if (lcRev) {
      const l = state.leetcode.find((x) => x.id === lcRev.dataset.lcReview);
      if (l) {
        l.status = "Mastered";
        l.lastTried = new Date().toISOString();
        l.solvedAt = new Date().toISOString();
        addReward(8, 8);
        UI.toast("Marked reviewed · +8 coins", "gold");
      }
      renderAll(); return;
    }
  });
  document.body.addEventListener("change", (e) => {
    const sel = e.target.closest("[data-lc-status]");
    if (sel) {
      const l = state.leetcode.find((x) => x.id === sel.dataset.lcStatus);
      if (l) {
        l.status = sel.value;
        l.lastTried = new Date().toISOString();
        if (sel.value === "Accepted" || sel.value === "Mastered") {
          if (!l.solvedAt) l.solvedAt = new Date().toISOString();
          const bonus = state.settings.leetcodeBonus;
          addReward(bonus, bonus);
          UI.toast(`Accepted! +${bonus} bonus coins`, "gold");
        }
        saveState();
        renderAll();
      }
    }
  });

  // leetcode form
  document.getElementById("lcForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const title = document.getElementById("lcTitle").value.trim();
    if (!title) { UI.toast("Give the problem a title"); return; }
    const minutes = toNumber(document.getElementById("lcTime").value, 0);
    const status = document.getElementById("lcStatus").value;
    const solved = status === "Accepted" || status === "Mastered";
    state.leetcode.unshift({
      id: uid(),
      title,
      difficulty: document.getElementById("lcDifficulty").value,
      status,
      language: document.getElementById("lcLanguage").value.trim(),
      tags: document.getElementById("lcTags").value.split(",").map((t) => t.trim()).filter(Boolean),
      url: document.getElementById("lcUrl").value.trim(),
      notes: document.getElementById("lcNotes").value.trim(),
      attempts: 1,
      timeSpentSec: minutes * 60,
      lastTried: new Date().toISOString(),
      solvedAt: solved ? new Date().toISOString() : null
    });
    if (solved) addReward(state.settings.leetcodeBonus, state.settings.leetcodeBonus);
    ["lcTitle", "lcUrl", "lcLanguage", "lcTags", "lcTime", "lcNotes"].forEach((id) => {
      document.getElementById(id).value = "";
    });
    UI.toast(solved ? "Problem logged as Accepted" : "Problem added");
    renderAll();
  });

  document.getElementById("lcFilterDiff").addEventListener("change", renderLeetCode);
  document.getElementById("lcFilterStatus").addEventListener("change", renderLeetCode);

  // LeetCode sync (primary + optional second profile)
  document.getElementById("lcSyncBtn").addEventListener("click", async () => {
    const btn = document.getElementById("lcSyncBtn");
    const out = document.getElementById("lcSyncResult");
    const user = document.getElementById("lcUser").value.trim();
    const user2 = document.getElementById("lcUser2").value.trim();
    btn.disabled = true; btn.textContent = "Syncing…";
    out.hidden = false;
    out.innerHTML = "Contacting free LeetCode API…";
    try {
      const data = await Integrations.fetchLeetCode(user);
      state.leetcodeLive = data;
      state.settings.leetcodeUser = user;
      let line2 = "";
      if (user2) {
        try {
          const data2 = await Integrations.fetchLeetCode(user2);
          state.leetcodeLive2 = data2;
          state.settings.leetcodeUser2 = user2;
          line2 = `<div>Second: <b>${UI.esc(data2.username)}</b> solved <b>${data2.stats.solved}</b> · combined <b>${data.stats.solved + data2.stats.solved}</b></div>`;
        } catch (e2) {
          line2 = `<div class="sync-err">⚠ Second profile failed: ${UI.esc(e2.message || "not found")}</div>`;
        }
      }
      saveState();
      out.innerHTML = `
        <div>✅ <b>${UI.esc(data.name)}</b> synced just now</div>
        <div>Solved: <b>${data.stats.solved}</b> (E ${data.stats.easy} · M ${data.stats.medium} · H ${data.stats.hard})</div>
        <div>Acceptance: <b>${data.stats.acceptance != null ? data.stats.acceptance + "%" : "—"}</b> · Ranking: <b>${data.stats.ranking != null ? "#" + data.stats.ranking : "—"}</b></div>
        ${line2}`;
      UI.toast(state.leetcodeLive2 ? "Both LeetCode profiles synced ✅" : "LeetCode synced ✅");
      renderLeetCode();
    } catch (err) {
      out.innerHTML = `<div class="sync-err">⚠ ${UI.esc(err.message || "Sync failed")}</div>
        <div class="muted small">Manual tracking still works. The free API may be asleep, retry in a minute.</div>`;
    } finally {
      btn.disabled = false; btn.textContent = "Sync";
    }
  });

  // GitHub sync
  document.getElementById("ghSyncBtn").addEventListener("click", async () => {
    const btn = document.getElementById("ghSyncBtn");
    const user = document.getElementById("ghUser").value.trim();
    if (!user) { UI.toast("Enter a GitHub username"); return; }
    btn.disabled = true; btn.textContent = "Fetching…";
    try {
      state.github = await Integrations.fetchGitHub(user);
      state.settings.githubUser = user;
      checkBadges();
      saveState();
      UI.toast("Repo stats loaded 🐙");
      renderAll();
    } catch (err) {
      UI.toast(err.message || "GitHub fetch failed");
    } finally {
      btn.disabled = false; btn.textContent = "Fetch";
    }
  });

  // WakaTime
  document.getElementById("wakaTestBtn").addEventListener("click", async () => {
    const btn = document.getElementById("wakaTestBtn");
    const out = document.getElementById("wakaResult");
    const key = document.getElementById("wakaKey").value.trim();
    btn.disabled = true; btn.textContent = "Testing…";
    out.hidden = false;
    try {
      const data = await Integrations.testWakaTime(key);
      state.settings.wakaKey = key;
      saveState();
      const langs = data.topLanguages.map((l) => `${l.name} ${(l.seconds / 3600).toFixed(1)}h`).join(" · ");
      out.innerHTML = `<div>✅ Connected. Last 7 days: <b>${formatDuration(data.totalSeconds)}</b></div>
        ${langs ? `<div class="muted small">${UI.esc(langs)}</div>` : ""}`;
      UI.toast("WakaTime connected");
    } catch (err) {
      out.innerHTML = `<div class="sync-err">⚠ ${UI.esc(err.message || "WakaTime test failed")}</div>`;
    } finally {
      btn.disabled = false; btn.textContent = "Test connection";
    }
  });

  // themes
  document.getElementById("themeGrid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-theme-pick]");
    if (!btn) return;
    state.settings.theme = btn.dataset.themePick;
    saveState();
    renderSettings();
    UI.toast(`Theme: ${btn.textContent.trim()}`);
  });

  // backgrounds
  document.getElementById("bgGrid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-bg]");
    if (!btn) return;
    state.settings.background = btn.dataset.bg;
    saveState();
    renderSettings();
  });
  document.getElementById("bgUrlBtn").addEventListener("click", () => {
    const url = document.getElementById("bgUrl").value.trim();
    if (!url) return;
    state.settings.background = url;
    saveState();
    renderSettings();
    UI.toast("Custom background applied");
  });
  document.getElementById("bgVeil").addEventListener("input", (e) => {
    state.settings.bgVeil = toNumber(e.target.value, 55);
    applyBackground();
    saveState();
  });
  document.getElementById("panelOpacity").addEventListener("input", (e) => {
    state.settings.panelOpacity = toNumber(e.target.value, 100);
    applyPanelOpacity();
    saveState();
  });
  document.getElementById("uiScale").addEventListener("input", (e) => {
    state.settings.uiScale = toNumber(e.target.value, 100);
    applyUiScale();
    saveState();
  });

  // sidebar: hide when not using, reopen via tab or edge drag
  document.getElementById("sideCollapseBtn").addEventListener("click", toggleSidebar);
  document.getElementById("sideOpenBtn").addEventListener("click", toggleSidebar);
  const edge = document.getElementById("edgeZone");
  if (edge) {
    let edgeX = null;
    edge.addEventListener("pointerdown", (e) => { edgeX = e.clientX; });
    edge.addEventListener("pointermove", (e) => {
      if (edgeX == null) return;
      if (e.clientX - edgeX > 50 && state.settings.sidebar === false) toggleSidebar();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((t) =>
      edge.addEventListener(t, () => { edgeX = null; }));
  }

  // resize handles: drag any dashboard block to resize it
  document.querySelectorAll(".resize-handle").forEach((h) => {
    const key = h.dataset.card;
    let startX = 0, startY = 0, startSpan = 1, dragging = false;
    h.addEventListener("pointerdown", (e) => {
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      startSpan = cardSize(key).span;
      if (h.setPointerCapture) { try { h.setPointerCapture(e.pointerId); } catch (err) {} }
      e.preventDefault();
    });
    h.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const span = Math.min(4, Math.max(1, startSpan + Math.round((e.clientX - startX) / 140)));
      const tall = (e.clientY - startY) > 60;
      const el = document.getElementById(CARD_IDS[key]);
      if (el) {
        el.style.gridColumn = `span ${span}`;
        el.classList.toggle("tall", tall);
        el.dataset.pendingSpan = String(span);
        el.dataset.pendingTall = tall ? "1" : "";
      }
    });
    const finish = (e) => {
      if (!dragging) return;
      dragging = false;
      const el = document.getElementById(CARD_IDS[key]);
      const span = el && el.dataset.pendingSpan ? Number(el.dataset.pendingSpan) : startSpan;
      const tall = !!(el && el.dataset.pendingTall);
      if (el) { delete el.dataset.pendingSpan; delete el.dataset.pendingTall; }
      resizeCard(key, span, tall);
    };
    h.addEventListener("pointerup", finish);
    h.addEventListener("pointercancel", finish);
  });
  document.getElementById("dashToggles").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-dash]");
    if (!btn) return;
    const key = btn.dataset.dash;
    if (!state.settings.dashboard) state.settings.dashboard = {};
    state.settings.dashboard[key] = state.settings.dashboard[key] === false ? true : false;
    saveState();
    renderDashboard();
    UI.toast(`${btn.textContent.trim()} ${state.settings.dashboard[key] ? "shown" : "hidden"}`);
  });

  // study rooms + friends + Meet
  document.getElementById("friendAddBtn").addEventListener("click", () => {
    const inp = document.getElementById("friendName");
    const added = Rooms.addFriend(inp.value);
    if (added) { inp.value = ""; UI.toast(`${added.name} joined your circle`); }
    else UI.toast("Enter a new friend name");
    Rooms.render();
  });
  document.getElementById("profileName").addEventListener("change", (e) => {
    state.profile.name = e.target.value.trim().slice(0, 40) || "Player";
    saveState();
    Rooms.render();
    UI.toast(`You are ${state.profile.name}`);
  });
  document.getElementById("roomCreateBtn").addEventListener("click", () => {
    const name = document.getElementById("roomName").value;
    const goal = document.getElementById("roomGoal").value;
    const room = Rooms.createRoom(name, goal);
    document.getElementById("roomName").value = "";
    UI.toast(`Room ${room.code} created. Share the code!`, "gold");
    Rooms.render();
  });
  document.getElementById("roomJoinBtn").addEventListener("click", () => {
    const inp = document.getElementById("roomJoinCode");
    const room = Rooms.joinRoom(inp.value);
    if (room) { inp.value = ""; UI.toast(`Joined ${room.code}`, "gold"); }
    else UI.toast("Enter a valid new code");
    Rooms.render();
  });
  document.getElementById("roomImportInput").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const room = Rooms.importProgressFile(JSON.parse(reader.result));
        UI.toast(`Friend progress added to ${room.code}`, "gold");
      } catch (err) {
        UI.toast("Import failed: " + err.message);
      }
      Rooms.render();
    };
    reader.readAsText(file);
  });
  document.body.addEventListener("click", (e) => {
    const exp = e.target.closest("[data-room-export]");
    if (exp) {
      const room = state.rooms.find((r) => r.id === exp.dataset.roomExport);
      if (!room) return;
      Archive.download(`lifequest-room-${room.code}.json`, Rooms.buildProgressFile(room));
      UI.toast("Progress file downloaded. Send it to your friend!");
      return;
    }
    const imp = e.target.closest("[data-room-import]");
    if (imp) {
      document.getElementById("roomImportInput").click();
      return;
    }
    const rdel = e.target.closest("[data-room-del]");
    if (rdel) {
      Rooms.deleteRoom(rdel.dataset.roomDel);
      Rooms.render();
      return;
    }
    const fdel = e.target.closest("[data-friend-del]");
    if (fdel) {
      Rooms.removeFriend(fdel.dataset.friendDel);
      Rooms.render();
    }
  });

  // Google Meet (link based, free, no key)
  document.getElementById("meetNewBtn").addEventListener("click", () => {
    window.open("https://meet.new", "_blank", "noopener");
    UI.toast("New Meet opening. Paste its link below, then Link it.");
  });
  document.getElementById("meetJoinBtn").addEventListener("click", () => {
    const link = Rooms.normalizeMeet(document.getElementById("meetUrl").value);
    if (!link) { UI.toast("Paste a Meet link or code like abc-defg-hij"); return; }
    state.currentMeet = link;
    document.getElementById("meetUrl").value = link;
    saveState();
    Rooms.renderMeet();
    UI.toast("Meet linked. Finished sessions will carry it.");
  });
  // Pop out: small overlay window with the live call (exe always-on-top,
  // web gets a compact popup — Meet blocks iframes, so no embed)
  document.getElementById("meetPopBtn").addEventListener("click", () => {
    const link = state.currentMeet || document.getElementById("meetUrl").value.trim();
    if (!link || !/^https?:\/\//i.test(link)) { UI.toast("Link a Meet first, then pop it out"); return; }
    if (window.LQ && window.LQ.isElectron) {
      window.LQ.openMeet(link);
      UI.toast("Call popped out over everything");
      return;
    }
    try {
      const pop = window.open(link, "lifequest-meet", "width=520,height=400,menubar=no,toolbar=no");
      if (!pop) throw new Error("blocked");
      try { pop.focus(); } catch (e) { /* ignore */ }
      // browsers cannot pin windows on top (only the exe can) — say so plainly
      UI.toast("Call popped out. True pin-over-everything needs the exe.");
    } catch (err) {
      UI.toast("Popup blocked. Allow popups, or use the exe overlay.");
    }
  });
  document.getElementById("meetCopyBtn").addEventListener("click", async () => {
    const link = state.currentMeet || document.getElementById("meetUrl").value.trim();
    if (!link) { UI.toast("No Meet link to copy"); return; }
    try {
      await navigator.clipboard.writeText(link);
      UI.toast("Meet link copied");
    } catch (err) {
      UI.toast("Copy failed. Long-press the link instead.");
    }
  });
  document.getElementById("meetAttach").addEventListener("change", (e) => {
    state.settings.meetAttach = e.target.checked;
    saveState();
  });

  // weekly boss
  document.getElementById("bossClaimBtn").addEventListener("click", claimBoss);

  // companion
  document.getElementById("companionSaveBtn").addEventListener("click", () => {
    state.settings.companion = document.getElementById("companionSelect").value;
    state.settings.companionName = document.getElementById("companionName").value.trim() || "Companion";
    saveState();
    Companion.render();
    Companion.react("level");
    UI.toast("Companion updated");
  });
  document.getElementById("feedBtn").addEventListener("click", () => {
    Companion.feed();
    Companion.renderStore();
  });

  // music
  Music.bind();

  // rates
  document.getElementById("ratesSaveBtn").addEventListener("click", () => {
    document.querySelectorAll("[data-rate]").forEach((i) => {
      state.settings.rates[i.dataset.rate] = toNumber(i.value, 1);
    });
    state.settings.taskReward = toNumber(document.getElementById("setTaskReward").value, 12);
    state.settings.leetcodeBonus = toNumber(document.getElementById("setLcBonus").value, 25);
    saveState();
    renderAll();
    UI.toast("Rates saved");
  });

  // data
  document.getElementById("exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lifequest-backup-${localISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    UI.toast("JSON exported");
  });

  document.getElementById("importInput").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data !== "object" || !Array.isArray(data.sessions)) {
          throw new Error("Not a LifeQuest backup");
        }
        state = { ...clone(DEFAULT_STATE), ...data };
        state.settings = { ...clone(DEFAULT_STATE).settings, ...(data.settings || {}) };
        saveState();
        renderAll();
        UI.toast("Backup imported ✅", "gold");
        Companion.react("level");
      } catch (err) {
        UI.toast("Import failed: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  document.getElementById("seedBtn").addEventListener("click", () => {
    state = buildDemoData();
    saveState();
    renderAll();
    UI.toast("Demo data loaded", "gold");
    Companion.react("level");
  });

  document.getElementById("resetBtn").addEventListener("click", () => {
    if (!confirm("Reset all LifeQuest data? This cannot be undone.")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = clone(DEFAULT_STATE);
    hasLocalData = false;
    resetTimer();
    renderAll();
    UI.toast("Everything reset");
  });

  // daily files: one per day + one final file updated daily
  const folderBtn = document.getElementById("dailyFolderBtn");
  if (folderBtn) folderBtn.addEventListener("click", async () => {
    try {
      await Archive.pickFolder();
      Archive.status(`Folder connected. Everyday files save into ${Archive.SUBDIR}/ automatically.`);
      UI.toast("Daily folder connected");
    } catch (err) {
      Archive.status(err.message || "Folder picker failed. Use the download buttons instead.");
    }
  });
  const saveBtn = document.getElementById("dailySaveBtn");
  if (saveBtn) saveBtn.addEventListener("click", async () => {
    try {
      const r = await Archive.saveNow();
      Archive.status(`Saved ${r.day} + ${r.final}${r.via ? " (downloads)" : " (folder)"}.`);
      UI.toast("Day + final files saved", "gold");
    } catch (err) {
      Archive.status("Save failed: " + (err.message || err));
    }
  });
  const dayDl = document.getElementById("dailyDownloadBtn");
  if (dayDl) dayDl.addEventListener("click", () => {
    Archive.snapshotLocal(state);
    Archive.downloadDay();
    Archive.status(`Downloaded ${Archive.dayFileName()}.`);
  });
  const finalDl = document.getElementById("finalDownloadBtn");
  if (finalDl) finalDl.addEventListener("click", () => {
    Archive.downloadFinal();
    Archive.status(`Downloaded ${Archive.finalFileName()}.`);
  });

  // shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeSessionModal(); return; }
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (e.key === "s" || e.key === "S") {
      timer.running ? pauseTimer() : startTimer();
    } else if (e.key === "f" || e.key === "F") {
      if (timer.elapsedMs > 0 || timer.running) finishTimer();
    } else if ("12345".includes(e.key)) {
      switchView(["dashboard", "tasks", "leetcode", "stats", "settings"][Number(e.key) - 1]);
    }
  });

  // persist on leave
  window.addEventListener("beforeunload", saveState);
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      state = loadState();
      renderAll();
    }
  });
}

/* ---------- boot ---------- */
function boot() {
  bindEvents();
  Companion.bind();
  if (typeof Companion.live === "function") {
    try { Companion.live(); } catch (e) { /* live ticks are optional */ }
  }
  if (typeof Archive !== "undefined" && Archive && typeof Archive.boot === "function") {
    Archive.boot();
  }
  renderAll();
  setTimerUi(false);
  if (typeof Market !== "undefined" && Market && typeof Market.start === "function") {
    try { Market.start(); } catch (e) { /* live ticks are optional */ }
  }

  // restore unfinished timer hint
  if (!hasLocalData) {
    UI.toast("Welcome to LifeQuest. Load demo data from Settings!");
    Companion.say("Hi! I'm ready to evolve.");
  } else {
    const last = state.sessions[0];
    if (last) Companion.say(`Last time: ${last.title || last.category}`);
  }
}

document.addEventListener("DOMContentLoaded", boot);

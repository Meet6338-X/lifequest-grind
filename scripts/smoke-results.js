/* Smoke test for the results page (server on :4174) */
const { JSDOM } = require("jsdom");

const errors = [];
const results = [];

function check(name, fn) {
  try {
    const r = fn();
    results.push(`  ok  ${name}${r ? " — " + r : ""}`);
  } catch (e) {
    errors.push(`${name}: ${e.message}`);
    results.push(`FAIL  ${name} — ${e.message}`);
  }
}

(async () => {
  const dom = await JSDOM.fromURL("http://localhost:4174/", {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true
  });
  const { window } = dom;
  const doc = window.document;
  window.addEventListener("error", (e) => errors.push("window error: " + (e.message || e.error)));

  await new Promise((res) => {
    if (doc.readyState === "complete") return res();
    window.addEventListener("load", res);
    setTimeout(res, 5000);
  });
  await new Promise((r) => setTimeout(r, 700));

  const q = (id) => doc.getElementById(id);
  const ev = (c) => window.eval(c);

  // let count-up animations settle before asserting numbers
  await new Promise((r) => setTimeout(r, 1100));

  check("demo chip shown", () => {
    const t = q("dataChip").textContent;
    if (!t.includes("demo")) throw new Error(t);
    return t;
  });

  check("KPI level", () => q("kpiLevel").textContent);
  check("KPI money", () => q("kpiMoney").textContent);
  check("KPI streak", () => q("kpiStreak").textContent);
  check("KPI focus", () => q("kpiFocus").textContent);

  check("hero art bars", () => {
    const n = q("artBars").children.length;
    if (n !== 7) throw new Error("bars=" + n);
    return "7 bars";
  });

  check("lc total counted", () => {
    const t = q("lcTotal").textContent;
    if (t === "0") throw new Error("still 0");
    return t;
  });

  check("two profiles combined (238 + 178)", () => {
    const t = q("lcTotal").textContent;
    if (t !== "416") throw new Error("total=" + t);
    const chip = q("lcChip").textContent;
    if (!chip.includes("+")) throw new Error("chip=" + chip);
    return `${t} · ${chip}`;
  });

  check("lc difficulty rows", () => {
    const n = q("lcRows").children.length;
    if (n !== 3) throw new Error("rows=" + n);
    return "3 rows";
  });

  check("lc week + avg + acc", () => {
    return `${q("lcWeek").textContent} / ${q("lcAvg").textContent} / ${q("lcAcc").textContent}`;
  });

  check("github stats", () => {
    const r = `${q("ghRepos").textContent} repos, ${q("ghStars").textContent} stars`;
    if (q("ghRepos").textContent.trim() === "0") throw new Error("repos still 0");
    return r;
  });
  check("repo list aggregate only (no names)", () => {
    const t = q("repoList").textContent;
    if (!/Aggregate totals only/i.test(t)) throw new Error("not aggregate: " + t.slice(0, 80));
    if (/quest-engine|focus-cli|dsa-notebook|hello-world|Spoon-Knife/i.test(t)) throw new Error("repo name leaked");
    return t.slice(0, 60);
  });

  check("week chart", () => {
    const n = q("weekChart").children.length;
    if (n !== 7) throw new Error("cols=" + n);
    return q("weekTotal").textContent;
  });

  check("task ring", () => `${q("taskPct").textContent} · ${q("taskCount").textContent}`);

  check("streak", () => `${q("streakNum").textContent} best ${q("streakBest").textContent}`);

  check("badges grid", () => {
    const n = q("badgeGrid").children.length;
    if (n !== 10) throw new Error("badges=" + n);
    return q("badgeCount").textContent;
  });

  check("marker highlights present", () => {
    const n = doc.querySelectorAll(".hl").length;
    if (n < 2) throw new Error("hl=" + n);
    return n + " highlighted words";
  });

  check("confetti shapes", () => {
    const n = doc.querySelectorAll(".cf").length;
    if (n !== 9) throw new Error("cf=" + n);
    return "9 shapes";
  });

  check("no lorem ipsum", () => {
    if (doc.body.textContent.toLowerCase().includes("lorem")) throw new Error("found lorem");
    return "clean";
  });

  check("no project or repo names in demo", () => {
    const t = doc.body.textContent;
    if (/quest-engine|focus-cli|dsa-notebook|companion-sprites|streak-api|wallpaper-hooks|hello-world|Spoon-Knife/i.test(t)) {
      throw new Error("repo/project name leaked");
    }
    return "aggregate-only clean";
  });

  check("no em-dashes in visible copy", () => {
    const text = doc.body.innerText || doc.body.textContent;
    if (text.includes("\u2014")) throw new Error("em-dash found");
    return "clean";
  });

  // simulate loading data from localStorage (same key as the app)
  check("load from localStorage", () => {
    window.localStorage.setItem("lifequest_v2", JSON.stringify({
      version: 2,
      profile: { name: "You", coins: 123456, xp: 2567, streak: { current: 33, best: 40, lastDay: "2026-10-05" }, badges: { "first-session": "2026-09-01", "level-10": "2026-10-01" } },
      settings: {},
      sessions: [{ id: "s1", category: "Coding", durationSec: 7200, endedAt: new Date().toISOString(), coins: 240, xp: 192 }],
      tasks: [{ id: "t1", title: "A", done: true }, { id: "t2", title: "B", done: false }],
      leetcode: [{ id: "l1", title: "Two Sum", difficulty: "Easy", status: "Accepted", timeSpentSec: 600, solvedAt: new Date().toISOString() }],
      leetcodeLive: null,
      github: null
    }));
    q("loadBtn").dispatchEvent(new window.Event("click", { bubbles: true }));
    return q("dataChip").textContent;
  });

  // count-up animation takes ~900ms, let it settle
  await new Promise((r) => setTimeout(r, 1200));

  check("your-data chip after load", () => {
    const t = q("dataChip").textContent;
    if (!t.includes("your data")) throw new Error(t);
    return t;
  });

  check("level from 2567 xp = 26", () => {
    const lv = q("kpiLevel").textContent;
    if (lv !== "26") throw new Error("level=" + lv);
    return lv;
  });

  check("streak 33 dots", () => {
    const s = q("streakNum").textContent;
    if (s !== "33") throw new Error("streak=" + s);
    return s;
  });

  check("github empty state", () => {
    const t = q("repoList").textContent;
    if (!t.includes("Connect GitHub")) throw new Error(t.slice(0, 60));
    return "graceful fallback";
  });

  check("manual lc fallback (no live)", () => {
    const chip = q("lcChip").textContent;
    if (!chip.includes("manual")) throw new Error(chip);
    return `${chip} · total ${q("lcTotal").textContent} · acc ${q("lcAcc").textContent}`;
  });

  console.log("\n=== RESULTS PAGE SMOKE ===");
  results.forEach((r) => console.log(r));
  console.log("\n=== ERRORS (" + errors.length + ") ===");
  errors.forEach((e) => console.log(" - " + e));
  dom.window.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => {
  console.error("HARNESS FAILURE:", e);
  process.exit(2);
});

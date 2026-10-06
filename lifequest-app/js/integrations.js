/* ============================================================
   LifeQuest integrations — free APIs only
   - LeetCode:  https://alfa-leetcode-api.onrender.com  (CORS open, no key)
   - GitHub:    https://api.github.com                  (no key, 60 req/h)
   - WakaTime:  optional user key, kept local
   ============================================================ */
"use strict";

const LC_API = "https://alfa-leetcode-api.onrender.com";

async function fetchJson(url, opts, timeoutMs) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs || 15000);
  try {
    const res = await fetch(url, { ...opts, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/* ---------- LeetCode ---------- */
const Integrations = {
  async fetchLeetCode(username) {
    const user = (username || "").trim();
    if (!user) throw new Error("Enter a LeetCode username");

    const [profile, solved] = await Promise.all([
      fetchJson(`${LC_API}/${encodeURIComponent(user)}`),
      fetchJson(`${LC_API}/${encodeURIComponent(user)}/solved`)
    ]);

    if (profile && profile.errors && profile.errors.length && !profile.username) {
      throw new Error("LeetCode user not found");
    }
    if (!solved || solved.solvedProblem == null) throw new Error("No solved data for that user");

    const totalSubs = (solved.totalSubmissionNum || []).find((x) => x.difficulty === "All");
    const acAll = (solved.acSubmissionNum || []).find((x) => x.difficulty === "All");
    const acceptance = totalSubs && totalSubs.submissions
      ? Math.round((acAll.count / totalSubs.submissions) * 1000) / 10
      : null;

    return {
      username: user,
      name: profile.name || user,
      avatar: profile.avatar || "",
      ranking: profile.ranking || null,
      lastSync: new Date().toISOString(),
      stats: {
        solved: solved.solvedProblem || 0,
        easy: solved.easySolved || 0,
        medium: solved.mediumSolved || 0,
        hard: solved.hardSolved || 0,
        ranking: profile.ranking || null,
        acceptance
      }
    };
  },

  /* ---------- GitHub ---------- */
  async fetchGitHub(username) {
    const user = (username || "").trim();
    if (!user) throw new Error("Enter a GitHub username");

    const gh = await fetchJson(`https://api.github.com/users/${encodeURIComponent(user)}`);
    if (gh.message && gh.message.toLowerCase().includes("not found")) {
      throw new Error("GitHub user not found");
    }

    const repos = await fetchJson(
      `https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=100&sort=updated`
    );

    const list = (Array.isArray(repos) ? repos : [])
      .map((r) => ({
        name: r.name,
        stars: r.stargazers_count || 0,
        forks: r.forks_count || 0,
        language: r.language || "—",
        description: r.description || "",
        html_url: r.html_url,
        updated_at: r.updated_at
      }))
      .sort((a, b) => b.stars - a.stars);

    const totalStars = list.reduce((s, r) => s + r.stars, 0);

    return {
      username: user,
      lastSync: new Date().toISOString(),
      profile: {
        public_repos: gh.public_repos || 0,
        followers: gh.followers || 0,
        totalStars,
        avatar: gh.avatar_url || "",
        html_url: gh.html_url || `https://github.com/${user}`
      },
      repos: list.slice(0, 12)
    };
  },

  /* ---------- WakaTime (optional key) ---------- */
  async testWakaTime(apiKey) {
    const key = (apiKey || "").trim();
    if (!key) throw new Error("Enter your WakaTime API key");
    const auth = btoa(key);
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const data = await fetchJson(
      `https://wakatime.com/api/v1/users/current/summaries?start=${start}&end=${end}`,
      { headers: { Authorization: `Basic ${auth}` } },
      20000
    );
    const total = (data.data || []).reduce((sum, day) => sum + (day.grand_total ? day.grand_total.seconds : 0), 0);
    const languages = {};
    (data.data || []).forEach((day) => {
      (day.languages || []).forEach((l) => { languages[l.name] = (languages[l.name] || 0) + l.total_seconds; });
    });
    const top = Object.entries(languages).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      totalSeconds: total,
      topLanguages: top.map(([name, sec]) => ({ name, seconds: sec }))
    };
  }
};

/* ============================================================
   LifeQuest companion — evolution stages + animations
   ============================================================ */
"use strict";

const COMPANION_STAGES = {
  plant: ["🌰 Seed", "🌱 Sprout", "🌿 Young Plant", "🪴 Potted", "🌳 Mature", "🌸 Blooming", "🌟 Spirit Tree"],
  animal: ["🥚 Egg", "🐣 Hatchling", "🐥 Chick", "🐤 Fledgling", "🦅 Sky Hunter", "🔥 Phoenix"],
  dragon: ["🥚 Egg", "🐛 Wyrmling", "🦎 Drake", "🐉 Dragon", "🌌 Cosmic Dragon"],
  robot: ["📦 Crate", "🤖 Basic Bot", "🦾 Upgraded", "🧠 AI Core", "🚀 Mech Titan"]
};

const COMPANION_EMOJI = {
  plant: ["🌰", "🌱", "🌿", "🪴", "🌳", "🌸", "🌟"],
  animal: ["🥚", "🐣", "🐥", "🐤", "🦅", "🔥"],
  dragon: ["🥚", "🐛", "🦎", "🐉", "🌌"],
  robot: ["📦", "🤖", "🦾", "🧠", "🚀"]
};

const COMPANION_LINES = {
  start: ["Let's go!", "Focus time!", "I believe in you!", "Grind mode: on"],
  finish: ["Nice work!", "Coins incoming!", "That counted!", "Level up energy!"],
  level: ["I can feel it evolving...", "New stage unlocked!", "Power surge!"],
  streak: ["Streak energy!", "Don't break the chain!", "Fire!"],
  idle: ["Waiting on you...", "One more session?", "You got this."]
};

/* Companion grows on a fast track: one stage every 50 XP, so you
   see evolution early. (Player level stays 100 XP per level.) */
function companionGrowthXp() { return state.profile.xp; }

function companionStageIndex(level) {
  const type = state.settings.companion;
  const stages = COMPANION_STAGES[type] || COMPANION_STAGES.plant;
  const growthLevel = Math.floor(companionGrowthXp() / 50) + 1;
  return Math.min(growthLevel - 1, stages.length - 1);
}

function companionIsFlying(type, stageIndex) {
  if (type === "dragon") return stageIndex >= 2; // Drake and up fly
  if (type === "animal") return stageIndex >= 3; // Fledgling and up fly
  return false;
}

const COMPANION_ACTIVITIES = {
  plant: [
    { emoji: "🌱", text: "growing" }, { emoji: "💧", text: "drinking water" },
    { emoji: "☀️", text: "sunbathing" }, { emoji: "🌸", text: "stretching leaves" },
    { emoji: "🍃", text: "breathing deep" }
  ],
  animal: [
    { emoji: "⚽", text: "playing" }, { emoji: "🍎", text: "eating" },
    { emoji: "😴", text: "napping" }, { emoji: "🏃", text: "running laps" },
    { emoji: "🎾", text: "chasing balls" }
  ],
  dragon: [
    { emoji: "💪", text: "training" }, { emoji: "🔥", text: "fire-breath practice" },
    { emoji: "🍖", text: "eating" }, { emoji: "😴", text: "napping" },
    { emoji: "🏋️", text: "push-ups" }
  ],
  robot: [
    { emoji: "🔋", text: "charging" }, { emoji: "⚙️", text: "calibrating" },
    { emoji: "🤖", text: "computing" }, { emoji: "🛠️", text: "self-repair" },
    { emoji: "📡", text: "scanning" }
  ]
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const CompanionLive = {
  ticks: 0,     // seconds since boot: the plant literally grows every second
  actIndex: 0,  // current activity slot
  reps: 0       // training reps / growth seconds counter
};

const Companion = {
  speechTimer: null,

  render() {
    const type = state.settings.companion;
    const level = levelFromXp(state.profile.xp);
    const idx = companionStageIndex(level);
    const stages = COMPANION_STAGES[type] || COMPANION_STAGES.plant;
    const emoji = (COMPANION_EMOJI[type] || COMPANION_EMOJI.plant)[idx];
    const flying = companionIsFlying(type, idx);

    const creature = document.getElementById("creature");
    if (creature) {
      const wasFlying = creature.classList.contains("fly");
      creature.textContent = emoji;
      creature.classList.toggle("fly", flying);
      if (!wasFlying && flying) { /* entering flight: keep animation fresh */ }
    }

    const side = document.getElementById("sideCompanion");
    if (side) side.innerHTML = `<span class="side-creature">${emoji}</span>`;

    const meta = document.getElementById("companionMeta");
    const xp = state.profile.xp;
    const inLevel = xp % 100;
    if (meta) {
      meta.textContent =
        `${state.settings.companionName || "Companion"} · ${stages[idx]}` +
        ` · Level ${level} · ${inLevel}/100 XP to next level` +
        (flying ? " · flying!" : "");
    }

    const typeChip = document.getElementById("companionTypeChip");
    if (typeChip) typeChip.textContent = type;

    const fill = document.getElementById("xpFill");
    if (fill) fill.style.width = `${inLevel}%`;

    const track = document.getElementById("stageTrack");
    if (track) {
      track.innerHTML = stages
        .map((s, i) => {
          const cls = i === idx ? "stage-pip now" : i < idx ? "stage-pip on" : "stage-pip";
          return `<span class="${cls}">${s}</span>`;
        })
        .join("");
    }
  },

  say(text) {
    const el = document.getElementById("speech");
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    clearTimeout(this.speechTimer);
    this.speechTimer = setTimeout(() => { el.hidden = true; }, 3200);
  },

  react(kind) {
    const lines = COMPANION_LINES[kind] || COMPANION_LINES.idle;
    this.say(pick(lines));

    const creature = document.getElementById("creature");
    if (!creature) return;
    creature.classList.remove("hatch", "shake");
    void creature.offsetWidth; // restart animation
    if (kind === "finish" || kind === "level") creature.classList.add("hatch");
    else creature.classList.add("shake");
  },

  /* One tick per second: training, eating, growing. The plant
     literally grows every second, and the creature flashes what
     it is doing so the habitat feels alive. */
  live() {
    if (this.liveTimer) return;
    this.liveTimer = setInterval(() => {
      try {
        CompanionLive.ticks++;
        const type = state.settings.companion;
        const acts = COMPANION_ACTIVITIES[type] || COMPANION_ACTIVITIES.plant;
        // new activity every 4 seconds
        if (CompanionLive.ticks % 4 === 1) {
          CompanionLive.actIndex = (CompanionLive.actIndex + 1) % acts.length;
          CompanionLive.reps = 0;
        }
        CompanionLive.reps++;
        const act = acts[CompanionLive.actIndex % acts.length];
        const line = document.getElementById("companionAct");
        if (line) {
          const unit = type === "plant" ? "grown" : type === "robot" ? "charged" : "reps";
          line.textContent = `${act.emoji} ${act.text} · ${CompanionLive.reps} ${unit} · alive ${CompanionLive.ticks}s`;
        }
        // flash the activity emoji on the creature for ~1s, then revert
        if (CompanionLive.ticks % 4 === 1) {
          const creature = document.getElementById("creature");
          if (creature && document.getElementById("view-dashboard").classList.contains("active")) {
            const keep = creature.textContent;
            creature.textContent = act.emoji;
            setTimeout(() => { this.render(); }, 1100);
          }
        }
      } catch (e) { /* habitat never breaks the app */ }
    }, 1000);
  },

  bind() {
    const creature = document.getElementById("creature");
    if (creature) {
      creature.addEventListener("click", () => {
        this.say(pick(["Boop!", "Hey!", `${state.settings.companionName || "Friend"} says hi`, "Pet received"]));
        const c = document.getElementById("creature");
        c.classList.remove("shake");
        void c.offsetWidth;
        c.classList.add("shake");
      });
    }
    // idle chatter every ~45s
    setInterval(() => {
      if (Math.random() < 0.5 && document.getElementById("view-dashboard").classList.contains("active")) {
        this.say(pick(COMPANION_LINES.idle));
      }
    }, 45000);
  }
};

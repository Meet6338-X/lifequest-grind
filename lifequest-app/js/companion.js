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

/* Paid skins: pure cosmetics, bought with Money in the companion store.
   A selected skin overrides the stage emoji for its type. */
const COMPANION_SKINS = [
  { key: "frost-dragon", type: "dragon", name: "Frost", emoji: "🐲", cost: 200 },
  { key: "rex-dragon", type: "dragon", name: "Rex", emoji: "🦖", cost: 300 },
  { key: "cactus", type: "plant", name: "Cactus", emoji: "🌵", cost: 150 },
  { key: "sunflower", type: "plant", name: "Sunflower", emoji: "🌻", cost: 300 },
  { key: "fox", type: "animal", name: "Fox", emoji: "🦊", cost: 200 },
  { key: "panda", type: "animal", name: "Panda", emoji: "🐼", cost: 350 },
  { key: "invader", type: "robot", name: "Invader", emoji: "👾", cost: 200 },
  { key: "saucer", type: "robot", name: "Saucer", emoji: "🛸", cost: 350 }
];

const SNACK_COST = 30;
const SNACK_XP = 8;

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
    const stageEmoji = (COMPANION_EMOJI[type] || COMPANION_EMOJI.plant)[idx];
    // owned skin overrides the stage look for its type
    const skinKey = state.settings.compSkin;
    const skin = COMPANION_SKINS.find((s) => s.key === skinKey && s.type === type);
    const emoji = skin ? skin.emoji : stageEmoji;
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

  feed() {
    if (state.profile.coins < SNACK_COST) {
      this.say(`Snack costs ${SNACK_COST} coins!`);
      return false;
    }
    state.profile.coins -= SNACK_COST;
    addReward(0, SNACK_XP);
    this.say(`Yum! +${SNACK_XP} XP`);
    this.react("finish");
    renderAll();
    return true;
  },

  buySkin(key) {
    const skin = COMPANION_SKINS.find((s) => s.key === key);
    if (!skin) return false;
    if (!state.settings.compSkins) state.settings.compSkins = [];
    if (state.settings.compSkins.includes(key)) {
      state.settings.compSkin = key;
      saveState();
      this.render();
      return true;
    }
    if (state.profile.coins < skin.cost) {
      this.say(`Need ${skin.cost} coins for ${skin.name}!`);
      return false;
    }
    state.profile.coins -= skin.cost;
    state.settings.compSkins.push(key);
    state.settings.compSkin = key;
    saveState();
    this.render();
    this.react("level");
    return true;
  },

  renderStore() {
    const bal = document.getElementById("storeBalance");
    if (bal) bal.textContent = `${state.profile.coins} coins`;
    const box = document.getElementById("storeSkins");
    if (!box) return;
    if (!state.settings.compSkins) state.settings.compSkins = [];
    const type = state.settings.companion;
    const skins = COMPANION_SKINS.filter((s) => s.type === type);
    const esc = (window.UI && UI.esc) || ((v) => String(v ?? ""));
    box.innerHTML = skins.map((s) => {
      const owned = state.settings.compSkins.includes(s.key);
      const active = state.settings.compSkin === s.key;
      const label = active ? "Wearing" : owned ? "Wear" : `Buy · ${s.cost}`;
      return `
        <button class="chip chip-btn ${active ? "active" : ""}" data-skin="${s.key}"
          ${!owned && state.profile.coins < s.cost ? "disabled" : ""}>
          ${s.emoji} ${esc(s.name)} · ${label}
        </button>`;
    }).join("");
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

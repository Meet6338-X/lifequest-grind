/* ============================================================
   LifeQuest market — coin candlestick chart (green/red, live)
   DOM/SVG only (no canvas, works in jsdom). Data comes from
   real session coins grouped per day. The last (today) candle
   ticks live with a small random walk so the chart feels alive.
   ============================================================ */
"use strict";

const Market = {
  days: 14,
  liveBoost: 0,
  liveTimer: null,

  /* Group session coins per day -> candles.
     open = previous day earned, close = this day earned,
     high/low from open/close plus biggest/smallest single
     session of the day. Green when close >= open, else red. */
  buildCandles(sessions, days) {
    const n = days || this.days;
    const per = {};
    (sessions || []).forEach((s) => {
      if (!s || !s.endedAt) return;
      let key = "";
      try { key = localISO(new Date(s.endedAt)); } catch (e) { return; }
      if (!per[key]) per[key] = { earned: 0, coins: [] };
      per[key].earned += (s.coins || 0);
      per[key].coins.push(s.coins || 0);
    });
    const dayList = lastNDays(n);
    let prev = null;
    return dayList.map((d) => {
      const info = per[d.key] || { earned: 0, coins: [] };
      const close = info.earned;
      const open = prev == null ? close : prev;
      const peak = info.coins.length ? Math.max(...info.coins) : 0;
      const trough = info.coins.length ? Math.min(...info.coins) : 0;
      const high = Math.max(open, close, peak);
      const low = Math.min(open, close, trough);
      prev = close;
      return { ...d, open, close, high, low, up: close >= open };
    });
  },

  candleSvg(candles, liveBoost) {
    const W = 340, H = 150;
    const padL = 30, padB = 16, padT = 8, padR = 6;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    let hi = 0;
    candles.forEach((c) => { hi = Math.max(hi, c.high); });
    hi = Math.max(hi, 10);
    const y = (v) => padT + plotH - (v / hi) * plotH;
    const slot = plotW / Math.max(1, candles.length);
    const bw = Math.max(4, Math.min(16, slot * 0.52));

    let grid = "";
    [0.25, 0.5, 0.75, 1].forEach((f) => {
      const gy = padT + plotH * (1 - f);
      const val = Math.round(hi * f);
      grid += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" class="grid-line"/>` +
        `<text x="2" y="${gy + 3}" class="grid-num">${val}</text>`;
    });

    const bodies = candles.map((c, i) => {
      const cx = padL + slot * i + slot / 2;
      const isLive = i === candles.length - 1;
      const close = isLive ? c.close + (liveBoost || 0) : c.close;
      const high = isLive ? Math.max(c.high, close) : c.high;
      const low = isLive ? Math.min(c.low, close) : c.low;
      const up = close >= c.open;
      const yO = y(c.open), yC = y(close);
      const top = Math.min(yO, yC), hgt = Math.max(3, Math.abs(yC - yO));
      const cls = up ? "up" : "down";
      return `<line x1="${cx}" y1="${y(high)}" x2="${cx}" y2="${y(low)}" class="wick-${cls}"/>` +
        `<rect x="${(cx - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${hgt.toFixed(1)}" rx="2" class="candle-${cls}${isLive ? " live-candle" : ""}">` +
        `<title>${c.label}: O ${c.open} H ${Math.round(high)} L ${Math.round(low)} C ${Math.round(close)}</title></rect>` +
        (i % 2 === 0 ? `<text x="${cx}" y="${H - 3}" class="candle-day">${c.label}</text>` : "");
    }).join("");

    return `<svg class="candles" viewBox="0 0 ${W} ${H}" role="img" aria-label="Coin candlestick chart">${grid}${bodies}</svg>`;
  },

  renderInto(elId, sumId) {
    const el = document.getElementById(elId);
    if (!el || typeof lastNDays !== "function") return;
    const candles = this.buildCandles(state.sessions, this.days);
    el.innerHTML = this.candleSvg(candles, this.liveBoost);
    if (sumId) {
      const sum = document.getElementById(sumId);
      if (sum) {
        const today = candles[candles.length - 1];
        const total = state.profile.coins || 0;
        const dir = today.close >= today.open ? "up" : "down";
        const arrow = dir === "up" ? "▲" : "▼";
        sum.textContent = `${arrow} today ${today.close} coins (open ${today.open}) · ${total} total`;
      }
    }
  },

  render() {
    this.renderInto("coinChart", "coinSummary");
    this.renderInto("coinChartBig", "coinSummaryBig");
  },

  start() {
    if (this.liveTimer) return;
    this.liveTimer = setInterval(() => {
      // small random walk so the last candle feels live
      this.liveBoost += (Math.random() - 0.5) * 2;
      if (this.liveBoost > 6) this.liveBoost = 6;
      if (this.liveBoost < -6) this.liveBoost = -6;
      // drift back toward the real value
      this.liveBoost *= 0.97;
      // re-render only when a chart host exists on screen
      if (document.getElementById("coinChart") || document.getElementById("coinChartBig")) {
        try { this.render(); } catch (e) { /* never break the app */ }
      }
    }, 2500);
  }
};

window.Market = Market;

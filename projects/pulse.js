(function () {
  const COLORS = {
    surface: "#ffffff",
    surface2: "#f0ede8",
    border: "#e0dbd3",
    text: "#1c1c1a",
    muted: "#7a7670",
    accent: "#2d6a50",
    blue: "#3d6b96",
    pulseRing: "#5cb6e0",
    pulseSoft: "rgba(92, 182, 224, 0.16)",
    pulseSofter: "rgba(92, 182, 224, 0.10)",
    pulseTint: "#eaf6fb",
  };

  const ANIM_H = 400;
  const HUB_RADIUS = 50;
  const TROLLEY_COUNT = 10;
  const TROLLEY_RING_RADIUS = 110;
  const TROLLEY_CIRCLE_R = 22;
  const TROLLEY_APPEAR_DURATION = 280;
  const TROLLEY_FADE_DURATION = 700;
  const TROLLEY_DECIDE_MIN = 1600;
  const TROLLEY_DECIDE_MAX = 3000;
  const TROLLEY_GREEN_HOLD = 900;
  const TROLLEY_RED_HOLD = 1100;
  const ABANDONMENT_RATE = 0.4;
  const COLOR_GREEN = "#2d6a50";
  const COLOR_GREEN_TINT = "#e3efe9";
  const COLOR_RED = "#c14848";
  const COLOR_RED_TINT = "#fbe8e8";
  const STOREFRONT_W = 80;
  const STOREFRONT_H = 340;
  const STOREFRONT_MARGIN = 30;

  const CHANNELS_W = 80;
  const CHANNELS_H = 340;
  const CHANNELS_MARGIN = 30;
  const CHANNELS_BORDER = "#aaaaaa";
  const ICON_SIZE = 30;

  const DURATION = 15000;
  const DOT_COUNT = 30;
  const DOT_TRAVEL = 900;
  const DOT_RADIUS = 5;
  const DOT_TRAIL_STEPS = 7;
  const DOT_TRAIL_GAP = 0.045;
  const SPAWN_INTERVAL = DURATION / DOT_COUNT;
  const CHANNEL_TRAVEL = 1100;
  const CHANNEL_DOT_COLOR = "rgba(193, 72, 72,";
  const PULSE_RIPPLE_DURATION = 700;
  const PULSE_RIPPLE_DISTANCE = 24;
  const CHANNEL_HIT_DURATION = 1500;

  class PulseHero {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.running = false;
      this.rafId = null;
      this.setupHiDPI();
      this.layout();
      this.reset();
    }

    reset() {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.running = false;
      this.elapsed = 0;
      this.startTime = 0;
      this.dots = [];
      this.channelDots = [];
      this.impulses = [];
      this.channelHits = [];
      this.slots = new Array(TROLLEY_COUNT).fill(null);
      this.nextSpawnAt = 0;
      this.draw();
    }

    start() {
      this.reset();
      this.running = true;
      this.startTime = performance.now();
      const tick = (now) => {
        if (!this.running) return;
        this.elapsed = Math.max(0, now - this.startTime);
        this.update();
        this.draw();
        this.rafId = requestAnimationFrame(tick);
      };
      this.rafId = requestAnimationFrame(tick);
    }

    update() {
      while (this.elapsed >= this.nextSpawnAt) {
        this.spawnDot(this.nextSpawnAt);
        this.nextSpawnAt += SPAWN_INTERVAL;
      }

      const stillAlive = [];
      for (const d of this.dots) {
        if (this.elapsed - d.startTime < d.duration) {
          stillAlive.push(d);
        } else {
          const arrival = d.startTime + d.duration;
          this.impulses.push(arrival);
          this.spawnTrolley(arrival);
        }
      }
      this.dots = stillAlive;

      this.updateTrolleys();

      const channelStillAlive = [];
      for (const d of this.channelDots) {
        if (this.elapsed - d.startTime < d.duration) {
          channelStillAlive.push(d);
        } else {
          this.channelHits.push({
            time: d.startTime + d.duration,
            x: d.tx,
            y: d.ty,
          });
        }
      }
      this.channelDots = channelStillAlive;

      this.impulses = this.impulses.filter(
        (t) => this.elapsed - t < PULSE_RIPPLE_DURATION,
      );
      this.channelHits = this.channelHits.filter(
        (h) => this.elapsed - h.time < CHANNEL_HIT_DURATION,
      );
    }

    spawnTrolley(arrival) {
      const empty = [];
      for (let i = 0; i < TROLLEY_COUNT; i++) {
        if (!this.slots[i]) empty.push(i);
      }
      if (empty.length === 0) return;
      const idx = empty[Math.floor(Math.random() * empty.length)];
      const decideDelay =
        TROLLEY_DECIDE_MIN +
        Math.random() * (TROLLEY_DECIDE_MAX - TROLLEY_DECIDE_MIN);
      this.slots[idx] = {
        slotIdx: idx,
        spawnTime: arrival,
        decideAt: arrival + decideDelay,
        outcome: "pending",
        fadeStart: null,
        channelSpawned: false,
      };
    }

    updateTrolleys() {
      for (let i = 0; i < TROLLEY_COUNT; i++) {
        const tr = this.slots[i];
        if (!tr) continue;

        if (tr.outcome === "pending" && this.elapsed >= tr.decideAt) {
          if (Math.random() < ABANDONMENT_RATE) {
            tr.outcome = "red";
          } else {
            tr.outcome = "green";
            tr.fadeStart = this.elapsed + TROLLEY_GREEN_HOLD;
          }
        }

        if (tr.outcome === "red" && !tr.channelSpawned) {
          this.spawnChannelDotFromTrolley(tr, this.elapsed);
          tr.channelSpawned = true;
          tr.fadeStart = this.elapsed + TROLLEY_RED_HOLD;
        }

        if (tr.fadeStart !== null) {
          const fadeAge = this.elapsed - tr.fadeStart;
          if (fadeAge >= TROLLEY_FADE_DURATION) {
            this.slots[i] = null;
          }
        }
      }
    }

    spawnChannelDotFromTrolley(tr, startTime) {
      const pos = this.trolleyPositions[tr.slotIdx];
      const target =
        this.channelIcons[
          Math.floor(Math.random() * this.channelIcons.length)
        ];
      this.channelDots.push({
        startTime,
        duration: CHANNEL_TRAVEL,
        ox: pos.x,
        oy: pos.y,
        tx: target.cx,
        ty: target.cy,
      });
    }

    spawnDot(startTime) {
      const sf = this.storefront;
      const pad = DOT_RADIUS + 2;
      this.dots.push({
        startTime,
        duration: DOT_TRAVEL,
        ox: sf.x + pad + Math.random() * (sf.w - pad * 2),
        oy: sf.y + pad + Math.random() * (sf.h - pad * 2),
      });
    }

    setupHiDPI() {
      const dpr = window.devicePixelRatio || 1;
      const w = this.canvas.width;
      const h = this.canvas.height;
      this.logicalW = w;
      this.logicalH = h;
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    layout() {
      this.hubX = this.logicalW / 2;
      this.hubY = ANIM_H / 2;
      this.hubR = HUB_RADIUS;

      this.storefront = {
        x: STOREFRONT_MARGIN,
        y: ANIM_H / 2 - STOREFRONT_H / 2,
        w: STOREFRONT_W,
        h: STOREFRONT_H,
      };

      this.channels = {
        x: this.logicalW - CHANNELS_MARGIN - CHANNELS_W,
        y: ANIM_H / 2 - CHANNELS_H / 2,
        w: CHANNELS_W,
        h: CHANNELS_H,
      };

      const gap = (CHANNELS_H - 3 * ICON_SIZE) / 4;
      const iconCx = this.channels.x + CHANNELS_W / 2;
      const firstCy = this.channels.y + gap + ICON_SIZE / 2;
      this.channelIcons = [
        { glyph: "✉️", cx: iconCx, cy: firstCy },
        { glyph: "💬", cx: iconCx, cy: firstCy + ICON_SIZE + gap },
        { glyph: "🔔", cx: iconCx, cy: firstCy + 2 * (ICON_SIZE + gap) },
      ];

      const sfGap = (STOREFRONT_H - 3 * ICON_SIZE) / 4;
      const sfCx = this.storefront.x + STOREFRONT_W / 2;
      const sfFirstCy = this.storefront.y + sfGap + ICON_SIZE / 2;
      this.storefrontIcons = [
        { glyph: "🏪", cx: sfCx, cy: sfFirstCy },
        { glyph: "🏬", cx: sfCx, cy: sfFirstCy + ICON_SIZE + sfGap },
        { glyph: "🛍️", cx: sfCx, cy: sfFirstCy + 2 * (ICON_SIZE + sfGap) },
      ];

      this.trolleyPositions = [];
      for (let i = 0; i < TROLLEY_COUNT; i++) {
        const a = (i / TROLLEY_COUNT) * Math.PI * 2 - Math.PI / 2;
        this.trolleyPositions.push({
          x: this.hubX + Math.cos(a) * TROLLEY_RING_RADIUS,
          y: this.hubY + Math.sin(a) * TROLLEY_RING_RADIUS,
        });
      }
    }

    draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.logicalW, this.logicalH);
      this.drawStorefront();
      this.drawChannels();
      this.drawDots();
      this.drawTrolleyRing();
      this.drawHub();
      this.drawChannelDots();
      this.drawLegend();
    }

    drawLegend() {
      const ctx = this.ctx;
      const dividerY = ANIM_H;
      const cy = ANIM_H + (this.logicalH - ANIM_H) / 2;
      const items = [
        { type: "meteor-blue", label: "Tracking event" },
        { type: "trolley-green", label: "Purchased" },
        { type: "trolley-red", label: "Abandoned" },
        { type: "meteor-red", label: "Recovery event" },
      ];
      const slotW = this.logicalW / items.length;
      const sampleW = 30;

      ctx.save();
      ctx.strokeStyle = "#aaaaaa";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, dividerY);
      ctx.lineTo(this.logicalW, dividerY);
      ctx.stroke();

      ctx.textBaseline = "middle";

      items.forEach((item, i) => {
        ctx.font = '600 11px "DM Mono", monospace';
        ctx.textAlign = "left";
        const labelW = ctx.measureText(item.label).width;
        const slotCenterX = slotW * i + slotW / 2;
        const totalW = sampleW + 10 + labelW;
        const startX = slotCenterX - totalW / 2;
        const sampleCx = startX + sampleW / 2;
        const labelX = startX + sampleW + 10;

        if (item.type === "meteor-blue" || item.type === "meteor-red") {
          const rgb =
            item.type === "meteor-blue" ? "92, 182, 224" : "193, 72, 72";
          for (let j = 6; j >= 0; j--) {
            const px = startX + sampleW - j * 4;
            const fade = 1 - j / 7;
            const radius = 4 * (0.4 + 0.6 * fade);
            ctx.fillStyle = `rgba(${rgb}, ${fade * 0.95})`;
            ctx.beginPath();
            ctx.arc(px, cy, radius, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (
          item.type === "trolley-green" ||
          item.type === "trolley-red"
        ) {
          const ringColor =
            item.type === "trolley-green" ? COLOR_GREEN : COLOR_RED;
          const tintColor =
            item.type === "trolley-green" ? COLOR_GREEN_TINT : COLOR_RED_TINT;
          ctx.beginPath();
          ctx.arc(sampleCx, cy, 11, 0, Math.PI * 2);
          ctx.fillStyle = tintColor;
          ctx.fill();
          ctx.strokeStyle = ringColor;
          ctx.lineWidth = 1.75;
          ctx.stroke();
          ctx.font =
            '11px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
          ctx.textAlign = "center";
          ctx.fillText("🛒", sampleCx, cy);
          ctx.font = '600 11px "DM Mono", monospace';
          ctx.textAlign = "left";
        }

        ctx.fillStyle = COLORS.muted;
        ctx.fillText(item.label, labelX, cy);
      });

      ctx.restore();
    }

    drawChannelDots() {
      const ctx = this.ctx;
      ctx.save();
      for (const d of this.channelDots) {
        const local = this.elapsed - d.startTime;
        const t = Math.max(0, Math.min(1, local / d.duration));
        for (let i = DOT_TRAIL_STEPS; i >= 0; i--) {
          const tt = t - i * DOT_TRAIL_GAP;
          if (tt < 0) continue;
          const x = d.ox + (d.tx - d.ox) * tt;
          const y = d.oy + (d.ty - d.oy) * tt;
          const fade = 1 - i / (DOT_TRAIL_STEPS + 1);
          const radius = DOT_RADIUS * (0.35 + 0.65 * fade);
          ctx.fillStyle = `${CHANNEL_DOT_COLOR} ${fade * 0.95})`;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    drawDots() {
      const ctx = this.ctx;
      ctx.save();
      for (const d of this.dots) {
        const local = this.elapsed - d.startTime;
        const t = Math.max(0, Math.min(1, local / d.duration));
        const dx = this.hubX - d.ox;
        const dy = this.hubY - d.oy;
        const dist = Math.hypot(dx, dy) || 1;
        const targetX = this.hubX - (dx / dist) * this.hubR;
        const targetY = this.hubY - (dy / dist) * this.hubR;

        for (let i = DOT_TRAIL_STEPS; i >= 0; i--) {
          const tt = t - i * DOT_TRAIL_GAP;
          if (tt < 0) continue;
          const x = d.ox + (targetX - d.ox) * tt;
          const y = d.oy + (targetY - d.oy) * tt;
          const fade = 1 - i / (DOT_TRAIL_STEPS + 1);
          const radius = DOT_RADIUS * (0.35 + 0.65 * fade);
          ctx.fillStyle = `rgba(92, 182, 224, ${fade * 0.95})`;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    drawTrolleyRing() {
      const ctx = this.ctx;
      for (let i = 0; i < TROLLEY_COUNT; i++) {
        const tr = this.slots[i];
        if (!tr) continue;
        const pos = this.trolleyPositions[i];

        const appearAge = this.elapsed - tr.spawnTime;
        const appearT = Math.max(
          0,
          Math.min(1, appearAge / TROLLEY_APPEAR_DURATION),
        );
        let alpha = appearT;
        if (tr.fadeStart !== null) {
          const fadeAge = this.elapsed - tr.fadeStart;
          if (fadeAge > 0) {
            alpha *= Math.max(
              0,
              1 - fadeAge / TROLLEY_FADE_DURATION,
            );
          }
        }
        if (alpha <= 0) continue;

        let strokeColor = "#aaaaaa";
        let fillColor = COLORS.surface;
        let strokeWidth = 1.5;
        let label = null;
        let labelColor = null;
        if (tr.outcome === "green") {
          strokeColor = COLOR_GREEN;
          fillColor = COLOR_GREEN_TINT;
          strokeWidth = 2.75;
          label = "purchased";
          labelColor = COLOR_GREEN;
        } else if (tr.outcome === "red") {
          strokeColor = COLOR_RED;
          fillColor = COLOR_RED_TINT;
          strokeWidth = 2.75;
          label = "abandoned";
          labelColor = COLOR_RED;
        }

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, TROLLEY_CIRCLE_R, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        ctx.stroke();

        ctx.font =
          '20px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = COLORS.text;
        ctx.fillText("🛒", pos.x, pos.y);

        if (label) {
          ctx.font = '700 11px "DM Mono", monospace';
          ctx.fillStyle = labelColor;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(label, pos.x, pos.y - TROLLEY_CIRCLE_R - 9);
        }
        ctx.restore();
      }
    }

    drawChannels() {
      const ctx = this.ctx;
      const { x, y, w, h } = this.channels;

      let hit = 0;
      for (const h of this.channelHits) {
        const age = (this.elapsed - h.time) / CHANNEL_HIT_DURATION;
        if (age >= 0 && age <= 1) hit = Math.max(hit, 1 - age);
      }

      ctx.save();
      if (hit > 0) {
        ctx.fillStyle = `rgba(45, 106, 80, ${hit * 0.22})`;
        ctx.fillRect(x, y, w, h);
      }
      ctx.strokeStyle = CHANNELS_BORDER;
      ctx.lineWidth = 1.25;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h);
      if (hit > 0) {
        ctx.strokeStyle = `rgba(45, 106, 80, ${hit})`;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, h);
      }
      ctx.restore();

      const label = "channels";
      const labelFont = '600 12px "DM Mono", monospace';
      ctx.font = labelFont;
      const textW = ctx.measureText(label).width;
      const padding = 6;

      ctx.save();
      ctx.translate(x + w, y + h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = COLORS.surface;
      ctx.fillRect(-textW / 2 - padding, -8, textW + padding * 2, 16);
      ctx.fillStyle = COLORS.muted;
      ctx.font = labelFont;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, 0, 0);
      ctx.restore();

      for (const icon of this.channelIcons) {
        this.drawChannelIcon(icon);
      }

      ctx.save();
      ctx.font = '700 11px "DM Mono", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const h of this.channelHits) {
        const age = (this.elapsed - h.time) / CHANNEL_HIT_DURATION;
        if (age < 0 || age > 1) continue;
        const opacity = 1 - age;
        const labelY = h.y - 20 - age * 12;
        ctx.fillStyle = `rgba(45, 106, 80, ${opacity})`;
        ctx.fillText("recovered", h.x, labelY);
      }
      ctx.restore();
    }

    drawChannelIcon(icon) {
      const ctx = this.ctx;
      ctx.save();
      ctx.font =
        '24px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(icon.glyph, icon.cx, icon.cy);
      ctx.restore();
    }

    drawStorefront() {
      const ctx = this.ctx;
      const { x, y, w, h } = this.storefront;

      ctx.save();
      ctx.strokeStyle = COLORS.muted;
      ctx.lineWidth = 1.25;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();

      ctx.save();
      ctx.font =
        '24px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const icon of this.storefrontIcons) {
        ctx.fillText(icon.glyph, icon.cx, icon.cy);
      }
      ctx.restore();

      const label = "storefront";
      const labelFont = '600 12px "DM Mono", monospace';
      ctx.font = labelFont;
      const textW = ctx.measureText(label).width;
      const padding = 6;

      ctx.save();
      ctx.translate(x, y + h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = COLORS.surface;
      ctx.fillRect(-textW / 2 - padding, -8, textW + padding * 2, 16);
      ctx.fillStyle = COLORS.muted;
      ctx.font = labelFont;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }

    drawHub() {
      const ctx = this.ctx;

      let freshness = 0;
      ctx.save();
      for (const t of this.impulses) {
        const age = (this.elapsed - t) / PULSE_RIPPLE_DURATION;
        if (age < 0 || age > 1) continue;
        const r = this.hubR + age * PULSE_RIPPLE_DISTANCE;
        const opacity = (1 - age) * 0.5;
        ctx.strokeStyle = `rgba(92, 182, 224, ${opacity})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.hubX, this.hubY, r, 0, Math.PI * 2);
        ctx.stroke();
        freshness = Math.max(freshness, 1 - age);
      }
      ctx.restore();

      ctx.save();
      ctx.fillStyle = COLORS.pulseSofter;
      ctx.beginPath();
      ctx.arc(this.hubX, this.hubY, this.hubR + 14 + freshness * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.pulseSoft;
      ctx.beginPath();
      ctx.arc(this.hubX, this.hubY, this.hubR + 6 + freshness * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(this.hubX, this.hubY, this.hubR, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.pulseTint;
      ctx.fill();
      ctx.strokeStyle = COLORS.pulseRing;
      ctx.lineWidth = 2.5 + freshness * 1.2;
      ctx.stroke();

      ctx.save();
      ctx.fillStyle = COLORS.pulseRing;
      ctx.font = '700 18px "DM Mono", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("PULSE", this.hubX, this.hubY + 1);
      ctx.restore();
    }
  }

  function init() {
    const canvas = document.getElementById("anim-hero");
    if (!canvas) return;
    const sim = new PulseHero(canvas);

    const replayBtn = document.getElementById("anim-replay");
    if (replayBtn) {
      replayBtn.addEventListener("click", () => sim.start());
    }

    sim.start();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

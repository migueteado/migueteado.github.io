(function () {
  const COLORS = {
    surface: "#ffffff",
    text: "#1c1c1a",
    muted: "#7a7670",
    softBorder: "#aaaaaa",
    pulseRing: "#5cb6e0",
    pulseSoft: "rgba(92, 182, 224, 0.16)",
    pulseSofter: "rgba(92, 182, 224, 0.10)",
    pulseTint: "#eaf6fb",
  };

  const ANIM_H = 400;
  const HUB_RADIUS = 50;
  const BOX_W = 80;
  const BOX_MARGIN = 30;
  const BOX_GAP = 20;
  const ICON_SIZE = 30;

  const FLOW_DOT_RADIUS = 4;
  const FLOW_TRAIL_STEPS = 7;
  const FLOW_TRAIL_GAP = 0.045;
  const PULSE_RIPPLE_DURATION = 700;
  const PULSE_RIPPLE_DISTANCE = 24;
  const BLOCK_HIT_DURATION = 1400;

  const LIST_W = 200;
  const LIST_H = 96;
  const ITEM_H = 28;
  const ITEM_FOCUS_MS = 1700;
  const ITEM_SCROLL_MS = 300;
  const ITEM_CYCLE_MS = ITEM_FOCUS_MS + ITEM_SCROLL_MS;
  const BLACKLIST_RATE = 0.6;
  const LIST_LOOKAHEAD = 5;
  const CHANNEL_NAMES = [
    "@CookingPro",
    "@TechDaily",
    "@FitnessHub",
    "@GamerArena",
    "@TravelGo",
    "@MusicMix",
    "@LearnFast",
    "@DIYCraft",
    "@DailyNews",
    "@MovieRev",
    "@KidsZone",
    "@SciencePop",
    "@CarFans",
    "@FashionTV",
    "@PetWorld",
    "@FoodieLife",
    "@AdventureX",
    "@StyleStudio",
    "@HealthyU",
    "@Cricket99",
  ];

  function pickChannelName() {
    return CHANNEL_NAMES[Math.floor(Math.random() * CHANNEL_NAMES.length)];
  }

  class ScopeHero {
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
      this.impulses = [];
      this.blockHits = [];
      if (this.flows) {
        for (const f of this.flows) {
          f.dots = [];
          f.nextSpawnAt = 0;
        }
      }
      this.channelList = [];
      this.lastVerdictIdx = 0;
      for (let i = 0; i < LIST_LOOKAHEAD; i++) {
        this.channelList.push({ name: pickChannelName(), status: "pending" });
      }
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
      for (const f of this.flows) {
        if (!f.manual) {
          while (this.elapsed >= f.nextSpawnAt) {
            this.spawnDot(f, f.nextSpawnAt);
            f.nextSpawnAt += f.spawnInterval;
          }
        }

        const stillAlive = [];
        for (const d of f.dots) {
          if (this.elapsed - d.startTime < d.duration) {
            stillAlive.push(d);
          } else if (f.id === "dashboard-instruction") {
            this.impulses.push(d.startTime + d.duration);
          } else if (f.id === "rule-update") {
            this.blockHits.push({
              time: d.startTime + d.duration,
              x: d.tx,
              y: d.ty,
            });
          }
        }
        f.dots = stillAlive;
      }

      this.impulses = this.impulses.filter(
        (t) => this.elapsed - t < PULSE_RIPPLE_DURATION,
      );
      this.blockHits = this.blockHits.filter(
        (h) => this.elapsed - h.time < BLOCK_HIT_DURATION,
      );

      const focusIdx = Math.floor(this.elapsed / ITEM_CYCLE_MS);
      const cycleAge = this.elapsed % ITEM_CYCLE_MS;
      const verdictThreshold =
        cycleAge >= ITEM_FOCUS_MS ? focusIdx + 1 : focusIdx;
      while (this.lastVerdictIdx < verdictThreshold) {
        const item = this.channelList[this.lastVerdictIdx];
        if (item) {
          const verdict =
            Math.random() < BLACKLIST_RATE ? "blocked" : "kept";
          item.status = verdict;
          if (verdict === "blocked") {
            const verdictTime =
              this.lastVerdictIdx * ITEM_CYCLE_MS + ITEM_FOCUS_MS;
            this.spawnBlockMeteor(verdictTime);
          }
        }
        this.lastVerdictIdx++;
      }
      while (this.channelList.length < focusIdx + LIST_LOOKAHEAD) {
        this.channelList.push({
          name: pickChannelName(),
          status: "pending",
        });
      }
    }

    spawnBlockMeteor(startTime) {
      const f = this.ruleUpdateFlow;
      const target =
        f.targetBox.iconPositions[
          Math.floor(Math.random() * f.targetBox.iconPositions.length)
        ];
      f.dots.push({
        startTime,
        duration: f.travel,
        ox: this.blockedMeteorOrigin.x,
        oy: this.blockedMeteorOrigin.y,
        tx: target.cx,
        ty: target.cy,
      });
    }

    spawnDot(f, startTime) {
      if (f.style === "linear") {
        f.dots.push({ startTime, duration: f.travel });
      } else if (f.style === "event") {
        let ox, oy, tx, ty;
        if (f.spawnPattern === "from-box-to-scope") {
          const src =
            f.sourceBox.iconPositions[
              Math.floor(Math.random() * f.sourceBox.iconPositions.length)
            ];
          ox = src.cx;
          oy = src.cy;
          const dx = this.scopeX - ox;
          const dy = this.scopeY - oy;
          const dist = Math.hypot(dx, dy) || 1;
          tx = this.scopeX - (dx / dist) * this.scopeR;
          ty = this.scopeY - (dy / dist) * this.scopeR;
        } else if (f.spawnPattern === "from-scope-to-box") {
          const target =
            f.targetBox.iconPositions[
              Math.floor(Math.random() * f.targetBox.iconPositions.length)
            ];
          tx = target.cx;
          ty = target.cy;
          const dx = tx - this.scopeX;
          const dy = ty - this.scopeY;
          const dist = Math.hypot(dx, dy) || 1;
          ox = this.scopeX + (dx / dist) * this.scopeR;
          oy = this.scopeY + (dy / dist) * this.scopeR;
        }
        f.dots.push({ startTime, duration: f.travel, ox, oy, tx, ty });
      }
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
      this.scopeX = this.logicalW / 2;
      this.scopeY = ANIM_H / 2;
      this.scopeR = HUB_RADIUS;

      const totalH = 340;
      const yTop = ANIM_H / 2 - totalH / 2;
      const rightX = this.logicalW - BOX_MARGIN - BOX_W;
      const rightBoxH = (totalH - BOX_GAP) / 2;

      this.dashboard = {
        id: "dashboard",
        label: "dashboard",
        labelSide: "left",
        x: BOX_MARGIN,
        y: yTop,
        w: BOX_W,
        h: totalH,
        icons: ["📊", "📈", "🖥️"],
      };

      this.youtube = {
        id: "youtube",
        label: "youtube",
        labelSide: "right",
        x: rightX,
        y: yTop,
        w: BOX_W,
        h: rightBoxH,
        icons: [""],
        iconFont: '400 36px "Font Awesome 6 Brands"',
        iconColor: "#FF0000",
      };

      this.gads = {
        id: "gads",
        label: "google ads",
        labelSide: "right",
        x: rightX,
        y: yTop + rightBoxH + BOX_GAP,
        w: BOX_W,
        h: rightBoxH,
        icons: [""],
        iconFont: '400 36px "Font Awesome 6 Brands"',
        iconColor: "#4285F4",
      };

      this.boxes = [this.dashboard, this.youtube, this.gads];

      for (const box of this.boxes) {
        const n = box.icons.length;
        const gap = (box.h - n * ICON_SIZE) / (n + 1);
        const cx = box.x + box.w / 2;
        const firstCy = box.y + gap + ICON_SIZE / 2;
        box.iconPositions = box.icons.map((glyph, i) => ({
          glyph,
          cx,
          cy: firstCy + i * (ICON_SIZE + gap),
        }));
      }

      const ytY = this.youtube.y + this.youtube.h / 2;
      const gadsY = this.gads.y + this.gads.h / 2;

      this.flows = [
        {
          id: "yt-poll",
          fromX: this.youtube.x,
          fromY: ytY,
          waypoints: [{ x: this.scopeX, y: ytY }],
          toX: this.scopeX,
          toY: this.scopeY - this.scopeR,
          rgb: "240, 200, 90",
          style: "linear",
          spawnInterval: 800,
          travel: 1700,
          dots: [],
          nextSpawnAt: 0,
        },
        {
          id: "gads-poll",
          fromX: this.gads.x,
          fromY: gadsY,
          waypoints: [
            { x: (this.gads.x + this.scopeX + this.scopeR) / 2, y: gadsY },
            {
              x: (this.gads.x + this.scopeX + this.scopeR) / 2,
              y: this.scopeY,
            },
          ],
          toX: this.scopeX + this.scopeR,
          toY: this.scopeY,
          rgb: "240, 200, 90",
          style: "linear",
          spawnInterval: 950,
          travel: 1800,
          dots: [],
          nextSpawnAt: 0,
        },
        {
          id: "scope-dashboard-poll",
          fromX: this.scopeX - this.scopeR,
          fromY: this.scopeY,
          toX: this.dashboard.x + this.dashboard.w,
          toY: this.scopeY,
          rgb: "240, 200, 90",
          style: "linear",
          spawnInterval: 1100,
          travel: 1500,
          dots: [],
          nextSpawnAt: 0,
        },
        {
          id: "dashboard-instruction",
          sourceBox: this.dashboard,
          spawnPattern: "from-box-to-scope",
          rgb: "92, 182, 224",
          style: "event",
          spawnInterval: ITEM_CYCLE_MS,
          travel: 800,
          dots: [],
          nextSpawnAt: 0,
        },
      ];

      this.ruleUpdateFlow = {
        id: "rule-update",
        targetBox: this.gads,
        spawnPattern: "from-scope-to-box",
        rgb: "193, 72, 72",
        style: "event",
        travel: 900,
        dots: [],
        nextSpawnAt: 0,
        manual: true,
      };
      this.flows.push(this.ruleUpdateFlow);

      for (const f of this.flows) {
        if (f.style !== "linear") continue;
        const pts = [{ x: f.fromX, y: f.fromY }];
        if (f.waypoints) for (const wp of f.waypoints) pts.push(wp);
        pts.push({ x: f.toX, y: f.toY });
        f.path = pts;
        f.segments = [];
        let total = 0;
        for (let i = 0; i < pts.length - 1; i++) {
          const dx = pts[i + 1].x - pts[i].x;
          const dy = pts[i + 1].y - pts[i].y;
          const len = Math.hypot(dx, dy);
          f.segments.push({
            from: pts[i],
            to: pts[i + 1],
            len,
            accStart: total,
          });
          total += len;
        }
        f.totalLen = total;
      }

      this.list = {
        x: this.scopeX - LIST_W / 2,
        y: this.scopeY + this.scopeR + 25,
        w: LIST_W,
        h: LIST_H,
      };

      this.blockedMeteorOrigin = {
        x: this.list.x + this.list.w - 6,
        y: this.list.y + this.list.h / 2,
      };
    }

    draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.logicalW, this.logicalH);
      this.drawFlowLines();
      for (const box of this.boxes) this.drawBox(box);
      this.drawHub();
      this.drawList();
      this.drawFlowDots();
      this.drawBlockHits();
      this.drawLegend();
    }

    drawBlockHits() {
      const ctx = this.ctx;
      ctx.save();
      ctx.font = '700 11px "DM Mono", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const h of this.blockHits) {
        const age = (this.elapsed - h.time) / BLOCK_HIT_DURATION;
        if (age < 0 || age > 1) continue;
        const opacity = 1 - age;
        const labelY = h.y - 22 - age * 14;
        ctx.fillStyle = `rgba(193, 72, 72, ${opacity})`;
        ctx.fillText("blocked", h.x, labelY);
      }
      ctx.restore();
    }

    drawList() {
      const ctx = this.ctx;
      const { x, y, w, h } = this.list;
      const focusIdx = Math.floor(this.elapsed / ITEM_CYCLE_MS);
      const cycleAge = this.elapsed % ITEM_CYCLE_MS;
      const scrollProgress =
        cycleAge > ITEM_FOCUS_MS
          ? (cycleAge - ITEM_FOCUS_MS) / ITEM_SCROLL_MS
          : 0;
      const focusY = y + h / 2;

      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();

      for (let offsetInt = -2; offsetInt <= 2; offsetInt++) {
        const idx = focusIdx + offsetInt;
        if (idx < 0 || idx >= this.channelList.length) continue;
        const item = this.channelList[idx];
        const offset = offsetInt - scrollProgress;
        const itemY = focusY + offset * ITEM_H;
        const alpha = Math.max(0, Math.min(1, 2 - Math.abs(offset)));
        if (alpha <= 0.01) continue;
        const isFocused = item.status === "pending" && idx === focusIdx;
        this.drawListItem(item, itemY, alpha, isFocused);
      }

      ctx.restore();
    }

    drawListItem(item, cy, alpha, isFocused) {
      const ctx = this.ctx;
      const { x, w } = this.list;
      const cardW = w - 12;
      const cardH = ITEM_H - 4;
      const cardX = x + 6;
      const cardY = cy - cardH / 2;

      let borderColor = COLORS.softBorder;
      let bgColor = COLORS.surface;
      let textColor = COLORS.muted;
      let statusColor = COLORS.muted;
      let statusText = "queued";
      let lineWidth = 1;

      if (item.status === "blocked") {
        borderColor = "#c14848";
        bgColor = "#fbe8e8";
        textColor = "#c14848";
        statusColor = "#c14848";
        statusText = "✗ block";
        lineWidth = 1.5;
      } else if (item.status === "kept") {
        borderColor = "#2d6a50";
        bgColor = "#e3efe9";
        textColor = "#2d6a50";
        statusColor = "#2d6a50";
        statusText = "✓ keep";
        lineWidth = 1.5;
      } else if (isFocused) {
        borderColor = COLORS.pulseRing;
        bgColor = "#eaf6fb";
        textColor = COLORS.text;
        statusColor = COLORS.pulseRing;
        statusText = "checking…";
        lineWidth = 1.75;
      }

      ctx.save();
      ctx.globalAlpha = alpha;

      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(cardX, cardY, cardW, cardH, 6);
      } else {
        ctx.rect(cardX, cardY, cardW, cardH);
      }
      ctx.fillStyle = bgColor;
      ctx.fill();
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = lineWidth;
      ctx.stroke();

      ctx.font = '600 11px "DM Mono", monospace';
      ctx.fillStyle = textColor;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(item.name, cardX + 9, cy);

      ctx.font = '600 9px "DM Mono", monospace';
      ctx.fillStyle = statusColor;
      ctx.textAlign = "right";
      ctx.fillText(statusText, cardX + cardW - 9, cy);

      ctx.restore();
    }

    drawFlowLines() {
      const ctx = this.ctx;
      ctx.save();
      ctx.strokeStyle = COLORS.softBorder;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      for (const f of this.flows) {
        if (f.style !== "linear") continue;
        ctx.beginPath();
        ctx.moveTo(f.path[0].x, f.path[0].y);
        for (let i = 1; i < f.path.length; i++) {
          ctx.lineTo(f.path[i].x, f.path[i].y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    drawFlowDots() {
      const ctx = this.ctx;
      ctx.save();
      for (const f of this.flows) {
        for (const d of f.dots) {
          const local = this.elapsed - d.startTime;
          const t = Math.max(0, Math.min(1, local / d.duration));

          if (f.style === "linear") {
            const target = t * f.totalLen;
            let x = f.path[f.path.length - 1].x;
            let y = f.path[f.path.length - 1].y;
            for (const seg of f.segments) {
              if (seg.accStart + seg.len >= target) {
                const localT =
                  seg.len === 0 ? 0 : (target - seg.accStart) / seg.len;
                x = seg.from.x + (seg.to.x - seg.from.x) * localT;
                y = seg.from.y + (seg.to.y - seg.from.y) * localT;
                break;
              }
            }
            ctx.fillStyle = `rgba(${f.rgb}, 1)`;
            ctx.beginPath();
            ctx.arc(x, y, FLOW_DOT_RADIUS, 0, Math.PI * 2);
            ctx.fill();
          } else if (f.style === "event") {
            for (let i = FLOW_TRAIL_STEPS; i >= 0; i--) {
              const tt = t - i * FLOW_TRAIL_GAP;
              if (tt < 0) continue;
              const x = d.ox + (d.tx - d.ox) * tt;
              const y = d.oy + (d.ty - d.oy) * tt;
              const fade = 1 - i / (FLOW_TRAIL_STEPS + 1);
              const radius = FLOW_DOT_RADIUS * (0.4 + 0.6 * fade);
              ctx.fillStyle = `rgba(${f.rgb}, ${fade * 0.95})`;
              ctx.beginPath();
              ctx.arc(x, y, radius, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
      ctx.restore();
    }

    drawBox(box) {
      const ctx = this.ctx;
      const { x, y, w, h } = box;

      ctx.save();
      ctx.strokeStyle = COLORS.softBorder;
      ctx.lineWidth = 1.25;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();

      ctx.save();
      ctx.font =
        box.iconFont ||
        '24px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      ctx.fillStyle = box.iconColor || COLORS.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const icon of box.iconPositions) {
        ctx.fillText(icon.glyph, icon.cx, icon.cy);
      }
      ctx.restore();

      const labelFont = '600 12px "DM Mono", monospace';
      ctx.font = labelFont;
      const textW = ctx.measureText(box.label).width;
      const padding = 6;
      const labelX = box.labelSide === "left" ? x : x + w;

      ctx.save();
      ctx.translate(labelX, y + h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = COLORS.surface;
      ctx.fillRect(-textW / 2 - padding, -8, textW + padding * 2, 16);
      ctx.fillStyle = COLORS.muted;
      ctx.font = labelFont;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(box.label, 0, 0);
      ctx.restore();
    }

    drawHub() {
      const ctx = this.ctx;

      let freshness = 0;
      ctx.save();
      for (const t of this.impulses) {
        const age = (this.elapsed - t) / PULSE_RIPPLE_DURATION;
        if (age < 0 || age > 1) continue;
        const r = this.scopeR + age * PULSE_RIPPLE_DISTANCE;
        const opacity = (1 - age) * 0.5;
        ctx.strokeStyle = `rgba(92, 182, 224, ${opacity})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.scopeX, this.scopeY, r, 0, Math.PI * 2);
        ctx.stroke();
        freshness = Math.max(freshness, 1 - age);
      }
      ctx.restore();

      ctx.save();
      ctx.fillStyle = COLORS.pulseSofter;
      ctx.beginPath();
      ctx.arc(
        this.scopeX,
        this.scopeY,
        this.scopeR + 14 + freshness * 4,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.fillStyle = COLORS.pulseSoft;
      ctx.beginPath();
      ctx.arc(
        this.scopeX,
        this.scopeY,
        this.scopeR + 6 + freshness * 3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(this.scopeX, this.scopeY, this.scopeR, 0, Math.PI * 2);
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
      ctx.fillText("SCOPE", this.scopeX, this.scopeY + 1);
      ctx.restore();
    }

    drawLegend() {
      const ctx = this.ctx;
      const dividerY = ANIM_H;
      const cy = ANIM_H + (this.logicalH - ANIM_H) / 2;
      const items = [
        { type: "polling", label: "Polling" },
        { type: "meteor-blue", label: "Instruction" },
        { type: "meteor-red", label: "Rule update" },
      ];
      const slotW = this.logicalW / items.length;
      const sampleW = 32;

      ctx.save();
      ctx.strokeStyle = COLORS.softBorder;
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

        if (item.type === "polling") {
          ctx.strokeStyle = COLORS.softBorder;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(startX, cy);
          ctx.lineTo(startX + sampleW, cy);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "rgba(240, 200, 90, 1)";
          ctx.beginPath();
          ctx.arc(sampleCx, cy, 4, 0, Math.PI * 2);
          ctx.fill();
        } else if (
          item.type === "meteor-blue" ||
          item.type === "meteor-red"
        ) {
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
        }

        ctx.fillStyle = COLORS.muted;
        ctx.fillText(item.label, labelX, cy);
      });

      ctx.restore();
    }
  }

  function init() {
    const canvas = document.getElementById("anim-hero");
    if (!canvas) return;
    const sim = new ScopeHero(canvas);

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

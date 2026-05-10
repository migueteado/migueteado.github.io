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
  const ICON_SIZE = 30;

  const FLOW_DOT_RADIUS = 4;
  const FLOW_TRAIL_STEPS = 7;
  const FLOW_TRAIL_GAP = 0.045;
  const PULSE_RIPPLE_DURATION = 700;
  const PULSE_RIPPLE_DISTANCE = 24;
  const LABEL_DURATION = 1200;
  const OP_HIT_DURATION = LABEL_DURATION;
  const OP_DELAY = 500;
  const SALE_LABEL_DURATION = LABEL_DURATION;
  const COIN_LABEL_DURATION = LABEL_DURATION;
  const REFUND_LABEL_DURATION = LABEL_DURATION;

  const LIST_W = 240;
  const LIST_H = 96;
  const ITEM_H = 28;
  const ITEM_FOCUS_MS = 1700;
  const ITEM_SCROLL_MS = 300;
  const ITEM_CYCLE_MS = ITEM_FOCUS_MS + ITEM_SCROLL_MS;
  const FAILURE_RATE = 0.1;
  const LIST_LOOKAHEAD = 5;

  const PROVIDER_COLOR = {
    stripe: "#635BFF",
    paypal: "#003087",
  };
  const PROVIDER_NAMES = ["stripe", "paypal"];

  function generatePayment() {
    const amount = (Math.random() * 195 + 5).toFixed(2);
    const provider =
      PROVIDER_NAMES[Math.floor(Math.random() * PROVIDER_NAMES.length)];
    return { amount: `$${amount}`, provider, status: "pending" };
  }

  class NexusHero {
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
      this.opHits = [];
      this.pendingOps = [];
      this.saleLabels = [];
      this.coinHits = [];
      this.refundLabels = [];
      if (this.flows) {
        for (const f of this.flows) {
          f.dots = [];
          f.nextSpawnAt = 0;
        }
      }
      this.paymentList = [];
      this.lastVerdictIdx = 0;
      for (let i = 0; i < LIST_LOOKAHEAD; i++) {
        this.paymentList.push(generatePayment());
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
            if (f.id === "storefront-payment") {
              const lastDot = f.dots[f.dots.length - 1];
              if (lastDot) {
                this.saleLabels.push({
                  time: lastDot.startTime,
                  x: lastDot.ox,
                  y: lastDot.oy,
                });
                this.spawnStorefrontNexus(
                  lastDot.startTime,
                  lastDot.ox,
                  lastDot.oy,
                );
              }
            } else if (f.id === "consumer-op") {
              const lastDot = f.dots[f.dots.length - 1];
              if (lastDot) {
                this.refundLabels.push({
                  time: lastDot.startTime,
                  x: lastDot.ox,
                  y: lastDot.oy,
                });
              }
            }
            f.nextSpawnAt += f.spawnInterval;
          }
        }

        const stillAlive = [];
        for (const d of f.dots) {
          if (this.elapsed - d.startTime < d.duration) {
            stillAlive.push(d);
          } else if (f.id === "consumer-op") {
            this.impulses.push(d.startTime + d.duration);
            this.pendingOps.push({
              fireAt: d.startTime + d.duration + OP_DELAY,
            });
          } else if (f.id === "op-execution") {
            this.opHits.push({
              time: d.startTime + d.duration,
              x: d.tx,
              y: d.ty,
            });
          } else if (f.id === "storefront-payment") {
            this.coinHits.push({
              time: d.startTime + d.duration,
              x: d.tx,
              y: d.ty,
            });
          } else if (f.id === "storefront-nexus") {
            this.impulses.push(d.startTime + d.duration);
          }
        }
        f.dots = stillAlive;
      }

      const remainingPending = [];
      for (const p of this.pendingOps) {
        if (this.elapsed >= p.fireAt) {
          this.spawnDot(this.opExecutionFlow, p.fireAt);
        } else {
          remainingPending.push(p);
        }
      }
      this.pendingOps = remainingPending;

      this.impulses = this.impulses.filter(
        (t) => this.elapsed - t < PULSE_RIPPLE_DURATION,
      );
      this.opHits = this.opHits.filter(
        (h) => this.elapsed - h.time < OP_HIT_DURATION,
      );
      this.saleLabels = this.saleLabels.filter(
        (h) => this.elapsed - h.time < SALE_LABEL_DURATION,
      );
      this.coinHits = this.coinHits.filter(
        (h) => this.elapsed - h.time < COIN_LABEL_DURATION,
      );
      this.refundLabels = this.refundLabels.filter(
        (h) => this.elapsed - h.time < REFUND_LABEL_DURATION,
      );

      const focusIdx = Math.floor(this.elapsed / ITEM_CYCLE_MS);
      const cycleAge = this.elapsed % ITEM_CYCLE_MS;
      const verdictThreshold =
        cycleAge >= ITEM_FOCUS_MS ? focusIdx + 1 : focusIdx;
      while (this.lastVerdictIdx < verdictThreshold) {
        const item = this.paymentList[this.lastVerdictIdx];
        if (item) {
          item.status =
            Math.random() < FAILURE_RATE ? "failed" : "consolidated";
        }
        this.lastVerdictIdx++;
      }
      while (this.paymentList.length < focusIdx + LIST_LOOKAHEAD) {
        this.paymentList.push(generatePayment());
      }
    }

    spawnStorefrontNexus(startTime, ox, oy) {
      const f = this.storefrontNexusFlow;
      const dx = this.scopeX - ox;
      const dy = this.scopeY - oy;
      const dist = Math.hypot(dx, dy) || 1;
      const tx = this.scopeX - (dx / dist) * this.scopeR;
      const ty = this.scopeY - (dy / dist) * this.scopeR;
      f.dots.push({
        startTime,
        duration: f.travel,
        ox,
        oy,
        tx,
        ty,
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
        } else if (f.spawnPattern === "from-box-to-random-box-icon") {
          const src =
            f.sourceBox.iconPositions[
              Math.floor(Math.random() * f.sourceBox.iconPositions.length)
            ];
          ox = src.cx;
          oy = src.cy;
          const targetBox =
            f.targetBoxes[Math.floor(Math.random() * f.targetBoxes.length)];
          const target =
            targetBox.iconPositions[
              Math.floor(Math.random() * targetBox.iconPositions.length)
            ];
          tx = target.cx;
          ty = target.cy;
        } else if (f.spawnPattern === "from-scope-to-random-box-icon") {
          const targetBox =
            f.targetBoxes[Math.floor(Math.random() * f.targetBoxes.length)];
          const target =
            targetBox.iconPositions[
              Math.floor(Math.random() * targetBox.iconPositions.length)
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
      const processorsW = 180;
      const processorsH = 80;
      const processorsX = this.scopeX - processorsW / 2;

      this.storefront = {
        id: "storefront",
        label: "storefront",
        labelSide: "left",
        x: BOX_MARGIN,
        y: yTop,
        w: BOX_W,
        h: totalH,
        icons: ["🛒", "🏪", "🛍️"],
      };

      this.consumers = {
        id: "consumers",
        label: "consumers",
        labelSide: "right",
        x: rightX,
        y: yTop,
        w: BOX_W,
        h: totalH,
        icons: ["🖥️", "📊", "💁"],
      };

      this.processors = {
        id: "processors",
        label: "payment processors",
        labelSide: "top",
        x: processorsX,
        y: yTop,
        w: processorsW,
        h: processorsH,
        iconLayout: "horizontal",
        icons: [
          { glyph: String.fromCharCode(0xf429), color: "#635BFF" },
          { glyph: String.fromCharCode(0xf1ed), color: "#003087" },
        ],
        iconFont: '400 36px "Font Awesome 6 Brands"',
      };


      this.boxes = [this.storefront, this.consumers, this.processors];

      for (const box of this.boxes) {
        const n = box.icons.length;
        if (box.iconLayout === "horizontal") {
          const gap = (box.w - n * ICON_SIZE) / (n + 1);
          const cy = box.y + box.h / 2;
          const firstCx = box.x + gap + ICON_SIZE / 2;
          box.iconPositions = box.icons.map((iconDef, i) => {
            const glyph =
              typeof iconDef === "string" ? iconDef : iconDef.glyph;
            const color =
              typeof iconDef === "string" ? null : iconDef.color;
            return {
              glyph,
              color,
              cx: firstCx + i * (ICON_SIZE + gap),
              cy,
            };
          });
        } else {
          const gap = (box.h - n * ICON_SIZE) / (n + 1);
          const cx = box.x + box.w / 2;
          const firstCy = box.y + gap + ICON_SIZE / 2;
          box.iconPositions = box.icons.map((iconDef, i) => {
            const glyph =
              typeof iconDef === "string" ? iconDef : iconDef.glyph;
            const color =
              typeof iconDef === "string" ? null : iconDef.color;
            return {
              glyph,
              color,
              cx,
              cy: firstCy + i * (ICON_SIZE + gap),
            };
          });
        }
      }

      const processorsBottom = this.processors.y + this.processors.h;

      this.flows = [
        {
          id: "processors-poll",
          fromX: this.scopeX,
          fromY: processorsBottom,
          toX: this.scopeX,
          toY: this.scopeY - this.scopeR,
          rgb: "240, 200, 90",
          style: "linear",
          spawnInterval: 800,
          travel: 1400,
          dots: [],
          nextSpawnAt: 0,
        },
        {
          id: "nexus-consumers-poll",
          fromX: this.scopeX + this.scopeR,
          fromY: this.scopeY,
          toX: this.consumers.x,
          toY: this.scopeY,
          rgb: "240, 200, 90",
          style: "linear",
          spawnInterval: 1100,
          travel: 1500,
          dots: [],
          nextSpawnAt: 0,
        },
        {
          id: "consumer-op",
          sourceBox: this.consumers,
          spawnPattern: "from-box-to-scope",
          rgb: "193, 72, 72",
          style: "event",
          spawnInterval: 3000,
          travel: 800,
          dots: [],
          nextSpawnAt: 0,
        },
        {
          id: "storefront-payment",
          sourceBox: this.storefront,
          targetBoxes: [this.processors],
          spawnPattern: "from-box-to-random-box-icon",
          rgb: "92, 182, 224",
          style: "event",
          spawnInterval: 1500,
          travel: 900,
          dots: [],
          nextSpawnAt: 0,
        },
      ];

      this.opExecutionFlow = {
        id: "op-execution",
        targetBoxes: [this.processors],
        spawnPattern: "from-scope-to-random-box-icon",
        rgb: "193, 72, 72",
        style: "event",
        travel: 900,
        dots: [],
        nextSpawnAt: 0,
        manual: true,
      };
      this.flows.push(this.opExecutionFlow);

      this.storefrontNexusFlow = {
        id: "storefront-nexus",
        rgb: "92, 182, 224",
        style: "event",
        travel: 850,
        dots: [],
        nextSpawnAt: 0,
        manual: true,
      };
      this.flows.push(this.storefrontNexusFlow);

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
    }

    draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.logicalW, this.logicalH);
      this.drawFlowLines();
      for (const box of this.boxes) this.drawBox(box);
      this.drawHub();
      this.drawList();
      this.drawFlowDots();
      this.drawOpHits();
      this.drawSaleLabels();
      this.drawCoinHits();
      this.drawRefundLabels();
      this.drawLegend();
    }

    drawRefundLabels() {
      const ctx = this.ctx;
      ctx.save();
      ctx.font = '700 11px "DM Mono", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const h of this.refundLabels) {
        const age = (this.elapsed - h.time) / REFUND_LABEL_DURATION;
        if (age < 0 || age > 1) continue;
        const opacity = 1 - age;
        const labelY = h.y - 22 - age * 14;
        ctx.fillStyle = `rgba(193, 72, 72, ${opacity})`;
        ctx.fillText("refund", h.x, labelY);
      }
      ctx.restore();
    }

    drawSaleLabels() {
      const ctx = this.ctx;
      ctx.save();
      ctx.font = '700 11px "DM Mono", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const h of this.saleLabels) {
        const age = (this.elapsed - h.time) / SALE_LABEL_DURATION;
        if (age < 0 || age > 1) continue;
        const opacity = 1 - age;
        const labelY = h.y - 22 - age * 14;
        ctx.fillStyle = `rgba(45, 106, 80, ${opacity})`;
        ctx.fillText("sale", h.x, labelY);
      }
      ctx.restore();
    }

    drawCoinHits() {
      const ctx = this.ctx;
      ctx.save();
      ctx.font =
        '20px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const h of this.coinHits) {
        const age = (this.elapsed - h.time) / COIN_LABEL_DURATION;
        if (age < 0 || age > 1) continue;
        const opacity = 1 - age;
        const labelY = h.y - 22 - age * 14;
        ctx.globalAlpha = opacity;
        ctx.fillText("🪙", h.x, labelY);
      }
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
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const icon of box.iconPositions) {
        ctx.fillStyle = icon.color || box.iconColor || COLORS.text;
        ctx.fillText(icon.glyph, icon.cx, icon.cy);
      }
      ctx.restore();

      const labelFont = '600 12px "DM Mono", monospace';
      ctx.font = labelFont;
      const textW = ctx.measureText(box.label).width;
      const padding = 6;

      ctx.save();
      if (box.labelSide === "top") {
        ctx.fillStyle = COLORS.surface;
        ctx.fillRect(
          x + w / 2 - textW / 2 - padding,
          y - 8,
          textW + padding * 2,
          16,
        );
        ctx.fillStyle = COLORS.muted;
        ctx.font = labelFont;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(box.label, x + w / 2, y);
      } else {
        const labelX = box.labelSide === "left" ? x : x + w;
        ctx.translate(labelX, y + h / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = COLORS.surface;
        ctx.fillRect(-textW / 2 - padding, -8, textW + padding * 2, 16);
        ctx.fillStyle = COLORS.muted;
        ctx.font = labelFont;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(box.label, 0, 0);
      }
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
      ctx.fillText("NEXUS", this.scopeX, this.scopeY + 1);
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
        if (idx < 0 || idx >= this.paymentList.length) continue;
        const item = this.paymentList[idx];
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

      if (item.status === "failed") {
        borderColor = "#c14848";
        bgColor = "#fbe8e8";
        textColor = "#c14848";
        statusColor = "#c14848";
        statusText = "✗ failed";
        lineWidth = 1.5;
      } else if (item.status === "consolidated") {
        borderColor = "#2d6a50";
        bgColor = "#e3efe9";
        textColor = "#2d6a50";
        statusColor = "#2d6a50";
        statusText = "✓ consolidated";
        lineWidth = 1.5;
      } else if (isFocused) {
        borderColor = COLORS.pulseRing;
        bgColor = "#eaf6fb";
        textColor = COLORS.text;
        statusColor = COLORS.pulseRing;
        statusText = "consolidating…";
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
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";

      const amountText = `${item.amount}  `;
      ctx.fillStyle = textColor;
      ctx.fillText(amountText, cardX + 9, cy);
      const amountW = ctx.measureText(amountText).width;

      ctx.fillStyle = PROVIDER_COLOR[item.provider] || textColor;
      ctx.fillText(item.provider, cardX + 9 + amountW, cy);

      ctx.font = '600 9px "DM Mono", monospace';
      ctx.fillStyle = statusColor;
      ctx.textAlign = "right";
      ctx.fillText(statusText, cardX + cardW - 9, cy);

      ctx.restore();
    }

    drawOpHits() {
      const ctx = this.ctx;
      ctx.save();
      ctx.font =
        '20px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const h of this.opHits) {
        const age = (this.elapsed - h.time) / OP_HIT_DURATION;
        if (age < 0 || age > 1) continue;
        const opacity = 1 - age;
        const labelY = h.y - 22 - age * 14;
        ctx.globalAlpha = opacity;
        ctx.fillText("💸", h.x, labelY);
      }
      ctx.restore();
    }

    drawLegend() {
      const ctx = this.ctx;
      const dividerY = ANIM_H;
      const cy = ANIM_H + (this.logicalH - ANIM_H) / 2;
      const items = [
        { type: "polling", label: "Polling" },
        { type: "meteor-blue", label: "Payment" },
        { type: "meteor-red", label: "Refund" },
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
    const sim = new NexusHero(canvas);

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

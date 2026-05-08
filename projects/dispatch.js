(function () {
  const COLORS = {
    surface: "#ffffff",
    surface2: "#f0ede8",
    border: "#e0dbd3",
    text: "#1c1c1a",
    muted: "#7a7670",
    accent: "#2d6a50",
    accent2: "#3d6b96",
    accentSoft: "rgba(45, 106, 80, 0.20)",
    accentGlow: "rgba(45, 106, 80, 0.08)",
    accentTrail: "rgba(45, 106, 80, 0.30)",
    roof: "#3d6b96",
  };

  const DURATION = 10000;
  const SPAWN_INTERVAL = 230;
  const SPAWN_END = 8200; // last spawn time so all orders complete by DURATION
  const ORDER_DURATION = 1700;
  const COUNTER_TARGET = 200000;
  const COUNTER_FILL_END = 7200;

  const easeInOut = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawPackage(ctx, cx, cy, w, h) {
    const x = cx - w / 2;
    const y = cy - h / 2;
    // Body
    ctx.fillStyle = COLORS.accent;
    roundRect(ctx, x, y, w, h, 4);
    ctx.fill();
    // Tape stripes
    ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
    ctx.fillRect(x, y + h / 2 - 2, w, 4);
    ctx.fillRect(x + w / 2 - 2, y, 4, h);
  }

  function drawWarehouse(ctx, cx, cy, w, h, active) {
    const x = cx - w / 2;
    const y = cy - h / 2;
    const roofH = Math.round(h * 0.32);
    const bodyY = y + roofH;
    const bodyH = h - roofH;

    // Glow when active
    if (active) {
      ctx.fillStyle = "rgba(45, 106, 80, 0.10)";
      roundRect(ctx, x - 4, y - 4, w + 8, h + 8, 8);
      ctx.fill();
    }

    // Roof (triangle)
    ctx.fillStyle = active ? COLORS.accent : COLORS.muted;
    ctx.beginPath();
    ctx.moveTo(x - 2, y + roofH);
    ctx.lineTo(x + w / 2, y);
    ctx.lineTo(x + w + 2, y + roofH);
    ctx.closePath();
    ctx.fill();

    // Body
    ctx.fillStyle = active ? "rgba(45, 106, 80, 0.08)" : COLORS.surface2;
    ctx.strokeStyle = active ? COLORS.accent : COLORS.border;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.rect(x, bodyY, w, bodyH);
    ctx.fill();
    ctx.stroke();

    // Door
    const doorW = Math.round(w * 0.26);
    const doorH = Math.round(bodyH * 0.62);
    ctx.fillStyle = active ? COLORS.accent : COLORS.border;
    ctx.fillRect(cx - doorW / 2, y + h - doorH, doorW, doorH);

    // Loading-bay slats (two small rectangles flanking the door)
    const slatW = Math.round(w * 0.16);
    const slatH = Math.round(bodyH * 0.32);
    const slatY = bodyY + Math.round((bodyH - slatH) / 2);
    ctx.fillStyle = active
      ? "rgba(45, 106, 80, 0.35)"
      : "rgba(122, 118, 112, 0.30)";
    ctx.fillRect(x + Math.round(w * 0.08), slatY, slatW, slatH);
    ctx.fillRect(x + w - Math.round(w * 0.08) - slatW, slatY, slatW, slatH);
  }

  function drawHub(ctx, cx, cy, r, pulse) {
    // Outer halo when pulsing
    if (pulse > 0) {
      ctx.fillStyle = `rgba(45, 106, 80, ${0.04 + pulse * 0.1})`;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 10 + pulse * 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Outer dashed ring
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Inner solid ring
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.surface;
    ctx.fill();
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 1.25;
    ctx.stroke();

    // 6 satellite nodes around outer ring
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const dx = cx + Math.cos(a) * r;
      const dy = cy + Math.sin(a) * r;
      ctx.fillStyle = COLORS.surface;
      ctx.beginPath();
      ctx.arc(dx, dy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = COLORS.accent;
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }

    // Central pulsing core
    const coreR = 7 + pulse * 4;
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fill();

    // Highlight ring on core
    if (pulse > 0.3) {
      ctx.strokeStyle = `rgba(45, 106, 80, ${(pulse - 0.3) * 0.6})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawQueueStack(ctx, cx, cy, count, w, h, gap) {
    const totalH = count * h + (count - 1) * gap;
    const yTop = cy - totalH / 2;
    for (let i = 0; i < count; i++) {
      const y = yTop + i * (h + gap) + h / 2;
      const alpha = 1 - i * 0.16;
      ctx.globalAlpha = alpha;
      drawPackage(ctx, cx, y, w, h);
    }
    ctx.globalAlpha = 1;
  }

  class DispatchHero {
    constructor(canvas, counterEl) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.counterEl = counterEl;
      this.running = false;
      this.rafId = null;

      this.setupHiDPI();
      this.layout();
      this.reset();
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
      const W = this.logicalW;
      const H = this.logicalH;

      // Queue
      this.queueX = 80;
      this.queueY = H / 2 + 8;
      this.queuePackW = 38;
      this.queuePackH = 28;
      this.queueGap = 5;

      // Hub
      this.hubX = W * 0.48;
      this.hubY = H / 2 + 8;
      this.hubR = 56;

      // Warehouses
      this.warehouses = [];
      const whW = 88;
      const whH = 72;
      const whX = W - 90;
      const whGap = 24;
      const totalH = 3 * whH + 2 * whGap;
      const wy0 = H / 2 + 8 - totalH / 2;
      for (let i = 0; i < 3; i++) {
        this.warehouses.push({
          id: i + 1,
          x: whX,
          y: wy0 + i * (whH + whGap) + whH / 2,
          w: whW,
          h: whH,
        });
      }

      // In-flight order size
      this.orderW = 36;
      this.orderH = 26;
    }

    reset() {
      this.running = false;
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.elapsed = 0;
      this.startTime = 0;
      this.counter = 0;
      this.orders = [];
      this.nextSpawnAt = 0;
      this.totalSpawned = 0;
      this.draw();
      this.updateCounter();
    }

    start() {
      this.reset();
      this.running = true;
      this.startTime = performance.now();
      const tick = (now) => {
        if (!this.running) return;
        this.elapsed = Math.min(Math.max(0, now - this.startTime), DURATION);
        this.update();
        this.draw();
        this.updateCounter();
        if (this.elapsed >= DURATION) {
          this.running = false;
          return;
        }
        this.rafId = requestAnimationFrame(tick);
      };
      this.rafId = requestAnimationFrame(tick);
    }

    showFinalState() {
      this.reset();
      this.elapsed = DURATION;
      this.counter = COUNTER_TARGET;
      this.draw();
      this.updateCounter();
    }

    update() {
      // Spawn orders at SPAWN_INTERVAL until SPAWN_END
      while (
        this.elapsed >= this.nextSpawnAt &&
        this.nextSpawnAt <= SPAWN_END
      ) {
        this.spawnOrder(this.nextSpawnAt);
        this.nextSpawnAt += SPAWN_INTERVAL;
      }

      // Drop completed orders
      this.orders = this.orders.filter(
        (o) => this.elapsed - o.startTime < o.duration,
      );

      // Counter
      if (this.elapsed < COUNTER_FILL_END) {
        const t = this.elapsed / COUNTER_FILL_END;
        this.counter = Math.floor(easeOutQuad(t) * COUNTER_TARGET);
      } else {
        this.counter = COUNTER_TARGET;
      }
    }

    spawnOrder(startTime) {
      const whIdx = this.totalSpawned % 3;
      this.orders.push({
        whIdx,
        startTime,
        duration: ORDER_DURATION,
      });
      this.totalSpawned++;
    }

    draw() {
      const ctx = this.ctx;
      const W = this.logicalW;
      const H = this.logicalH;
      ctx.clearRect(0, 0, W, H);

      this.drawColumnLabels();
      this.drawConnectors();
      this.drawQueue();
      this.drawWarehouses();

      // Orders draw BEFORE hub so hub overlays orders sitting at center
      this.drawOrders();
      this.drawHub();
    }

    drawColumnLabels() {
      const ctx = this.ctx;
      ctx.fillStyle = COLORS.muted;
      ctx.font = '600 11px "DM Mono", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("ORDERS", this.queueX, 18);
      ctx.fillText("DISPATCHER", this.hubX, 18);
      ctx.fillText("WAREHOUSES", this.warehouses[0].x, 18);
    }

    drawConnectors() {
      const ctx = this.ctx;
      ctx.strokeStyle = COLORS.border;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      const cy = this.hubY;

      // Queue → Hub (straight)
      ctx.beginPath();
      ctx.moveTo(this.queueX + this.queuePackW / 2 + 10, cy);
      ctx.lineTo(this.hubX - this.hubR - 10, cy);
      ctx.stroke();

      // Hub → each warehouse (curved)
      for (const wh of this.warehouses) {
        const startX = this.hubX + this.hubR + 4;
        const endX = wh.x - wh.w / 2 - 8;
        const cpX = (startX + endX) / 2;
        ctx.beginPath();
        ctx.moveTo(startX, cy);
        ctx.quadraticCurveTo(cpX, cy, endX, wh.y);
        ctx.stroke();
      }

      ctx.setLineDash([]);
    }

    drawQueue() {
      drawQueueStack(
        this.ctx,
        this.queueX,
        this.queueY,
        4,
        this.queuePackW,
        this.queuePackH,
        this.queueGap,
      );
    }

    drawWarehouses() {
      const arrivals = new Set();
      for (const o of this.orders) {
        const t = (this.elapsed - o.startTime) / o.duration;
        if (t > 0.55 && t < 1.0) arrivals.add(o.whIdx);
      }
      for (const wh of this.warehouses) {
        drawWarehouse(
          this.ctx,
          wh.x,
          wh.y,
          wh.w,
          wh.h,
          arrivals.has(wh.id - 1),
        );
      }
    }

    drawHub() {
      let pulse = 0;
      for (const o of this.orders) {
        const t = (this.elapsed - o.startTime) / o.duration;
        if (t > 0.32 && t < 0.58) {
          const hubT = (t - 0.32) / 0.26;
          pulse = Math.max(pulse, Math.sin(hubT * Math.PI));
        }
      }
      drawHub(this.ctx, this.hubX, this.hubY, this.hubR, pulse);
    }

    drawOrders() {
      const ctx = this.ctx;
      for (const o of this.orders) {
        const local = this.elapsed - o.startTime;
        const t = local / o.duration;
        if (t < 0 || t > 1) continue;

        const wh = this.warehouses[o.whIdx];
        let x,
          y,
          alpha = 1;

        if (t < 0.32) {
          // Queue → Hub (straight)
          const p = easeInOut(t / 0.32);
          x = this.queueX + (this.hubX - this.queueX) * p;
          y = this.queueY + (this.hubY - this.queueY) * p;
          if (t < 0.04) alpha = t / 0.04;
        } else if (t < 0.58) {
          // At hub — fade out then fade back in
          const hubT = (t - 0.32) / 0.26;
          alpha = hubT < 0.5 ? 1 - hubT * 2 : (hubT - 0.5) * 2;
          x = this.hubX;
          y = this.hubY;
        } else {
          // Hub → Warehouse (curved bezier)
          const p = easeInOut((t - 0.58) / 0.42);
          const startX = this.hubX + this.hubR + 4;
          const endX = wh.x - wh.w / 2 - 8;
          const cpX = (startX + endX) / 2;
          const t1 = 1 - p;
          x = t1 * t1 * startX + 2 * t1 * p * cpX + p * p * endX;
          y = t1 * t1 * this.hubY + 2 * t1 * p * this.hubY + p * p * wh.y;
          if (t > 0.96) alpha = (1 - t) / 0.04;
        }

        if (alpha <= 0.01) continue;

        // Trail
        ctx.globalAlpha = alpha * 0.3;
        ctx.fillStyle = COLORS.accentTrail;
        roundRect(
          ctx,
          x - this.orderW / 2 - 7,
          y - this.orderH / 2,
          this.orderW,
          this.orderH,
          4,
        );
        ctx.fill();

        // Order
        ctx.globalAlpha = alpha;
        drawPackage(ctx, x, y, this.orderW, this.orderH);
      }
      ctx.globalAlpha = 1;
    }

    updateCounter() {
      if (!this.counterEl) return;
      const formatted = this.counter.toLocaleString("en-US");
      if (this.counterEl.textContent !== formatted) {
        this.counterEl.textContent = formatted;
      }
    }
  }

  function init() {
    const canvas = document.getElementById("anim-hero");
    if (!canvas) return;
    const counterEl = document.getElementById("anim-counter");
    const sim = new DispatchHero(canvas, counterEl);

    const replayBtn = document.getElementById("anim-replay");
    if (replayBtn) {
      replayBtn.addEventListener("click", () => sim.start());
    }

    const reduced =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      sim.showFinalState();
      return;
    }

    if ("IntersectionObserver" in window) {
      let triggered = false;
      const observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting && !triggered) {
              triggered = true;
              sim.start();
              observer.disconnect();
              break;
            }
          }
        },
        { threshold: 0.4 },
      );
      observer.observe(canvas);
    } else {
      sim.start();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

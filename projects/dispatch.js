(function () {
  const COLORS = {
    surface: "#ffffff",
    text: "#1c1c1a",
    muted: "#7a7670",
    softBorder: "#aaaaaa",
    yellow: "#f0c85a",
    hubRing: "#2d6a50",
    hubSoft: "rgba(45, 106, 80, 0.16)",
    hubSofter: "rgba(45, 106, 80, 0.10)",
    hubTint: "#eaf3ee",
  };

  const BOX_W = 80;
  const BOX_H = 160;
  const BOX_MARGIN = 30;
  const BOX_GAP = 20;
  const ICON_SIZE = 30;

  const ANIM_H = 400;
  const DISPATCH_W = 160;
  const DISPATCH_H = 340;
  const SERVICE_W = 130;
  const SERVICE_H = 80;

  const FLOW_DOT_RADIUS = 4;
  const FLOW_TRAIL_STEPS = 7;
  const FLOW_TRAIL_GAP = 0.045;
  const PACKAGE_TRAVEL = 1200;
  const PACKAGE_SPAWN_INTERVAL = 400;
  const PACKAGE_FONT_SIZE = 20;
  const SERVICE_PULSE_DURATION = 500;
  const PACKAGE_HIT_DURATION = 1200;

  class DispatchHero {
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
      if (this.flows) {
        for (const f of this.flows) {
          f.dots = [];
          f.nextSpawnAt = 0;
        }
      }
      this.packages = [];
      this.nextPackageSpawnAt = 0;
      this.serviceImpulses = [];
      this.packageHits = [];
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
        while (this.elapsed >= f.nextSpawnAt) {
          const dot = { startTime: f.nextSpawnAt, duration: f.travel };
          if (f.style === "event") {
            const src = f.sources[Math.floor(Math.random() * f.sources.length)];
            dot.ox = src.x;
            dot.oy = src.y;
          }
          f.dots.push(dot);
          f.nextSpawnAt += f.spawnInterval;
        }
        const stillAlive = [];
        for (const d of f.dots) {
          if (this.elapsed - d.startTime < d.duration) {
            stillAlive.push(d);
          } else if (
            f.style === "event" &&
            f.targetServiceIdx !== undefined
          ) {
            this.serviceImpulses.push({
              serviceIdx: f.targetServiceIdx,
              time: d.startTime + d.duration,
            });
          }
        }
        f.dots = stillAlive;
      }

      while (this.elapsed >= this.nextPackageSpawnAt) {
        this.spawnPackage(this.nextPackageSpawnAt);
        this.nextPackageSpawnAt += PACKAGE_SPAWN_INTERVAL;
      }
      const packagesStillAlive = [];
      for (const p of this.packages) {
        if (this.elapsed - p.startTime < p.duration) {
          packagesStillAlive.push(p);
        } else {
          this.packageHits.push({
            time: p.startTime + p.duration,
            x: p.tx,
            y: p.ty,
          });
        }
      }
      this.packages = packagesStillAlive;

      this.serviceImpulses = this.serviceImpulses.filter(
        (imp) => this.elapsed - imp.time < SERVICE_PULSE_DURATION,
      );
      this.packageHits = this.packageHits.filter(
        (h) => this.elapsed - h.time < PACKAGE_HIT_DURATION,
      );
    }

    spawnPackage(startTime) {
      const orderService = this.services[0];
      const warehousesBox = this.boxes[2];
      const target =
        warehousesBox.iconPositions[
          Math.floor(Math.random() * warehousesBox.iconPositions.length)
        ];
      this.packages.push({
        startTime,
        duration: PACKAGE_TRAVEL,
        ox: orderService.x + orderService.w,
        oy: orderService.cy,
        tx: target.cx,
        ty: target.cy,
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
      this.dispatch = {
        x: this.logicalW / 2 - DISPATCH_W / 2,
        y: ANIM_H / 2 - DISPATCH_H / 2,
        w: DISPATCH_W,
        h: DISPATCH_H,
      };

      const sGap = (DISPATCH_H - 3 * SERVICE_H) / 4;
      const sCx = this.dispatch.x + DISPATCH_W / 2;
      const sX = sCx - SERVICE_W / 2;
      const labels = [
        { line1: "Order", line2: "allocation" },
        { line1: "Stock", line2: "management" },
        { line1: "Shipment", line2: "tracking" },
      ];
      this.services = labels.map((lab, i) => {
        const y = this.dispatch.y + sGap + i * (SERVICE_H + sGap);
        return {
          line1: lab.line1,
          line2: lab.line2,
          x: sX,
          y,
          w: SERVICE_W,
          h: SERVICE_H,
          cx: sCx,
          cy: y + SERVICE_H / 2,
        };
      });

      const totalH = 2 * BOX_H + BOX_GAP;
      const yTop = ANIM_H / 2 - totalH / 2;
      const yStackBottom = yTop + totalH;
      const leftX = BOX_MARGIN;
      const rightX = this.logicalW - BOX_MARGIN - BOX_W;

      const shipService = this.services[2];
      const shipmentsHalf = (yStackBottom - shipService.cy);
      const shipmentsH = Math.round(shipmentsHalf * 2);
      const shipmentsY = Math.round(shipService.cy - shipmentsH / 2);
      const warehousesH = shipmentsY - BOX_GAP - yTop;

      const dashboardH = shipmentsH;
      const storefrontH = totalH - dashboardH - BOX_GAP;
      const storefrontY = yTop;
      const dashboardY = storefrontY + storefrontH + BOX_GAP;

      this.boxes = [
        {
          id: "storefront",
          label: "storefront",
          labelSide: "left",
          borderColor: COLORS.softBorder,
          x: leftX,
          y: storefrontY,
          w: BOX_W,
          h: storefrontH,
          icons: ["🏪", "🛍️", "🛒"],
        },
        {
          id: "dashboard",
          label: "dashboard",
          labelSide: "left",
          borderColor: COLORS.softBorder,
          x: leftX,
          y: dashboardY,
          w: BOX_W,
          h: dashboardH,
          icons: ["📈", "🖥️"],
        },
        {
          id: "warehouses",
          label: "warehouses",
          labelSide: "right",
          borderColor: COLORS.softBorder,
          x: rightX,
          y: yTop,
          w: BOX_W,
          h: warehousesH,
          icons: ["🏭", "🏬", "🏢"],
        },
        {
          id: "shipment",
          label: "shipments",
          labelSide: "right",
          borderColor: COLORS.softBorder,
          x: rightX,
          y: shipmentsY,
          w: BOX_W,
          h: shipmentsH,
          icons: ["🚚", "🗺️"],
        },
      ];

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

      const shipBox = this.boxes[3];
      const storefrontBox = this.boxes[0];
      const dashboardBox = this.boxes[1];
      const warehousesBox = this.boxes[2];
      const orderService = this.services[0];
      const stockService = this.services[1];

      const whEdgeX = warehousesBox.x;
      const whEdgeY = warehousesBox.y + warehousesBox.h / 2;
      const stEdgeX = stockService.x + stockService.w;
      const stEdgeY = stockService.cy;
      const whStockMidX = (whEdgeX + stEdgeX) / 2;

      const stLeftX = stockService.x;
      const stLeftY = stockService.cy;
      const sfEdgeX = storefrontBox.x + storefrontBox.w;
      const sfEdgeY = storefrontBox.y + storefrontBox.h / 2;
      const dbEdgeX = dashboardBox.x + dashboardBox.w;
      const dbEdgeY = dashboardBox.y + dashboardBox.h / 2;
      const stLeftMidX = (stLeftX + sfEdgeX) / 2;

      this.flows = [
        {
          fromX: shipBox.x,
          fromY: shipService.cy,
          toX: shipService.x + shipService.w,
          toY: shipService.cy,
          rgb: "240, 200, 90",
          style: "linear",
          spawnInterval: 600,
          travel: 1600,
          dots: [],
          nextSpawnAt: 0,
        },
        {
          fromX: whEdgeX,
          fromY: whEdgeY,
          waypoints: [
            { x: whStockMidX, y: whEdgeY },
            { x: whStockMidX, y: stEdgeY },
          ],
          toX: stEdgeX,
          toY: stEdgeY,
          rgb: "240, 200, 90",
          style: "linear",
          spawnInterval: 700,
          travel: 1800,
          dots: [],
          nextSpawnAt: 0,
        },
        {
          fromX: stLeftX,
          fromY: stLeftY,
          waypoints: [
            { x: stLeftMidX, y: stLeftY },
            { x: stLeftMidX, y: sfEdgeY },
          ],
          toX: sfEdgeX,
          toY: sfEdgeY,
          rgb: "240, 200, 90",
          style: "linear",
          spawnInterval: 800,
          travel: 1700,
          dots: [],
          nextSpawnAt: 0,
        },
        {
          fromX: stLeftX,
          fromY: stLeftY,
          waypoints: [
            { x: stLeftMidX, y: stLeftY },
            { x: stLeftMidX, y: dbEdgeY },
          ],
          toX: dbEdgeX,
          toY: dbEdgeY,
          rgb: "240, 200, 90",
          style: "linear",
          spawnInterval: 900,
          travel: 1900,
          dots: [],
          nextSpawnAt: 0,
        },
        {
          sources: storefrontBox.iconPositions.map((ip) => ({
            x: ip.cx,
            y: ip.cy,
          })),
          targetX: orderService.x,
          targetY: orderService.cy,
          targetServiceIdx: 0,
          rgb: "92, 182, 224",
          style: "event",
          spawnInterval: 400,
          travel: 800,
          dots: [],
          nextSpawnAt: 0,
        },
        {
          sources: dashboardBox.iconPositions.map((ip) => ({
            x: ip.cx,
            y: ip.cy,
          })),
          targetX: orderService.x,
          targetY: orderService.cy,
          targetServiceIdx: 0,
          rgb: "92, 182, 224",
          style: "event",
          spawnInterval: 4000,
          travel: 850,
          dots: [],
          nextSpawnAt: 0,
        },
        {
          sources: dashboardBox.iconPositions.map((ip) => ({
            x: ip.cx,
            y: ip.cy,
          })),
          targetX: stockService.x,
          targetY: stockService.cy,
          targetServiceIdx: 1,
          rgb: "92, 182, 224",
          style: "event",
          spawnInterval: 5000,
          travel: 900,
          dots: [],
          nextSpawnAt: 0,
        },
      ];

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
    }

    draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.logicalW, this.logicalH);
      this.drawFlowLines();
      for (const box of this.boxes) {
        this.drawBox(box);
      }
      this.drawDispatch();
      this.drawFlowDots();
      this.drawPackages();
      this.drawPackageHits();
      this.drawLegend();
    }

    drawPackageHits() {
      const ctx = this.ctx;
      ctx.save();
      ctx.font = '700 10px "DM Mono", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const h of this.packageHits) {
        const age = (this.elapsed - h.time) / PACKAGE_HIT_DURATION;
        if (age < 0 || age > 1) continue;
        const opacity = 1 - age;
        const labelY = h.y - 22 - age * 14;
        ctx.fillStyle = `rgba(45, 106, 80, ${opacity})`;
        ctx.fillText("assigned", h.x, labelY);
      }
      ctx.restore();
    }

    drawLegend() {
      const ctx = this.ctx;
      const dividerY = ANIM_H;
      const cy = ANIM_H + (this.logicalH - ANIM_H) / 2;
      const items = [
        { type: "polling", label: "Polling" },
        { type: "event", label: "Events" },
        { type: "package", label: "Package routing" },
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
      ctx.font = '600 11px "DM Mono", monospace';
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
        } else if (item.type === "event") {
          for (let j = 6; j >= 0; j--) {
            const px = startX + sampleW - j * 4;
            const fade = 1 - j / 7;
            const radius = 4 * (0.4 + 0.6 * fade);
            ctx.fillStyle = `rgba(92, 182, 224, ${fade * 0.95})`;
            ctx.beginPath();
            ctx.arc(px, cy, radius, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (item.type === "package") {
          ctx.font =
            '16px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
          ctx.textAlign = "center";
          ctx.fillText("📦", sampleCx, cy);
          ctx.font = '600 11px "DM Mono", monospace';
          ctx.textAlign = "left";
        }

        ctx.fillStyle = COLORS.muted;
        ctx.fillText(item.label, labelX, cy);
      });

      ctx.restore();
    }

    drawPackages() {
      const ctx = this.ctx;
      ctx.save();
      ctx.font = `${PACKAGE_FONT_SIZE}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const p of this.packages) {
        const t = Math.max(
          0,
          Math.min(1, (this.elapsed - p.startTime) / p.duration),
        );
        const x = p.ox + (p.tx - p.ox) * t;
        const y = p.oy + (p.ty - p.oy) * t;
        ctx.fillText("📦", x, y);
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

          if (f.style === "event") {
            const fromX = d.ox;
            const fromY = d.oy;
            const toX = f.targetX;
            const toY = f.targetY;
            for (let i = FLOW_TRAIL_STEPS; i >= 0; i--) {
              const tt = t - i * FLOW_TRAIL_GAP;
              if (tt < 0) continue;
              const x = fromX + (toX - fromX) * tt;
              const y = fromY + (toY - fromY) * tt;
              const fade = 1 - i / (FLOW_TRAIL_STEPS + 1);
              const radius = FLOW_DOT_RADIUS * (0.4 + 0.6 * fade);
              ctx.fillStyle = `rgba(${f.rgb}, ${fade * 0.95})`;
              ctx.beginPath();
              ctx.arc(x, y, radius, 0, Math.PI * 2);
              ctx.fill();
            }
          } else {
            const target = t * f.totalLen;
            let x = f.path[f.path.length - 1].x;
            let y = f.path[f.path.length - 1].y;
            for (const seg of f.segments) {
              if (seg.accStart + seg.len >= target) {
                const localT = seg.len === 0 ? 0 : (target - seg.accStart) / seg.len;
                x = seg.from.x + (seg.to.x - seg.from.x) * localT;
                y = seg.from.y + (seg.to.y - seg.from.y) * localT;
                break;
              }
            }
            ctx.fillStyle = `rgba(${f.rgb}, 1)`;
            ctx.beginPath();
            ctx.arc(x, y, FLOW_DOT_RADIUS, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.restore();
    }

    drawBox(box) {
      const ctx = this.ctx;
      const { x, y, w, h } = box;

      ctx.save();
      ctx.strokeStyle = box.borderColor;
      ctx.lineWidth = 1.25;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();

      ctx.save();
      ctx.font =
        '24px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
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

    drawDispatch() {
      const ctx = this.ctx;
      const { x, y, w, h } = this.dispatch;

      ctx.save();
      ctx.strokeStyle = COLORS.hubRing;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();

      for (let i = 0; i < this.services.length; i++) {
        this.drawService(this.services[i], i);
      }

      const label = "DISPATCH";
      const labelFont = '700 13px "DM Mono", monospace';
      ctx.font = labelFont;
      const textW = ctx.measureText(label).width;
      const padding = 8;

      ctx.save();
      ctx.fillStyle = COLORS.surface;
      ctx.fillRect(
        x + w / 2 - textW / 2 - padding,
        y - 10,
        textW + padding * 2,
        20,
      );
      ctx.fillStyle = COLORS.hubRing;
      ctx.font = labelFont;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + w / 2, y);
      ctx.restore();
    }

    drawService(s, idx) {
      const ctx = this.ctx;

      let freshness = 0;
      for (const imp of this.serviceImpulses) {
        if (imp.serviceIdx !== idx) continue;
        const age = (this.elapsed - imp.time) / SERVICE_PULSE_DURATION;
        if (age >= 0 && age <= 1) {
          const ease = 1 - age;
          freshness = Math.max(freshness, ease * ease);
        }
      }

      const scale = 1 + freshness * 0.08;
      const w = s.w * scale;
      const h = s.h * scale;
      const x = s.cx - w / 2;
      const y = s.cy - h / 2;

      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(x, y, w, h, 8);
      } else {
        ctx.rect(x, y, w, h);
      }
      ctx.fillStyle = COLORS.hubTint;
      ctx.fill();
      ctx.strokeStyle = COLORS.hubRing;
      ctx.lineWidth = 2.25 + freshness * 1.25;
      ctx.stroke();

      ctx.save();
      ctx.fillStyle = COLORS.hubRing;
      ctx.font = '700 12px "DM Mono", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(s.line1, s.cx, s.cy - 9);
      ctx.fillText(s.line2, s.cx, s.cy + 9);
      ctx.restore();
    }
  }

  function init() {
    const canvas = document.getElementById("anim-hero");
    if (!canvas) return;
    const sim = new DispatchHero(canvas);

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

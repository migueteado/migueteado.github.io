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

  const TICKET_GEN_MS = 1500;
  const TICKET_TRAVEL_TO_SUP_MS = 800;
  const TICKET_REVIEW_MS = 1100;
  const TICKET_TRAVEL_BACK_MS = 700;
  const TICKET_TRAVEL_TO_MS_MS = 700;
  const TICKET_PROCESS_MS = 1500;
  const TICKET_FADE_MS = 600;
  const REJECT_RATE = 0.18;
  const TICKET_INTERVAL = 3500;

  const T_GEN = TICKET_GEN_MS;
  const T_SUP = T_GEN + TICKET_TRAVEL_TO_SUP_MS;
  const T_REVIEW = T_SUP + TICKET_REVIEW_MS;
  const T_REJ_END = T_REVIEW + TICKET_FADE_MS;
  const T_BACK = T_REVIEW + TICKET_TRAVEL_BACK_MS;
  const T_TO_MS = T_BACK + TICKET_TRAVEL_TO_MS_MS;
  const T_PROCESS_END = T_TO_MS + TICKET_PROCESS_MS;

  class ResolveHero {
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
      this.approvedLabels = [];
      this.rejectedLabels = [];
      this.processedLabels = [];
      this.tickets = [];
      if (this.flows) {
        for (const f of this.flows) {
          f.dots = [];
          f.nextSpawnAt = 0;
        }
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
          } else if (f.id === "agent-request") {
            this.impulses.push(d.startTime + d.duration);
            this.spawnTicket(d.startTime + d.duration);
          }
        }
        f.dots = stillAlive;
      }

      const aliveTickets = [];
      for (const tk of this.tickets) {
        const t = this.elapsed - tk.spawnTime;
        const totalDuration =
          tk.outcome === "rejected" ? T_REJ_END : T_PROCESS_END;
        if (t < totalDuration) {
          aliveTickets.push(tk);
        } else if (tk.outcome === "approved") {
          this.processedLabels.push({
            time: tk.spawnTime + T_PROCESS_END,
            x: tk.msTargetX,
            y: tk.msTargetY,
          });
        }
      }
      this.tickets = aliveTickets;

      this.impulses = this.impulses.filter(
        (t) => this.elapsed - t < PULSE_RIPPLE_DURATION,
      );
      this.approvedLabels = this.approvedLabels.filter(
        (h) => this.elapsed - h.time < LABEL_DURATION,
      );
      this.rejectedLabels = this.rejectedLabels.filter(
        (h) => this.elapsed - h.time < LABEL_DURATION,
      );
      this.processedLabels = this.processedLabels.filter(
        (h) => this.elapsed - h.time < LABEL_DURATION,
      );
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
        }
        f.dots.push({ startTime, duration: f.travel, ox, oy, tx, ty });
      }
    }

    spawnTicket(startTime) {
      const supervisorIcon =
        this.supervisors.iconPositions[
          Math.floor(Math.random() * this.supervisors.iconPositions.length)
        ];
      const microserviceIcon =
        this.microservices.iconPositions[
          Math.floor(Math.random() * this.microservices.iconPositions.length)
        ];
      const outcome = Math.random() < REJECT_RATE ? "rejected" : "approved";
      this.tickets.push({
        spawnTime: startTime,
        outcome,
        supTargetX: supervisorIcon.cx,
        supTargetY: supervisorIcon.cy,
        msTargetX: microserviceIcon.cx,
        msTargetY: microserviceIcon.cy,
      });
      const verdictTime = startTime + T_REVIEW;
      if (outcome === "approved") {
        this.approvedLabels.push({
          time: verdictTime,
          x: supervisorIcon.cx,
          y: supervisorIcon.cy,
        });
      } else {
        this.rejectedLabels.push({
          time: verdictTime,
          x: supervisorIcon.cx,
          y: supervisorIcon.cy,
        });
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
      const microservicesW = 240;
      const microservicesH = 80;
      const microservicesX = this.scopeX - microservicesW / 2;

      this.agents = {
        id: "agents",
        label: "cs agents",
        labelSide: "left",
        x: BOX_MARGIN,
        y: yTop,
        w: BOX_W,
        h: totalH,
        icons: ["💁", "💁", "💁"],
      };

      this.supervisors = {
        id: "supervisors",
        label: "cs supervisors",
        labelSide: "right",
        x: rightX,
        y: yTop,
        w: BOX_W,
        h: totalH,
        icons: ["🧐", "🧐", "🧐"],
      };

      this.microservices = {
        id: "microservices",
        label: "microservices",
        labelSide: "top",
        x: microservicesX,
        y: yTop,
        w: microservicesW,
        h: microservicesH,
        iconLayout: "horizontal",
        icons: ["📦", "💳", "🚚"],
      };

      this.boxes = [this.agents, this.supervisors, this.microservices];

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

      this.docHomeX = this.scopeX;
      this.docHomeY = this.scopeY + this.scopeR + 60;

      this.flows = [];

      for (let i = 0; i < this.microservices.iconPositions.length; i++) {
        const ip = this.microservices.iconPositions[i];
        this.flows.push({
          id: `microservice-${i}-poll`,
          fromX: ip.cx,
          fromY: this.microservices.y + this.microservices.h,
          waypoints: [{ x: ip.cx, y: this.scopeY - this.scopeR }],
          toX: this.scopeX,
          toY: this.scopeY - this.scopeR,
          rgb: "240, 200, 90",
          style: "linear",
          spawnInterval: 900 + i * 120,
          travel: 1500,
          dots: [],
          nextSpawnAt: 0,
        });
      }

      this.flows.push({
        id: "agent-request",
        sourceBox: this.agents,
        spawnPattern: "from-box-to-scope",
        rgb: "92, 182, 224",
        style: "event",
        spawnInterval: TICKET_INTERVAL,
        travel: 800,
        dots: [],
        nextSpawnAt: 0,
      });

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
      for (const box of this.boxes) this.drawBox(box);
      this.drawHub();
      this.drawTickets();
      this.drawFlowDots();
      this.drawApprovedLabels();
      this.drawRejectedLabels();
      this.drawProcessedLabels();
      this.drawLegend();
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
      ctx.font = '700 16px "DM Mono", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("RESOLVE", this.scopeX, this.scopeY + 1);
      ctx.restore();
    }

    drawTickets() {
      const ctx = this.ctx;

      for (const tk of this.tickets) {
        const t = this.elapsed - tk.spawnTime;
        if (t < 0) continue;

        let docX, docY;
        let alpha = 1;
        let labelText = null;
        let labelColor = null;
        let drawSpinner = false;

        if (t < T_GEN) {
          docX = this.docHomeX;
          docY = this.docHomeY;
          labelText = "creating ticket";
          labelColor = "rgba(92, 182, 224, 1)";
          drawSpinner = true;
        } else if (t < T_SUP) {
          const phaseT = (t - T_GEN) / TICKET_TRAVEL_TO_SUP_MS;
          docX = this.docHomeX + (tk.supTargetX - this.docHomeX) * phaseT;
          docY = this.docHomeY + (tk.supTargetY - this.docHomeY) * phaseT;
        } else if (t < T_REVIEW) {
          docX = tk.supTargetX;
          docY = tk.supTargetY;
          labelText = "reviewing";
          labelColor = "rgba(122, 118, 112, 1)";
        } else if (tk.outcome === "rejected") {
          if (t < T_REJ_END) {
            const fadeT = (t - T_REVIEW) / TICKET_FADE_MS;
            docX = tk.supTargetX;
            docY = tk.supTargetY;
            alpha = 1 - fadeT;
          } else {
            continue;
          }
        } else {
          if (t < T_BACK) {
            const phaseT = (t - T_REVIEW) / TICKET_TRAVEL_BACK_MS;
            docX = tk.supTargetX + (this.scopeX - tk.supTargetX) * phaseT;
            docY = tk.supTargetY + (this.scopeY - tk.supTargetY) * phaseT;
          } else if (t < T_TO_MS) {
            const phaseT = (t - T_BACK) / TICKET_TRAVEL_TO_MS_MS;
            docX = this.scopeX + (tk.msTargetX - this.scopeX) * phaseT;
            docY = this.scopeY + (tk.msTargetY - this.scopeY) * phaseT;
          } else if (t < T_PROCESS_END) {
            docX = tk.msTargetX;
            docY = tk.msTargetY;
            labelText = "processing";
            labelColor = "rgba(92, 182, 224, 1)";
            drawSpinner = true;
          } else {
            continue;
          }
        }

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font =
          '24px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🎫", docX, docY);

        if (drawSpinner) {
          const spinnerCx = docX;
          const spinnerCy = docY + 26;
          const spinnerR = 9;
          const rotation = (this.elapsed / 600) * Math.PI * 2;
          const arcLength = Math.PI * 1.4;
          ctx.strokeStyle = "rgba(92, 182, 224, 0.2)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(spinnerCx, spinnerCy, spinnerR, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = COLORS.pulseRing;
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.arc(
            spinnerCx,
            spinnerCy,
            spinnerR,
            rotation,
            rotation + arcLength,
          );
          ctx.stroke();
          ctx.lineCap = "butt";
        }

        if (labelText) {
          ctx.font = '700 11px "DM Mono", monospace';
          ctx.fillStyle = labelColor;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(labelText, docX, docY - 25);
        }
        ctx.restore();
      }
    }

    drawApprovedLabels() {
      const ctx = this.ctx;
      ctx.save();
      ctx.font = '700 11px "DM Mono", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const h of this.approvedLabels) {
        const age = (this.elapsed - h.time) / LABEL_DURATION;
        if (age < 0 || age > 1) continue;
        const opacity = 1 - age;
        const labelY = h.y - 22 - age * 14;
        ctx.fillStyle = `rgba(45, 106, 80, ${opacity})`;
        ctx.fillText("approved", h.x, labelY);
      }
      ctx.restore();
    }

    drawRejectedLabels() {
      const ctx = this.ctx;
      ctx.save();
      ctx.font = '700 11px "DM Mono", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const h of this.rejectedLabels) {
        const age = (this.elapsed - h.time) / LABEL_DURATION;
        if (age < 0 || age > 1) continue;
        const opacity = 1 - age;
        const labelY = h.y - 22 - age * 14;
        ctx.fillStyle = `rgba(193, 72, 72, ${opacity})`;
        ctx.fillText("rejected", h.x, labelY);
      }
      ctx.restore();
    }

    drawProcessedLabels() {
      const ctx = this.ctx;
      ctx.save();
      ctx.font = '700 11px "DM Mono", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const h of this.processedLabels) {
        const age = (this.elapsed - h.time) / LABEL_DURATION;
        if (age < 0 || age > 1) continue;
        const opacity = 1 - age;
        const labelY = h.y - 22 - age * 14;
        ctx.fillStyle = `rgba(45, 106, 80, ${opacity})`;
        ctx.fillText("processed", h.x, labelY);
      }
      ctx.restore();
    }

    drawLegend() {
      const ctx = this.ctx;
      const dividerY = ANIM_H;
      const cy = ANIM_H + (this.logicalH - ANIM_H) / 2;
      const items = [
        { type: "polling", label: "Polling" },
        { type: "meteor-blue", label: "Ticket request" },
        { type: "ticket", label: "Ticket" },
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
        } else if (item.type === "meteor-blue") {
          for (let j = 6; j >= 0; j--) {
            const px = startX + sampleW - j * 4;
            const fade = 1 - j / 7;
            const radius = 4 * (0.4 + 0.6 * fade);
            ctx.fillStyle = `rgba(92, 182, 224, ${fade * 0.95})`;
            ctx.beginPath();
            ctx.arc(px, cy, radius, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (item.type === "ticket") {
          ctx.font =
            '20px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
          ctx.textAlign = "center";
          ctx.fillText("🎫", sampleCx, cy);
        }

        ctx.font = '600 11px "DM Mono", monospace';
        ctx.textAlign = "left";
        ctx.fillStyle = COLORS.muted;
        ctx.fillText(item.label, labelX, cy);
      });

      ctx.restore();
    }
  }

  function init() {
    const canvas = document.getElementById("anim-hero");
    if (!canvas) return;
    const sim = new ResolveHero(canvas);

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

/* Resolve project page — hub-and-spoke ticket flow animation
 *
 * Layout:
 *           [REVIEWERS group: SUP1   SUP2]
 *                       ▲ ▼ (review / approve)
 *  [AGENTS]  ──→  [ R E S O L V E ]  ──→  [EXTERNAL SERVICES: ORDER, PAYMENT]
 *                                  ◀──   (responses)
 *
 * Flow:
 *  1. Agent → Resolve (ticket arrives)
 *  2. Resolve → Reviewer (Resolve dispatches for approval)
 *  3a. Rejected → ticket dismissed at reviewer
 *  3b. Approved → back to Resolve
 *  4. Resolve → external Service (Order or Payment)
 *  5. Service → Resolve (response packet returns; counter increments)
 */

const DURATION       = 16000;
const SPAWN_END      = 13500;
const REVIEW_MS      = 1300;
const REVIEWED_MS    = 450;   // brief display of check/X after review
const TRAVEL_FAST    = 0.0019;
const TRAVEL_NORMAL  = 0.0014;
const RESPONSE_DELAY = 220;
const REJECT_RATE    = 0.18;
const SPAWN_MIN      = 2400;
const SPAWN_MAX      = 3800;

const TICKET_TYPES = [
  { id: 'reship', label: 'RESHIP', color: '#2d6a50', service: 0 },
  { id: 'refund', label: 'REFUND', color: '#3d6b96', service: 1 },
  { id: 'cancel', label: 'CANCEL', color: '#9a6240', service: 0 },
];

class ResolveHero {
  constructor(canvas, counterEl) {
    this.canvas    = canvas;
    this.ctx       = canvas.getContext('2d');
    this.counterEl = counterEl;
    this.tickets   = [];
    this.nextId    = 0;
    this.resolved  = 0;
    this.elapsed   = 0;
    this.lastTs    = null;
    this.rafId     = null;
    this.resolvePulseT = 0;
    this.setupHiDPI();
    this.layout();
    this.bindReplay();
    this.autoPlay();
  }

  setupHiDPI() {
    const dpr = window.devicePixelRatio || 1;
    const lW  = this.canvas.width;
    const lH  = this.canvas.height;
    this.canvas.width  = lW * dpr;
    this.canvas.height = lH * dpr;
    this.W = lW;
    this.H = lH;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  layout() {
    // Canvas: 720×380, Resolve canvas-centered at (360, 190)

    // ── Top label ──────────────────────────────────────────
    this.topLabelY = 20;

    // ── REVIEWERS (top center, 2 supervisors) ──────────────
    this.reviewerR = 22;
    this.reviewers = [
      { x: 325, y: 58, busy: false, ticketId: null, progress: 0 },
      { x: 395, y: 58, busy: false, ticketId: null, progress: 0 },
    ];

    // ── Three boxes share the same vertical band ───────────
    // Agent and External boxes mirror each other around Resolve.
    const boxTop = 100, boxBottom = 280; // H = 180

    // ── AGENT GROUP (left, dashed boundary, 4 agents) ──────
    this.agentLeft   = 60;
    this.agentRight  = 240;     // W = 180
    this.agentTop    = boxTop;
    this.agentBottom = boxBottom;
    this.agentR = 18;
    this.agents = [130, 170, 210, 250].map((y, i) => ({
      x: 150,                   // centered in agent box
      y,
      lastSpawn: -Math.random() * 1800 - i * 350,
      spawnInterval: SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN),
      flashT: 0,
    }));

    // ── RESOLVE box (canvas-centered hub) ──────────────────
    this.resolveX      = 360;
    this.resolveY      = 190;
    this.resolveW      = 160;
    this.resolveH      = 180;
    this.resolveLeft   = this.resolveX - this.resolveW / 2;  // 280
    this.resolveRight  = this.resolveX + this.resolveW / 2;  // 440
    this.resolveTop    = this.resolveY - this.resolveH / 2;  // 100
    this.resolveBottom = this.resolveY + this.resolveH / 2;  // 280

    // ── EXTERNAL SERVICES (right, dashed boundary) ─────────
    this.externalLeft   = 480;
    this.externalRight  = 660;  // W = 180
    this.externalTop    = boxTop;
    this.externalBottom = boxBottom;
    this.serviceR = 22;
    this.services = [
      { x: 570, y: 150, id: 'order',   label: 'ORDER',   color: '#2d6a50', pulseT: 0 },
      { x: 570, y: 230, id: 'payment', label: 'PAYMENT', color: '#3d6b96', pulseT: 0 },
    ];

    // ── Ticket sizing ──────────────────────────────────────
    this.tickW = 42;
    this.tickH = 20;
  }

  autoPlay() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.draw(); return;
    }
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) { this.start(); obs.disconnect(); }
    }, { threshold: 0.3 });
    obs.observe(this.canvas);
  }

  bindReplay() {
    document.getElementById('anim-replay')?.addEventListener('click', () => this.start());
  }

  start() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.tickets   = [];
    this.nextId    = 0;
    this.resolved  = 0;
    this.elapsed   = 0;
    this.lastTs    = null;
    this.resolvePulseT = 0;
    this.agents.forEach((a, i) => {
      a.lastSpawn = -Math.random() * 1800 - i * 350;
      a.spawnInterval = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
      a.flashT = 0;
    });
    this.reviewers.forEach(r => { r.busy = false; r.ticketId = null; r.progress = 0; });
    this.services.forEach(s => s.pulseT = 0);
    if (this.counterEl) this.counterEl.textContent = '0';
    this.rafId = requestAnimationFrame(ts => this.loop(ts));
  }

  loop(ts) {
    if (!this.lastTs) this.lastTs = ts;
    const dt = Math.min(ts - this.lastTs, 50);
    this.lastTs = ts;
    this.elapsed += dt;
    this.update(dt);
    this.draw();
    if (this.elapsed < DURATION || this.tickets.length > 0) {
      this.rafId = requestAnimationFrame(t => this.loop(t));
    }
  }

  // ── UPDATE ─────────────────────────────────────────────────────────────────

  update(dt) {
    // Decay agent flashes
    for (const a of this.agents) {
      if (a.flashT > 0) a.flashT = Math.max(0, a.flashT - dt * 0.0035);
    }
    // Decay Resolve pulse
    if (this.resolvePulseT > 0) {
      this.resolvePulseT = Math.max(0, this.resolvePulseT - dt * 0.0024);
    }
    // Decay service pulses
    for (const s of this.services) {
      if (s.pulseT > 0) s.pulseT = Math.max(0, s.pulseT - dt * 0.0018);
    }

    // 1. Agents spawn tickets in parallel
    if (this.elapsed < SPAWN_END) {
      for (const agent of this.agents) {
        if (this.elapsed - agent.lastSpawn >= agent.spawnInterval) {
          agent.lastSpawn = this.elapsed;
          agent.spawnInterval = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
          agent.flashT = 1;
          const type = TICKET_TYPES[Math.floor(Math.random() * 3)];
          const approved = Math.random() > REJECT_RATE;
          this.tickets.push({
            id: this.nextId++,
            type,
            approved,
            phase: 'agent-to-resolve',
            t: 0,
            opacity: 0,
            srcX: agent.x,
            srcY: agent.y,
            reviewerIdx: null,
            responseDelay: 0,
          });
        }
      }
    }

    // 2. Update each ticket based on phase
    const toRemove = [];
    for (const tk of this.tickets) {
      switch (tk.phase) {
        case 'agent-to-resolve':
          tk.t += dt * TRAVEL_NORMAL;
          tk.opacity = Math.min(1, tk.t * 5) * (1 - Math.max(0, (tk.t - 0.72) / 0.28));
          if (tk.t >= 1) {
            this.resolvePulseT = Math.max(this.resolvePulseT, 0.7);
            tk.t = 0;
            tk.phase = 'await-reviewer';
          }
          break;

        case 'await-reviewer':
          // Held inside Resolve; assignment happens in queue pass below
          break;

        case 'resolve-to-reviewer':
          tk.t += dt * TRAVEL_FAST;
          tk.opacity = Math.min(1, tk.t * 4);
          if (tk.t >= 1) { tk.t = 0; tk.opacity = 1; tk.phase = 'reviewing'; }
          break;

        case 'reviewing': {
          tk.t += dt / REVIEW_MS;
          const r = this.reviewers[tk.reviewerIdx];
          r.progress = tk.t;
          if (tk.t >= 1) {
            tk.t = 0;
            tk.phase = 'reviewed';
          }
          break;
        }

        case 'reviewed': {
          tk.t += dt / REVIEWED_MS;
          if (tk.t >= 1) {
            const r = this.reviewers[tk.reviewerIdx];
            r.busy = false;
            r.ticketId = null;
            r.progress = 0;
            tk.t = 0;
            tk.phase = tk.approved ? 'reviewer-to-resolve' : 'rejected';
          }
          break;
        }

        case 'rejected':
          tk.t += dt * 0.0024;
          tk.opacity = 1 - tk.t;
          if (tk.t >= 1) toRemove.push(tk.id);
          break;

        case 'reviewer-to-resolve':
          tk.t += dt * TRAVEL_FAST;
          tk.opacity = 1 - Math.max(0, (tk.t - 0.7) / 0.3);
          if (tk.t >= 1) {
            this.resolvePulseT = Math.max(this.resolvePulseT, 0.8);
            tk.t = 0;
            tk.phase = 'resolve-to-service';
          }
          break;

        case 'resolve-to-service':
          tk.t += dt * TRAVEL_NORMAL;
          tk.opacity = Math.min(1, tk.t * 5) * (1 - Math.max(0, (tk.t - 0.78) / 0.22));
          if (tk.t >= 1) {
            this.services[tk.type.service].pulseT = 1;
            tk.t = 0;
            tk.opacity = 1;
            tk.phase = 'service-response';
            tk.responseDelay = RESPONSE_DELAY;
          }
          break;

        case 'service-response':
          if (tk.responseDelay > 0) {
            tk.responseDelay -= dt;
            tk.opacity = 0;
            break;
          }
          tk.t += dt * TRAVEL_NORMAL;
          tk.opacity = Math.min(1, tk.t * 5) * (1 - Math.max(0, (tk.t - 0.8) / 0.2));
          if (tk.t >= 1) {
            this.resolvePulseT = Math.max(this.resolvePulseT, 1);
            this.resolved++;
            if (this.counterEl) this.counterEl.textContent = this.resolved.toString();
            toRemove.push(tk.id);
          }
          break;
      }
    }

    // 3. FIFO assign awaiting tickets to free reviewers
    const awaiting = this.tickets
      .filter(t => t.phase === 'await-reviewer')
      .sort((a, b) => a.id - b.id);
    for (const tk of awaiting) {
      const freeIdx = this.reviewers.findIndex(r => !r.busy);
      if (freeIdx < 0) break;
      tk.reviewerIdx = freeIdx;
      this.reviewers[freeIdx].busy = true;
      this.reviewers[freeIdx].ticketId = tk.id;
      this.reviewers[freeIdx].progress = 0;
      tk.phase = 'resolve-to-reviewer';
      tk.t = 0;
    }

    // 4. Remove finished
    if (toRemove.length) {
      this.tickets = this.tickets.filter(t => !toRemove.includes(t.id));
    }
  }

  // ── DRAW ───────────────────────────────────────────────────────────────────

  draw() {
    const { ctx, W, H } = this;
    ctx.clearRect(0, 0, W, H);
    this.drawConnectors();
    this.drawTopLabel();
    this.drawGroupBoundary(this.agentLeft, this.agentTop, this.agentRight - this.agentLeft, this.agentBottom - this.agentTop, 'CS AGENTS');
    this.drawGroupBoundary(this.externalLeft, this.externalTop, this.externalRight - this.externalLeft, this.externalBottom - this.externalTop, 'EXTERNAL');
    this.drawAgents();
    this.drawReviewers();
    this.drawServices();
    this.drawResolveBox();
    this.drawTickets();
  }

  drawConnectors() {
    const { ctx } = this;
    const border = cssVar('--border', '#e0dbd3');
    ctx.save();
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.globalAlpha = 0.4;

    // Agents → Resolve (left edge anchor)
    for (const a of this.agents) {
      ctx.beginPath();
      ctx.moveTo(a.x + this.agentR + 1, a.y);
      ctx.lineTo(this.resolveLeft - 2, this.resolveY);
      ctx.stroke();
    }

    // Resolve ↔ Reviewers (diagonals converging on Resolve top center)
    for (const r of this.reviewers) {
      ctx.beginPath();
      ctx.moveTo(r.x, r.y + this.reviewerR + 2);
      ctx.lineTo(this.resolveX, this.resolveTop - 2);
      ctx.stroke();
    }

    // Resolve → Services (bidirectional)
    for (const s of this.services) {
      ctx.beginPath();
      ctx.moveTo(this.resolveRight + 2, this.resolveY);
      ctx.lineTo(s.x - this.serviceR - 2, s.y);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawTopLabel() {
    const { ctx, topLabelY } = this;
    const muted = cssVar('--muted', '#7a7670');
    ctx.save();
    ctx.font = '500 9px "DM Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = muted;
    ctx.fillText('CS SUPERVISORS · REVIEWERS', (this.reviewers[0].x + this.reviewers[1].x) / 2, topLabelY);
    ctx.restore();
  }

  drawGroupBoundary(x, y, w, h, label) {
    const { ctx } = this;
    const muted = cssVar('--muted', '#7a7670');
    const border = cssVar('--border', '#e0dbd3');
    ctx.save();

    // Dashed boundary
    roundRect(ctx, x, y, w, h, 10);
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.setLineDash([]);

    // Tag breaking through the top border
    const tagX = x + 12;
    const tagY = y;
    ctx.font = 'bold 8px "DM Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const tagW = ctx.measureText(label).width + 12;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(tagX - 4, tagY - 7, tagW, 12);
    ctx.fillStyle = muted;
    ctx.fillText(label, tagX + 2, tagY);

    ctx.restore();
  }

  drawAgents() {
    const { ctx } = this;
    const accent = cssVar('--accent', '#2d6a50');
    const border = cssVar('--border', '#e0dbd3');

    for (const a of this.agents) {
      ctx.save();
      if (a.flashT > 0) {
        ctx.beginPath();
        ctx.arc(a.x, a.y, this.agentR + 4 + (1 - a.flashT) * 7, 0, Math.PI * 2);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = a.flashT * 0.45;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.beginPath();
      ctx.arc(a.x, a.y, this.agentR, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = border;
      ctx.lineWidth = 1.3;
      ctx.fill();
      ctx.stroke();

      // Person + headset
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(a.x, a.y - 4, 4.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(a.x, a.y + 11, 8.5, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(a.x, a.y - 4, 7.5, Math.PI, 0);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(a.x - 7.5, a.y - 4, 1.7, 0, Math.PI * 2);
      ctx.arc(a.x + 7.5, a.y - 4, 1.7, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();

      ctx.restore();
    }
  }

  drawReviewers() {
    const { ctx, reviewerR } = this;
    const accent = cssVar('--accent', '#2d6a50');
    const border = cssVar('--border', '#e0dbd3');

    for (const r of this.reviewers) {
      ctx.save();

      // Outer dashed ring
      ctx.beginPath();
      ctx.arc(r.x, r.y, reviewerR + 7, 0, Math.PI * 2);
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Body
      ctx.beginPath();
      ctx.arc(r.x, r.y, reviewerR, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = border;
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();

      // Shield + check
      const sy = r.y - 1;
      ctx.beginPath();
      ctx.moveTo(r.x, sy - 11);
      ctx.lineTo(r.x + 9, sy - 7);
      ctx.lineTo(r.x + 9, sy + 1);
      ctx.quadraticCurveTo(r.x + 9, sy + 8, r.x, sy + 13);
      ctx.quadraticCurveTo(r.x - 9, sy + 8, r.x - 9, sy + 1);
      ctx.lineTo(r.x - 9, sy - 7);
      ctx.closePath();
      ctx.fillStyle = 'rgba(45,106,80,0.10)';
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.3;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(r.x - 4, sy + 1);
      ctx.lineTo(r.x - 1, sy + 4);
      ctx.lineTo(r.x + 5, sy - 4);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      ctx.restore();
    }
  }

  drawResolveBox() {
    const { ctx, resolveX, resolveY, resolveW, resolveH, resolveLeft, resolveTop, resolveBottom } = this;
    const accent = cssVar('--accent', '#2d6a50');
    const border = cssVar('--border', '#e0dbd3');
    const text   = cssVar('--text', '#1c1c1a');
    const muted  = cssVar('--muted', '#7a7670');
    ctx.save();

    // Pulse glow
    if (this.resolvePulseT > 0) {
      const pad = (1 - this.resolvePulseT) * 14 + 4;
      roundRect(ctx, resolveLeft - pad, resolveTop - pad, resolveW + pad * 2, resolveH + pad * 2, 14);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = this.resolvePulseT * 0.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Body
    roundRect(ctx, resolveLeft, resolveTop, resolveW, resolveH, 10);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = this.resolvePulseT > 0.05 ? accent : border;
    ctx.lineWidth = 1.8;
    ctx.fill();
    ctx.stroke();

    // Header bar inside box
    ctx.save();
    roundRect(ctx, resolveLeft, resolveTop, resolveW, 26, { tl: 10, tr: 10, br: 0, bl: 0 });
    ctx.fillStyle = 'rgba(45,106,80,0.07)';
    ctx.fill();
    ctx.restore();

    // Header text
    ctx.font = '600 7.5px "DM Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accent;
    ctx.fillText('● SYSTEM', resolveLeft + 11, resolveTop + 13);

    // Title (positioned near box vertical center)
    ctx.font = '800 22px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = text;
    ctx.fillText('Resolve', resolveX, resolveTop + 75);

    // Subtitle
    ctx.font = '500 7.5px "DM Mono", monospace';
    ctx.fillStyle = muted;
    ctx.fillText('ORCHESTRATOR', resolveX, resolveTop + 92);

    // Divider
    ctx.beginPath();
    ctx.moveTo(resolveLeft + 16, resolveTop + 105);
    ctx.lineTo(resolveLeft + resolveW - 16, resolveTop + 105);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Queue chips (awaiting reviewer) near bottom
    const awaiting = this.tickets.filter(t => t.phase === 'await-reviewer');
    const chipY = resolveBottom - 28;
    const maxChips = 9;
    const chipSpacing = 10;
    const showChips = Math.min(awaiting.length, maxChips);
    if (showChips > 0) {
      const totalW = (showChips - 1) * chipSpacing;
      const startX = resolveX - totalW / 2;
      for (let i = 0; i < showChips; i++) {
        const tk = awaiting[i];
        ctx.beginPath();
        ctx.arc(startX + i * chipSpacing, chipY, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = tk.type.color;
        ctx.fill();
      }
    }
    // Queue label
    ctx.font = '500 7px "DM Mono", monospace';
    ctx.fillStyle = muted;
    ctx.textAlign = 'center';
    ctx.fillText(awaiting.length > 0 ? `QUEUE · ${awaiting.length}` : 'IDLE', resolveX, chipY + 13);

    ctx.restore();
  }

  drawServices() {
    const { ctx, serviceR } = this;
    const border = cssVar('--border', '#e0dbd3');

    for (const s of this.services) {
      ctx.save();
      const w = serviceR * 2.0, h = serviceR * 1.7;

      // Pulse ring
      if (s.pulseT > 0) {
        const pad = (1 - s.pulseT) * 9 + 2;
        roundRect(ctx, s.x - w/2 - pad, s.y - h/2 - pad, w + pad * 2, h + pad * 2, 9);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = s.pulseT * 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Body
      roundRect(ctx, s.x - w/2, s.y - h/2, w, h, 7);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = s.pulseT > 0.1 ? s.color : border;
      ctx.lineWidth = 1.6;
      ctx.fill();
      ctx.stroke();

      // Icon
      ctx.strokeStyle = s.color;
      ctx.fillStyle   = s.color;
      ctx.lineWidth   = 1.5;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';

      if (s.id === 'order') {
        // Box with cross-tape
        ctx.beginPath();
        roundRect(ctx, s.x - 11, s.y - 8, 22, 14, 1.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s.x - 11, s.y - 1);
        ctx.lineTo(s.x + 11, s.y - 1);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - 8);
        ctx.lineTo(s.x, s.y + 5);
        ctx.stroke();
      } else {
        // Card with chip + stripe
        ctx.beginPath();
        roundRect(ctx, s.x - 12, s.y - 8, 24, 15, 2);
        ctx.stroke();
        ctx.fillRect(s.x - 12, s.y - 5, 24, 2.5);
        ctx.beginPath();
        ctx.rect(s.x - 9, s.y + 1, 5, 4);
        ctx.stroke();
      }

      // Label below icon (inside box)
      ctx.font = 'bold 8px "DM Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = s.color;
      ctx.fillText(s.label, s.x, s.y + h/2 + 14);

      ctx.restore();
    }
  }

  // ── Tickets ────────────────────────────────────────────────────────────────

  drawTickets() {
    for (const tk of this.tickets) {
      if (tk.phase === 'await-reviewer') continue; // rendered as chips inside Resolve
      const pos = this.getTicketPos(tk);
      if (!pos) continue;
      const compact = (tk.phase === 'service-response');
      this.drawTicket(pos.x, pos.y, tk, compact);

      // Decision badge stamps onto the ticket during reviewed/rejected phases
      if (tk.phase === 'reviewed') {
        // Pop-in scale during the first ~25% of the phase
        const scale = Math.min(1, tk.t * 4);
        this.drawDecisionBadge(pos.x, pos.y, tk.approved, scale, tk.opacity ?? 1);
      } else if (tk.phase === 'rejected') {
        this.drawDecisionBadge(pos.x, pos.y, false, 1, tk.opacity ?? 1);
      }
    }
  }

  drawDecisionBadge(x, y, approved, scale, opacity) {
    const { ctx } = this;
    if (scale <= 0) return;
    ctx.save();
    ctx.globalAlpha = opacity;

    const r = 11 * scale;
    const color = approved ? '#2d6a50' : '#c0392b';

    // White halo so the badge reads against the ticket
    ctx.beginPath();
    ctx.arc(x, y, r + 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Filled badge
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Icon (only render once badge is mostly grown)
    if (scale > 0.45) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (approved) {
        ctx.beginPath();
        ctx.moveTo(x - 4, y);
        ctx.lineTo(x - 1, y + 3);
        ctx.lineTo(x + 4, y - 3);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(x - 3.5, y - 3.5);
        ctx.lineTo(x + 3.5, y + 3.5);
        ctx.moveTo(x + 3.5, y - 3.5);
        ctx.lineTo(x - 3.5, y + 3.5);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  getTicketPos(tk) {
    if (tk.phase === 'agent-to-resolve') {
      const e = easeInOut(tk.t);
      return { x: lerp(tk.srcX, this.resolveX, e), y: lerp(tk.srcY, this.resolveY, e) };
    }
    if (tk.phase === 'resolve-to-reviewer') {
      const r = this.reviewers[tk.reviewerIdx];
      const e = easeInOut(tk.t);
      return { x: lerp(this.resolveX, r.x, e), y: lerp(this.resolveY, r.y, e) };
    }
    if (tk.phase === 'reviewing' || tk.phase === 'reviewed' || tk.phase === 'rejected') {
      const r = this.reviewers[tk.reviewerIdx];
      // Position ticket slightly below the reviewer so the shield stays visible
      return { x: r.x, y: r.y + this.reviewerR + 10 };
    }
    if (tk.phase === 'reviewer-to-resolve') {
      const r = this.reviewers[tk.reviewerIdx];
      const e = easeInOut(tk.t);
      return { x: lerp(r.x, this.resolveX, e), y: lerp(r.y + this.reviewerR + 10, this.resolveY, e) };
    }
    if (tk.phase === 'resolve-to-service') {
      const s = this.services[tk.type.service];
      const e = easeInOut(tk.t);
      return { x: lerp(this.resolveX, s.x, e), y: lerp(this.resolveY, s.y, e) };
    }
    if (tk.phase === 'service-response') {
      const s = this.services[tk.type.service];
      const e = easeInOut(tk.t);
      return { x: lerp(s.x, this.resolveX, e), y: lerp(s.y, this.resolveY, e) };
    }
    return null;
  }

  drawTicket(x, y, tk, compact) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = tk.opacity ?? 1;

    if (compact) {
      // Response packet — small filled chip
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = tk.type.color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      return;
    }

    const w = this.tickW, h = this.tickH;

    // Body
    roundRect(ctx, x - w/2, y - h/2, w, h, 4);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = tk.type.color;
    ctx.lineWidth = 1.2;
    ctx.fill();
    ctx.stroke();

    // Color stripe (left edge)
    ctx.save();
    roundRect(ctx, x - w/2, y - h/2, w, h, 4);
    ctx.clip();
    ctx.fillStyle = tk.type.color;
    ctx.fillRect(x - w/2, y - h/2, 4, h);
    ctx.restore();

    // Centered type label
    ctx.font = 'bold 7px "DM Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = tk.type.color;
    ctx.fillText(tk.type.label, x + 2, y);

    ctx.restore();
  }
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

function cssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function easeInOut(t) {
  t = Math.max(0, Math.min(1, t));
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function lerp(a, b, t) { return a + (b - a) * t; }

function roundRect(ctx, x, y, w, h, r) {
  let rTL, rTR, rBR, rBL;
  if (typeof r === 'object') {
    rTL = r.tl ?? 0; rTR = r.tr ?? 0; rBR = r.br ?? 0; rBL = r.bl ?? 0;
  } else {
    rTL = rTR = rBR = rBL = r;
  }
  // clamp
  const maxR = Math.min(w, h) / 2;
  rTL = Math.min(rTL, maxR); rTR = Math.min(rTR, maxR);
  rBR = Math.min(rBR, maxR); rBL = Math.min(rBL, maxR);
  ctx.beginPath();
  ctx.moveTo(x + rTL, y);
  ctx.lineTo(x + w - rTR, y);
  if (rTR > 0) ctx.arcTo(x + w, y, x + w, y + rTR, rTR);
  ctx.lineTo(x + w, y + h - rBR);
  if (rBR > 0) ctx.arcTo(x + w, y + h, x + w - rBR, y + h, rBR);
  ctx.lineTo(x + rBL, y + h);
  if (rBL > 0) ctx.arcTo(x, y + h, x, y + h - rBL, rBL);
  ctx.lineTo(x, y + rTL);
  if (rTL > 0) ctx.arcTo(x, y, x + rTL, y, rTL);
  ctx.closePath();
}

// ── INIT ─────────────────────────────────────────────────────────────────────

const canvas    = document.getElementById('anim-hero');
const counterEl = document.getElementById('anim-counter');
if (canvas) new ResolveHero(canvas, counterEl);

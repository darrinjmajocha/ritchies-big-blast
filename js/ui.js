/**
 * ui.js
 * Canvas rendering + DOM UI (accessible buttons overlay)
 */
(function(){
  const { CANVAS_BASE_W, CANVAS_BASE_H, COLORS, FONTS } = window.CONSTS;

  // Bigger, unified RITchie size + placement
  const RITCHIE_R = 300;
  const RITCHIE_PLAY_X = CANVAS_BASE_W / 2;
  const RITCHIE_PLAY_Y = 360;

  function easeOutCubic(t){ return 1 - Math.pow(1-t,3); }
  function easeInOutSine(t){ return -(Math.cos(Math.PI*t)-1)/2; }

  class Renderer {
    constructor(canvas, assets){
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.assets = assets;
    }

    // Desktop-friendly, letterboxed 16:9 fit
    resize(){
      const W = CANVAS_BASE_W, H = CANVAS_BASE_H;
      const vw = window.innerWidth, vh = window.innerHeight;
      const scale = Math.min(vw / W, vh / H);

      this.canvas.width = W;
      this.canvas.height = H;

      const cssW = Math.round(W * scale);
      const cssH = Math.round(H * scale);
      this.canvas.style.width = cssW + "px";
      this.canvas.style.height = cssH + "px";
    }

    begin(){
      const g = this.ctx;
      g.save();
      g.clearRect(0,0,this.canvas.width,this.canvas.height);
      if(this.assets.images.bg){
        g.drawImage(this.assets.images.bg, 0,0, CANVAS_BASE_W, CANVAS_BASE_H);
      }else{
        g.fillStyle = COLORS.bg;
        g.fillRect(0,0,CANVAS_BASE_W, CANVAS_BASE_H);
      }
    }

    end(){ this.ctx.restore(); }

    // --- SCREENS ---

    drawTitle(){
      const g = this.ctx;
      g.fillStyle = "#fff";
      g.font = FONTS.big;
      g.textAlign = "center";
      g.fillText("RITchie's Big Blast", CANVAS_BASE_W/2, 180);

      g.font = FONTS.med;
      g.fillStyle = "#dbe4ff";
      g.fillText("Press Play to Begin", CANVAS_BASE_W/2, 240);
    }

    drawSetup(currentCount){
      const g = this.ctx;
      g.fillStyle = "#fff";
      g.font = FONTS.med;
      g.textAlign = "center";
      g.fillText(`Players: ${currentCount}`, CANVAS_BASE_W/2, 160);
      g.font = FONTS.small;
      g.fillStyle = "#b8c0ff";
      g.fillText("Use + / - or the buttons below (2–20)", CANVAS_BASE_W/2, 200);
    }

    // Intro = inflate/zoom from tiny to full size (not dropping)
    drawIntro(t){
      const g = this.ctx;
      const scale = 0.15 + 0.85 * easeOutCubic(t); // 0.15→1.0
      this.drawRitchie(CANVAS_BASE_W/2, RITCHIE_PLAY_Y, RITCHIE_R * scale, "ritchie");
    }

    drawStartPrompt(game, now){
      const total = 3000;
      const remain = Math.max(0, game.startPromptUntil - now);
      const t = 1 - (remain / total); // 0..1
      const alpha = 1 - Math.abs(2*t - 1);
      const eased = easeInOutSine(alpha);

      const g = this.ctx;
      g.save();
      g.globalAlpha = eased;
      g.fillStyle = "#fff";
      g.font = FONTS.big;
      g.textAlign = "center";
      g.fillText("Start!", CANVAS_BASE_W/2, 140);
      g.restore();
    }

    drawPlaying(game){
      const g = this.ctx;

      if(game.showRitchie){
        const rx = RITCHIE_PLAY_X;
        const ry = RITCHIE_PLAY_Y;
        const scale = game.balloonScale || 1;

        // Decide which balloon image to show during countdown
        let variant = "ritchie";
        if (game.state === window.GameStates.COUNTDOWN) {
          if (game.countdownValue === 3) variant = "ritchie_3";
          else if (game.countdownValue === 2) variant = "ritchie_2";
          else if (game.countdownValue === 1) variant = "ritchie_1";
        }
        this.drawRitchie(rx, ry, RITCHIE_R * scale, variant);

        if(game.showDudUntil && performance.now() < game.showDudUntil){
          // Fade in over 0.5s from when dud started
          const now = performance.now();
          const t = Math.min(1, (now - (game.dudShownAt || 0)) / 500);
          g.save();
          g.globalAlpha = t; // 0→1 over 0.5s
          g.textAlign = "center";
          g.font = FONTS.big;
          g.fillStyle = "#ffffff";
          g.fillText("Dud!", rx, ry + (RITCHIE_R*scale*0.7));
          g.restore();
        }
      }

      // HUD (top-left)
      g.font = FONTS.small;
      g.fillStyle = "#b8c0ff";
      g.textAlign = "left";
      g.fillText(`Remaining Players: ${game.hud.remainingPlayers}`, 24, 34);
      g.fillText(`Choices this round: ${game.hud.remainingChoices}`, 24, 60);

      // Restored: pop % chance (1 / remaining untaken)
      const remaining = (game.roundChoices || []).filter(c => !c.taken).length;
      if (remaining > 0) {
        const pct = Math.round(100 / remaining);
        g.fillText(`Pop chance: ${pct}%`, 24, 86);
      }
    }

    drawReveal(game){
      this.drawPlaying(game);
    }

    // Keep the old numeric countdown invisible (opacity 0) per your note.
    drawCountdown(game){
      if(game.countdownValue === null) return;
      const g = this.ctx;
      g.save();
      g.globalAlpha = 0; // invisible text countdown
      g.textAlign = "center";
      g.font = "800 144px system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica, Arial, sans-serif";
      g.fillStyle = "#ffffff";
      g.fillText(String(game.countdownValue), CANVAS_BASE_W/2, CANVAS_BASE_H/2);
      g.restore();
    }

    drawExplosion(){
      const img = this.assets.images.explosion;
      const g = this.ctx;
      if(img){
        const w = 520, h = 380;
        g.drawImage(img, (CANVAS_BASE_W - w)/2, (CANVAS_BASE_H - h)/2, w, h);
      } else {
        g.save();
        g.fillStyle = "#ffecd1";
        g.globalAlpha = 0.9;
        g.fillRect(0,0,CANVAS_BASE_W,CANVAS_BASE_H);
        g.restore();
      }
    }

    drawGameOver(game){
      const g = this.ctx;
      g.textAlign = "center";
      g.font = FONTS.big;
      g.fillStyle = "#fff";
      g.fillText("Winner!", CANVAS_BASE_W/2, 180);
    }

    // --- SPRITES ---
    // imgKey: "ritchie" (default), or "ritchie_3" / "ritchie_2" / "ritchie_1"
    drawRitchie(x, y, r, imgKey="ritchie"){
      const g = this.ctx;
      const img = this.assets.images[imgKey] || this.assets.images.ritchie;
      if(img){
        const w = r*1.6, h = r*1.6;
        g.drawImage(img, x-w/2, y-h/2, w, h);
      }else{
        // placeholder balloon
        g.fillStyle = "#ff7a59";
        g.beginPath(); g.arc(x, y, r/2, 0, Math.PI*2); g.fill();
        g.fillStyle = "#fff";
        g.beginPath(); g.arc(x-28, y-10, 10, 0, Math.PI*2); g.fill();
        g.beginPath(); g.arc(x+28, y-10, 10, 0, Math.PI*2); g.fill();
        g.fillStyle = "#0b1020";
        g.beginPath(); g.arc(x-28, y-10, 5, 0, Math.PI*2); g.fill();
        g.beginPath(); g.arc(x+28, y-10, 5, 0, Math.PI*2); g.fill();
        g.strokeStyle = "#ffc9b9";
        g.lineWidth = 3;
        g.beginPath(); g.moveTo(x, y+r/2); g.lineTo(x, y+r/2+60); g.stroke();
      }
    }
  }

  class UILayer {
    constructor(root){
      this.root = root;
      this.root.innerHTML = "";
      this.rows = {};
    }
    clear(){ this.root.innerHTML=""; this.rows={}; }
    row(id){
      if(!this.rows[id]){
        const div = document.createElement("div");
        div.className = "ui-row";
        this.root.appendChild(div);
        this.rows[id] = div;
      }
      return this.rows[id];
    }
    button(text, cls, onClick, ariaLabel){
      const b = document.createElement("button");
      b.className = `ui-btn ${cls||""}`.trim();
      b.textContent = text;
      b.setAttribute("aria-label", ariaLabel || text);
      b.addEventListener("click", onClick);
      return b;
    }
  }

  window.Renderer = Renderer;
  window.UILayer = UILayer;
})();

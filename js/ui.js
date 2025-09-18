/**
 * ui.js
 * Canvas rendering + DOM UI (accessible buttons overlay)
 */
(function(){
  const { CANVAS_BASE_W, CANVAS_BASE_H, COLORS, FONTS } = window.CONSTS;

  function easeOutCubic(t){ return 1 - Math.pow(1-t,3); }
  function easeInOutSine(t){ return -(Math.cos(Math.PI*t)-1)/2; }

  class Renderer {
    constructor(canvas, assets){
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.assets = assets;
      this.scale = 1;
      this.offsetX = 0;
      this.offsetY = 0;
    }

    // Desktop-friendly, letterboxed 16:9 fit
    resize(){
      const W = CANVAS_BASE_W, H = CANVAS_BASE_H;
      const vw = window.innerWidth, vh = window.innerHeight;
      const scale = Math.min(vw / W, vh / H);

      // internal render resolution stays native
      this.canvas.width = W;
      this.canvas.height = H;

      // CSS display size (centered by parent styles)
      const cssW = Math.round(W * scale);
      const cssH = Math.round(H * scale);
      this.canvas.style.width = cssW + "px";
      this.canvas.style.height = cssH + "px";
    }

    begin(){
      const g = this.ctx;
      g.save();
      g.clearRect(0,0,this.canvas.width,this.canvas.height);
      // background
      if(this.assets.images.bg){
        g.drawImage(this.assets.images.bg, 0,0, CANVAS_BASE_W, CANVAS_BASE_H);
      }else{
        g.fillStyle = COLORS.bg;
        g.fillRect(0,0,CANVAS_BASE_W, CANVAS_BASE_H);
      }
    }

    end(){
      this.ctx.restore();
    }

    // --- SCREENS ---

    drawTitle(){
      const g = this.ctx;
      g.fillStyle = "#fff";
      g.font = FONTS.big;
      g.textAlign = "center";
      g.fillText("Ritchie's Big Blast", CANVAS_BASE_W/2, 180);

      g.font = FONTS.med;
      g.fillStyle = "#dbe4ff";
      g.fillText("Press Play to Begin", CANVAS_BASE_W/2, 240);
      // No Ritchie on title
    }

    drawSetup(currentCount){
      const g = this.ctx;
      g.fillStyle = "#fff";
      g.font = FONTS.med;
      g.textAlign = "center";
      g.fillText(`Players: ${currentCount}`, CANVAS_BASE_W/2, 160);
      g.font = FONTS.small;
      g.fillStyle = "#b8c0ff";
      g.fillText("Use + / - or the buttons below (2–15)", CANVAS_BASE_W/2, 200);
      // No Ritchie on setup
    }

    drawIntro(t){
      // Ritchie balloon floats down with easing
      const g = this.ctx;
      const startY = -150;
      const endY = 280;
      const y = startY + (endY - startY) * easeOutCubic(t);
      this.drawRitchie(CANVAS_BASE_W/2, y, 200); // bigger
      g.fillStyle = "#dbe4ff";
      g.font = FONTS.small;
      g.textAlign = "center";
      g.fillText("Get ready…", CANVAS_BASE_W/2, y + 140);
    }

    drawStartPrompt(game, now){
      // 3s total; fade in then out
      const total = 3000;
      const remain = Math.max(0, game.startPromptUntil - now);
      const t = 1 - (remain / total); // 0..1
      // soft triangle fade (0→1→0)
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

      // Only draw Ritchie when allowed
      if(game.showRitchie){
        this.drawRitchie(CANVAS_BASE_W/2, 260, 200); // bigger
      }

      // HUD
      g.font = FONTS.small;
      g.fillStyle = "#b8c0ff";
      g.textAlign = "left";
      const cp = game.currentPlayer;
      g.fillText(`Current: ${cp?cp.name:"—"}`, 24, 34);
      g.fillText(`Remaining Players: ${game.hud.remainingPlayers}`, 24, 60);
      g.fillText(`Choices this round: ${game.hud.remainingChoices}`, 24, 86);

      // DUD text (if active)
      if(game.showDudUntil && performance.now() < game.showDudUntil){
        g.save();
        g.textAlign = "center";
        g.font = FONTS.big;
        g.fillStyle = "#ffffff";
        g.fillText("Dud!", CANVAS_BASE_W/2, 150);
        g.restore();
      }

      // COUNTDOWN overlay (if active)
      if(game.state === window.GameStates.COUNTDOWN && game.countdownValue){
        g.save();
        g.textAlign = "center";
        g.font = FONTS.big;
        g.fillStyle = "#ffffff";
        g.fillText(String(game.countdownValue), CANVAS_BASE_W/2, 150);
        g.restore();
      }
    }

    drawReveal(game){
      // Suspense only (no "Revealing…" text)
      this.drawPlaying(game);
    }

    drawExplosion(){
      const img = this.assets.images.explosion;
      const g = this.ctx;
      if(img){
        const w = 500, h = 380;
        g.drawImage(img, (CANVAS_BASE_W - w)/2, (CANVAS_BASE_H - h)/2, w, h);
      } else {
        // simple flash fallback
        g.save();
        g.fillStyle = "#ffecd1";
        g.globalAlpha = 0.8;
        g.fillRect(0,0,CANVAS_BASE_W,CANVAS_BASE_H);
        g.restore();
      }
    }

    drawGameOver(game){
      const g = this.ctx;
      g.textAlign = "center";
      g.font = FONTS.big;
      g.fillStyle = "#fff";
      g.fillText(game.winner ? `${game.winner.name} Wins!` : "Game Over", CANVAS_BASE_W/2, 180);
    }

    // --- SPRITES ---

    drawRitchie(x, y, r){
      const g = this.ctx;
      if(this.assets.images.ritchie){
        const img = this.assets.images.ritchie;
        const w = r*1.6, h = r*1.6;
        g.drawImage(img, x-w/2, y-h/2, w, h);
      }else{
        // simple placeholder balloon
        g.fillStyle = "#ff7a59";
        g.beginPath();
        g.arc(x, y, r/2, 0, Math.PI*2);
        g.fill();
        // eyes
        g.fillStyle = "#fff";
        g.beginPath(); g.arc(x-20, y-5, 8, 0, Math.PI*2); g.fill();
        g.beginPath(); g.arc(x+20, y-5, 8, 0, Math.PI*2); g.fill();
        g.fillStyle = "#0b1020";
        g.beginPath(); g.arc(x-20, y-5, 4, 0, Math.PI*2); g.fill();
        g.beginPath(); g.arc(x+20, y-5, 4, 0, Math.PI*2); g.fill();
        // string
        g.strokeStyle = "#ffc9b9";
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(x, y+r/2);
        g.lineTo(x, y+r/2+40);
        g.stroke();
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

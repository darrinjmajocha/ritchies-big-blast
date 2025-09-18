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
      this.drawRitchie(CANVAS_BASE_W/2, y, 160);

      g.fillStyle = "#dbe4ff";
      g.font = FONTS.small;
      g.textAlign = "center";
      g.fillText("Get ready…", CANVAS_BASE_W/2, y + 130);
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
        // Base Ritchie position
        const r = 150;
        const rx = CANVAS_BASE_W/2;
        const ry = 260;
        this.drawRitchie(rx, ry, r);

        // If we are in the dud pause window, draw "Dud!" below Ritchie
        if(game.showDudUntil && performance.now() < game.showDudUntil){
          g.save();
          g.textAlign = "center";
          g.font = FONTS.big;
          g.fillStyle = "#ffffff";
          g.fillText("Dud!", rx, ry + r*0.9); // just under the balloon
          g.restore();
        }
      }

      // HUD
      g.font = FONTS.small;
      g.fillStyle = "#b8c0ff";
      g.textAlign = "left";
      const cp = game.currentPlayer;
      g.fillText(`Current: ${cp?cp.name:"—"}`, 24, 34);
      g.fillText(`Remaining Players: ${game.hud.remainingPlayers}`, 24, 60);
      g.fillText(`Choices this round: ${game.hud.remainingChoices}`, 24, 86);
    }

    drawReveal(game){
      // Suspense only (no "Revealing…" text)
      this.drawPlaying(game);
    }

    drawExplosion(){
      const img = this.assets.images.explosion;
      const g = this.ctx;
      if(img){
        const w = 420, h = 320;
        g.drawImage(img, (CANVAS_BASE_W - w)/2, (CANVAS_BASE_H - h)/2, w, h);
      } else {
        // simple flash fallback
        g.save();
        g.fillStyle = "#ffecd1";
        g.globalAlpha = 0.8;
        g.fi

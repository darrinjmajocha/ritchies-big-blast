
/**
 * ui.js
 * Canvas rendering + DOM UI (accessible buttons overlay)
 */
(function(){
  const { CANVAS_BASE_W, CANVAS_BASE_H, COLORS, FONTS } = window.CONSTS;

  function easeOutCubic(t){ return 1 - Math.pow(1-t,3); }

  class Renderer {
    constructor(canvas, assets){
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.assets = assets;
      this.scale = 1;
      this.offsetX = 0;
      this.offsetY = 0;
    }

    resize(){
      const parent = this.canvas.parentElement;
      const w = parent.clientWidth - 24;
      const h = Math.round(w * (CANVAS_BASE_H/CANVAS_BASE_W));
      this.canvas.width = CANVAS_BASE_W;
      this.canvas.height = CANVAS_BASE_H;
      this.canvas.style.width = w+"px";
      this.canvas.style.height = h+"px";
    }

    begin(){
      const g = this.ctx;
      g.save();
      g.clearRect(0,0,this.canvas.width,this.canvas.height);
      // bg
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

    drawTitle(){
      const g = this.ctx;
      g.fillStyle = "#fff";
      g.font = FONTS.big;
      g.textAlign = "center";
      g.fillText("Ritchie's Big Blast", CANVAS_BASE_W/2, 180);

      g.font = FONTS.med;
      g.fillStyle = "#dbe4ff";
      g.fillText("Press Play to Begin", CANVAS_BASE_W/2, 240);

      // Ritchie stand-in
      this.drawRitchie(CANVAS_BASE_W/2, 350, 140);
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
      this.drawRitchie(CANVAS_BASE_W/2, 360, 130);
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

    drawPlaying(game){
      const g = this.ctx;
      // Ritchie idle resting
      this.drawRitchie(CANVAS_BASE_W/2, 260, 150);

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
      this.drawPlaying(game);
      const g = this.ctx;
      g.textAlign = "center";
      g.font = FONTS.med;
      g.fillStyle = "#dbe4ff";
      g.fillText("Revealing…", CANVAS_BASE_W/2, 120);
    }

    drawGameOver(game){
      const g = this.ctx;
      this.drawRitchie(CANVAS_BASE_W/2, 260, 150);
      g.textAlign = "center";
      g.font = FONTS.big;
      g.fillStyle = "#fff";
      g.fillText(game.winner ? `${game.winner.name} Wins!` : "Game Over", CANVAS_BASE_W/2, 140);
    }

    drawRitchie(x, y, r){
      const g = this.ctx;
      if(this.assets.images.ritchie){
        const img = this.assets.images.ritchie;
        const w = r*1.6, h = r*1.6;
        g.drawImage(img, x-w/2, y-h/2, w, h);
      }else{
        // circle balloon placeholder
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

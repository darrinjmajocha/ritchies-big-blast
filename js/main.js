
/**
 * main.js
 * Bootstraps app, manages state loop, inputs, resizing, and ties everything together.
 */
(async function(){
  const canvas = document.getElementById("gameCanvas");
  const uiRoot = document.getElementById("uiLayer");
  const loadingOverlay = document.getElementById("loadingOverlay");
  const loadingLabel = document.getElementById("loadingLabel");
  const enableBtn = document.getElementById("enableSoundBtn");

  const assets = new AssetManager((pct)=>{ loadingLabel.textContent = `Loading… ${pct}%`; });
  // Try creating audio context early but we won't start anything until user click
  window.audio = new AudioManager(assets);
  await window.audio.init();

  const renderer = new Renderer(canvas, assets);
  const ui = new UILayer(uiRoot);
  const game = new Game();

  // Preload (if WebAudio, decode sfx; otherwise still ticks progress and HTMLAudio will on-demand)
  await assets.loadAll(window.audio.ctx);
  loadingOverlay.classList.add("hidden");

  function resize(){ renderer.resize(); }
  window.addEventListener("resize", resize, {passive:true});
  resize();

  // State control helpers
  function gotoTitle(){
    game.reset();
    buildTitleUI();
  }
  function gotoSetup(){
    game.state = GameStates.SETUP;
    game.players = [];
    buildSetupUI(4); // default 4 players
  }

  function buildTitleUI(){
    ui.clear();
    const row = ui.row("main");
    const play = ui.button("Play", "primary", async ()=>{
      // On first click, resume/enable audio and start BGM
      await window.audio.resume();
      window.audio.playMusic(true);
      gotoSetup();
    }, "Start the game");
    row.appendChild(play);
  }

  function buildSetupUI(startCount){
    ui.clear();
    let count = Math.min(15, Math.max(2, startCount));

    const updateUI = ()=>{
      // Redraw handled in loop; this just tweaks buttons if needed
    };

    const controls = ui.row("setup");
    const minus = ui.button("−", "", ()=>{ count=Math.max(2,count-1); updateUI(); }, "Decrease player count");
    const plus = ui.button("+", "", ()=>{ count=Math.min(15,count+1); updateUI(); }, "Increase player count");
    const start = ui.button("Start", "primary", ()=>{
      game.setPlayers(count);
    }, "Confirm player count and start");
    controls.appendChild(minus);
    controls.appendChild(plus);
    controls.appendChild(start);

    // Keyboard shortcuts
    window.onkeydown = (e)=>{
      if(game.state!==GameStates.SETUP) return;
      if(e.key==="+") { count=Math.min(15,count+1); }
      if(e.key==="-") { count=Math.max(2,count-1); }
      if(e.key==="Enter"){ game.setPlayers(count); }
    };

    // Render loop will read 'count' to show on screen
    game._setupCountRef = ()=>count;
  }

  function buildChoiceButtons(){
    ui.clear();
    const row = ui.row("choices");
    // Build numbered buttons; keep them focusable and labeled
    game.roundChoices.forEach((c, idx)=>{
      const b = ui.button(c.label, "", ()=>{
        game.selectChoice(idx);
      }, `Choose number ${c.label}`);
      b.disabled = c.taken || game.state!==GameStates.PLAYING;
      // color hints
      b.classList.toggle("safe", c.taken && idx!==game.armedIndex);
      b.classList.toggle("danger", c.taken && idx===game.armedIndex);
      row.appendChild(b);
    });
  }

  function buildGameOverUI(){
    ui.clear();
    const row = ui.row("actions");
    const again = ui.button("Play Again", "primary", ()=>gotoTitle(), "Return to title");
    row.appendChild(again);
  }

  // Number key input for quick selection
  window.addEventListener("keydown", (e)=>{
    if(game.state!==GameStates.PLAYING) return;
    const key = e.key;
    let num = null;
    if(key>="1" && key<="9") num = parseInt(key,10);
    else if(key==="0") num = 10;
    // For >10, use letters a=11, b=12, c=13, d=14, e=15, f=16
    else if(/^[a-f]$/i.test(key)){ num = 10 + (key.toLowerCase().charCodeAt(0)-96); }
    if(num!==null){
      const idx = num-1;
      if(idx>=0 && idx<game.roundChoices.length){
        game.selectChoice(idx);
      }
    }
  });

  // Enable sound retry (for autoplay policies)
  enableBtn.addEventListener("click", async ()=>{
    enableBtn.classList.add("hidden");
    await window.audio.resume();
    window.audio.playMusic(true);
  });

  // Main loop
  function loop(ts){
    renderer.begin();
    // Render by state
    switch(game.state){
      case GameStates.TITLE:
        renderer.drawTitle();
        break;
      case GameStates.SETUP:
        renderer.drawSetup(game._setupCountRef ? game._setupCountRef() : 4);
        break;
      case GameStates.INTRO_ANIM:
        renderer.drawIntro(game.introAnimT);
        break;
      case GameStates.PLAYING:
        renderer.drawPlaying(game);
        break;
      case GameStates.REVEAL:
        renderer.drawReveal(game);
        break;
      case GameStates.ELIMINATE:
        renderer.drawPlaying(game);
        // Small overlay text for feedback
        drawCenteredText("Boom! Eliminated.", "#ffb3c1");
        break;
      case GameStates.NEXT_ROUND:
        renderer.drawPlaying(game);
        drawCenteredText("Next Round!", "#caffbf");
        break;
      case GameStates.GAME_OVER:
        renderer.drawGameOver(game);
        break;
    }
    renderer.end();

    // UI updates that depend on state
    if(game.state===GameStates.TITLE){
      // built in gotoTitle
    }else if(game.state===GameStates.SETUP){
      // buttons built in buildSetupUI; nothing per-frame
    }else if(game.state===GameStates.INTRO_ANIM){
      // no UI
    }else if(game.state===GameStates.PLAYING){
      // Ensure choice buttons exist and reflect state
      if(!ui.rows["choices"] || ui.rows["choices"].children.length !== game.roundChoices.length){
        buildChoiceButtons();
      }else{
        // Update disabled states live
        [...ui.rows["choices"].children].forEach((b, idx)=>{
          const c = game.roundChoices[idx];
          b.disabled = c.taken || game.state!==GameStates.PLAYING;
          b.classList.toggle("safe", c.taken && idx!==game.armedIndex);
          b.classList.toggle("danger", c.taken && idx===game.armedIndex);
        });
      }
    }else if(game.state===GameStates.GAME_OVER){
      if(!ui.rows["actions"]) buildGameOverUI();
    }else{
      // clear UI during reveal/eliminate/next_round
      ui.clear();
    }

    // Update logic
    game.update(performance.now());

    requestAnimationFrame(loop);
  }

  function drawCenteredText(text, color){
    const g = canvas.getContext("2d");
    g.save();
    g.textAlign = "center";
    g.font = CONSTS.med;
    g.fillStyle = color;
    g.fillText(text, CONSTS.CANVAS_BASE_W/2, 110);
    g.restore();
  }

  // Kick things off
  gotoTitle();
  requestAnimationFrame(loop);

  // PUBLIC API hook (debug)
  window._game = game;
  window._audio = window.audio;
})();

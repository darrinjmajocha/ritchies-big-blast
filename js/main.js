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
  const resetBtn = document.getElementById("resetBtn");   // NEW

  const assets = new AssetManager((pct)=>{ loadingLabel.textContent = `Loading… ${pct}%`; });
  // Prepare audio, but don't start music until after START_PROMPT
  window.audio = new AudioManager(assets);
  await window.audio.init();

  const renderer = new Renderer(canvas, assets);
  const ui = new UILayer(uiRoot);
  const game = new Game();

  // Preload assets (images, sfx buffers if WebAudio)
  await assets.loadAll(window.audio.ctx);
  loadingOverlay.classList.add("hidden");

  function resize(){ renderer.resize(); }
  window.addEventListener("resize", resize, {passive:true});
  resize();

  // --- State controls ---
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
      // init/resume audio context only (no BGM yet)
      await window.audio.resume();
      gotoSetup();
    }, "Start the game");
    row.appendChild(play);
  }

  function buildSetupUI(startCount){
    ui.clear();
    let count = Math.min(15, Math.max(2, startCount));

    const controls = ui.row("setup");
    const minus = ui.button("−", "", ()=>{ count=Math.max(2,count-1); }, "Decrease player count");
    const plus  = ui.button("+", "", ()=>{ count=Math.min(15,count+1); }, "Increase player count");
    const start = ui.button("Start", "primary", ()=>{ game.setPlayers(count); }, "Confirm player count and start");
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

    // Renderer reads this to draw the current value
    game._setupCountRef = ()=>count;
  }

  function buildChoiceButtons(){
    ui.clear();
    const row = ui.row("choices");
    game.roundChoices.forEach((c, idx)=>{
      const b = ui.button(c.label, "", ()=>{ game.selectChoice(idx); }, `Choose number ${c.label}`);
      b.disabled = c.taken || game.state!==GameStates.PLAYING;
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
    // For >10, a=11, b=12, c=13, d=14, e=15, f=16
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
    // still do NOT force-play music here; game flow will start it
  });

  // NEW: Reset button (always available)
  resetBtn.addEventListener("click", ()=>{
    // Stop music softly and go back to setup
    window.audio?.fadeMusicTo(window.CONSTS.AUDIO.musicVolume, 1); // snap back to default
    gotoSetup();
  });

  // --- Main loop ---
  function loop(){
    const now = performance.now();
    renderer.begin();

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

      case GameStates.START_PROMPT:
        renderer.drawPlaying(game);
        renderer.drawStartPrompt(game, now);
        break;

      case GameStates.PLAYING:
        renderer.drawPlaying(game);
        break;

      case GameStates.REVEAL:
        renderer.drawReveal(game);
        break;

      case GameStates.SAFE_HOLD:
        renderer.drawPlaying(game);
        break;

      case GameStates.COUNTDOWN:
        renderer.drawPlaying(game);
        renderer.drawCountdown(game);    // NEW: show 3/2/1
        break;

      case GameStates.EXPLODING:
        renderer.drawPlaying(game);
        renderer.drawExplosion();
        break;

      case GameStates.ELIMINATE:
        renderer.drawPlaying(game);
        break;

      case GameStates.GAME_OVER:
        renderer.drawGameOver(game);
        break;
    }

    renderer.end();

    // UI buttons exist ONLY during PLAYING
    if(game.state===GameStates.PLAYING){
      if(!ui.rows["choices"] || ui.rows["choices"].children.length !== game.roundChoices.length){
        buildChoiceButtons();
      }else{
        [...ui.rows["choices"]..children].forEach((b, idx)=>{
          const c = game.roundChoices[idx];
          b.disabled = c.taken || game.state!==GameStates.PLAYING;
          b.classList.toggle("safe", c.taken && idx!==game.armedIndex);
          b.classList.toggle("danger", c.taken && idx===game.armedIndex);
        });
      }
    } else {
      // hide choice buttons during intro/reveal/safe_hold/countdown/explosion/overlays/etc.
      if(ui.rows["choices"]) ui.clear();
      if(game.state===GameStates.GAME_OVER && !ui.rows["actions"]){
        buildGameOverUI();
      }
    }

    // Step the game
    game.update(now);

    requestAnimationFrame(loop);
  }

  // Start
  gotoTitle();
  requestAnimationFrame(loop);

  // Expose for quick testing
  window._game = game;
  window._audio = window.audio;
})();

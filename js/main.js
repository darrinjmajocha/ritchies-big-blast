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
  const resetBtn = document.getElementById("resetBtn");

  const assets = new AssetManager((pct)=>{ loadingLabel.textContent = `Loading… ${pct}%`; });
  window.audio = new AudioManager(assets);
  await window.audio.init();

  const renderer = new Renderer(canvas, assets);
  const ui = new UILayer(uiRoot);
  const game = new Game();

  await assets.loadAll(window.audio.ctx);
  loadingOverlay.classList.add("hidden");

  function resize(){ renderer.resize(); }
  window.addEventListener("resize", resize, {passive:true});
  resize();

  // --- First interaction bootstrap for audio/menu music ---
  let firstInteractionArmed = true;
  const armFirstInteraction = ()=>{
    if(!firstInteractionArmed) return;
    firstInteractionArmed = false;
    const handler = async ()=>{
      document.removeEventListener("pointerdown", handler, true);
      await window.audio.resume();
      // If we're on Title/Setup and no music is playing yet, start the menu loop now.
      if((game.state===GameStates.TITLE || game.state===GameStates.SETUP) &&
         (!window.audio.musicEl || window.audio.musicEl.paused)){
        await window.audio.playMenuMusic(true);
      }
    };
    document.addEventListener("pointerdown", handler, true);
  };

  // --- State controls ---
  function gotoTitle(){
    game.reset();
    // Do NOT try to play menu music immediately (autoplay). Arm first-interaction instead.
    window.audio?.stopMusic();
    armFirstInteraction();
    buildTitleUI();
  }
  function gotoSetup(){
    game.state = GameStates.SETUP;
    game.players = [];
    // On entering setup: if nothing is playing, try to start menu music (will work after user gesture).
    if(!window.audio.musicEl || window.audio.musicEl.paused){
      window.audio.playMenuMusic(true);
    }
    buildSetupUI(4);
  }

  function buildTitleUI(){
    ui.clear();
    const row = ui.row("main");
    const play = ui.button("Play", "primary", async ()=>{
      // User gesture here should allow audio. Resume context, ensure menu music runs in setup.
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
    const start = ui.button("Start", "primary", ()=>{
      // Stop menu music; gameplay music will start later when PLAYING begins.
      window.audio?.stopMusic();
      game.setPlayers(count);
    }, "Confirm player count and start");
    controls.appendChild(minus);
    controls.appendChild(plus);
    controls.appendChild(start);

    window.onkeydown = (e)=>{
      if(game.state!==GameStates.SETUP) return;
      if(e.key==="+") { count=Math.min(15,count+1); }
      if(e.key==="-") { count=Math.max(2,count-1); }
      if(e.key==="Enter"){
        window.audio?.stopMusic();
        game.setPlayers(count);
      }
    };

    game._setupCountRef = ()=>count;
  }

  // (choice buttons layout code unchanged from your latest)
  function buildChoiceButtons(){
    ui.clear();
    const topRow = ui.row("choicesTop");
    const bottomRow = ui.row("choicesBottom");
    topRow.innerHTML = "";
    bottomRow.innerHTML = "";

    const n = game.roundChoices.length;
    const topCount = Math.floor(n/2);
    const bottomCount = n - topCount;
    const putAllInBottom = (n <= 5);

    function makeBtn(c, idx){
      const b = ui.button(c.label, "choice", ()=>{ game.selectChoice(idx); }, `Choose number ${c.label}`);
      b.disabled = c.taken || game.state!==GameStates.PLAYING;
      b.classList.toggle("safe", c.taken && idx!==game.armedIndex);
      b.classList.toggle("danger", c.taken && idx===game.armedIndex);
      return b;
    }

    if(putAllInBottom){
      game.roundChoices.forEach((c, idx)=> bottomRow.appendChild(makeBtn(c, idx)));
    } else {
      game.roundChoices.slice(0, topCount).forEach((c, i)=> topRow.appendChild(makeBtn(c, i)));
      game.roundChoices.slice(topCount).forEach((c, j)=> bottomRow.appendChild(makeBtn(c, topCount + j)));
    }
  }

  function updateChoiceButtons(){
    const topRow = ui.rows["choicesTop"];
    const bottomRow = ui.rows["choicesBottom"];
    if(!topRow || !bottomRow) return;
    const btns = [...topRow.children, ...bottomRow.children];
    btns.forEach((b, idx)=>{
      const c = game.roundChoices[idx];
      if(!c) return;
      b.disabled = c.taken || game.state!==GameStates.PLAYING;
      b.classList.toggle("safe", c.taken && idx!==game.armedIndex);
      b.classList.toggle("danger", c.taken && idx===game.armedIndex);
    });
  }

  function buildGameOverUI(){
    ui.clear();
    const row = ui.row("actions");
    const again = ui.button("Play Again", "primary", ()=>{
      // Winner → back to menu/setup with menu loop
      window.audio?.stopMusic();
      window.audio?.playMenuMusic(true);
      gotoSetup();
    }, "Return to player selection");
    row.appendChild(again);
  }

  // number key shortcuts unchanged …

  enableBtn.addEventListener("click", async ()=>{
    enableBtn.classList.add("hidden");
    await window.audio.resume();
    // If on menu screens, spin up menu music now.
    if((game.state===GameStates.TITLE || game.state===GameStates.SETUP) &&
       (!window.audio.musicEl || window.audio.musicEl.paused)){
      window.audio.playMenuMusic(true);
    }
  });

  resetBtn.addEventListener("click", ()=>{
    window.audio?.stopMusic();
    window.audio?.playMenuMusic(true);
    gotoSetup();
  });

  // --- Main loop (rendering & state) ---
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
        renderer.drawCountdown(game);
        break;
      case GameStates.EXPLODING:
        renderer.drawPlaying(game);
        renderer.drawExplosion();
        break;
      case GameStates.GAME_OVER:
        renderer.drawGameOver(game);
        break;
    }

    renderer.end();

    if(game.state===GameStates.PLAYING){
      if(!ui.rows["choicesTop"] || !ui.rows["choicesBottom"]){
        buildChoiceButtons();
      }else{
        updateChoiceButtons();
      }
    } else {
      if(ui.rows["choicesTop"] || ui.rows["choicesBottom"]) ui.clear();
      if(game.state===GameStates.GAME_OVER && !ui.rows["actions"]){
        window.audio?.stopMusic();
        window.audio?.playMenuMusic(true);
        buildGameOverUI();
      }
    }

    game.update(now);
    requestAnimationFrame(loop);
  }

  // Start at Title; arm the first-interaction handler for menu music
  gotoTitle();
  requestAnimationFrame(loop);
})();

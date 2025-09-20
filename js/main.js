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
  const muteBtn  = document.getElementById("muteBtn");

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
    window.audio?.stopMusic();
    armFirstInteraction();
    buildTitleUI();
  }
  function gotoSetup(){
    game.state = GameStates.SETUP;
    game.players = [];
    if(!window.audio.musicEl || window.audio.musicEl.paused){
      window.audio.playMenuMusic(true);
    }
    buildSetupUI(4); // default 4
  }

  function buildTitleUI(){
    ui.clear();
    const row = ui.row("main");
    const play = ui.button("Play", "primary", async ()=>{
      await window.audio.resume();
      gotoSetup();
    }, "Start the game");
    row.appendChild(play);
  }

  function buildSetupUI(startCount){
    ui.clear();
    let count = Math.min(20, Math.max(2, startCount));

    const controls = ui.row("setup");
    const minus = ui.button("−", "", ()=>{ count=Math.max(2,count-1); }, "Decrease player count");
    const plus  = ui.button("+", "", ()=>{ count=Math.min(20,count+1); }, "Increase player count");
    const start = ui.button("Start", "primary", ()=>{
      window.audio?.stopMusic();
      game.setPlayers(count);
    }, "Confirm player count and start");
    controls.appendChild(minus);
    controls.appendChild(plus);
    controls.appendChild(start);

    window.onkeydown = (e)=>{
      if(game.state!==GameStates.SETUP) return;
      if(e.key==="+") { count=Math.min(20,count+1); }
      if(e.key==="-") { count=Math.max(2,count-1); }
      if(e.key==="Enter"){
        window.audio?.stopMusic();
        game.setPlayers(count);
      }
    };

    game._setupCountRef = ()=>count;
  }

  // Two-row layout; bottom anchors single-row case for composition
  function buildChoiceButtons(){
    ui.clear();
    const topRow = ui.row("choicesTop");
    const bottomRow = ui.row("choicesBottom");
    topRow.innerHTML = "";
    bottomRow.innerHTML = "";

    const n = game.roundChoices.length;
    const topCount = Math.floor(n/2);
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
      window.audio?.stopMusic();
      window.audio?.playMenuMusic(true);
      gotoSetup();
    }, "Return to player selection");
    const menu = ui.button("Main Menu", "", ()=>{
      window.audio?.stopMusic();
      window.audio?.playMenuMusic(true);
      gotoTitle();
    }, "Return to main menu");
    row.appendChild(again);
    row.appendChild(menu);
  }

  // Quick-select by keyboard:
  // 1–9, 0=10, A–J => 11..20
  window.addEventListener("keydown", (e)=>{
    if(game.state!==GameStates.PLAYING) return;
    const key = e.key;
    let num = null;
    if(key>="1" && key<="9") num = parseInt(key,10);
    else if(key==="0") num = 10;
    else if(/^[a-j]$/i.test(key)){ num = 10 + (key.toLowerCase().charCodeAt(0)-96); } // a=11 .. j=20
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
    if((game.state===GameStates.TITLE || game.state===GameStates.SETUP) &&
       (!window.audio.musicEl || window.audio.musicEl.paused)){
      window.audio.playMenuMusic(true);
    }
  });

  // Reset → Setup + menu music
  resetBtn.addEventListener("click", ()=>{
    window.audio?.stopMusic();
    window.audio?.playMenuMusic(true);
    gotoSetup();
  });

  // Mute toggle
  function refreshMuteBtn(){
    const muted = window.audio.isMuted();
    muteBtn.textContent = muted ? "Unmute" : "Mute";
    muteBtn.setAttribute("aria-pressed", String(muted));
    muteBtn.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
  }
  muteBtn.addEventListener("click", ()=>{
    window.audio.setMuted(!window.audio.isMuted());
    refreshMuteBtn();
  });
  refreshMuteBtn();

  // --- Main loop ---
  function loop(){
    const now = performance.now();
    renderer.begin();

    switch(game.state){
      case GameStates.TITLE:       renderer.drawTitle(); break;
      case GameStates.SETUP:       renderer.drawSetup(game._setupCountRef ? game._setupCountRef() : 4); break;
      case GameStates.INTRO_ANIM:  renderer.drawIntro(game.introAnimT); break;
      case GameStates.START_PROMPT:renderer.drawPlaying(game); renderer.drawStartPrompt(game, now); break;
      case GameStates.PLAYING:     renderer.drawPlaying(game); break;
      case GameStates.REVEAL:      renderer.drawReveal(game); break;
      case GameStates.SAFE_HOLD:   renderer.drawPlaying(game); break;
      case GameStates.COUNTDOWN:   renderer.drawPlaying(game); renderer.drawCountdown(game); break;
      case GameStates.EXPLODING:   renderer.drawPlaying(game); renderer.drawExplosion(); break;
      case GameStates.GAME_OVER:   renderer.drawGameOver(game); break;
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

  // Start
  gotoTitle();
  requestAnimationFrame(loop);

  // Expose for quick testing
  window._game = game;
  window._audio = window.audio;
})();

(function(){
  const States = Object.freeze({
    TITLE: "TITLE",
    SETUP: "SETUP",
    INTRO_ANIM: "INTRO_ANIM",    // balloon drop-in
    START_PROMPT: "START_PROMPT",// show "Start!" (fade 3s)
    PLAYING: "PLAYING",
    REVEAL: "REVEAL",            // suspense period after plunger
    SAFE_HOLD: "SAFE_HOLD",      // 1s pause after dud + "Dud!" text
    COUNTDOWN: "COUNTDOWN",      // 1.0s beat, then 3→2→1 at 1.0s each
    EXPLODING: "EXPLODING",      // play explosion gif once + white flash
    GAME_OVER: "GAME_OVER",
  });

  class RNG {
    constructor(seed = Date.now() & 0xffffffff){ this.seed = seed >>> 0; }
    next(){ let x=this.seed; x^=x<<13; x^=x>>>17; x^=x<<5; this.seed=x>>>0; return this.seed/0xffffffff; }
    pickInt(min,max){ return Math.floor(this.next()*(max-min+1))+min; }
    shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(this.next()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }
  }

  class Game {
    constructor(){
      this.states = States;
      this.state = States.TITLE;

      this.players = [];
      this.currentPlayerIdx = 0;
      this.roundChoices = [];
      this.armedIndex = -1;
      this.rng = new RNG();

      this.pendingReveal = null;   // { at: timestamp }
      this.selectedChoice = -1;

      this.winner = null;

      // animation & staging
      this.introAnimT = 0;         // 0..1
      this.introDurMs = 3000;      // initial drop duration
      this.nextIntroDurMs = 3000;  // may become 1500 after eliminations
      this.introStartAt = 0;

      this.showRitchie = false;    // hidden until after player select & drop
      this.startPromptUntil = 0;   // when to end the "Start!" text
      this.fadeBlackUntil = 0;     // winner hold
      this.explodingUntil = 0;     // explosion gif/flash window

      // Dud overlay
      this.showDudUntil = 0;

      // Countdown
      this.countdownStartAt = 0;
      this.countdownValue = null;  // 3,2,1
      this.nextTickAt = 0;

      // One-shot flag to reuse the intro drop without showing the Start! prompt
      this.skipStartPromptOnce = false;

      this.hud = { remainingPlayers: 0, remainingChoices: 0 };
    }

    reset(){
      this.state = States.TITLE;
      this.players = [];
      this.currentPlayerIdx = 0;
      this.roundChoices = [];
      this.armedIndex = -1;
      this.pendingReveal = null;
      this.selectedChoice = -1;
      this.winner = null;

      this.introAnimT = 0;
      this.introDurMs = 3000;
      this.nextIntroDurMs = 3000;
      this.introStartAt = 0;

      this.showRitchie = false;
      this.startPromptUntil = 0;
      this.fadeBlackUntil = 0;
      this.explodingUntil = 0;

      this.showDudUntil = 0;
      this.countdownStartAt = 0;
      this.countdownValue = null;
      this.nextTickAt = 0;

      this.skipStartPromptOnce = false;

      this.hud = { remainingPlayers: 0, remainingChoices: 0 };
    }

    setPlayers(count){
      this.players = [];
      for(let i=0;i<count;i++) this.players.push({ id:i, alive:true, name:`P${i+1}` });
      this.currentPlayerIdx = 0;
      this.hud.remainingPlayers = this.players.length;

      // Start drop-in (no BGM yet). Play priming.
      this.showRitchie = false;
      this.introDurMs = 3000;
      this.nextIntroDurMs = 3000;
      this.introStartAt = performance.now();
      this.introAnimT = 0;
      this.state = States.INTRO_ANIM;
      window.audio?.playSfx("priming");
    }

    startRound(){
      const aliveCount = this.players.filter(p=>p.alive).length;
      const choices = aliveCount + 1;
      this.roundChoices = Array.from({length: choices}, (_,i)=>({ idx:i, taken:false, label:`${i+1}` }));
      this.armedIndex = this.rng.pickInt(0, choices-1);
      this.hud.remainingChoices = choices;
      window.audio?.playSfx("arming");
    }

    get currentPlayer(){
      let i = this.currentPlayerIdx % this.players.length;
      for(let c=0;c<this.players.length;c++){
        const p = this.players[i];
        if(p.alive) return p;
        i = (i+1) % this.players.length;
      }
      return null;
    }

    nextPlayer(){
      let i = (this.currentPlayerIdx+1) % this.players.length;
      for(let c=0;c<this.players.length;c++){
        if(this.players[i].alive){ this.currentPlayerIdx = i; return; }
        i = (i+1) % this.players.length;
      }
      this.currentPlayerIdx = i;
    }

    // Reveal delay increases (up to 5s) — bias more if fewer than 6 players
    computeRevealDelay(){
      const total = this.roundChoices.length;
      const remaining = this.roundChoices.filter(c=>!c.taken).length;
      const alivePlayers = this.players.filter(p=>p.alive).length;

      const p = 1 - (remaining-1)/(total-1 || 1); // 0 when many, →1 when few
      const baseMin = alivePlayers < 6 ? 800 : 500;   // slightly higher base for small groups
      const extraMax = alivePlayers < 6 ? 4800 : 4500;
      const r = this.rng.next();
      const weight = p*p;       // stronger near end
      const delay = baseMin + (extraMax * weight * (0.5 + 0.5*r));
      return Math.min(5000, Math.floor(delay));
    }

    selectChoice(index){
      if(this.state!=="PLAYING") return;
      const choice = this.roundChoices[index];
      if(!choice || choice.taken) return;

      // plunger: 1s, fade BGM to 0 over that second
      window.audio?.playSfx("plunger");
      window.audio?.fadeMusicTo(0, 1000);

      this.selectedChoice = index;

      // suspense; reveal after plunger + biased delay
      const delay = 1000 + this.computeRevealDelay();
      this.pendingReveal = { at: performance.now() + delay };
      this.state = "REVEAL";
    }

    update(now){
      switch(this.state){
        case "INTRO_ANIM": {
          const t = Math.min(1, (now - this.introStartAt) / this.introDurMs);
          this.introAnimT = t;
          if(t >= 1){
            this.showRitchie = true;

            if(this.skipStartPromptOnce){
              // Fast-drop finish after re-arming all-duds reset:
              this.skipStartPromptOnce = false;
              // Ensure game music is back
              if(!window.audio?.musicEl) { window.audio?.playGameMusic(true); }
              window.audio?.fadeMusicTo(window.CONSTS.AUDIO.musicVolume, 600);
              this.state = "PLAYING";
            } else {
              // Normal first drop: show the Start! prompt then begin the first round
              this.state = "START_PROMPT";
              this.startPromptUntil = now + 3000; // fade text over 3s
              window.audio?.playSfx("start");
              this.startRound();
            }
          }
        } break;

        case "START_PROMPT":
          if(now >= this.startPromptUntil){
            // Begin actual play and start BGM (menu music stops in main loop control)
            window.audio?.fadeMusicTo(window.CONSTS.AUDIO.musicVolume, 600);
            if(!window.audio?.musicEl){ window.audio?.playGameMusic(true); }
            this.state = "PLAYING";
          }
          break;

        case "REVEAL":
          if(this.pendingReveal && now >= this.pendingReveal.at){
            const armed = this.selectedChoice === this.armedIndex;
            const c = this.roundChoices[this.selectedChoice];
            if(c) c.taken = true;

            if(armed){
              // Real button: start countdown (1s beat, then 3/2/1 each 1s)
              window.audio?.playSfx("countdown");
              this.countdownStartAt = now;
              this.countdownValue = null; // shown after first tick
              this.nextTickAt = now + 1000; // first tick in 1.0s
              this.state = "COUNTDOWN";
            }else{
              // DUD: keep Ritchie, play dud, show “Dud!” for ~1s, then resume
              window.audio?.playSfx("dud");
              this.showDudUntil = now + 1000;
              this.state = "SAFE_HOLD";
              this.pendingReveal = { at: now + 1000 }; // 1s breathing room
            }
          }
          break;

        case "SAFE_HOLD":
          if(this.pendingReveal && now >= this.pendingReveal.at){
            this.pendingReveal = null;

            // Anti-inevitability: if only one unpicked remains AND it's the bomb,
            // reset the round choices and re-arm via RNG (same count), then do a fast drop.
            const remaining = this.roundChoices.filter(c=>!c.taken).map(c=>c.idx);
            if(remaining.length === 1 && remaining[0] === this.armedIndex){
              const n = this.roundChoices.length;
              this.roundChoices.forEach(c=>{ c.taken=false; });
              this.armedIndex = this.rng.pickInt(0, n-1);
              this.hud.remainingChoices = n;

              // Quick re-intro: drop from top at 2x speed, skip Start! prompt
              this.showRitchie = false;
              this.introDurMs = 1500;             // 2x faster
              this.introStartAt = now;
              this.introAnimT = 0;
              this.skipStartPromptOnce = true;
              this.state = "INTRO_ANIM";
              window.audio?.playSfx("priming");

              // Make sure music comes back on the other side of the drop (handled at INTRO_ANIM completion)
              return;
            }

            // Normal dud flow: next player and fade music back
            this.nextPlayer();
            window.audio?.fadeMusicTo(1, 3000);
            this.state = "PLAYING";
          }
          break;

        case "COUNTDOWN":
          if(now >= this.nextTickAt){
            if(this.countdownValue === null){
              this.countdownValue = 3;
              this.nextTickAt = now + 1000;
            }else if(this.countdownValue === 3){
              this.countdownValue = 2;
              this.nextTickAt = now + 1000;
            }else if(this.countdownValue === 2){
              this.countdownValue = 1;
              this.nextTickAt = now + 1000;
            }else{
              // After showing "1" for 1.0s → EXPLODE (white flash + gif)
              this.showRitchie = false;             // hide balloon immediately
              this.explodingUntil = now + 2200;     // was ~1200; now +1s longer
              this.state = "EXPLODING";
            }
          }
          break;

        case "EXPLODING":
          if(now >= this.explodingUntil){
            // After explosion, eliminate and start next round (fast drop)
            const cp = this.currentPlayer;
            if(cp){ cp.alive = false; this.hud.remainingPlayers = this.players.filter(p=>p.alive).length; }
            // Winner?
            if(this.hud.remainingPlayers <= 1){
              this.winner = this.players.find(p=>p.alive) || null;
              window.audio?.playSfx("fanfare");
              // Show winner ~5s, then return handled in main (menu music there)
              this.fadeBlackUntil = now + 5000;
              this.state = "GAME_OVER";
            }else{
              // Next round: faster drop-in (2x speed)
              this.nextIntroDurMs = 1500;
              this.introDurMs = this.nextIntroDurMs;
              this.introStartAt = now;
              this.introAnimT = 0;
              this.state = "INTRO_ANIM";
              window.audio?.playSfx("priming");
              // Music will already be playing; leave it alone here.
            }
          }
          break;

        case "GAME_OVER":
          // Nothing here; main loop will route back to setup after fade window.
          break;
      }
    }
  }

  window.GameStates = States;
  window.RNG = RNG;
  window.Game = Game;
})();

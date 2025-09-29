(function(){
  const States = Object.freeze({
    TITLE: "TITLE",
    SETUP: "SETUP",
    INTRO_ANIM: "INTRO_ANIM",     // inflate/zoom in
    START_PROMPT: "START_PROMPT", // show "Start!" (fade 3s)
    PLAYING: "PLAYING",
    REVEAL: "REVEAL",             // suspense period after plunger
    SAFE_HOLD: "SAFE_HOLD",       // ~1s pause after dud + "Dud!" text
    COUNTDOWN: "COUNTDOWN",       // 1.0s beat, then 3→2→1 at 1.0s each
    EXPLODING: "EXPLODING",       // pop/flash
    GAME_OVER: "GAME_OVER",
  });

  function clamp01(x){ return Math.max(0, Math.min(1, x)); }
  function easeOutCubic(t){ return 1 - Math.pow(1-t,3); }

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
      this.initialPlayersCount = 0;
      this.currentPlayerIdx = 0;
      this.roundChoices = [];
      this.armedIndex = -1;
      this.rng = new RNG();

      this.pendingReveal = null;   // { at: timestamp }
      this.selectedChoice = -1;

      this.winner = null;

      // Intro (inflate) animation
      this.introAnimT = 0;         // 0..1
      this.introDurMs = 3000;      // first inflate
      this.nextIntroDurMs = 3000;  // after eliminations becomes 1500
      this.introStartAt = 0;

      this.showRitchie = false;    // hidden until after intro
      this.balloonScale = 1;       // for drawPlaying (inflation on countdown)

      this.startPromptUntil = 0;   // when to end the "Start!" text
      this.explodingUntil = 0;     // white flash / gif window

      // Dud overlay
      this.showDudUntil = 0;
      this.dudShownAt = 0;         // NEW: for fade-in timing

      // Countdown
      this.countdownStartAt = 0;
      this.countdownEndAt = 0;     // for balloon expansion pacing
      this.countdownValue = null;  // 3,2,1
      this.nextTickAt = 0;

      // Flags
      this.skipStartPromptOnce = false;      // true for post-elimination & all-duds re-intro
      this.startNewRoundAfterIntro = false;  // true only after elimination

      // HUD
      this.hud = { remainingPlayers: 0, remainingChoices: 0 };
    }

    reset(){
      this.state = States.TITLE;
      this.players = [];
      this.initialPlayersCount = 0;
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
      this.balloonScale = 1;

      this.startPromptUntil = 0;
      this.explodingUntil = 0;
      this.showDudUntil = 0;
      this.dudShownAt = 0;

      this.countdownStartAt = 0;
      this.countdownEndAt = 0;
      this.countdownValue = null;
      this.nextTickAt = 0;

      this.skipStartPromptOnce = false;
      this.startNewRoundAfterIntro = false;

      this.hud = { remainingPlayers: 0, remainingChoices: 0 };
    }

    setPlayers(count){
      this.players = [];
      for(let i=0;i<count;i++) this.players.push({ id:i, alive:true, name:`P${i+1}` });
      this.initialPlayersCount = count;
      this.currentPlayerIdx = 0;
      this.hud.remainingPlayers = this.players.length;

      // Begin first intro (inflate). Play priming cue.
      this.showRitchie = false;
      this.balloonScale = 1;
      this.introDurMs = 3000;
      this.nextIntroDurMs = 3000;
      this.introStartAt = performance.now();
      this.introAnimT = 0;
      this.state = States.INTRO_ANIM;
      window.audio?.playSfx("priming");

      // Start game BGM immediately at 0 and fade up over 5s while intro + "Start!" happen
      window.audio?.setMusicVolume(window.CONSTS.AUDIO.musicVolume);
      window.audio?.playGameMusic(true);
      window.audio?.fadeMusicTo(window.CONSTS.AUDIO.musicVolume, 5000);
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

    // Suspense bias combines within-round progress + overall game progress
    computeRevealDelay(){
      const total = this.roundChoices.length;
      const remainingChoices = this.roundChoices.filter(c=>!c.taken).length;
      const roundProgress = 1 - (remainingChoices-1)/(total-1 || 1); // 0 → start of round, 1 → last pick
      const roundWeight = Math.pow(roundProgress, 3);                // strong bias late in round

      const alive = this.players.filter(p=>p.alive).length;
      const init = Math.max(2, this.initialPlayersCount || alive);
      const gameProgress = 1 - (alive-1)/(init-1);                   // 0 → start of game, 1 → nearly done
      const globalMult = 1 + 0.8 * gameProgress;                     // up to ~1.8× near the end

      const baseMin = 500;       // ms
      const extraMax = 4500;     // ms (cap still 5s)
      const r = this.rng.next(); // 0..1 random
      let delay = baseMin + (extraMax * roundWeight * (0.5 + 0.5*r));
      delay *= globalMult;

      const reduction = 500 * Math.pow(roundProgress, 1.2);
      delay = Math.max(baseMin, delay - reduction);

      if(gameProgress >= 0.75){
        const extraFloor = 1000 + 1000 * ((gameProgress - 0.75) / 0.25); // 1000→2000ms
        delay = Math.max(delay, extraFloor);
      }

      return Math.min(5000, Math.floor(delay));
    }

    /**
     * @param {number} index
     * @param {boolean} forcePop - if true (CTRL-held), treat as armed and go straight to countdown
     */
    selectChoice(index, forcePop=false){
      if(this.state!==States.PLAYING) return;
      const choice = this.roundChoices[index];
      if(!choice || choice.taken) return;

      // Plunger: 1s, duck music to 0 over that second
      window.audio?.playSfx("plunger");
      window.audio?.fadeMusicTo(0, 1000);

      this.selectedChoice = index;

      const now = performance.now();

      if(forcePop){
        // Treat as if this selection is the bomb; keep visuals (countdown) the same,
        // but skip the random suspense wait.
        choice.taken = true;
        this.armedIndex = index; // for styling consistency if needed
        window.audio?.playSfx("countdown");
        this.countdownStartAt = now;
        this.countdownEndAt   = now + 4000;
        this.balloonScale = 1;
        this.countdownValue = null;
        this.nextTickAt = now + 1000;
        this.state = States.COUNTDOWN;
        return;
      }

      // Normal flow → suspense; reveal after plunger + biased delay
      const extraSmallGamePad = (this.initialPlayersCount <= 4) ? 1000 : 0; // additional default 1s
      const delay = 1000 + extraSmallGamePad + this.computeRevealDelay();
      this.pendingReveal = { at: now + delay };
      this.state = States.REVEAL;
    }

    update(now){
      switch(this.state){
        case States.INTRO_ANIM: {
          const t = clamp01((now - this.introStartAt) / this.introDurMs);
          this.introAnimT = t;
          if(t >= 1){
            this.showRitchie = true;
            this.balloonScale = 1;

            if(this.skipStartPromptOnce){
              this.skipStartPromptOnce = false;

              if(this.startNewRoundAfterIntro){
                this.startNewRoundAfterIntro = false;
                this.startRound();
              }

              if(!window.audio?.musicEl){ window.audio?.playGameMusic(true); }
              window.audio?.fadeMusicTo(window.CONSTS.AUDIO.musicVolume, 600);

              this.state = States.PLAYING;
            } else {
              this.state = States.START_PROMPT;
              this.startPromptUntil = now + 3000; // 3s
              window.audio?.playSfx("start");
              this.startRound();
            }
          }
        } break;

        case States.START_PROMPT:
          if(now >= this.startPromptUntil){
            if(!window.audio?.musicEl){ window.audio?.playGameMusic(true); }
            this.state = States.PLAYING;
          }
          break;

        case States.REVEAL:
          if(this.pendingReveal && now >= this.pendingReveal.at){
            const armed = this.selectedChoice === this.armedIndex;
            const c = this.roundChoices[this.selectedChoice];
            if(c) c.taken = true;

            if(armed){
              window.audio?.playSfx("countdown");
              this.countdownStartAt = now;
              this.countdownEndAt   = now + 4000; // total window for balloon expansion
              this.balloonScale = 1;
              this.countdownValue = null;         // shown after first tick
              this.nextTickAt = now + 1000;       // first number at +1s
              this.state = States.COUNTDOWN;
            }else{
              window.audio?.playSfx("dud");
              this.dudShownAt = now;
              this.showDudUntil = now + 1000;
              this.state = States.SAFE_HOLD;
              this.pendingReveal = { at: now + 1000 }; // 1s breathing room
            }
          }
          break;

        case States.SAFE_HOLD:
          if(this.pendingReveal && now >= this.pendingReveal.at){
            this.pendingReveal = null;

            const remaining = this.roundChoices.filter(c=>!c.taken).map(c=>c.idx);
            if(remaining.length === 1 && remaining[0] === this.armedIndex){
              const n = this.roundChoices.length;
              this.roundChoices.forEach(c=>{ c.taken=false; });
              this.armedIndex = this.rng.pickInt(0, n-1);
              this.hud.remainingChoices = n;

              this.showRitchie = false;
              this.introDurMs = 1500;             // 2x faster
              this.introStartAt = now;
              this.introAnimT = 0;
              this.skipStartPromptOnce = true;     // but NOT a new round
              this.startNewRoundAfterIntro = false;
              this.state = States.INTRO_ANIM;
              window.audio?.playSfx("priming");
              return;
            }

            this.nextPlayer();
            window.audio?.fadeMusicTo(1, 3000);
            this.state = States.PLAYING;
          }
          break;

        case States.COUNTDOWN: {
          const t = clamp01((now - this.countdownStartAt) / (this.countdownEndAt - this.countdownStartAt));
          this.balloonScale = 1 + 1.0 * easeOutCubic(t); // up to ~2.0x

          if(now >= this.nextTickAt){
            if(this.countdownValue === null){
              this.countdownValue = 3; this.nextTickAt = now + 1000;
            }else if(this.countdownValue === 3){
              this.countdownValue = 2; this.nextTickAt = now + 1000;
            }else if(this.countdownValue === 2){
              this.countdownValue = 1; this.nextTickAt = now + 1000;
            }else{
              this.showRitchie = false;
              window.audio?.playSfx("boom");
              this.explodingUntil = now + 1000;   // 1s (was 2200ms)
              this.state = States.EXPLODING;
            }
          }
        } break;

        case States.EXPLODING:
          if(now >= this.explodingUntil){
            const cp = this.currentPlayer;
            if(cp){ cp.alive = false; this.hud.remainingPlayers = this.players.filter(p=>p.alive).length; }

            if(this.hud.remainingPlayers <= 1){
              this.winner = this.players.find(p=>p.alive) || null;
              window.audio?.playSfx("fanfare");
              this.state = States.GAME_OVER;
            }else{
              this.nextIntroDurMs = 1500;
              this.introDurMs = this.nextIntroDurMs;
              this.introStartAt = now;
              this.introAnimT = 0;
              this.showRitchie = false;
              this.skipStartPromptOnce = true;
              this.startNewRoundAfterIntro = true;   // <-- new round after intro completes
              this.state = States.INTRO_ANIM;
              window.audio?.playSfx("priming");
            }
          }
          break;

        case States.GAME_OVER:
          // Wait for UI input (Main Menu / Play Again)
          break;
      }
    }
  }

  window.GameStates = States;
  window.RNG = RNG;
  window.Game = Game;
})();

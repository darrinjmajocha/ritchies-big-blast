(function(){
  const States = Object.freeze({
    TITLE: "TITLE",
    SETUP: "SETUP",
    INTRO_ANIM: "INTRO_ANIM",    // balloon drop-in
    START_PROMPT: "START_PROMPT",// show "Start!" (fade 3s)
    PLAYING: "PLAYING",
    REVEAL: "REVEAL",            // suspense period after plunger
    SAFE_HOLD: "SAFE_HOLD",      // 1s pause after dud + "Dud!" text
    COUNTDOWN: "COUNTDOWN",      // 0.5s beat, then 3→2→1 at 0.5s each
    EXPLODING: "EXPLODING",      // play explosion gif once
    ELIMINATE: "ELIMINATE",
    NEXT_ROUND: "NEXT_ROUND",
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
      this.fadeBlackUntil = 0;     // not used now; we return straight to SETUP after winner hold
      this.explodingUntil = 0;     // explosion gif window

      // Dud overlay
      this.showDudUntil = 0;

      // Countdown
      this.countdownStartAt = 0;
      this.countdownValue = null;  // 3,2,1
      this.nextTickAt = 0;

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
      // optional: arming cue
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

    // Reveal delay increases (up to 5s) as fewer choices remain
    computeRevealDelay(){
      const total = this.roundChoices.length;
      const remaining = this.roundChoices.filter(c=>!c.taken).length;
      // fraction of suspense: more suspense with fewer remaining
      const p = 1 - (remaining-1)/(total-1 || 1); // 0 when many, →1 when few
      const baseMin = 500;      // ms
      const extraMax = 4500;    // up to 5s total
      // Quadratic bias + random factor
      const r = this.rng.next();
      const weight = p*p;       // stronger near end
      const delay = baseMin + (extraMax * weight * (0.5 + 0.5*r)); // avoid always tiny values
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
      this.state = States.REVEAL;
    }

    update(now){
      switch(this.state){
        case States.INTRO_ANIM: {
          const t = Math.min(1, (now - this.introStartAt) / this.introDurMs);
          this.introAnimT = t;
          if(t >= 1){
            this.showRitchie = true;
            this.state = States.START_PROMPT;
            this.startPromptUntil = now + 3000; // fade text over 3s
            window.audio?.playSfx("start");
            // Start round & then (after prompt) start BGM in main loop
            this.startRound();
          }
        } break;

        case States.START_PROMPT:
          if(now >= this.startPromptUntil){
            // Begin actual play and start BGM
            window.audio?.fadeMusicTo(window.CONSTS.AUDIO.musicVolume, 600);
            if(!window.audio?.musicEl){ window.audio?.playMusic(true); }
            this.state = States.PLAYING;
          }
          break;

        case States.REVEAL:
          if(this.pendingReveal && now >= this.pendingReveal.at){
            const armed = this.selectedChoice === this.armedIndex;
            const c = this.roundChoices[this.selectedChoice];
            if(c) c.taken = true;

            if(armed){
              // Real button: play countdown. Sequence:
              // start sound, wait 0.5s, then 3, 2, 1 at 0.5s each → explosion
              window.audio?.playSfx("countdown");
              this.countdownStartAt = now;
              this.countdownValue = null; // shown after first tick
              this.nextTickAt = now + 500; // first tick in 0.5s
              this.state = States.COUNTDOWN;
            }else{
              // Dud: keep Ritchie, play dud, show “Dud!” for ~1s, then resume
              window.audio?.playSfx("dud");
              this.showDudUntil = now + 1000;
              this.state = States.SAFE_HOLD;
              this.pendingReveal = { at: now + 1000 }; // 1s breathing room
            }
          }
          break;

        case States.SAFE_HOLD:
          if(this.pendingReveal && now >= this.pendingReveal.at){
            this.pendingReveal = null;
            this.nextPlayer();
            // Ease music back to 100% over ~3s
            window.audio?.fadeMusicTo(1, 3000);
            this.state = States.PLAYING;
          }
          break;

        case States.COUNTDOWN:
          if(now >= this.nextTickAt){
            if(this.countdownValue === null){
              this.countdownValue = 3;
              this.nextTickAt = now + 500;
            }else if(this.countdownValue === 3){
              this.countdownValue = 2;
              this.nextTickAt = now + 500;
            }else if(this.countdownValue === 2){
              this.countdownValue = 1;
              this.nextTickAt = now + 500;
            }else{
              // After showing "1" for 0.5s → EXPLODE
              this.showRitchie = false;             // hide balloon immediately
              this.explodingUntil = now + 1200;     // show GIF ~1.2s
              this.state = States.EXPLODING;
            }
          }
          break;

        case States.EXPLODING:
          if(now >= this.explodingUntil){
            // After explosion gif, eliminate and speed next drop
            const cp = this.currentPlayer;
            if(cp){ cp.alive = false; this.hud.remainingPlayers = this.players.filter(p=>p.alive).length; }
            // Winner?
            if(this.hud.remainingPlayers <= 1){
              this.winner = this.players.find(p=>p.alive) || null;
              window.audio?.playSfx("fanfare");
              // Show winner ~5s, then return to setup
              this.fadeBlackUntil = now + 5000;
              this.state = States.GAME_OVER;
            }else{
              // Next round: faster drop-in (2x speed)
              this.nextIntroDurMs = 1500;
              this.introDurMs = this.nextIntroDurMs;
              this.introStartAt = now;
              this.introAnimT = 0;
              this.state = States.INTRO_ANIM;
              window.audio?.playSfx("priming");
            }
          }
          break;

        case States.GAME_OVER:
          if(now >= this.fadeBlackUntil){
            // Back to setup (player select), no BGM restart here
            this.players = [];
            this.state = States.SETUP;
          }
          break;
      }
    }
  }

  window.GameStates = States;
  window.RNG = RNG;
  window.Game = Game;
})();

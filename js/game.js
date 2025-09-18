(function(){
  const States = Object.freeze({
    TITLE: "TITLE",
    SETUP: "SETUP",
    INTRO_ANIM: "INTRO_ANIM",   // balloon drop-in
    START_PROMPT: "START_PROMPT",// show "Start!" (fade 3s)
    PLAYING: "PLAYING",
    REVEAL: "REVEAL",           // suspense period after plunger
    SAFE_HOLD: "SAFE_HOLD",     // 1s pause after dud
    EXPLODING: "EXPLODING",     // play explosion gif once
    ELIMINATE: "ELIMINATE",
    NEXT_ROUND: "NEXT_ROUND",
    GAME_OVER: "GAME_OVER",
    FADE_OUT: "FADE_OUT",       // 5s winner then fade to setup
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
      this.fadeBlackUntil = 0;     // fade-to-black timer for GAME_OVER->SETUP
      this.explodingUntil = 0;     // explosion gif window

      // NEW: DUD text timing
      this.showDudUntil = 0;

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

      // NEW: reset DUD text
      this.showDudUntil = 0;

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
      // optional: arming cue (still allowed)
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

    selectChoice(index){
      if(this.state!=="PLAYING") return;
      const choice = this.roundChoices[index];
      if(!choice || choice.taken) return;

      // plunger: 1s, fade BGM to 0 over that second
      window.audio?.playSfx("plunger");
      window.audio?.fadeMusicTo(0, 1000);

      this.selectedChoice = index;
      this.pendingReveal = { at: performance.now() + 1000 }; // suspense; reveal after plunger
      this.state = States.REVEAL;
    }

    update(now){
      switch(this.state){
        case States.INTRO_ANIM: {
          const t = Math.min(1, (now - this.introStartAt) / this.introDurMs);
          this.introAnimT = t;
          // When t hits 1: show balloon, play "Start!" cue, schedule prompt window
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
              // Real button: countdown + explosion, hide balloon immediately
              window.audio?.playSfx("countdown");
              this.showRitchie = false;
              this.explodingUntil = now + 1200; // show GIF ~1.2s
              this.state = States.EXPLODING;
            }else{
              // DUD: keep Ritchie, show "Dud!" for ~1s, then resume
              window.audio?.playSfx("dud");
              this.showDudUntil = now + 1000;       // <-- NEW
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

        case States.EXPLODING:
          if(now >= this.explodingUntil){
            // After explosion gif, eliminate and speed next drop
            const cp = this.currentPlayer;
            if(cp){ cp.alive = false; this.hud.remainingPlayers = this.players.filter(p=>p.alive).length; }
            // Winner?
            if(this.hud.remainingPlayers <= 1){
              this.winner = this.players.find(p=>p.alive) || null;
              window.audio?.playSfx("fanfare");
              this.state = States.GAME_OVER;
              this.fadeBlackUntil = now + 5000; // show "Winner!" ~5s before fade
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
          // Wait 5s showing "Winner!", then fade to black and reset
          if(now >= this.fadeBlackUntil){
            // Back to setup (player select), no BGM restart here
            this.players = [];
            this.state = States.SETUP;
          }
          break;

        case States.NEXT_ROUND:
          // (unused path now; we transition via INTRO_ANIM for each new round)
          break;

        // TITLE/SETUP/PLAYING handled externally for UI, no timers here
      }
    }
  }

  window.GameStates = States;
  window.RNG = RNG;
  window.Game = Game;
})();

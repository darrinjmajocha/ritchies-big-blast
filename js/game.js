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
      this.fadeBlackUntil = 0;     // winner hold
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
      this.hud.remainingChoices = cho

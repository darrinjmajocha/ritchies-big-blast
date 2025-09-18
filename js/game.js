
/**
 * game.js
 * Core game logic + state machine (no rendering/UI here)
 */
(function(){
  const States = Object.freeze({
    TITLE: "TITLE",
    SETUP: "SETUP",
    INTRO_ANIM: "INTRO_ANIM",
    PLAYING: "PLAYING",
    REVEAL: "REVEAL",
    ELIMINATE: "ELIMINATE",
    NEXT_ROUND: "NEXT_ROUND",
    GAME_OVER: "GAME_OVER",
  });

  class RNG {
    constructor(seed = Date.now() & 0xffffffff){
      this.seed = seed >>> 0;
    }
    next(){
      // xorshift32
      let x = this.seed;
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      this.seed = x >>> 0;
      return this.seed / 0xffffffff;
    }
    pickInt(min, max){
      return Math.floor(this.next()*(max-min+1))+min;
    }
    shuffle(arr){
      for(let i=arr.length-1;i>0;i--){
        const j = Math.floor(this.next()*(i+1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
  }

  class Game {
    constructor(){
      this.state = States.TITLE;
      this.players = [];
      this.currentPlayerIdx = 0;
      this.roundChoices = [];
      this.armedIndex = -1;
      this.rng = new RNG();
      this.pendingReveal = null; // {choiceIndex, at}
      this.revealResult = null; // "safe" | "boom"
      this.delayRange = [300, 900]; // ms
      this.selectedChoice = -1;
      this.winner = null;
      this.introAnimT = 0; // 0..1 easing
      this.hud = { remainingPlayers: 0, remainingChoices: 0 };
    }

    reset(){
      this.state = States.TITLE;
      this.players = [];
      this.currentPlayerIdx = 0;
      this.roundChoices = [];
      this.armedIndex = -1;
      this.pendingReveal = null;
      this.revealResult = null;
      this.selectedChoice = -1;
      this.winner = null;
      this.introAnimT = 0;
      this.hud = { remainingPlayers: 0, remainingChoices: 0 };
    }

    setPlayers(count){
      this.players = [];
      for(let i=0;i<count;i++){
        this.players.push({ id: i, alive:true, name: `P${i+1}` });
      }
      this.currentPlayerIdx = 0;
      this.state = States.INTRO_ANIM;
      this.hud.remainingPlayers = this.players.length;
    }

    startRound(){
      const aliveCount = this.players.filter(p=>p.alive).length;
      const choices = aliveCount + 1;
      this.roundChoices = Array.from({length: choices}, (_,i)=>({ idx:i, taken:false, label:`${i+1}` }));
      this.armedIndex = this.rng.pickInt(0, choices-1);
      this.hud.remainingChoices = choices;
      // signal arming
      if(window.audio) window.audio.playSfx("arming");
    }

    get currentPlayer(){
      // advance to next alive as needed
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
      // register selection, start suspense delay
      this.selectedChoice = index;
      this.pendingReveal = { choiceIndex:index, at: performance.now() + this.rng.pickInt(...this.delayRange) };
      this.state = States.REVEAL;
      window.audio?.playSfx("click");
      // duck music
      const A = window.CONSTS.AUDIO;
      window.audio?.fadeMusicTo(A.duckTo, A.duckFadeMs);
      setTimeout(()=>{
        window.audio?.fadeMusicTo(window.CONSTS.AUDIO.musicVolume, 160);
      }, A.duckFadeMs + A.duckHoldMs);
    }

    update(now){
      switch(this.state){
        case States.INTRO_ANIM:
          this.introAnimT = Math.min(1, this.introAnimT + 0.02);
          if(this.introAnimT>=1){
            this.startRound();
            this.state = States.PLAYING;
          }
          break;
        case States.REVEAL:
          if(this.pendingReveal && now >= this.pendingReveal.at){
            const armed = this.selectedChoice === this.armedIndex;
            this.revealResult = armed ? "boom" : "safe";
            if(armed){ window.audio?.playSfx("boom"); }
            this.state = armed ? States.ELIMINATE : States.PLAYING;
            // mark taken either way
            const c = this.roundChoices[this.selectedChoice];
            if(c) c.taken = true;
            // if safe, move to next player
            if(!armed){
              this.nextPlayer();
            }
            this.pendingReveal = null;
          }
          break;
        case States.ELIMINATE:
          // eliminate current player and go next round
          const cp = this.currentPlayer;
          if(cp){ cp.alive = false; this.hud.remainingPlayers = this.players.filter(p=>p.alive).length; }
          // check win
          if(this.hud.remainingPlayers<=1){
            const w = this.players.find(p=>p.alive);
            this.winner = w || null;
            this.state = States.GAME_OVER;
            window.audio?.playSfx("win");
          }else{
            this.state = States.NEXT_ROUND;
          }
          break;
        case States.NEXT_ROUND:
          this.startRound();
          // set current player to next alive (the one after eliminated)
          this.nextPlayer();
          this.state = States.PLAYING;
          break;
      }
    }
  }

  window.GameStates = States;
  window.RNG = RNG;
  window.Game = Game;
})();

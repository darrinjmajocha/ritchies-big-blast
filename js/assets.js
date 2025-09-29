/**
 * assets.js
 * AssetManager for images & audio with progress + graceful fallbacks
 */
(function(){
  // Image & audio paths
  const IMG_PATHS = {
    ritchie:   "assets/img/ritchie.png",
    ritchie_3: "assets/img/ritchie_3.png", // eyes show "3"
    ritchie_2: "assets/img/ritchie_2.png", // eyes show "2"
    ritchie_1: "assets/img/ritchie_1.png", // eyes show "1"
    button: "assets/img/button.png",
    bg: "assets/img/background.png",
    explosion: "assets/img/explosion.gif",   // one-shot pop/explosion gif
  };

  const SFX_PATHS = {
    // round signal (optional)
    arming: "assets/sfx/arming.wav",

    // clicks & gameplay
    click: "assets/sfx/click.wav",
    plunger: "assets/sfx/plunger.ogg",
    dud: "assets/sfx/dud.ogg",

    // sequences
    priming: "assets/sfx/priming.ogg",     // intro inflate cue
    start: "assets/sfx/start.ogg",         // “Start!” text
    countdown: "assets/sfx/countdown.ogg", // real button sequence
    boom: "assets/sfx/boom.wav",           // pop SFX when countdown ends
    fanfare: "assets/sfx/fanfare.ogg",     // winner

    // legacy win (kept for compatibility; unused)
    win: "assets/sfx/win.wav",
  };

  const MUSIC_PATH = "assets/music/bgm.ogg";       // in-game loop
  const MENU_MUSIC_PATH = "assets/music/menu.ogg"; // menu loop

  class AssetManager {
    constructor(onProgress){
      this.onProgress = onProgress || (()=>{});
      this.images = {};
      this.sfx = {};
      this.musicUrl = MUSIC_PATH;
      this.menuMusicUrl = MENU_MUSIC_PATH;
      // Count images + sfx + 2 ticks for music references
      this.total = Object.keys(IMG_PATHS).length + Object.keys(SFX_PATHS).length + 2;
      this.loaded = 0;
    }
    _tick(){
      this.loaded++;
      const pct = Math.round((this.loaded/this.total)*100);
      this.onProgress(pct);
    }
    async loadImage(key, src){
      return new Promise((res)=>{
        const img = new Image();
        img.onload = ()=>{ this.images[key]=img; this._tick(); res(img); };
        img.onerror = ()=>{ console.warn("Image missing, fallback:", src); this.images[key]=null; this._tick(); res(null); };
        img.src = src;
      });
    }
    async loadAudioBuffer(ctx, src){
      if(!ctx) { this._tick(); return null; }
      try{
        const resp = await fetch(src, {cache:"no-cache"});
        if(!resp.ok) throw new Error("fetch failed");
        const arr = await resp.arrayBuffer();
        const buf = await ctx.decodeAudioData(arr);
        this._tick();
        return buf;
      }catch(e){
        console.warn("Audio fetch/decode failed, will fallback:", src, e);
        this._tick();
        return null;
      }
    }
    async loadAll(audioCtx){
      const imgPromises = Object.entries(IMG_PATHS).map(([k,src])=>this.loadImage(k,src));
      await Promise.all(imgPromises);
      const sfxEntries = Object.entries(SFX_PATHS);
      for(const [k,src] of sfxEntries){
        this.sfx[k] = await this.loadAudioBuffer(audioCtx, src);
      }
      // Progress ticks for music (actual streaming via <audio>)
      this._tick(); // bgm
      this._tick(); // menu
    }
  }

  window.AssetManager = AssetManager;
  window.ASSET_PATHS = { IMG_PATHS, SFX_PATHS, MUSIC_PATH, MENU_MUSIC_PATH };
})();

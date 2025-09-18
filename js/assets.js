
/**
 * assets.js
 * AssetManager for images & audio with progress + graceful fallbacks
 */
(function(){
  // Replace the IMG_PATHS + SFX_PATHS + MUSIC_PATH block:
const IMG_PATHS = {
  ritchie: "assets/img/ritchie.png",
  button: "assets/img/button.png",
  bg: "assets/img/background.png",
  explosion: "assets/img/explosion.gif",   // NEW: one-shot explosion gif
};

const SFX_PATHS = {
  // round signal (optional to keep)
  arming: "assets/sfx/arming.wav",

  // clicks & gameplay
  click: "assets/sfx/click.wav",
  plunger: "assets/sfx/plunger.ogg",       // NEW
  dud: "assets/sfx/dud.ogg",               // NEW

  // sequences
  priming: "assets/sfx/priming.ogg",       // NEW, drop-in start
  start: "assets/sfx/start.ogg",           // NEW, fade “Start!”
  countdown: "assets/sfx/countdown.ogg",   // NEW, real button
  fanfare: "assets/sfx/fanfare.ogg",       // NEW, winner

  // legacy win (kept for compatibility; unused now)
  win: "assets/sfx/win.wav",
};

const MUSIC_PATH = "assets/music/bgm.ogg";


  class AssetManager {
    constructor(onProgress){
      this.onProgress = onProgress || (()=>{});
      this.images = {};
      this.sfx = {};
      this.musicUrl = MUSIC_PATH;
      this.total = Object.keys(IMG_PATHS).length + Object.keys(SFX_PATHS).length + 1;
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
      // If WebAudio unavailable or fails, resolve null; AudioManager will fallback.
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
      // Count music as one progress tick (actual stream handled in AudioManager)
      this._tick();
    }
  }

  window.AssetManager = AssetManager;
  window.ASSET_PATHS = { IMG_PATHS, SFX_PATHS, MUSIC_PATH };
})();

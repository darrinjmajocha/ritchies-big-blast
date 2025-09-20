/**
 * audio.js
 * AudioManager: WebAudio if possible; else HTMLAudio fallbacks.
 * Exposes:
 *   playSfx(name)
 *   playGameMusic(loop=true)
 *   playMenuMusic(loop=true)
 *   stopMusic()
 *   setMusicVolume(v)
 *   fadeMusicTo(target, ms)
 *   setMuted(bool)
 *   isMuted()
 */
(function(){
  class AudioManager {
    constructor(assets){
      this.assets = assets;
      this.ctx = null;
      this.musicGain = null;
      this.masterGain = null;
      this.musicSource = null;
      this.musicEl = null;
      this.enabled = false;
      this.preferred = "webaudio";
      this.musicVolume = (window.CONSTS?.AUDIO?.musicVolume) ?? 0.5;
      this.sfxVolume = (window.CONSTS?.AUDIO?.sfxVolume) ?? 0.9;
      this._currentTrack = "none"; // "menu" | "game" | "none"
      this._muted = false;
    }

    async init(){
      try{
        const AC = window.AudioContext || window.webkitAudioContext;
        if(!AC) throw new Error("No AudioContext");
        this.ctx = new AC();
        this.masterGain = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();
        this.masterGain.gain.value = 1;
        this.musicGain.gain.value = this.musicVolume;
        this.musicGain.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
        this.enabled = true;
        this.preferred = "webaudio";
      }catch(e){
        console.warn("WebAudio unavailable, will use HTMLAudio fallback.", e);
        this.enabled = true;
        this.preferred = "htmlaudio";
      }
    }

    async resume(){
      if(this.ctx && this.ctx.state === "suspended"){
        await this.ctx.resume();
      }
    }

    // --- Mute controls ---
    setMuted(m){
      this._muted = !!m;
      if(this.preferred==="webaudio" && this.masterGain){
        this.masterGain.gain.value = this._muted ? 0 : 1;
      }else{
        if(this.musicEl) this.musicEl.muted = this._muted;
      }
    }
    isMuted(){ return !!this._muted; }

    playSfx(name){
      if(!this.enabled) return;
      if(this._muted) return;
      const path = window.ASSET_PATHS.SFX_PATHS[name];
      if(this.preferred==="webaudio" && this.ctx && this.assets.sfx[name]){
        const src = this.ctx.createBufferSource();
        src.buffer = this.assets.sfx[name];
        const gain = this.ctx.createGain();
        gain.gain.value = this.sfxVolume;
        src.connect(gain).connect(this.masterGain);
        src.start(0);
      }else{
        const a = new Audio(path);
        a.volume = this.sfxVolume;
        a.muted = this._muted;
        a.play().catch(()=>{/* ignore */});
      }
    }

    async _play(url, loop){
      if(!this.enabled) return;
      try{
        this.stopMusic();
        this.musicEl = new Audio(url);
        this.musicEl.loop = loop;
        this.musicEl.muted = this._muted;
        this.musicEl.volume = this.preferred==="webaudio" ? 1 : this.musicVolume;
        if(this.preferred==="webaudio" && this.ctx){
          const src = this.ctx.createMediaElementSource(this.musicEl);
          src.connect(this.musicGain).connect(this.masterGain);
        }
        await this.musicEl.play();
      }catch(e){
        console.warn("Music play failed (likely autoplay). Will show enable button and retry after user gesture.", e);
        if (this.musicEl) {
          try { this.musicEl.pause(); } catch(_) {}
          this.musicEl.src = "";
        }
        this.musicEl = null;
        const btn = document.getElementById("enableSoundBtn");
        if(btn) btn.classList.remove("hidden");
      }
    }

    async playGameMusic(loop=true){
      this._currentTrack = "game";
      await this._play(this.assets.musicUrl, loop);
    }

    async playMenuMusic(loop=true){
      this._currentTrack = "menu";
      await this._play(this.assets.menuMusicUrl, loop);
    }

    stopMusic(){
      if(this.musicEl){
        try { this.musicEl.pause(); } catch(_){}
        this.musicEl.currentTime = 0;
        this.musicEl.src = "";
        this.musicEl = null;
      }
      this._currentTrack = "none";
    }

    setMusicVolume(v){
      this.musicVolume = Math.max(0, Math.min(1, v));
      if(this.preferred==="webaudio" && this.musicGain){
        this.musicGain.gain.value = this.musicVolume;
      }else if(this.musicEl){
        this.musicEl.volume = this.musicVolume;
      }
    }

    fadeMusicTo(target, ms){
      if(this._muted) return;
      target = Math.max(0, Math.min(1, target));
      if(this.preferred==="webaudio" && this.musicGain && this.ctx){
        const now = this.ctx.currentTime;
        const end = now + (ms/1000);
        this.musicGain.gain.cancelScheduledValues(now);
        this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
        this.musicGain.gain.linearRampToValueAtTime(target, end);
      }else if(this.musicEl){
        const start = this.musicEl.volume;
        const startT = performance.now();
        const step = (now)=>{
          const t = Math.min(1, (now-startT)/ms);
          const v = start + (target-start)*t;
          this.musicEl.volume = v;
          if(t<1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }
  }

  window.AudioManager = AudioManager;
})();

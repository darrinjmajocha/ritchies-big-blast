/**
 * audio.js
 * AudioManager: WebAudio if possible; else HTMLAudio fallbacks.
 * Adds global volume cycling: full → half → mute.
 */
(function(){
  class AudioManager {
    constructor(assets){
      this.assets = assets;
      this.ctx = null;
      this.musicGain = null;
      this.masterGain = null;
      this.musicSource = null;
      this.musicEl = null; // HTMLAudio fallback
      this.enabled = false;
      this.preferred = "webaudio";

      // Base (per-track) volumes
      this.musicVolume = (window.CONSTS?.AUDIO?.musicVolume) ?? 0.5;
      this.sfxVolume = (window.CONSTS?.AUDIO?.sfxVolume) ?? 0.9;

      // Global scalar applied to everything (1.0, 0.5, 0)
      this.globalVolume = 1.0;
      this._level = "full"; // "full" | "half" | "mute"

      this._currentTrack = "none"; // "menu" | "game" | "none"
      this._muted = false; // derived from globalVolume===0 for back-compat
    }

    async init(){
      try{
        const AC = window.AudioContext || window.webkitAudioContext;
        if(!AC) throw new Error("No AudioContext");
        this.ctx = new AC();
        this.masterGain = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();
        this.masterGain.gain.value = this.globalVolume; // honor global level
        this.musicGain.gain.value = this.musicVolume;
        this.musicGain.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
        this.enabled = true;
        this.preferred = "webaudio";
      }catch(e){
        console.warn("WebAudio unavailable, will use HTMLAudio fallback.", e);
        this.enabled = true; // enabled but fallback will be used
        this.preferred = "htmlaudio";
      }
    }

    async resume(){
      if(this.ctx && this.ctx.state === "suspended"){
        await this.ctx.resume();
      }
    }

    // --- Volume controls (global) ---
    setVolumeLevel(level){
      // level: "full" | "half" | "mute"
      this._level = level;
      this.globalVolume = (level==="full") ? 1.0 : (level==="half" ? 0.5 : 0.0);
      this._muted = (this.globalVolume===0);

      if(this.preferred==="webaudio" && this.masterGain){
        this.masterGain.gain.value = this.globalVolume; // scales both music + sfx
      }else{
        if(this.musicEl){
          this.musicEl.volume = this.musicVolume * this.globalVolume;
          this.musicEl.muted = (this.globalVolume===0);
        }
      }
    }
    getVolumeLevel(){ return this._level; }

    // Back-compat for existing calls (mapped to mute/unmute)
    setMuted(m){ this.setVolumeLevel(m ? "mute" : "full"); }
    isMuted(){ return this.globalVolume===0; }

    playSfx(name){
      if(!this.enabled) return;
      if(this.globalVolume===0) return; // silence SFX when muted

      const path = window.ASSET_PATHS.SFX_PATHS[name];
      if(this.preferred==="webaudio" && this.ctx && this.assets.sfx[name]){
        const src = this.ctx.createBufferSource();
        src.buffer = this.assets.sfx[name];
        const gain = this.ctx.createGain();
        gain.gain.value = this.sfxVolume; // masterGain applies globalVolume
        src.connect(gain).connect(this.masterGain);
        src.start(0);
      }else{
        const a = new Audio(path);
        a.volume = this.sfxVolume * this.globalVolume;
        a.muted = (this.globalVolume===0);
        a.play().catch(()=>{/* ignore */});
      }
    }

    async _play(url, loop){
      if(!this.enabled) return;
      try{
        this.stopMusic();
        this.musicEl = new Audio(url);
        this.musicEl.loop = loop;
        this.musicEl.muted = (this.globalVolume===0);
        // In WebAudio, we route through a MediaElementSource to musicGain → masterGain
        this.musicEl.volume = (this.preferred==="webaudio") ? 1 : (this.musicVolume * this.globalVolume);
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
        this.musicGain.gain.value = this.musicVolume; // masterGain still applies global
      }else if(this.musicEl){
        this.musicEl.volume = this.musicVolume * this.globalVolume;
      }
    }

    fadeMusicTo(target, ms){
      if(this.globalVolume===0){
        // keep silent when muted; snap to 0
        if(this.preferred!=="webaudio" && this.musicEl) this.musicEl.volume = 0;
        return;
      }
      target = Math.max(0, Math.min(1, target));
      if(this.preferred==="webaudio" && this.musicGain && this.ctx){
        const now = this.ctx.currentTime;
        const end = now + (ms/1000);
        this.musicGain.gain.cancelScheduledValues(now);
        this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
        this.musicGain.gain.linearRampToValueAtTime(target, end);
      }else if(this.musicEl){
        const start = this.musicEl.volume;                // already includes global scalar
        const goal  = target * this.globalVolume;         // scale target by global
        const startT = performance.now();
        const step = (now)=>{
          const t = Math.min(1, (now-startT)/ms);
          const v = start + (goal-start)*t;
          this.musicEl.volume = v;
          if(t<1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }
  }

  window.AudioManager = AudioManager;
})();

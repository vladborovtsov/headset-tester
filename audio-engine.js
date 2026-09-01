const BPM = 78;
const STEP_DURATION = 60 / BPM / 4;
const CHORDS = [
  { notes: [57, 60, 64], bass: 45, next: [1, 2] },
  { notes: [53, 57, 60], bass: 41, next: [2, 3] },
  { notes: [60, 64, 67], bass: 48, next: [0, 3] },
  { notes: [55, 59, 62], bass: 43, next: [0, 1] },
];
const MELODY = [57, 60, 62, 64, 67, 69, 72, 74];

export class AudioEngine {
  constructor(options = {}) {
    this.AudioContextClass = options.AudioContextClass
      || globalThis.AudioContext
      || globalThis.webkitAudioContext;
    this.mediaDevices = options.mediaDevices || globalThis.navigator?.mediaDevices;
    this.permissionRequest = null;
    this.context = null;
    this.musicSchedulerTimer = null;
    this.musicPlaying = false;
    this.nextStepTime = 0;
    this.sequencerStep = 0;
    this.chordIndex = 0;
    this.melodyIndex = 2;
    this.stream = null;
    this.micSource = null;
    this.analyser = null;
    this.stereoOutput = null;
    this.micGain = null;
  }

  ensureContext() {
    if (this.context) return;
    if (!this.AudioContextClass) throw new Error('Web Audio is not supported');

    this.context = new this.AudioContextClass();
    this.musicGain = this.context.createGain();
    this.musicFilter = this.context.createBiquadFilter();
    this.musicCompressor = this.context.createDynamicsCompressor();
    this.musicGain.gain.value = 0;
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 3600;
    this.musicFilter.Q.value = 0.4;
    this.musicCompressor.threshold.value = -20;
    this.musicCompressor.knee.value = 18;
    this.musicCompressor.ratio.value = 3;
    this.musicCompressor.attack.value = 0.01;
    this.musicCompressor.release.value = 0.25;
    this.musicGain
      .connect(this.musicFilter)
      .connect(this.musicCompressor)
      .connect(this.context.destination);

    this.noiseBuffer = this.context.createBuffer(
      1,
      this.context.sampleRate,
      this.context.sampleRate,
    );
    const noise = this.noiseBuffer.getChannelData(0);
    for (let index = 0; index < noise.length; index++) {
      noise[index] = Math.random() * 2 - 1;
    }
  }

  async resume() {
    this.ensureContext();
    await this.context.resume();
  }

  microphoneConstraints() {
    return {
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    };
  }

  requestMicPermission() {
    if (!this.mediaDevices?.getUserMedia) {
      return Promise.reject(new Error('Microphone unavailable'));
    }
    if (this.permissionRequest) return this.permissionRequest;

    this.permissionRequest = this.mediaDevices
      .getUserMedia(this.microphoneConstraints())
      .then(permissionStream => {
        permissionStream.getTracks().forEach(track => track.stop());
        return true;
      })
      .finally(() => {
        this.permissionRequest = null;
      });
    return this.permissionRequest;
  }

  async startMusic(isCurrent = () => true) {
    await this.resume();
    if (!isCurrent()) return false;

    this.stopMic();
    this.startMusicLayer(0.22, true);
    return true;
  }

  startMusicLayer(volume, restart = false) {
    if (restart || !this.musicPlaying) {
      clearTimeout(this.musicSchedulerTimer);
      this.musicPlaying = true;
      this.sequencerStep = 0;
      this.chordIndex = Math.floor(Math.random() * CHORDS.length);
      this.melodyIndex = 1 + Math.floor(Math.random() * (MELODY.length - 3));
      this.nextStepTime = this.context.currentTime + 0.06;
      this.runMusicScheduler();
    }
    this.musicGain.gain.cancelScheduledValues(this.context.currentTime);
    this.musicGain.gain.setTargetAtTime(volume, this.context.currentTime, 0.18);
  }

  stopMusic() {
    this.musicPlaying = false;
    clearTimeout(this.musicSchedulerTimer);
    if (!this.musicGain || !this.context) return;
    this.musicGain.gain.cancelScheduledValues(this.context.currentTime);
    this.musicGain.gain.setTargetAtTime(0, this.context.currentTime, 0.06);
  }

  async startMic(isCurrent = () => true, ambientEnabled = true) {
    await this.resume();
    if (!isCurrent()) return false;

    if (ambientEnabled) this.startMusicLayer(0.1);
    else this.stopMusic();
    this.stopMic();
    if (!this.mediaDevices?.getUserMedia) throw new Error('Microphone unavailable');

    if (this.permissionRequest) await this.permissionRequest;
    if (!isCurrent()) return false;

    const pendingStream = await this.mediaDevices.getUserMedia(
      this.microphoneConstraints(),
    );
    if (!isCurrent()) {
      pendingStream.getTracks().forEach(track => track.stop());
      return false;
    }

    this.stream = pendingStream;
    this.micSource = this.context.createMediaStreamSource(this.stream);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 256;
    this.stereoOutput = this.context.createChannelMerger(2);
    this.micGain = this.context.createGain();
    this.micGain.gain.value = 0.82;
    this.micSource.connect(this.analyser);
    this.micSource.connect(this.stereoOutput, 0, 0);
    this.micSource.connect(this.stereoOutput, 0, 1);
    this.stereoOutput.connect(this.micGain).connect(this.context.destination);
    return true;
  }

  setMicAmbient(enabled) {
    if (!this.context) return;
    if (enabled) this.startMusicLayer(0.1);
    else this.stopMusic();
  }

  stopMic() {
    if (this.stream) this.stream.getTracks().forEach(track => track.stop());
    [
      this.micSource,
      this.analyser,
      this.stereoOutput,
      this.micGain,
    ].forEach(node => this.disconnectNode(node));
    this.stream = null;
    this.micSource = null;
    this.analyser = null;
    this.stereoOutput = null;
    this.micGain = null;
  }

  stopAll() {
    this.stopMusic();
    this.stopMic();
  }

  getMicLevel() {
    if (!this.analyser) return 0;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    const average = data.reduce((sum, value) => sum + value, 0) / data.length;
    return Math.min(100, average * 1.8);
  }

  disconnectNode(node) {
    if (!node) return;
    try {
      node.disconnect();
    } catch {
      // The node was already disconnected.
    }
  }

  midiToFrequency(note) {
    return 440 * 2 ** ((note - 69) / 12);
  }

  scheduleTone(note, time, duration, volume, options = {}) {
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    const panner = this.context.createStereoPanner();
    oscillator.type = options.type || 'triangle';
    oscillator.frequency.setValueAtTime(this.midiToFrequency(note), time);
    oscillator.detune.value = options.detune || 0;
    filter.type = 'lowpass';
    filter.frequency.value = options.filter || 1800;
    panner.pan.value = options.pan || 0;
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.linearRampToValueAtTime(
      volume,
      time + Math.min(0.04, duration / 4),
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator
      .connect(filter)
      .connect(envelope)
      .connect(panner)
      .connect(this.musicGain);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.05);
  }

  scheduleNoise(time, duration, volume, highpass) {
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = 'highpass';
    filter.frequency.value = highpass;
    envelope.gain.setValueAtTime(volume, time);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter).connect(envelope).connect(this.musicGain);
    source.start(time);
    source.stop(time + duration);
  }

  scheduleKick(time) {
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(115, time);
    oscillator.frequency.exponentialRampToValueAtTime(43, time + 0.22);
    envelope.gain.setValueAtTime(0.32, time);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);
    oscillator.connect(envelope).connect(this.musicGain);
    oscillator.start(time);
    oscillator.stop(time + 0.3);
  }

  scheduleChord(time, chord) {
    chord.notes.forEach((note, index) => {
      this.scheduleTone(note, time, STEP_DURATION * 14, 0.026, {
        type: index === 1 ? 'sine' : 'triangle',
        filter: 1050,
        detune: (Math.random() - 0.5) * 7,
        pan: (index - 1) * 0.32,
      });
    });
  }

  scheduleStep(step, time) {
    const position = step % 16;
    if (position === 0) {
      if (step > 0) {
        const choices = CHORDS[this.chordIndex].next;
        this.chordIndex = choices[Math.floor(Math.random() * choices.length)];
      }
      this.scheduleChord(time, CHORDS[this.chordIndex]);
    }

    if (
      position === 0
      || position === 8
      || (position === 11 && Math.random() > 0.65)
    ) {
      this.scheduleKick(time);
    }
    if (position === 4 || position === 12) {
      this.scheduleNoise(time, 0.16, 0.075, 1100);
      this.scheduleTone(45, time, 0.12, 0.045, {
        type: 'triangle',
        filter: 700,
      });
    }
    if (position % 2 === 0 && Math.random() > 0.12) {
      this.scheduleNoise(
        time,
        position % 4 === 0 ? 0.06 : 0.035,
        0.022,
        5200,
      );
    }

    if (
      position === 0
      || position === 8
      || (position === 12 && Math.random() > 0.55)
    ) {
      this.scheduleTone(
        CHORDS[this.chordIndex].bass,
        time,
        STEP_DURATION * 3.2,
        0.075,
        { type: 'sine', filter: 520 },
      );
    }

    if (position % 2 === 0 && Math.random() > 0.42) {
      const movement = [-2, -1, 1, 2][Math.floor(Math.random() * 4)];
      this.melodyIndex = Math.max(
        0,
        Math.min(MELODY.length - 1, this.melodyIndex + movement),
      );
      this.scheduleTone(
        MELODY[this.melodyIndex],
        time,
        STEP_DURATION * (1.2 + Math.random() * 1.8),
        0.055,
        {
          type: Math.random() > 0.35 ? 'triangle' : 'sine',
          filter: 1500 + Math.random() * 900,
          detune: (Math.random() - 0.5) * 5,
          pan: Math.random() * 0.8 - 0.4,
        },
      );
    }
  }

  runMusicScheduler() {
    if (!this.musicPlaying || !this.context) return;
    while (this.nextStepTime < this.context.currentTime + 0.2) {
      this.scheduleStep(this.sequencerStep, this.nextStepTime);
      this.nextStepTime += STEP_DURATION;
      this.sequencerStep++;
    }
    this.musicSchedulerTimer = setTimeout(
      () => this.runMusicScheduler(),
      50,
    );
  }
}

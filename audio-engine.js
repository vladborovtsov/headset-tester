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
    this.musicLayer = null;
    this.currentMusicVolume = 0;
    this.loopbackVolume = 0.82;
    this.ambientVolume = 0.1;
    this.micMuted = false;
    this.channelTestTimer = null;
    this.diagnosticsCallback = null;
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
    this.calibrationGain = this.context.createGain();
    this.calibrationGain.gain.value = 0.18;
    this.musicGain
      .connect(this.musicFilter)
      .connect(this.musicCompressor)
      .connect(this.context.destination);
    this.calibrationGain
      .connect(this.musicCompressor);

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

  microphoneConstraints(deviceId = '') {
    const deviceConstraint = deviceId
      ? { deviceId: { exact: deviceId } }
      : {};
    return {
      audio: {
        ...deviceConstraint,
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
    this.startMusicLayer(0.22, true, 'full');
    return true;
  }

  startMusicLayer(volume, restart = false, layer = this.musicLayer) {
    if (restart || !this.musicPlaying) {
      clearTimeout(this.musicSchedulerTimer);
      this.musicPlaying = true;
      this.sequencerStep = 0;
      this.chordIndex = Math.floor(Math.random() * CHORDS.length);
      this.melodyIndex = 1 + Math.floor(Math.random() * (MELODY.length - 3));
      this.nextStepTime = this.context.currentTime + 0.06;
      this.runMusicScheduler();
    }
    this.musicLayer = layer;
    this.currentMusicVolume = volume;
    this.musicGain.gain.cancelScheduledValues(this.context.currentTime);
    this.musicGain.gain.setTargetAtTime(volume, this.context.currentTime, 0.18);
  }

  stopMusic() {
    this.musicPlaying = false;
    this.musicLayer = null;
    this.currentMusicVolume = 0;
    clearTimeout(this.musicSchedulerTimer);
    if (!this.musicGain || !this.context) return;
    this.musicGain.gain.cancelScheduledValues(this.context.currentTime);
    this.musicGain.gain.setTargetAtTime(0, this.context.currentTime, 0.06);
  }

  async startMic(
    isCurrent = () => true,
    ambientEnabled = true,
    inputDeviceId = '',
  ) {
    await this.resume();
    if (!isCurrent()) return false;

    if (ambientEnabled) this.startMusicLayer(this.ambientVolume, false, 'ambient');
    else this.stopMusic();
    this.stopMic();
    if (!this.mediaDevices?.getUserMedia) throw new Error('Microphone unavailable');

    if (this.permissionRequest) await this.permissionRequest;
    if (!isCurrent()) return false;

    const pendingStream = await this.mediaDevices.getUserMedia(
      this.microphoneConstraints(inputDeviceId),
    );
    if (!isCurrent()) {
      pendingStream.getTracks().forEach(track => track.stop());
      return false;
    }

    this.stream = pendingStream;
    const track = this.stream.getAudioTracks()[0];
    ['mute', 'unmute', 'ended'].forEach(eventName => {
      track?.addEventListener?.(eventName, () => this.emitDiagnosticsChange());
    });
    this.stream.addEventListener?.('inactive', () => this.emitDiagnosticsChange());
    this.micSource = this.context.createMediaStreamSource(this.stream);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 256;
    this.stereoOutput = this.context.createChannelMerger(2);
    this.micGain = this.context.createGain();
    this.micGain.gain.value = this.micMuted ? 0 : this.loopbackVolume;
    this.micSource.connect(this.analyser);
    this.micSource.connect(this.stereoOutput, 0, 0);
    this.micSource.connect(this.stereoOutput, 0, 1);
    this.stereoOutput.connect(this.micGain).connect(this.context.destination);
    return true;
  }

  setMicAmbient(enabled) {
    if (!this.context) return;
    if (enabled) this.startMusicLayer(this.ambientVolume, false, 'ambient');
    else this.stopMusic();
  }

  setLoopbackVolume(percent) {
    this.loopbackVolume = Math.max(0, Math.min(1, percent / 100));
    if (this.micGain && !this.micMuted) {
      this.micGain.gain.setTargetAtTime(
        this.loopbackVolume,
        this.context.currentTime,
        0.03,
      );
    }
  }

  setAmbientVolume(percent) {
    this.ambientVolume = 0.22 * Math.max(0, Math.min(1, percent / 100));
    if (this.musicLayer === 'ambient') {
      this.startMusicLayer(this.ambientVolume, false, 'ambient');
    }
  }

  setMicMuted(muted) {
    this.micMuted = muted;
    if (this.micGain) {
      this.micGain.gain.setTargetAtTime(
        muted ? 0 : this.loopbackVolume,
        this.context.currentTime,
        0.03,
      );
    }
  }

  async playChannelTest(channel) {
    await this.resume();
    const pan = { left: -1, both: 0, right: 1 }[channel] ?? 0;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    const panner = this.context.createStereoPanner();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(660, now);
    panner.pan.value = pan;
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.linearRampToValueAtTime(1, now + 0.025);
    envelope.gain.setValueAtTime(1, now + 0.35);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    oscillator
      .connect(envelope)
      .connect(panner)
      .connect(this.calibrationGain);

    if (this.musicPlaying) {
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setTargetAtTime(
        this.currentMusicVolume * 0.2,
        now,
        0.02,
      );
    }
    oscillator.start(now);
    oscillator.stop(now + 0.58);
    clearTimeout(this.channelTestTimer);
    this.channelTestTimer = setTimeout(() => {
      if (!this.context || !this.musicPlaying) return;
      this.musicGain.gain.cancelScheduledValues(this.context.currentTime);
      this.musicGain.gain.setTargetAtTime(
        this.currentMusicVolume,
        this.context.currentTime,
        0.08,
      );
    }, 620);
  }

  supportsOutputSelection() {
    return Boolean(
      this.mediaDevices?.selectAudioOutput
      && this.AudioContextClass?.prototype
      && 'setSinkId' in this.AudioContextClass.prototype,
    );
  }

  async selectOutput() {
    if (!this.supportsOutputSelection()) {
      throw new Error('Output selection is not supported');
    }
    const device = await this.mediaDevices.selectAudioOutput();
    this.ensureContext();
    await this.context.setSinkId(device.deviceId);
    return {
      deviceId: device.deviceId,
      groupId: device.groupId || '',
      label: device.label,
    };
  }

  async listAudioInputs() {
    if (!this.mediaDevices?.enumerateDevices) return [];
    const devices = await this.mediaDevices.enumerateDevices();
    return devices
      .filter(device => device.kind === 'audioinput')
      .map(device => ({
        deviceId: device.deviceId,
        groupId: device.groupId || '',
        label: device.label,
      }));
  }

  onDeviceChange(callback) {
    this.mediaDevices?.addEventListener?.('devicechange', callback);
  }

  onDiagnosticsChange(callback) {
    this.diagnosticsCallback = callback;
  }

  emitDiagnosticsChange() {
    this.diagnosticsCallback?.();
  }

  getDiagnostics() {
    const track = this.stream?.getAudioTracks?.()[0];
    let settings = {};
    let capabilities = {};
    let constraints = {};
    let supportedConstraints = {};
    try {
      settings = track?.getSettings?.() || {};
      capabilities = track?.getCapabilities?.() || {};
      constraints = track?.getConstraints?.() || {};
      supportedConstraints = this.mediaDevices?.getSupportedConstraints?.() || {};
    } catch {
      // Some browsers expose these methods but withhold individual values.
    }
    const destination = this.context?.destination;
    return {
      contextState: this.context?.state || 'not started',
      contextSampleRate: this.context?.sampleRate || null,
      baseLatency: this.context?.baseLatency ?? null,
      outputLatency: this.context?.outputLatency ?? null,
      outputChannelCount: destination?.channelCount || null,
      maxOutputChannelCount: destination?.maxChannelCount || null,
      sinkId: typeof this.context?.sinkId === 'string'
        ? this.context.sinkId
        : '',
      inputLabel: track?.label || '',
      inputGroupId: settings.groupId || '',
      inputSampleRate: settings.sampleRate || null,
      inputSampleSize: settings.sampleSize || null,
      inputChannelCount: settings.channelCount || null,
      inputLatency: settings.latency ?? null,
      inputVolume: settings.volume ?? null,
      echoCancellation: settings.echoCancellation ?? null,
      noiseSuppression: settings.noiseSuppression ?? null,
      autoGainControl: settings.autoGainControl ?? null,
      voiceIsolation: settings.voiceIsolation ?? null,
      trackState: track?.readyState || 'inactive',
      trackEnabled: track?.enabled ?? null,
      trackMuted: track?.muted ?? null,
      streamActive: this.stream?.active ?? null,
      capabilities,
      constraints,
      supportedConstraints,
      deviceChangeSupported: Boolean(this.mediaDevices?.addEventListener),
      mediaDevicesSupported: Boolean(this.mediaDevices?.getUserMedia),
      secureContext: globalThis.isSecureContext ?? null,
    };
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

  getMicMetrics() {
    if (!this.analyser) return { level: 0, clipping: false };
    const data = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(data);
    const peak = data.reduce(
      (maximum, value) => Math.max(maximum, Math.abs(value - 128)),
      0,
    );
    return {
      level: Math.min(100, peak / 1.28),
      clipping: peak >= 126,
    };
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

export class SessionController {
  constructor({ audio, ui, clock = {} }) {
    this.audio = audio;
    this.ui = ui;
    this.clock = {
      now: clock.now || (() => Date.now()),
      setInterval: clock.setInterval || ((callback, delay) => setInterval(callback, delay)),
      clearInterval: clock.clearInterval || (timer => clearInterval(timer)),
    };
    this.state = {
      running: false,
      switchingMethod: 'manual',
      activeMode: null,
      desiredMode: null,
      transitioning: false,
      transitionId: 0,
      remaining: this.ui.getInterval(),
      ambientInMic: this.ui.getAmbientInMic(),
      musicPreset: this.ui.getMusicPreset(),
      micPermission: 'unknown',
      loopbackVolume: this.ui.getLoopbackVolume(),
      ambientVolume: this.ui.getAmbientVolume(),
      micMuted: false,
      inputDevices: [],
      selectedInputId: '',
      outputSelectionSupported: this.audio.supportsOutputSelection(),
      outputSelecting: false,
      outputLabel: 'System default output',
      outputGroupId: '',
      outputError: '',
      diagnostics: this.audio.getDiagnostics(),
    };
    this.audio.setLoopbackVolume(this.state.loopbackVolume);
    this.audio.setAmbientVolume(this.state.ambientVolume);
    this.audio.setMusicPreset(this.state.musicPreset);
    this.countdownTimer = null;
    this.permissionAttempt = null;
  }

  init() {
    this.audio.onDeviceChange(() => this.refreshInputDevices());
    this.audio.onDiagnosticsChange?.(() => {
      this.refreshDiagnostics();
      this.ui.render(this.state);
    });
    this.ui.render(this.state);
    this.permissionAttempt = this.requestInitialMicPermission();
    return this.permissionAttempt;
  }

  async requestInitialMicPermission() {
    this.state.micPermission = 'requesting';
    this.ui.render(this.state);
    try {
      await this.audio.requestMicPermission();
      this.state.micPermission = 'granted';
      await this.refreshInputDevices(false);
    } catch (error) {
      this.state.micPermission = error?.name === 'NotAllowedError'
        ? 'denied'
        : 'unavailable';
    }
    this.refreshDiagnostics();
    this.ui.render(this.state);
  }

  async refreshInputDevices(render = true) {
    try {
      this.state.inputDevices = await this.audio.listAudioInputs();
      const selectedIsAvailable = this.state.inputDevices.some(
        device => device.deviceId === this.state.selectedInputId,
      );
      if (this.state.selectedInputId && !selectedIsAvailable) {
        this.state.selectedInputId = '';
      }
    } catch {
      this.state.inputDevices = [];
      this.state.selectedInputId = '';
    }
    if (render) this.ui.render(this.state);
  }

  refreshDiagnostics() {
    this.state.diagnostics = this.audio.getDiagnostics();
  }

  snapshot() {
    return { ...this.state };
  }

  handleStart() {
    if (this.state.running) {
      this.stopTest();
      return;
    }
    if (this.state.switchingMethod === 'auto') {
      this.requestMode('music');
    }
  }

  async requestMode(nextMode, { force = false } = {}) {
    if (
      !force
      && this.state.running
      && this.state.activeMode === nextMode
      && !this.state.transitioning
    ) {
      return;
    }

    if (!this.state.running) this.state.running = true;
    this.clearAutomaticCountdown();
    const id = ++this.state.transitionId;
    this.state.activeMode = null;
    this.state.desiredMode = nextMode;
    this.state.transitioning = true;
    this.ui.stopVisualization();
    this.ui.render(this.state);

    const isCurrent = () => (
      id === this.state.transitionId
      && this.state.running
      && this.state.desiredMode === nextMode
    );

    try {
      const started = nextMode === 'music'
        ? await this.audio.startMusic(isCurrent)
        : await this.audio.startMic(
          isCurrent,
          this.state.ambientInMic,
          this.state.selectedInputId,
        );
      if (!started || !isCurrent()) return;
      this.finishTransition(id, nextMode);
    } catch (error) {
      if (id !== this.state.transitionId) return;
      if (nextMode === 'mic') {
        this.state.micPermission = error?.name === 'NotAllowedError'
          ? 'denied'
          : 'unavailable';
      }
      const message = error?.name === 'NotAllowedError'
        ? 'Microphone permission was not granted'
        : error?.message === 'Web Audio is not supported'
          ? 'Web Audio is not supported'
          : nextMode === 'mic'
            ? 'Microphone unavailable'
            : 'Audio playback unavailable';
      this.stopTest(message);
    }
  }

  finishTransition(id, mode) {
    if (id !== this.state.transitionId || !this.state.running) return;
    this.state.activeMode = mode;
    this.state.desiredMode = null;
    this.state.transitioning = false;
    if (mode === 'mic') {
      this.audio.setMicAmbient(this.state.ambientInMic);
    }
    this.refreshDiagnostics();
    this.ui.render(this.state);
    this.ui.startVisualization(mode, () => this.audio.getMicMetrics());
    this.startAutomaticCountdown();
  }

  stopTest(message = 'Test stopped') {
    this.state.transitionId++;
    this.state.running = false;
    this.state.activeMode = null;
    this.state.desiredMode = null;
    this.state.transitioning = false;
    this.clearAutomaticCountdown();
    this.audio.stopAll();
    this.refreshDiagnostics();
    this.ui.stopVisualization();
    this.ui.render(this.state, message);
  }

  setSwitchingMethod(method) {
    if (this.state.switchingMethod === method) return;
    this.state.switchingMethod = method;
    this.clearAutomaticCountdown();
    this.ui.render(this.state);
    if (
      method === 'auto'
      && this.state.running
      && !this.state.transitioning
    ) {
      this.startAutomaticCountdown();
    }
  }

  intervalChanged() {
    if (this.state.running && this.state.switchingMethod === 'auto') {
      this.startAutomaticCountdown();
    }
  }

  setAmbientInMic(enabled) {
    this.state.ambientInMic = enabled;
    if (
      this.state.activeMode === 'mic'
      || this.state.desiredMode === 'mic'
    ) {
      this.audio.setMicAmbient(enabled);
    }
    this.ui.render(this.state);
  }

  setLoopbackVolume(value) {
    this.state.loopbackVolume = value;
    this.audio.setLoopbackVolume(value);
    this.ui.render(this.state);
  }

  setAmbientVolume(value) {
    this.state.ambientVolume = value;
    this.audio.setAmbientVolume(value);
    this.ui.render(this.state);
  }

  setMusicPreset(preset) {
    if (!['lofi', '8bit'].includes(preset)) return;
    this.state.musicPreset = preset;
    this.audio.setMusicPreset(preset);
    this.ui.render(this.state);
    this.ui.announce(`${preset === '8bit' ? 'Dark DMG' : 'Lo-fi'} music selected`);
  }

  toggleMicMute() {
    this.state.micMuted = !this.state.micMuted;
    this.audio.setMicMuted(this.state.micMuted);
    this.ui.render(this.state);
  }

  async playChannelTest(channel) {
    try {
      await this.audio.playChannelTest(channel);
      const label = channel === 'both' ? 'Both channels' : `${channel} channel`;
      this.ui.announce(`${label} test`);
    } catch {
      this.ui.announce('Channel test is unavailable in this browser.');
    }
  }

  async setInputDevice(deviceId) {
    this.state.selectedInputId = deviceId;
    this.ui.render(this.state);
    if (
      this.state.activeMode === 'mic'
      || this.state.desiredMode === 'mic'
    ) {
      await this.requestMode('mic', { force: true });
    }
  }

  async chooseOutput() {
    if (!this.state.outputSelectionSupported || this.state.outputSelecting) return;
    this.state.outputSelecting = true;
    this.state.outputError = '';
    this.ui.render(this.state);
    try {
      const device = await this.audio.selectOutput();
      this.state.outputLabel = device.label || 'Selected output';
      this.state.outputGroupId = device.groupId || '';
      this.refreshDiagnostics();
    } catch (error) {
      this.state.outputError = error?.name === 'NotAllowedError'
        ? 'Output selection was not granted.'
        : 'Could not switch the output device.';
    } finally {
      this.state.outputSelecting = false;
      this.ui.render(this.state);
    }
  }

  clearAutomaticCountdown() {
    if (this.countdownTimer !== null) {
      this.clock.clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  startAutomaticCountdown() {
    this.clearAutomaticCountdown();
    if (
      !this.state.running
      || this.state.switchingMethod !== 'auto'
      || !this.state.activeMode
    ) {
      return;
    }

    const duration = this.ui.getInterval();
    const deadline = this.clock.now() + duration * 1000;
    this.state.remaining = duration;
    this.ui.setCountdown(`Switches in ${duration} seconds`);
    this.countdownTimer = this.clock.setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((deadline - this.clock.now()) / 1000),
      );
      if (remaining !== this.state.remaining) {
        this.state.remaining = remaining;
        this.ui.setCountdown(
          `Switches in ${remaining} second${remaining === 1 ? '' : 's'}`,
        );
      }
      if (remaining <= 0) {
        this.clearAutomaticCountdown();
        this.requestMode(
          this.state.activeMode === 'music' ? 'mic' : 'music',
        );
      }
    }, 200);
  }
}

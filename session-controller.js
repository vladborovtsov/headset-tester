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
      switchingMethod: 'auto',
      activeMode: null,
      desiredMode: null,
      transitioning: false,
      transitionId: 0,
      remaining: this.ui.getInterval(),
    };
    this.countdownTimer = null;
  }

  init() {
    this.ui.render(this.state);
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

  async requestMode(nextMode) {
    if (
      this.state.running
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
        : await this.audio.startMic(isCurrent);
      if (!started || !isCurrent()) return;
      this.finishTransition(id, nextMode);
    } catch (error) {
      if (id !== this.state.transitionId) return;
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
    this.ui.render(this.state);
    this.ui.startVisualization(mode, () => this.audio.getMicLevel());
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

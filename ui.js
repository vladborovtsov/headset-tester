export class UI {
  constructor(root = document) {
    this.controlPanel = root.querySelector('.control-panel');
    this.startButton = root.querySelector('#startButton');
    this.intervalSelect = root.querySelector('#interval');
    this.timerWrap = root.querySelector('#timerWrap');
    this.autoModeButton = root.querySelector('#autoMode');
    this.manualModeButton = root.querySelector('#manualMode');
    this.selectMusic = root.querySelector('#selectMusic');
    this.selectMic = root.querySelector('#selectMic');
    this.musicCard = root.querySelector('#musicCard');
    this.micCard = root.querySelector('#micCard');
    this.musicStatus = root.querySelector('#musicStatus');
    this.micStatus = root.querySelector('#micStatus');
    this.currentMode = root.querySelector('#currentMode');
    this.countdown = root.querySelector('#countdown');
    this.announcement = root.querySelector('#announcement');
    this.trackDot = root.querySelector('#trackDot');
    this.meter = root.querySelector('#micMeter');
    this.visualizer = root.querySelector('#visualizer');
    this.musicActionLabel = root.querySelector('#musicActionLabel');
    this.micActionLabel = root.querySelector('#micActionLabel');
    this.ambientInMic = root.querySelector('#ambientInMic');
    this.dialog = root.querySelector('#aboutDialog');
    this.aboutButton = root.querySelector('#aboutButton');
    this.closeDialogButton = root.querySelector('#closeDialog');
    this.animationFrame = null;

    for (let index = 0; index < 46; index++) {
      this.visualizer.append(document.createElement('i'));
    }
  }

  bind(handlers) {
    this.startButton.addEventListener('click', handlers.start);
    this.selectMusic.addEventListener('click', () => handlers.selectMode('music'));
    this.selectMic.addEventListener('click', () => handlers.selectMode('mic'));
    this.autoModeButton.addEventListener(
      'click',
      () => handlers.setSwitchingMethod('auto'),
    );
    this.manualModeButton.addEventListener(
      'click',
      () => handlers.setSwitchingMethod('manual'),
    );
    this.intervalSelect.addEventListener('change', handlers.intervalChanged);
    this.ambientInMic.addEventListener(
      'change',
      () => handlers.ambientChanged(this.ambientInMic.checked),
    );
    this.aboutButton.addEventListener('click', () => this.dialog.showModal());
    this.closeDialogButton.addEventListener('click', () => this.dialog.close());
  }

  getInterval() {
    return Number(this.intervalSelect.value);
  }

  getAmbientInMic() {
    return this.ambientInMic.checked;
  }

  setCountdown(text) {
    this.countdown.textContent = text;
  }

  statusMarkup(text) {
    return `<i></i> ${text}`;
  }

  render(state, message) {
    const isMusic = state.running && state.activeMode === 'music';
    const isMic = state.running && state.activeMode === 'mic';
    this.musicCard.classList.toggle('active', isMusic);
    this.micCard.classList.toggle('active', isMic);
    this.trackDot.classList.toggle(
      'mic',
      isMic || state.desiredMode === 'mic',
    );

    if (!state.running) {
      this.musicStatus.innerHTML = this.statusMarkup('READY');
      this.micStatus.innerHTML = this.statusMarkup(
        state.micPermission === 'requesting'
          ? 'REQUESTING'
          : ['denied', 'unavailable'].includes(state.micPermission)
            ? 'BLOCKED'
            : 'READY',
      );
      this.currentMode.textContent = 'Not running';
    } else {
      this.musicStatus.innerHTML = this.statusMarkup(
        isMusic
          ? 'ACTIVE'
          : state.desiredMode === 'music' ? 'SWITCHING' : 'STANDBY',
      );
      this.micStatus.innerHTML = this.statusMarkup(
        isMic
          ? 'ACTIVE'
          : state.desiredMode === 'mic'
            ? 'SWITCHING'
            : ['denied', 'unavailable'].includes(state.micPermission)
              ? 'BLOCKED'
              : state.micPermission === 'requesting' ? 'REQUESTING' : 'STANDBY',
      );
      this.currentMode.textContent = state.transitioning
        ? state.desiredMode === 'mic'
          ? 'Requesting microphone…'
          : 'Switching to audio…'
        : isMusic ? 'Audio playback' : 'Microphone loopback';
    }

    const manual = state.switchingMethod === 'manual';
    this.controlPanel.classList.toggle('manual', manual);
    this.autoModeButton.classList.toggle('selected', !manual);
    this.manualModeButton.classList.toggle('selected', manual);
    this.autoModeButton.setAttribute('aria-pressed', String(!manual));
    this.manualModeButton.setAttribute('aria-pressed', String(manual));
    this.timerWrap.hidden = manual;
    this.selectMusic.hidden = !manual;
    this.selectMic.hidden = !manual;
    this.intervalSelect.disabled = state.running;
    this.ambientInMic.checked = state.ambientInMic;

    if (manual) {
      this.musicActionLabel.textContent = !state.running
        ? 'START AUDIO'
        : isMusic
          ? 'ACTIVE'
          : state.desiredMode === 'music' ? 'SWITCHING…' : 'SWITCH TO AUDIO';
      this.micActionLabel.textContent = !state.running
        ? 'START HEADSET'
        : isMic
          ? 'ACTIVE'
          : state.desiredMode === 'mic'
            ? 'SWITCHING…'
            : 'SWITCH TO HEADSET';
      this.selectMusic.disabled = isMusic || state.desiredMode === 'music';
      this.selectMic.disabled = isMic || state.desiredMode === 'mic';
    }

    this.startButton.classList.toggle('running', state.running);
    this.startButton.disabled = manual && !state.running;
    this.startButton.innerHTML = state.running
      ? '<span>STOP TEST</span><b>×</b>'
      : manual
        ? '<span>SELECT A MODE</span><b>↗</b>'
        : '<span>START TEST</span><b>→</b>';

    if (message) this.setCountdown(message);
    else if (!state.running) {
      this.setCountdown(
        state.micPermission === 'requesting'
          ? 'Requesting microphone permission…'
          : state.micPermission === 'denied'
            ? 'Microphone permission was not granted'
            : state.micPermission === 'unavailable'
              ? 'Microphone unavailable'
              : state.micPermission === 'granted'
                ? 'Microphone ready'
                : manual ? 'Choose a mode to begin' : 'Ready for automatic test',
      );
    } else if (state.transitioning) {
      this.setCountdown(
        state.desiredMode === 'mic'
          ? 'Requesting microphone permission…'
          : 'Releasing microphone…',
      );
    } else if (manual) {
      this.setCountdown('Manual control');
    }

    if (message) this.announcement.textContent = message;
    else if (state.micPermission === 'requesting') {
      this.announcement.textContent = 'Requesting microphone permission';
    } else if (!state.running && state.micPermission === 'granted') {
      this.announcement.textContent = 'Microphone permission granted';
    } else if (!state.running && state.micPermission === 'denied') {
      this.announcement.textContent = 'Microphone permission was not granted';
    } else if (!state.running && state.micPermission === 'unavailable') {
      this.announcement.textContent = 'Microphone unavailable';
    } else if (state.transitioning) {
      this.announcement.textContent = this.currentMode.textContent;
    } else if (state.running && state.activeMode) {
      this.announcement.textContent = `${this.currentMode.textContent} active`;
    }
  }

  startVisualization(mode, getMicLevel) {
    this.stopVisualization();
    if (mode === 'music') this.animateMusic();
    else this.animateMeter(getMicLevel);
  }

  stopVisualization() {
    cancelAnimationFrame(this.animationFrame);
    this.meter.style.width = '0';
  }

  animateMeter(getMicLevel) {
    this.meter.style.width = `${getMicLevel()}%`;
    this.animationFrame = requestAnimationFrame(
      () => this.animateMeter(getMicLevel),
    );
  }

  animateMusic() {
    this.visualizer.querySelectorAll('i').forEach((bar, index) => {
      const wave = Math.abs(Math.sin(Date.now() / 420 + index * 0.48));
      bar.style.height = `${18 + wave * 72}%`;
    });
    this.animationFrame = requestAnimationFrame(() => this.animateMusic());
  }
}

export class UI {
  constructor(root = document) {
    this.controlPanel = root.querySelector('.control-panel');
    this.startButton = root.querySelector('#startButton');
    this.intervalSelect = root.querySelector('#interval');
    this.timerWrap = root.querySelector('#timerWrap');
    this.autoModeButton = root.querySelector('#autoMode');
    this.manualModeButton = root.querySelector('#manualMode');
    this.musicAction = root.querySelector('#musicAction');
    this.micAction = root.querySelector('#micAction');
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
    this.inputDevice = root.querySelector('#inputDevice');
    this.chooseOutput = root.querySelector('#chooseOutput');
    this.outputDevice = root.querySelector('#outputDevice');
    this.outputSupport = root.querySelector('#outputSupport');
    this.deviceWarning = root.querySelector('#deviceWarning');
    this.diagPermission = root.querySelector('#diagPermission');
    this.diagInputDevice = root.querySelector('#diagInputDevice');
    this.diagTrack = root.querySelector('#diagTrack');
    this.diagInputFormat = root.querySelector('#diagInputFormat');
    this.diagProcessing = root.querySelector('#diagProcessing');
    this.diagInputLatency = root.querySelector('#diagInputLatency');
    this.diagRequest = root.querySelector('#diagRequest');
    this.diagCapabilities = root.querySelector('#diagCapabilities');
    this.diagContext = root.querySelector('#diagContext');
    this.diagOutputChannels = root.querySelector('#diagOutputChannels');
    this.diagLatency = root.querySelector('#diagLatency');
    this.diagPairing = root.querySelector('#diagPairing');
    this.diagApiSupport = root.querySelector('#diagApiSupport');
    this.diagMode = root.querySelector('#diagMode');
    this.loopbackVolume = root.querySelector('#loopbackVolume');
    this.loopbackValue = root.querySelector('#loopbackValue');
    this.ambientVolume = root.querySelector('#ambientVolume');
    this.ambientValue = root.querySelector('#ambientValue');
    this.channelTestButtons = [...root.querySelectorAll('[data-channel]')];
    this.muteMic = root.querySelector('#muteMic');
    this.clipIndicator = root.querySelector('#clipIndicator');
    this.animationFrame = null;

    for (let index = 0; index < 46; index++) {
      this.visualizer.append(document.createElement('i'));
    }
  }

  bind(handlers) {
    this.startButton.addEventListener('click', handlers.start);
    this.bindModeCard(this.musicCard, 'music', handlers.selectMode);
    this.bindModeCard(this.micCard, 'mic', handlers.selectMode);
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
    this.inputDevice.addEventListener(
      'change',
      () => handlers.inputDeviceChanged(this.inputDevice.value),
    );
    this.chooseOutput.addEventListener('click', handlers.chooseOutput);
    this.loopbackVolume.addEventListener(
      'input',
      () => handlers.loopbackChanged(Number(this.loopbackVolume.value)),
    );
    this.ambientVolume.addEventListener(
      'input',
      () => handlers.ambientVolumeChanged(Number(this.ambientVolume.value)),
    );
    this.channelTestButtons.forEach(button => {
      button.addEventListener(
        'click',
        () => handlers.channelTest(button.dataset.channel),
      );
    });
    this.muteMic.addEventListener('click', handlers.toggleMicMute);
  }

  bindModeCard(card, mode, selectMode) {
    card.addEventListener('click', event => {
      if (
        !card.classList.contains('selectable')
        || event.target.closest('input, label, button, select, a')
      ) {
        return;
      }
      selectMode(mode);
    });
    card.addEventListener('keydown', event => {
      if (
        event.target !== card
        || !card.classList.contains('selectable')
        || !['Enter', ' '].includes(event.key)
      ) {
        return;
      }
      event.preventDefault();
      selectMode(mode);
    });
  }

  getInterval() {
    return Number(this.intervalSelect.value);
  }

  getAmbientInMic() {
    return this.ambientInMic.checked;
  }

  getLoopbackVolume() {
    return Number(this.loopbackVolume.value);
  }

  getAmbientVolume() {
    return Number(this.ambientVolume.value);
  }

  setCountdown(text) {
    this.countdown.textContent = text;
  }

  announce(text) {
    this.announcement.textContent = text;
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
    this.musicAction.hidden = !manual;
    this.micAction.hidden = !manual;
    this.intervalSelect.disabled = state.running;
    this.ambientInMic.checked = state.ambientInMic;
    this.ambientVolume.disabled = !state.ambientInMic;

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
      this.setModeCardState(
        this.musicCard,
        !(isMusic || state.desiredMode === 'music'),
        this.musicActionLabel.textContent,
      );
      this.setModeCardState(
        this.micCard,
        !(isMic || state.desiredMode === 'mic'),
        this.micActionLabel.textContent,
      );
    } else {
      this.clearModeCardState(this.musicCard);
      this.clearModeCardState(this.micCard);
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

    this.renderAudioTools(state);
  }

  setModeCardState(card, selectable, label) {
    card.classList.toggle('selectable', selectable);
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', label);
    card.setAttribute('aria-disabled', String(!selectable));
    card.tabIndex = selectable ? 0 : -1;
  }

  clearModeCardState(card) {
    card.classList.remove('selectable');
    card.removeAttribute('role');
    card.removeAttribute('aria-label');
    card.removeAttribute('aria-disabled');
    card.removeAttribute('tabindex');
  }

  renderAudioTools(state) {
    const devicesSignature = state.inputDevices
      .map(device => `${device.deviceId}:${device.label}`)
      .join('|');
    if (this.inputDevice.dataset.signature !== devicesSignature) {
      this.inputDevice.replaceChildren();
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'System default';
      this.inputDevice.append(defaultOption);
      state.inputDevices.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Microphone ${index + 1}`;
        this.inputDevice.append(option);
      });
      this.inputDevice.dataset.signature = devicesSignature;
    }
    this.inputDevice.value = state.selectedInputId;
    this.inputDevice.disabled = state.micPermission !== 'granted'
      || state.inputDevices.length === 0;

    const selectedDevice = state.inputDevices.find(
      device => device.deviceId === state.selectedInputId,
    );
    const inputLabel = selectedDevice?.label
      || state.diagnostics.inputLabel
      || '';
    const bluetoothPattern = /airpods|bluetooth|headset|buds|beats|bose|jabra|soundcore|momentum|poly|wh-|wf-/i;
    this.deviceWarning.hidden = !inputLabel
      || bluetoothPattern.test(inputLabel);

    this.chooseOutput.disabled = !state.outputSelectionSupported
      || state.outputSelecting;
    this.chooseOutput.textContent = state.outputSelecting
      ? 'CHOOSING…'
      : 'CHOOSE OUTPUT';
    this.outputDevice.textContent = state.outputLabel;
    this.outputSupport.textContent = state.outputError
      || (state.outputSelectionSupported
        ? 'Output selection is available in this browser.'
        : 'Using the system default. Direct output selection is unavailable here.');

    const permissionLabels = {
      unknown: 'Unknown',
      requesting: 'Requesting',
      granted: 'Granted',
      denied: 'Denied',
      unavailable: 'Unavailable',
    };
    this.diagPermission.textContent = permissionLabels[state.micPermission];
    this.diagInputDevice.textContent = inputLabel
      ? state.inputDevices.length
        ? `${inputLabel} · ${state.inputDevices.length} visible`
        : inputLabel
      : state.inputDevices.length
        ? `${state.inputDevices.length} microphone${state.inputDevices.length === 1 ? '' : 's'} visible`
        : 'Not reported';
    this.diagTrack.textContent = !state.diagnostics.trackState
      || state.diagnostics.trackState === 'inactive'
      ? 'Not active'
      : [
        state.diagnostics.trackState,
        typeof state.diagnostics.trackMuted === 'boolean'
          ? state.diagnostics.trackMuted ? 'source muted' : 'source flowing'
          : '',
        typeof state.diagnostics.trackEnabled === 'boolean'
          ? state.diagnostics.trackEnabled ? 'track enabled' : 'track disabled'
          : '',
        state.diagnostics.streamActive === false ? 'stream inactive' : '',
      ].filter(Boolean).join(' · ');
    const channels = state.diagnostics.inputChannelCount;
    const inputRate = state.diagnostics.inputSampleRate;
    const sampleSize = state.diagnostics.inputSampleSize;
    this.diagInputFormat.textContent = channels || inputRate || sampleSize
      ? [
        channels ? `${channels} ch` : 'channels unknown',
        inputRate ? `${inputRate} Hz` : 'rate unknown',
        sampleSize ? `${sampleSize}-bit` : '',
      ].filter(Boolean).join(' · ')
      : 'Not active';
    const processing = [
      this.formatToggle('Echo', state.diagnostics.echoCancellation),
      this.formatToggle('Noise', state.diagnostics.noiseSuppression),
      this.formatToggle('AGC', state.diagnostics.autoGainControl),
      this.formatToggle('Voice isolation', state.diagnostics.voiceIsolation),
    ].filter(Boolean);
    this.diagProcessing.textContent = processing.join(' · ') || 'Not reported';
    const inputDetails = [
      state.diagnostics.inputLatency != null
        ? `${(state.diagnostics.inputLatency * 1000).toFixed(1)} ms target`
        : '',
      state.diagnostics.inputVolume != null
        ? `${Math.round(state.diagnostics.inputVolume * 100)}% source volume`
        : '',
    ].filter(Boolean);
    this.diagInputLatency.textContent = inputDetails.join(' · ') || 'Not reported';
    this.diagRequest.textContent = this.formatRequestedCapture(
      state.diagnostics.constraints,
    );
    this.diagCapabilities.textContent = this.formatCapabilities(
      state.diagnostics.capabilities,
    );
    this.diagContext.textContent = state.diagnostics.contextSampleRate
      ? `${state.diagnostics.contextSampleRate} Hz · ${state.diagnostics.contextState}`
      : state.diagnostics.contextState;
    const outputChannels = state.diagnostics.outputChannelCount;
    const maxOutputChannels = state.diagnostics.maxOutputChannelCount;
    this.diagOutputChannels.textContent = outputChannels || maxOutputChannels
      ? `${outputChannels || '?'} current · ${maxOutputChannels || '?'} max`
      : 'Not active';
    const latencies = [
      state.diagnostics.baseLatency != null
        ? `${(state.diagnostics.baseLatency * 1000).toFixed(1)} ms base`
        : '',
      state.diagnostics.outputLatency != null
        ? `${(state.diagnostics.outputLatency * 1000).toFixed(1)} ms output`
        : '',
    ].filter(Boolean);
    this.diagLatency.textContent = latencies.join(' · ') || 'Unavailable';
    const inputGroupId = state.diagnostics.inputGroupId
      || selectedDevice?.groupId
      || '';
    this.diagPairing.textContent = inputGroupId && state.outputGroupId
      ? inputGroupId === state.outputGroupId
        ? 'Same physical device group'
        : 'Separate device groups'
      : 'Not reported by this browser';
    this.diagApiSupport.textContent = [
      state.diagnostics.secureContext === true
        ? 'Secure context'
        : state.diagnostics.secureContext === false
          ? 'Insecure context'
          : 'Context security unknown',
      state.diagnostics.mediaDevicesSupported ? 'Capture' : 'No capture',
      Object.keys(state.diagnostics.supportedConstraints || {}).length
        ? 'Track constraints'
        : '',
      state.diagnostics.deviceChangeSupported ? 'Hot-plug events' : '',
      state.outputSelectionSupported ? 'Output routing' : '',
    ].filter(Boolean).join(' · ');
    this.diagMode.textContent = state.transitioning
      ? `Switching to ${state.desiredMode === 'mic' ? 'headset' : 'audio'}`
      : state.activeMode === 'mic'
        ? 'Headset mode'
        : state.activeMode === 'music' ? 'Audio mode' : 'Not running';

    this.loopbackVolume.value = state.loopbackVolume;
    this.loopbackValue.value = `${state.loopbackVolume}%`;
    this.ambientVolume.value = state.ambientVolume;
    this.ambientValue.value = `${state.ambientVolume}%`;
    this.muteMic.classList.toggle('active', state.micMuted);
    this.muteMic.setAttribute('aria-pressed', String(state.micMuted));
    this.muteMic.textContent = state.micMuted ? 'UNMUTE MIC' : 'MUTE MIC';
    if (state.activeMode !== 'mic') this.setClipping(false);
  }

  formatToggle(label, value) {
    if (typeof value !== 'boolean') return '';
    return `${label} ${value ? 'on' : 'off'}`;
  }

  constraintValue(value) {
    if (value == null) return null;
    if (typeof value !== 'object') return value;
    return value.exact ?? value.ideal ?? null;
  }

  formatRequestedCapture(constraints = {}) {
    const channelCount = this.constraintValue(constraints.channelCount);
    const values = [
      channelCount != null ? `${channelCount} ch` : '',
      this.formatToggle('Echo', this.constraintValue(constraints.echoCancellation)),
      this.formatToggle('Noise', this.constraintValue(constraints.noiseSuppression)),
      this.formatToggle('AGC', this.constraintValue(constraints.autoGainControl)),
    ].filter(Boolean);
    return values.join(' · ') || 'Not active';
  }

  formatCapabilityRange(range, formatter) {
    if (range == null) return '';
    if (Array.isArray(range)) {
      return range.length ? range.map(formatter).join('/') : '';
    }
    if (typeof range === 'object') {
      if (range.min == null && range.max == null) return '';
      const minimum = range.min ?? range.max;
      const maximum = range.max ?? range.min;
      if (minimum === maximum) return formatter(minimum);
      return `${formatter(minimum)}–${formatter(maximum)}`;
    }
    return formatter(range);
  }

  formatCapabilities(capabilities = {}) {
    const values = [
      this.formatCapabilityRange(
        capabilities.channelCount,
        value => `${value} ch`,
      ),
      this.formatCapabilityRange(
        capabilities.sampleRate,
        value => `${Math.round(value / 100) / 10} kHz`,
      ),
      this.formatCapabilityRange(
        capabilities.sampleSize,
        value => `${value}-bit`,
      ),
      this.formatCapabilityRange(
        capabilities.latency,
        value => `${(value * 1000).toFixed(1)} ms`,
      ),
    ].filter(Boolean);
    return values.join(' · ') || 'Not reported';
  }

  setClipping(clipping) {
    this.clipIndicator.classList.toggle('clipping', clipping);
    this.clipIndicator.textContent = clipping ? 'CLIPPING' : 'PEAK OK';
  }

  startVisualization(mode, getMicMetrics) {
    this.stopVisualization();
    if (mode === 'music') this.animateMusic();
    else this.animateMeter(getMicMetrics);
  }

  stopVisualization() {
    cancelAnimationFrame(this.animationFrame);
    this.meter.style.width = '0';
    this.setClipping(false);
  }

  animateMeter(getMicMetrics) {
    const metrics = getMicMetrics();
    this.meter.style.width = `${metrics.level}%`;
    this.setClipping(metrics.clipping);
    this.animationFrame = requestAnimationFrame(
      () => this.animateMeter(getMicMetrics),
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

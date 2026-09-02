import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../audio-engine.js';
import { SessionController } from '../session-controller.js';
import { UI } from '../ui.js';

function deferred() {
  let resolve;
  const promise = new Promise(done => {
    resolve = done;
  });
  return { promise, resolve };
}

function createHarness(audioOverrides = {}) {
  const renders = [];
  const countdowns = [];
  const visualizations = [];
  const intervals = new Map();
  let nextTimer = 1;
  let now = 0;

  const ui = {
    getInterval: () => 15,
    getAmbientInMic: () => true,
    getLoopbackVolume: () => 82,
    getAmbientVolume: () => 45,
    render: (state, message) => renders.push({ state: { ...state }, message }),
    setCountdown: value => countdowns.push(value),
    startVisualization: mode => visualizations.push(mode),
    stopVisualization: () => {},
    announce: () => {},
  };
  const audio = {
    requestMicPermission: async () => true,
    startMusic: async isCurrent => isCurrent(),
    startMic: async isCurrent => isCurrent(),
    setMicAmbient: () => {},
    setLoopbackVolume: () => {},
    setAmbientVolume: () => {},
    setMicMuted: () => {},
    playChannelTest: async () => {},
    listAudioInputs: async () => [],
    onDeviceChange: () => {},
    supportsOutputSelection: () => false,
    selectOutput: async () => ({ deviceId: 'output', label: 'Headphones' }),
    getDiagnostics: () => ({
      contextState: 'not started',
      contextSampleRate: null,
      baseLatency: null,
      outputLatency: null,
      sinkId: '',
      inputLabel: '',
      inputSampleRate: null,
      inputChannelCount: null,
    }),
    stopAll: () => {},
    getMicMetrics: () => ({ level: 0, clipping: false }),
    ...audioOverrides,
  };
  const clock = {
    now: () => now,
    setInterval: callback => {
      const id = nextTimer++;
      intervals.set(id, callback);
      return id;
    },
    clearInterval: id => intervals.delete(id),
  };
  const controller = new SessionController({ audio, ui, clock });

  return {
    controller,
    renders,
    countdowns,
    visualizations,
    intervals,
    setNow: value => {
      now = value;
    },
  };
}

test('manual selection starts directly in the requested mode', async () => {
  const harness = createHarness();
  harness.controller.init();

  await harness.controller.requestMode('mic');

  const state = harness.controller.snapshot();
  assert.equal(state.running, true);
  assert.equal(state.switchingMethod, 'manual');
  assert.equal(state.activeMode, 'mic');
  assert.equal(state.transitioning, false);
  assert.equal(state.ambientInMic, true);
  assert.equal(state.micPermission, 'granted');
  assert.deepEqual(harness.visualizations, ['mic']);
  assert.equal(harness.intervals.size, 0);
});

test('initialization immediately requests and records microphone permission', async () => {
  let requests = 0;
  const harness = createHarness({
    requestMicPermission: async () => {
      requests++;
      return true;
    },
  });

  harness.controller.init();
  assert.equal(harness.controller.snapshot().micPermission, 'requesting');
  await harness.controller.permissionAttempt;

  assert.equal(requests, 1);
  assert.equal(harness.controller.snapshot().micPermission, 'granted');
});

test('initial permission denial is recorded without starting a session', async () => {
  const denied = new Error('Denied');
  denied.name = 'NotAllowedError';
  const harness = createHarness({
    requestMicPermission: async () => {
      throw denied;
    },
  });

  harness.controller.init();
  await harness.controller.permissionAttempt;

  assert.equal(harness.controller.snapshot().micPermission, 'denied');
  assert.equal(harness.controller.snapshot().running, false);
});

test('ambient music is enabled by default and follows checkbox changes', async () => {
  let requestedAmbient;
  const ambientChanges = [];
  const harness = createHarness({
    startMic: async (isCurrent, ambientEnabled) => {
      requestedAmbient = ambientEnabled;
      return isCurrent();
    },
    setMicAmbient: enabled => ambientChanges.push(enabled),
  });

  await harness.controller.requestMode('mic');
  assert.equal(requestedAmbient, true);
  assert.deepEqual(ambientChanges, [true]);

  harness.controller.setAmbientInMic(false);
  assert.equal(harness.controller.snapshot().ambientInMic, false);
  assert.deepEqual(ambientChanges, [true, false]);
});

test('permission priming releases its temporary microphone stream', async () => {
  let stopped = false;
  const engine = new AudioEngine({
    mediaDevices: {
      getUserMedia: async () => ({
        getTracks: () => [{ stop: () => { stopped = true; } }],
      }),
    },
  });

  await engine.requestMicPermission();

  assert.equal(stopped, true);
  assert.equal(engine.stream, null);
});

test('audio diagnostics report active settings, capabilities, and output capacity', () => {
  const track = {
    label: 'Bluetooth headset',
    readyState: 'live',
    enabled: true,
    muted: false,
    getSettings: () => ({
      groupId: 'headset-group',
      sampleRate: 16_000,
      sampleSize: 16,
      channelCount: 1,
      latency: 0.02,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    }),
    getCapabilities: () => ({
      channelCount: { min: 1, max: 2 },
      sampleRate: { min: 8_000, max: 48_000 },
    }),
    getConstraints: () => ({ channelCount: 1 }),
  };
  const engine = new AudioEngine({
    mediaDevices: {
      getUserMedia: () => {},
      getSupportedConstraints: () => ({ channelCount: true }),
      addEventListener: () => {},
    },
  });
  engine.stream = {
    active: true,
    getAudioTracks: () => [track],
  };
  engine.context = {
    state: 'running',
    sampleRate: 48_000,
    baseLatency: 0.01,
    outputLatency: 0.03,
    sinkId: 'output-id',
    destination: { channelCount: 2, maxChannelCount: 2 },
  };

  const diagnostics = engine.getDiagnostics();

  assert.equal(diagnostics.inputLabel, 'Bluetooth headset');
  assert.equal(diagnostics.inputSampleRate, 16_000);
  assert.equal(diagnostics.inputSampleSize, 16);
  assert.equal(diagnostics.inputLatency, 0.02);
  assert.equal(diagnostics.trackState, 'live');
  assert.equal(diagnostics.streamActive, true);
  assert.deepEqual(diagnostics.capabilities.channelCount, { min: 1, max: 2 });
  assert.equal(diagnostics.outputChannelCount, 2);
  assert.equal(diagnostics.maxOutputChannelCount, 2);
});

test('diagnostic formatters distinguish requested values and capability ranges', () => {
  const ui = Object.create(UI.prototype);

  assert.equal(
    ui.formatRequestedCapture({
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    }),
    '1 ch · Echo off · Noise off · AGC off',
  );
  assert.equal(
    ui.formatCapabilities({
      channelCount: { min: 1, max: 2 },
      sampleRate: { min: 8_000, max: 48_000 },
      sampleSize: { min: 16, max: 24 },
    }),
    '1 ch–2 ch · 8 kHz–48 kHz · 16-bit–24-bit',
  );
});

test('automatic countdown starts only after audio transition completes', async () => {
  const transition = deferred();
  const harness = createHarness({
    startMusic: async isCurrent => {
      await transition.promise;
      return isCurrent();
    },
  });
  harness.controller.setSwitchingMethod('auto');

  const request = harness.controller.requestMode('music');
  assert.equal(harness.intervals.size, 0);

  transition.resolve();
  await request;

  assert.equal(harness.controller.snapshot().activeMode, 'music');
  assert.equal(harness.intervals.size, 1);
  assert.equal(harness.countdowns.at(-1), 'Switches in 15 seconds');
});

test('stopping invalidates a pending microphone transition', async () => {
  const permission = deferred();
  let stopped = false;
  const harness = createHarness({
    startMic: async isCurrent => {
      await permission.promise;
      return isCurrent();
    },
    stopAll: () => {
      stopped = true;
    },
  });

  const request = harness.controller.requestMode('mic');
  harness.controller.stopTest();
  permission.resolve();
  await request;

  assert.equal(stopped, true);
  assert.equal(harness.controller.snapshot().running, false);
  assert.equal(harness.controller.snapshot().activeMode, null);
  assert.equal(harness.intervals.size, 0);
});

test('switching to manual clears the automatic countdown', async () => {
  const harness = createHarness();
  harness.controller.setSwitchingMethod('auto');
  await harness.controller.requestMode('music');
  assert.equal(harness.intervals.size, 1);

  harness.controller.setSwitchingMethod('manual');

  assert.equal(harness.controller.snapshot().activeMode, 'music');
  assert.equal(harness.controller.snapshot().switchingMethod, 'manual');
  assert.equal(harness.intervals.size, 0);
});

test('elapsed automatic countdown requests the opposite mode', async () => {
  const calls = [];
  const harness = createHarness({
    startMusic: async isCurrent => {
      calls.push('music');
      return isCurrent();
    },
    startMic: async isCurrent => {
      calls.push('mic');
      return isCurrent();
    },
  });
  harness.controller.setSwitchingMethod('auto');
  await harness.controller.requestMode('music');

  harness.setNow(15_000);
  const tick = [...harness.intervals.values()][0];
  tick();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(calls, ['music', 'mic']);
  assert.equal(harness.controller.snapshot().activeMode, 'mic');
});

test('changing input while mic mode is active reacquires the selected device', async () => {
  const requestedDevices = [];
  const harness = createHarness({
    startMic: async (isCurrent, _ambient, deviceId) => {
      requestedDevices.push(deviceId);
      return isCurrent();
    },
  });

  await harness.controller.requestMode('mic');
  await harness.controller.setInputDevice('bluetooth-mic');

  assert.deepEqual(requestedDevices, ['', 'bluetooth-mic']);
  assert.equal(harness.controller.snapshot().selectedInputId, 'bluetooth-mic');
  assert.equal(harness.controller.snapshot().activeMode, 'mic');
});

test('calibration controls update volume and mute state', () => {
  const loopbackValues = [];
  const ambientValues = [];
  const muteValues = [];
  const harness = createHarness({
    setLoopbackVolume: value => loopbackValues.push(value),
    setAmbientVolume: value => ambientValues.push(value),
    setMicMuted: value => muteValues.push(value),
  });

  harness.controller.setLoopbackVolume(60);
  harness.controller.setAmbientVolume(30);
  harness.controller.toggleMicMute();

  assert.deepEqual(loopbackValues, [82, 60]);
  assert.deepEqual(ambientValues, [45, 30]);
  assert.deepEqual(muteValues, [true]);
  assert.equal(harness.controller.snapshot().micMuted, true);
});

test('supported output selection records the chosen device', async () => {
  const harness = createHarness({
    supportsOutputSelection: () => true,
    selectOutput: async () => ({
      deviceId: 'speaker-id',
      groupId: 'desk-group',
      label: 'Desk speakers',
    }),
  });

  await harness.controller.chooseOutput();

  const state = harness.controller.snapshot();
  assert.equal(state.outputLabel, 'Desk speakers');
  assert.equal(state.outputGroupId, 'desk-group');
  assert.equal(state.outputError, '');
  assert.equal(state.outputSelecting, false);
});

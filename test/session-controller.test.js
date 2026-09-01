import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../audio-engine.js';
import { SessionController } from '../session-controller.js';

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
    render: (state, message) => renders.push({ state: { ...state }, message }),
    setCountdown: value => countdowns.push(value),
    startVisualization: mode => visualizations.push(mode),
    stopVisualization: () => {},
  };
  const audio = {
    requestMicPermission: async () => true,
    startMusic: async isCurrent => isCurrent(),
    startMic: async isCurrent => isCurrent(),
    setMicAmbient: () => {},
    stopAll: () => {},
    getMicLevel: () => 0,
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
  harness.controller.setSwitchingMethod('manual');

  await harness.controller.requestMode('mic');

  assert.deepEqual(
    harness.controller.snapshot(),
    {
      running: true,
      switchingMethod: 'manual',
      activeMode: 'mic',
      desiredMode: null,
      transitioning: false,
      transitionId: 1,
      remaining: 15,
      ambientInMic: true,
      micPermission: 'granted',
    },
  );
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

test('automatic countdown starts only after audio transition completes', async () => {
  const transition = deferred();
  const harness = createHarness({
    startMusic: async isCurrent => {
      await transition.promise;
      return isCurrent();
    },
  });

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
  await harness.controller.requestMode('music');

  harness.setNow(15_000);
  const tick = [...harness.intervals.values()][0];
  tick();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(calls, ['music', 'mic']);
  assert.equal(harness.controller.snapshot().activeMode, 'mic');
});

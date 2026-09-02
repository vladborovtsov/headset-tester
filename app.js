import { AudioEngine } from './audio-engine.js?v=20260902-manual-default';
import { SessionController } from './session-controller.js?v=20260902-manual-default';
import { UI } from './ui.js?v=20260902-manual-default';

const ui = new UI();
const audio = new AudioEngine();
const controller = new SessionController({ audio, ui });

ui.bind({
  start: () => controller.handleStart(),
  selectMode: mode => controller.requestMode(mode),
  setSwitchingMethod: method => controller.setSwitchingMethod(method),
  intervalChanged: () => controller.intervalChanged(),
  ambientChanged: enabled => controller.setAmbientInMic(enabled),
  inputDeviceChanged: deviceId => controller.setInputDevice(deviceId),
  chooseOutput: () => controller.chooseOutput(),
  loopbackChanged: value => controller.setLoopbackVolume(value),
  ambientVolumeChanged: value => controller.setAmbientVolume(value),
  channelTest: channel => controller.playChannelTest(channel),
  toggleMicMute: () => controller.toggleMicMute(),
});

controller.init();

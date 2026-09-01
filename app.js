import { AudioEngine } from './audio-engine.js';
import { SessionController } from './session-controller.js';
import { UI } from './ui.js';

const ui = new UI();
const audio = new AudioEngine();
const controller = new SessionController({ audio, ui });

ui.bind({
  start: () => controller.handleStart(),
  selectMode: mode => controller.requestMode(mode),
  setSwitchingMethod: method => controller.setSwitchingMethod(method),
  intervalChanged: () => controller.intervalChanged(),
  ambientChanged: enabled => controller.setAmbientInMic(enabled),
});

controller.init();

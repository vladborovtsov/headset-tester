const startButton = document.querySelector('#startButton');
const intervalSelect = document.querySelector('#interval');
const musicCard = document.querySelector('#musicCard');
const micCard = document.querySelector('#micCard');
const musicStatus = document.querySelector('#musicStatus');
const micStatus = document.querySelector('#micStatus');
const currentMode = document.querySelector('#currentMode');
const countdown = document.querySelector('#countdown');
const trackDot = document.querySelector('#trackDot');
const meter = document.querySelector('#micMeter');
const visualizer = document.querySelector('#visualizer');

let context, musicGain, stream, analyser, animationFrame, timer, musicTimer;
let running = false, mode = 'music', remaining = 15;

for (let i = 0; i < 46; i++) visualizer.append(document.createElement('i'));

function buildMusic() {
  context ||= new AudioContext();
  musicGain = context.createGain();
  musicGain.gain.value = 0.12;
  musicGain.connect(context.destination);
  // A warm, slowly shifting drone forms the bed of the generated soundscape.
  [65.41, 98, 130.81].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = index === 1 ? 'triangle' : 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.value = .045 / (index + 1);
    oscillator.connect(gain).connect(musicGain);
    oscillator.start();
  });
  const lfo = context.createOscillator();
  const lfoGain = context.createGain();
  lfo.frequency.value = .12; lfoGain.gain.value = .035;
  lfo.connect(lfoGain).connect(musicGain.gain); lfo.start();
  scheduleMelody();
}

function scheduleMelody() {
  clearTimeout(musicTimer);
  if (!running || mode !== 'music' || !context) return;
  const scale = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33];
  const frequency = scale[Math.floor(Math.random() * scale.length)];
  const now = context.currentTime;
  const note = context.createOscillator();
  const envelope = context.createGain();
  const filter = context.createBiquadFilter();
  const pan = context.createStereoPanner();
  note.type = Math.random() > .45 ? 'sine' : 'triangle';
  note.frequency.setValueAtTime(frequency, now);
  note.detune.value = (Math.random() - .5) * 12;
  filter.type = 'lowpass'; filter.frequency.value = 1400;
  pan.pan.value = Math.random() * 1.4 - .7;
  envelope.gain.setValueAtTime(0, now);
  envelope.gain.linearRampToValueAtTime(.13, now + .04);
  envelope.gain.exponentialRampToValueAtTime(.001, now + 1.8);
  note.connect(filter).connect(envelope).connect(pan).connect(musicGain);
  note.start(now); note.stop(now + 1.9);
  musicTimer = setTimeout(scheduleMelody, 360 + Math.random() * 640);
}

async function useMusic() {
  stopMic(); mode = 'music';
  if (!context) buildMusic();
  await context.resume(); musicGain.gain.setTargetAtTime(.12, context.currentTime, .2);
  updateUI(); animateMusic(); scheduleMelody();
}

async function useMic() {
  mode = 'mic';
  if (!context) buildMusic();
  musicGain.gain.setTargetAtTime(0, context.currentTime, .08);
  try {
    stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false, noiseSuppression:false, autoGainControl:false}});
    const source = context.createMediaStreamSource(stream);
    analyser = context.createAnalyser(); analyser.fftSize = 256;
    source.connect(analyser);
    // Explicitly duplicate the mono headset microphone into both output channels.
    const stereoOutput = context.createChannelMerger(2);
    source.connect(stereoOutput, 0, 0);
    source.connect(stereoOutput, 0, 1);
    stereoOutput.connect(context.destination);
    updateUI(); animateMeter();
  } catch (error) {
    stopTest();
    countdown.textContent = error.name === 'NotAllowedError' ? 'Microphone permission was not granted' : 'Microphone unavailable';
  }
}

function stopMic() { if (stream) stream.getTracks().forEach(track => track.stop()); stream = null; analyser = null; meter.style.width = '0'; }
function animateMeter() { if (!analyser) return; const data = new Uint8Array(analyser.frequencyBinCount); analyser.getByteFrequencyData(data); const level = Math.min(100, data.reduce((a,b)=>a+b,0)/data.length*1.8); meter.style.width = `${level}%`; animationFrame = requestAnimationFrame(animateMeter); }
function animateMusic() { if (!running || mode !== 'music') return; visualizer.querySelectorAll('i').forEach((bar,i)=>bar.style.height=`${18 + Math.abs(Math.sin(Date.now()/420+i*.48))*72}%`); animationFrame=requestAnimationFrame(animateMusic); }

function updateUI() {
  const isMusic = mode === 'music';
  musicCard.classList.toggle('active', isMusic); micCard.classList.toggle('active', !isMusic);
  trackDot.classList.toggle('mic', !isMusic);
  musicStatus.innerHTML = `<i></i> ${isMusic ? 'ACTIVE' : 'STANDBY'}`;
  micStatus.innerHTML = `<i></i> ${isMusic ? 'STANDBY' : 'ACTIVE'}`;
  currentMode.textContent = isMusic ? 'Audio playback' : 'Microphone loopback';
}

function resetCountdown() { remaining=Number(intervalSelect.value); countdown.textContent=`Switches in ${remaining} seconds`; }
async function switchManually(nextMode) {
  if (!running) {
    running=true; startButton.classList.add('running'); startButton.innerHTML='<span>STOP TEST</span><b>×</b>'; intervalSelect.disabled=true;
    resetCountdown(); timer=setInterval(tick,1000);
    if (nextMode === 'mic') { if (!context) buildMusic(); await context.resume(); await useMic(); }
    else await useMusic();
    return;
  }
  if (mode === nextMode) return;
  clearTimeout(musicTimer); resetCountdown();
  nextMode === 'music' ? useMusic() : useMic();
}
function tick() { remaining--; countdown.textContent=`Switches in ${remaining} second${remaining===1?'':'s'}`; if (remaining<=0) { resetCountdown(); mode === 'music' ? useMic() : useMusic(); } }
async function startTest() { running=true; remaining=Number(intervalSelect.value); startButton.classList.add('running'); startButton.innerHTML='<span>STOP TEST</span><b>×</b>'; intervalSelect.disabled=true; await useMusic(); countdown.textContent=`Switches in ${remaining} seconds`; timer=setInterval(tick,1000); }
function stopTest() { running=false; clearInterval(timer); clearTimeout(musicTimer); cancelAnimationFrame(animationFrame); stopMic(); if(musicGain&&context) musicGain.gain.setTargetAtTime(0,context.currentTime,.08); startButton.classList.remove('running'); startButton.innerHTML='<span>START TEST</span><b>→</b>'; intervalSelect.disabled=false; countdown.textContent='Test stopped'; }
startButton.addEventListener('click',()=>running?stopTest():startTest());
document.querySelector('#selectMusic').addEventListener('click',()=>switchManually('music'));
document.querySelector('#selectMic').addEventListener('click',()=>switchManually('mic'));
intervalSelect.addEventListener('change',()=>{remaining=Number(intervalSelect.value); countdown.textContent=`Switches in ${remaining} seconds`;});
const dialog=document.querySelector('#aboutDialog');
document.querySelector('#aboutButton').addEventListener('click',()=>dialog.showModal());
document.querySelector('#closeDialog').addEventListener('click',()=>dialog.close());

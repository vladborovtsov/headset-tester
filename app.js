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

let context, musicGain, stream, analyser, animationFrame, timer;
let running = false, mode = 'music', remaining = 15;

for (let i = 0; i < 46; i++) visualizer.append(document.createElement('i'));

function buildMusic() {
  context ||= new AudioContext();
  musicGain = context.createGain();
  musicGain.gain.value = 0.12;
  musicGain.connect(context.destination);
  const notes = [130.81, 164.81, 196, 246.94, 293.66];
  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = index < 2 ? 'sine' : 'triangle';
    oscillator.frequency.value = frequency / (index < 2 ? 2 : 1);
    gain.gain.value = .055 / (index + 1);
    oscillator.connect(gain).connect(musicGain);
    oscillator.start();
  });
  const lfo = context.createOscillator();
  const lfoGain = context.createGain();
  lfo.frequency.value = .12; lfoGain.gain.value = .035;
  lfo.connect(lfoGain).connect(musicGain.gain); lfo.start();
}

async function useMusic() {
  stopMic(); mode = 'music';
  if (!context) buildMusic();
  await context.resume(); musicGain.gain.setTargetAtTime(.12, context.currentTime, .2);
  updateUI(); animateMusic();
}

async function useMic() {
  mode = 'mic';
  if (!context) buildMusic();
  musicGain.gain.setTargetAtTime(0, context.currentTime, .08);
  try {
    stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false, noiseSuppression:false, autoGainControl:false}});
    const source = context.createMediaStreamSource(stream);
    analyser = context.createAnalyser(); analyser.fftSize = 256;
    source.connect(analyser); source.connect(context.destination);
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

function tick() { remaining--; countdown.textContent=`Switches in ${remaining} second${remaining===1?'':'s'}`; if (remaining<=0) { remaining=Number(intervalSelect.value); mode === 'music' ? useMic() : useMusic(); } }
async function startTest() { running=true; remaining=Number(intervalSelect.value); startButton.classList.add('running'); startButton.innerHTML='<span>STOP TEST</span><b>×</b>'; intervalSelect.disabled=true; await useMusic(); countdown.textContent=`Switches in ${remaining} seconds`; timer=setInterval(tick,1000); }
function stopTest() { running=false; clearInterval(timer); cancelAnimationFrame(animationFrame); stopMic(); if(musicGain&&context) musicGain.gain.setTargetAtTime(0,context.currentTime,.08); startButton.classList.remove('running'); startButton.innerHTML='<span>START TEST</span><b>→</b>'; intervalSelect.disabled=false; countdown.textContent='Test stopped'; }
startButton.addEventListener('click',()=>running?stopTest():startTest());
intervalSelect.addEventListener('change',()=>{remaining=Number(intervalSelect.value); countdown.textContent=`Switches in ${remaining} seconds`;});
const dialog=document.querySelector('#aboutDialog');
document.querySelector('#aboutButton').addEventListener('click',()=>dialog.showModal());
document.querySelector('#closeDialog').addEventListener('click',()=>dialog.close());

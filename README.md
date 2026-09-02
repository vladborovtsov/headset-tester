# Headset Hop

A dependency-free static website for testing the transition between Bluetooth
high-quality playback and microphone/headset mode.

**[Open the live headset tester](https://vladborovtsov.github.io/headset-tester/)**

The application uses only HTML, CSS, native JavaScript modules, and browser
APIs. It has no framework, build step, backend, remote assets, or runtime
dependencies.

## Run locally

Native JavaScript modules and microphone permissions require an HTTP origin.
From the project directory, run:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`, then connect a Bluetooth headset as both the
system input and output. The app requests microphone permission when the page
loads, then immediately releases the temporary permission stream until headset
mode is activated.

## Deploy

Upload the repository's HTML, CSS, and JavaScript files to any static host. All
URLs are relative, so the site works from either a domain root or a
subdirectory. HTTPS is required for microphone access on non-localhost hosts.

## Test

The automated tests use Node's built-in test runner and download nothing:

```sh
npm test
```

Manual mode is selected by default and lets either mode card start the test or
request the next profile transition directly. Automatic mode alternates on the
selected interval.
Audio mode plays a procedurally generated melody and beat with switchable lo-fi
and original dark DMG-era chiptune presets; headset mode
mirrors the microphone into both browser output channels. Music continues
quietly in headset mode by default and can be disabled with the **Keep music
playing** checkbox.

The expandable **Setup & calibration** panel provides:

- Microphone input selection, including live re-acquisition when changed in
  headset mode.
- Browser API support, permission, device, live track health, actual and
  requested capture settings, processing flags, capability ranges, channel
  capacity, device pairing, and latency diagnostics.
- Independent microphone loopback and headset-music volume controls.
- Left, both, and right channel tones, a microphone mute control, and a live
  clipping indicator.
- Audio output selection where the browser exposes both the output picker and
  Web Audio output routing. Other browsers continue using the system default.

Device names and routing capabilities vary by browser and operating system.
The Bluetooth-input warning is a label-based hint, so system audio settings
remain the source of truth.

The standards-backed inventory of available and unavailable browser data is in
[`docs/browser-audio-diagnostics.md`](docs/browser-audio-diagnostics.md).

> Browsers do not expose direct A2DP/HFP profile controls. Requesting the
> microphone generally causes the operating system to negotiate the headset
> profile, while releasing it allows A2DP to resume. The app duplicates
> microphone audio into left and right channels, but a Bluetooth HFP route may
> still be mono at the operating-system or headset level.

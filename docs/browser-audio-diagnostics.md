# Browser audio diagnostics

Research date: 2026-09-02

## Summary

The browser can expose substantially more information once microphone access has succeeded: the active capture configuration, the processing that the browser applied, device capability ranges, track health, device pairing hints, and more detail about the Web Audio output graph.

It cannot expose the active Bluetooth profile (A2DP versus HFP/HSP), codec, bitrate, radio strength, battery level, OS volume, or definitive end-to-end acoustic latency. That conclusion is an inference from the standardized media-capture, audio-output, and Web Audio interfaces: none defines those fields.

## Useful additions

### Active microphone configuration

`MediaStreamTrack.getSettings()` reports the configuration the browser actually selected. For an audio track this may include:

- `sampleRate`, `sampleSize`, and `channelCount`
- `latency` in seconds
- `echoCancellation`, `noiseSuppression`, and `autoGainControl`
- `deviceId` and `groupId`

The app already displays sample rate and channel count. Bit depth, input latency, and the three processing flags are the highest-value additions. Settings are target/current browser values and can differ from measured performance. [Media Capture and Streams: audio constrainable properties](https://www.w3.org/TR/mediacapture-streams/#media-track-constraints) and [settings semantics](https://www.w3.org/TR/mediacapture-streams/#settings)

`track.getConstraints()` reports the last successfully applied constraints. Showing requested values beside actual settings is useful here because the app requests a particular channel layout and processing policy, but the selected result can differ. [Constrainable interface](https://www.w3.org/TR/mediacapture-streams/#constrainable-interface)

### Microphone capabilities

`track.getCapabilities()` can report per-source ranges for `sampleRate`, `sampleSize`, `latency`, and `channelCount`, plus allowed values for echo cancellation, noise suppression, and automatic gain control. Members are optional in practice and must be feature-detected. Capability ranges also do not describe every valid combination. [MediaTrackCapabilities](https://www.w3.org/TR/mediacapture-streams/#dom-mediatrackcapabilities)

`navigator.mediaDevices.getSupportedConstraints()` reports which constraint names the browser recognizes. It does not prove that the selected microphone supports a particular value, nor that a request will succeed. [getSupportedConstraints](https://www.w3.org/TR/mediacapture-streams/#dom-mediadevices-getsupportedconstraints)

### Track and stream health

Useful live state includes:

- `track.readyState`: `live` or `ended`
- `track.enabled`: controlled by the application
- `track.muted`: controlled by the source/browser/OS
- `stream.active`
- `mute`, `unmute`, and `ended` events

`muted` can indicate a physical or OS mute, browser privacy control, interruption by another application, or another implementation-defined loss of input. A disabled or muted audio track produces silence, but the two states have different causes. [Media flow](https://www.w3.org/TR/mediacapture-streams/#media-flow) and [track lifecycle](https://www.w3.org/TR/mediacapture-streams/#life-cycle)

### Devices and likely pairing

`enumerateDevices()` yields `audioinput` and permitted `audiooutput` entries with `kind`, `label`, `deviceId`, and `groupId`. Equal non-empty `groupId` values mean the input and output belong to the same physical device, so the UI can say “paired headset output found.” It should not display raw IDs by default. [Device information](https://www.w3.org/TR/mediacapture-streams/#device-info)

Before capture permission/exposure, the browser can return only a default device with blank identifying fields. Labels are browser-provided and the specification explicitly says applications cannot assume they contain a device type or model. Device IDs are origin-scoped and can rotate; group IDs are document-scoped. [Device information exposure](https://www.w3.org/TR/mediacapture-streams/#device-information-exposure), [device ID privacy](https://www.w3.org/TR/mediacapture-streams/#dom-mediadeviceinfo-deviceid), and [label semantics](https://www.w3.org/TR/mediacapture-streams/#dom-mediadeviceinfo-label)

The `devicechange` event can update the inventory when hardware is attached, removed, or its exposure changes. Browsers may coalesce events or fuzz their timing for privacy. [Device change notification](https://www.w3.org/TR/mediacapture-streams/#device-change-notification-steps)

### Permission state

When supported, `navigator.permissions.query({ name: "microphone" })` returns `prompt`, `granted`, or `denied`. A `PermissionStatus` also emits `change`, so the diagnostic can update after permission is revoked. `granted` means a prompt is not expected; it does not guarantee capture will succeed because the device, constraints, or operating environment may still cause failure. Code should feature-detect, catch query errors, and fall back to the result of `getUserMedia()`. [Permissions API](https://www.w3.org/TR/permissions/#dom-permissions-query) and [media-capture permission integration](https://www.w3.org/TR/mediacapture-streams/#permissions-integration)

### Web Audio output graph

In addition to the context state, rate, base latency, output latency, and sink ID already collected, the app can expose:

- `audioContext.destination.channelCount` and `maxChannelCount`
- `audioContext.getOutputTimestamp()` for audio-clock/performance-clock correlation
- newer, feature-detected surfaces such as `renderQuantumSize`, `renderCapacity`, `onsinkchange`, and `onerror`

Destination channel capacity is useful context, but it is not proof that a Bluetooth link is currently using A2DP or that audible output is stereo. [AudioDestinationNode](https://www.w3.org/TR/webaudio-1.1/#AudioDestinationNode), [getOutputTimestamp](https://www.w3.org/TR/webaudio-1.1/#dom-audiocontext-getoutputtimestamp), and [AudioContext](https://www.w3.org/TR/webaudio-1.1/#AudioContext)

`baseLatency` covers processing from the destination node to the audio subsystem and excludes graph and later hardware delays. `outputLatency` is an estimate and may change when the output changes. Input `settings.latency` is also a target/estimate. Their sum must not be presented as measured round-trip latency. [baseLatency](https://www.w3.org/TR/webaudio-1.1/#dom-audiocontext-baselatency) and [outputLatency](https://www.w3.org/TR/webaudio-1.1/#dom-audiocontext-outputlatency)

Output selection remains an unevenly implemented, secure-context capability that requires permission/policy and transient user activation. Keep the current dual feature gate for `selectAudioOutput` and `AudioContext.setSinkId`. The [Audio Output Devices specification](https://www.w3.org/TR/audio-output/) defines the security model. Chrome documents `AudioContext.setSinkId()` from Chrome 110, while WebKit's Safari 18.4 announcement describes output enumeration and `HTMLMediaElement.setSinkId()` on macOS, not direct `AudioContext` routing. [Chrome documentation](https://developer.chrome.com/blog/audiocontext-setsinkid) and [WebKit Safari 18.4 notes](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)

## Recommended UI

Keep the common fields compact, with a second expandable details section:

1. **Input:** label; actual rate, bit depth, channels, and latency; EC/NS/AGC state; live/muted/enabled health.
2. **Output:** selected/default label; context rate; current/max destination channels; base/output latency; routing support.
3. **Pairing:** show whether exposed input and output group IDs indicate the same physical device.
4. **Advanced details:** capability ranges, requested constraints, supported-constraint flags, and API feature availability.

Use “Not reported by this browser” for absent values. Keep raw `deviceId` and `groupId` values hidden or truncated/copy-on-demand because they are identifiers and add fingerprinting surface.

## Local measurements

The existing analyser can compute RMS or dBFS level, peak hold, clipping count, approximate noise floor, and spectrum/dominant-frequency hints. These are measurements derived from captured samples, not hardware metadata. A true round-trip latency test would require emitting a known signal and correlating its recorded return; even then, acoustic conditions and echo cancellation can distort the result.

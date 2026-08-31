# Headset Hop

A zero-build browser app for testing the transition between Bluetooth high-quality playback and microphone/headset mode.

## Run with Docker Compose

```sh
docker compose up --build
```

Open `http://localhost:8000`. Stop the app with `Ctrl+C`, or use `docker compose down` if you started it in detached mode.

## Run without Docker

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`, connect a Bluetooth headset as both the system input and output, and press **Start test**. Microphone access requires a secure context (`localhost` or HTTPS).

> Browsers do not expose direct A2DP/HFP profile controls. Requesting the microphone generally causes the operating system to negotiate the headset profile, while releasing it allows A2DP to resume.

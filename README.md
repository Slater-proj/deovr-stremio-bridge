<div align="center">

# DeoVR ⇄ Stremio Bridge

**Browse your Stremio library from inside DeoVR — and start a film with one click.**

[![CI](https://github.com/Slater-proj/deovr-stremio-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/Slater-proj/deovr-stremio-bridge/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Slater-proj/deovr-stremio-bridge?sort=semver)](https://github.com/Slater-proj/deovr-stremio-bridge/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)
![Dependencies](https://img.shields.io/badge/dependencies-0-success)
![Platform](https://img.shields.io/badge/platform-Windows%20PCVR-0078d4)

[Download](../../releases/latest) · [Install](docs/INSTALL.md) · [Usage](docs/USAGE.md) · [Troubleshooting](docs/TROUBLESHOOTING.md) · [Français](README.fr.md)

</div>

---

A tiny local web server that sits between **DeoVR** (PC version, on Steam) and **Stremio**. DeoVR's built-in browser opens the bridge and shows a native library — tabs, thumbnails, VR flags. The bridge reads your Stremio addons, lets Stremio's own streaming server download the torrent, and feeds DeoVR a stream it can play. No Debrid account, no cloud service, no npm dependency: Node.js and ffmpeg only.

Designed on a Pimax Dream Air + RTX 4090; any PCVR headset running DeoVR for Windows should work.

> The application itself (console, loading screen, DeoVR lists) is currently in **French**, and so are the guides in `docs/`. Translations are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Features

- **Native DeoVR library** — type the bridge address in DeoVR's browser and get tabs: *En cours* (what you started), *Plus de seeds*, *Nouveautés*, one tab per Stremio catalogue, search, and a test tab. Thumbnails are 16:9 like DeoVR's own.
- **Nothing downloads while you browse.** The download starts when you pick a film, continues for 30 minutes after you leave the player (configurable), runs for several films at once and resumes instead of restarting from zero.
- **Honest loading screen** at every click: step, peers, MB received, real vs needed speed, buffer, ETA, and plain messages such as "not enough speed" or "no source". It switches to the film by itself once enough is buffered.
- **VR declared correctly** — 180° dome, 360° sphere, fisheye or MKX200, side-by-side or top-bottom, detected from the catalogue, genre and title (`LR`, `TB`, `OU` included).
- **Stable status badges** in titles: `[S12] Title`, `[EN COURS 18 % · 1,4 Mo/s]`, `[PRÊT · 8 min en tampon]`, `[BLOQUÉ · 0 pair]` — identical in the list and the film page.
- **Built to keep running**: ffmpeg is restarted at the right position if it crashes, watched segments are trimmed when the disk gets full, the Stremio cache size is checked, a clear message appears if Stremio isn't running, and `start.bat` restarts the bridge if it stops.
- **Diagnostics included**: `diagnose.bat`, `RAPPORT.bat` (a support report with secrets masked), per-click logs, a per-film summary, `/status` and `/debug/downloads`.

## How it works

```mermaid
flowchart LR
    D["DeoVR<br/>built-in browser + player"] -- "/deovr library, deeplinks" --> B(("Bridge<br/>:8080"))
    B -- "catalogues + streams" --> A["Stremio addons"]
    B -- "create / stats / feed" --> S["Stremio streaming server<br/>:11470"]
    S -- "torrent" --> P["Peers"]
    B -- "ffmpeg: loading screen, then HLS" --> D
```

1. DeoVR requests the bridge's address; the bridge answers with the library in DeoVR's JSON format.
2. On a click, the bridge asks Stremio's streaming server to start that torrent and hands DeoVR an HLS stream.
3. While data accumulates, DeoVR plays a generated loading screen; when the buffer is long enough, the same stream continues with the real film.

More detail in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Requirements

| | |
|---|---|
| OS | Windows 10/11 (the code also runs on Linux/macOS, that is what CI covers) |
| Stremio | desktop app running (streaming server on `127.0.0.1:11470`) with at least one addon |
| DeoVR | PC version (Steam) |
| Node.js | 20 or newer (CI runs the tests on Node 24 LTS) — `INSTALL.bat` installs it with winget |
| ffmpeg | recommended — `INSTALL.bat` installs it; needed for MKV, the loading screen and thumbnails |
| Stremio cache | Settings → Streaming → cache **unlimited or ≥ 20 GB** (VR films are huge) |

## Quick start

1. Download the latest zip from [Releases](../../releases/latest) and unzip it anywhere.
2. Double-click `INSTALL.bat`. It installs Node/ffmpeg if missing and asks for your Stremio e-mail and password. They are stored in `config.json`, which never leaves your PC.
3. Start Stremio, then double-click `start.bat`.
4. In DeoVR's browser, type `http://localhost:8080` (or the port in your `config.json`).

Optional: `DEMARRAGE-AUTO.bat` starts the bridge with Windows; `PARE-FEU.bat` opens the firewall if you want to reach the bridge from another device.

## What is verified, and what is not

| Covered by automated tests (CI, with mocks) | Still needs a real headset to be confirmed |
|---|---|
| library tabs and order, VR declaration, badges, search, 16:9 thumbnails | DeoVR accepting the loading-screen → film HLS switch (*Test 5 / 6* in the "Test pont" tab) |
| click ⇒ download, loading screen ⇒ film, "En cours" tab | `deovr://` links opened from DeoVR's browser (page `/t`) |
| ffmpeg crash recovery, disk trimming, cache budget, Stremio-down message | real field names of Stremio's `/settings` and `stats.json` on every Stremio version |
| films with 0 seeders never produce a fake film | accents and `·` rendering in DeoVR titles |

The real-device test protocol and how to send a useful report are in [docs/TESTING.md](docs/TESTING.md).

## Documentation

| Guide | |
|---|---|
| [Install](docs/INSTALL.md) | step by step, with and without `INSTALL.bat` |
| [Usage](docs/USAGE.md) | tabs, badges, the loading screen, search |
| [Configuration](docs/CONFIGURATION.md) | every `config.json` option (generated from the code) |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | symptoms → causes → fixes |
| [Architecture](docs/ARCHITECTURE.md) · [HTTP endpoints](docs/HTTP-ENDPOINTS.md) · [DeoVR notes](docs/DEOVR-NOTES.md) | how it is built and what DeoVR accepts |
| [Testing](docs/TESTING.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md) | for contributors |

## Development

```bash
git clone https://github.com/Slater-proj/deovr-stremio-bridge.git
cd deovr-stremio-bridge
npm test            # unit + integration tests (needs ffmpeg), mocks only, no real Stremio
npm run check       # syntax check + configuration doc up to date
npm run build       # builds dist/deovr-stremio-bridge-vX.Y.Z.zip
```

CI runs the full test suite on Windows with Node 24 (about 4 minutes), plus a parallel job that builds the release zip and checks its content. Pushing a tag `vX.Y.Z` that matches `package.json` builds the zip and publishes a GitHub Release with the matching section of the changelog.

## Legal

This project is a local tool. It **does not host, index or distribute any content** and ships no addon or source. You are responsible for what you stream and for respecting the laws and licences that apply to you. It is not affiliated with Stremio, DeoVR or any addon author.

## License

[MIT](LICENSE)

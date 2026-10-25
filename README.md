# Relay

An Electron employee workspace for demonstrating browser workflows, running reusable agents, and keeping their useful results. The sidebar contains **My agents**, **Team agents**, and **Connections**. The Admin mode is intentionally a placeholder.

This repository contains working local and separately runnable backend/worker paths. It is not a publicly deployed service. Read [capabilities and limitations](docs/CAPABILITIES.md) before using it with real accounts.

## Start on a development computer

Prerequisites: Node **24.13+**, npm, and an interactive desktop. Dependencies are pinned in `package.json` and `package-lock.json`.

```sh
npm ci
npm run browsers
npm run fixture
```

Leave the fixture running. In another terminal:

```sh
npm run dev
```

The first Electron launch may download its binary. Use the same terminal environment for subsequent commands. The development app uses Vite at `127.0.0.1:5173`; the recorder bridge uses `127.0.0.1:4319`; the fictional fixture uses `127.0.0.1:4318`.

### First real run

1. Use the seeded **Alex Morgan** identity. Open **Connections**, connect **Northstar Orders · fixture**, and sign in with any fictional email and password. Select **I've finished signing in** in Relay. The fixture accepts fictional credentials only; never enter a real password.
2. Open **Overdue orders → Edit → Edit workflow**. Back navigation preserves the draft. In **Test**, choose **Run test**.
3. Relay downloads a real XLSX file, filters overdue rows, writes a summary worksheet, and pauses. Inspect the browser and generated files, then choose **Review complete · Resume**.
4. The workflow uploads the generated workbook and collects the website's confirmation. Choose **Enable → Save and enable**.
5. **Activity** shows execution history. **Results** contains persisted records and files with workbook/CSV previews and downloads. No successful runs are pre-seeded.

Switch identities using the bottom profile menu. This is **demo identity switching, not secure authentication**. Alex and Jordan belong to Operations; Sam and Taylor belong to Customer success. Team agents use the current runner's own connections. Duplicates start as private drafts without credentials, sessions, results, run history, or API tokens.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Build Electron services and start Vite + Electron |
| `npm run build` | Production renderer and Electron bundles |
| `npm start` | Launch the built app |
| `npm run typecheck` | TypeScript checks |
| `npm test` | Service, browser, API, isolation, worker and file tests |
| `npm run test:ui` | Build and launch the real Electron UI smoke test |
| `npm run test:journey` | Real Electron run, human resume, upload, Results and workbook preview |
| `npm run seed` | Idempotent demo seeding |
| `npm run reset` | Move the explicitly selected data directory to a timestamped backup |
| `npm run fixture` | Fictional login/orders/download/upload website |
| `npm run server` | Authenticated backend API, default port 4320 |
| `npm run worker` | Shared runtime worker, hosted by default |
| `npm run runner` | Authenticated outbound local runner |
| `npm run package` | Build a platform installer into `release/` |
| `npm run package:dir` | Build an unpacked platform application |
| `npm run format` | Format source files |

Stop services with Ctrl+C. Electron closes its worker and browser contexts when quitting. Keep one execution worker per data directory/location; multiple-worker clustering is not supported.

## Data and resets

Electron uses the OS application-data directory. Node services use `Relay` under the OS application-data location. Set **`RELAY_DATA_DIR` explicitly** when you want processes to share a database or when testing; use different directories for desktop and hosted deployments.

macOS/Linux example:

```sh
export RELAY_DATA_DIR="$PWD/.relay/desktop"
```

PowerShell equivalent:

```powershell
$env:RELAY_DATA_DIR = Join-Path (Get-Location) '.relay/desktop'
```

SQLite, run files and isolated browser profiles live below this directory. `npm run reset` requires this variable and preserves the previous directory as a backup. Stop the app, API and workers before resetting. Run `npm run seed` afterward. Backups include sensitive browser sessions and must be protected like the original data.

## Recording and providers

Follow [recorder installation and pairing](docs/RECORDER.md). Recording is opt-in, limited to explicitly selected Chromium tabs, and reviewable before interpretation. Manual step authoring and deterministic event conversion work without an API key.

In **Application settings**, enter an OpenAI-compatible `/v1` endpoint, supported model identifier, and API key. The adapter calls `/chat/completions` with JSON output and validates the resulting workflow. For OpenAI, the base endpoint is `https://api.openai.com/v1`. Choose a model that supports Chat Completions and JSON object output. No provider model is silently selected and no live provider call is claimed without credentials.

Keys use Electron `safeStorage`. Linux refuses the insecure `basic_text` fallback; configure Secret Service/KWallet. Passwords, verification codes and browser cookies are never supplied to the provider. Review and redact other private values before requesting AI interpretation.

## Hosted execution and API

See [deployment and runner instructions](docs/DEPLOYMENT.md) and [authenticated API examples](docs/API.md). The backend is loopback-only by default. Hosted browser sign-in is performed explicitly on the hosted machine with `npm run seed -- connect alex`; local profiles are never uploaded.

Approved sites and API authentication requirements are configured in [config/approved-sites.json](config/approved-sites.json). Add origins there and rebuild; there is no admin configuration screen. New configuration requires corresponding seeded employee permissions. Website requests are persisted as **Pending**, without simulated approval.

## Platform notes

- **Windows:** built and tested here with Node 24.13.0. Installer is unsigned; see the test report for the actual packaging result. The data directory inherits the Windows user's filesystem permissions.
- **macOS:** configuration targets DMG. Install Node 24+, run the browser install command, and use a graphical session with Keychain available. Signing/notarization requires your own Apple credentials. Runtime and packaging have not been tested on macOS.
- **Linux:** configuration targets AppImage. Install Playwright OS libraries (`npx playwright install --with-deps chromium` on a supported distribution), a Secret Service/KWallet keyring, and an X11/Wayland display for interactive login. Headless workers can set `RELAY_HEADLESS=1`. Runtime and packaging have not been tested on Linux.

Chromium is installed into Playwright's OS cache rather than bundled in the installer. Run `npm run browsers` for the account that will execute workflows. A packaged app on another computer needs the matching Playwright browser installation; it does not assume your ordinary Chrome profile is available.

## Structure

```text
packages/desktop/              React/Mantine UI, isolated preload, Electron host
packages/recorder-extension/   Chromium Manifest V3 recorder
packages/shared-runtime/       Schemas, SQLite, permissions, runtime, results, adapters
packages/server/               Authenticated API, worker, outbound runner, fixture
config/                       Approved-site catalog
tests/                        Automated service and real-browser tests
scripts/                      Development, build, reset and visual checks
docs/                         Deployment, API, recorder, limitations and test report
```

Implementation follows the official [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security), [context-isolation guidance](https://www.electronjs.org/docs/latest/tutorial/context-isolation), [Mantine Vite setup](https://mantine.dev/guides/vite/), and [Playwright browser installation guidance](https://playwright.dev/docs/browsers). Renderer Node integration is disabled, context isolation and sandboxing are enabled, and long operations run in a worker thread.

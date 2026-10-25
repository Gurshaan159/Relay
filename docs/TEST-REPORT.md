# Verification report

Executed on **Windows 11 x64 (10.0.26200)** with **Node 24.13.0**, October 24, 2026 (America/Chicago). No macOS or Linux runtime result is claimed.

## Automated checks

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run build` | Passed; renderer and Electron service bundles produced |
| `npm test` | 15 top-level tests passed, 0 failed |
| Real Electron UI smoke | Passed: My agents, creator, Connections, Results empty state, employee switching and Admin placeholder |
| Real Electron workflow journey | Passed: app-triggered browser run, human pause/resume, upload, persisted Results and workbook preview |
| Managed recording browser | Passed: automatically loaded extension; navigation, new tabs, supported frames, select controls, sensitive-field exclusion, pause/resume, cancel confirmation, isolated ownership and authenticated intake |
| Real Electron recording journey | Passed: create → start recording → demonstrate → finish → edit → test → enable → repeat run → persisted Results |
| Packaged Windows executable UI smoke | Passed independently of the development Electron binary |
| Production dependency audit | Zero vulnerabilities in the last completed audit |

The browser test executes a real Chromium session against the local fixture. It also covers deterministic recording conversion → editable workflow → successful test → enable → another run, shared-agent connection isolation, duplication, a changed layout, and a missing page target that pauses for review. The API-account scenario rejects an invalid bearer token, verifies the fixture credential, executes HTTP extraction, keeps the token out of run history, and clears the retained secret on disconnect.

The other tests cover private employee/team boundaries, immutable shared originals, artifact authorization, result upsert history, one-time extension pairing, sensitive-event exclusion, URL/file boundaries, API authentication and idempotency, cancellation, offline local queuing/claims, restart recovery, a separately spawned hosted worker, CSV sorting/filtering/aggregation, authenticated hosted previews/downloads/exports, and HMAC webhook signatures/retries.

Hosted tests use separate local/backend SQLite directories. They assert that remote run rows and results are **not** copied into local SQLite. No live external-provider call or publicly deployed server is represented by these tests.

## Visual inspection

Inspected actual Electron screenshots of the agent list, six-stage creator, Connections, real Results and the generated workbook preview. Verified restrained spacing, readable table columns, light surfaces, labels beside primary actions, visible input focus, empty states, human-input messaging and employee navigation.

Reproducible screenshots are saved under `test-output/` by the UI scripts:

- `my-agents.png`, `create-agent.png`, `connections.png`
- `results-empty.png`, `activity-needs-input.png`
- `results-real.png`, `workbook-preview.png`

Screenshot data comes from either an explicitly empty test workspace or an actual completed fixture execution, not seeded successful runs. The preview smoke test selects the generated output by filename, so it does not depend on SQLite artifact ordering.

## Packaging

The unpacked Windows executable was built and launched successfully. NSIS installer verification is recorded in the final delivery update below. The Windows build is unsigned and uses the default Electron application icon. Signing/notarization and installed-app upgrade/uninstall behavior are not tested.

The first NSIS tool download stalled. The recovery uses official electron-builder NSIS archives, verified against the SHA-256 hashes pinned in the installed electron-builder package, with the supported `ELECTRON_BUILDER_NSIS_DIR` and `ELECTRON_BUILDER_NSIS_RESOURCES_DIR` overrides. No package source was modified to bypass verification.

## Verification limits

- The managed extension is loaded and exercised in the actual bundled Chromium. Legacy existing-browser developer installation is not tested as an employee journey and is not presented in the normal UI.
- No live model-provider credential was supplied, so provider interpretation is implemented but not live-tested.
- No real third-party account/MFA, remote display streaming, public hosting, macOS, Linux, signing or notarization test was performed.
- The build reports a renderer chunk-size warning; this does not prevent launch. Node reports its `node:sqlite` experimental API warning.
- See [CAPABILITIES.md](CAPABILITIES.md) for supported operations and explicit functional boundaries.

## Recording replacement verification

The actual Electron creation/recording journey was captured with Playwright video, including a separate video of the demonstration browser. Latest successful run evidence: `test-output/recording-journey-f2wm3F/` (screenshots, `result.json`, `app-journey.webm`, and browser video under `videos/`). The fixture spreadsheet agent also ran successfully through human review, generated workbook upload and Results preview; video: `test-output/full-agent-run.webm`.

Fixed during verification: missing optional DOM attributes interrupting event capture; nondeterministic session selection; delayed cleanup affecting a subsequent session; reopened drafts restoring already-reviewed recording steps; missing UTF-8 response encoding in the fixture. Inspected actual screenshots of the simplified recording screen, toolbar, completed run and persisted result tables. Test-driver selector mismatches were corrected without changing product behavior.

Fixture accounts were signed in using real browser forms in isolated test profiles. The recording journey used that separately prepared test connection, then signed in again in its fresh recording browser; no cookies were transferred from recording into a connection. No third-party website or real credential was used. Normal recording never captures video; the video/DevTools diagnostic flag is enabled only by the explicit test script.

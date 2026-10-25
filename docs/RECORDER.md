# Browser recording

In Create agent → Demonstrate, choose **Start recording**. Relay opens its own Chromium window and connects automatically. Sign in normally, demonstrate the task, then choose **Finish** to return to editable workflow review. No model receives the recording automatically. **Pause** suspends capture; **Cancel** asks before discarding captured actions. App controls remain available when a browser page cannot show the toolbar.

## Implementation and privacy

The browser is Playwright's full bundled Chromium (`channel: chromium`), not installed Chrome. Developer setup requires `npm run browsers`; deployments must provision the matching Playwright browser as described in README. Missing-browser/site errors offer Retry. See [official extension documentation](https://playwright.dev/docs/chrome-extensions).

Every session uses a fresh employee-scoped temporary profile. Login cookies are not borrowed or uploaded. Recording does not create a reusable connection: Connect remains an explicit separate login. Temporary profiles are removed on normal finish/cancel/shutdown. OS crashes can leave sensitive temporary profiles in application storage.

A random 256-bit capability is installed directly into the isolated extension worker over Playwright's private transport. The worker sends events to an ephemeral loopback listener requiring that capability on every request. The app renderer and page scripts never receive it. The listener closes with the session.

Capture includes completed field changes, clicks, select changes, Enter, navigation, tab identifiers, frame URLs, timestamps, roles, accessible names, labels, stable attributes and locator candidates. Navigated pages, new tabs and supported HTTP(S) frames automatically receive the extension. Only employee-approved origins are captured. Unapproved websites show “This site isn’t recorded.” Browser-internal pages, blank/srcdoc and inaccessible sandboxed frames are unsupported; use app controls and manually author these steps. Captured frame actions receive a human recommendation because runtime frame replay is not implemented.

Password, hidden, email, telephone, recognizable authentication/OTP and payment inputs are excluded before transport, with a second service-side filter. Upload events contain no local filenames or contents. URL credentials, queries and fragments are stripped. Review other business values before optional AI interpretation. This is not a general-purpose data-loss prevention system. Download notifications need review to associate them with a replayable download target. No desktop recording, Excel observation, video inference or coordinate replay is used.

Events are checkpointed to SQLite. Unexpected closure preserves actions and offers **Review saved actions** or **Retry**. Switching employees closes the previous recording browser and hides their recordings.

## Developer-only existing-browser extension

The older extension is retained for development/export testing, not offered in the normal employee flow. In Chromium's extensions page enable developer mode and load `packages/recorder-extension` (not the managed subdirectory). Obtain an expiring code through the local service's `pair` request, enter it in the popup, then explicitly add approved tabs. The development bridge on loopback port 4319 requires authenticated pairing and bearer tokens. Export recordings for import into Relay. No store-distributed existing-browser installation is implemented.

## Verification

`npx tsx --test tests/managed-recorder.test.ts` tests actual bundled Chromium capture across navigation, tabs and frames, sensitive exclusion, pause/resume, finish/cancel, employee isolation and unauthorized requests.

After `npm run build`, run `npx tsx scripts/recording-journey-test.ts` for the actual Electron creation → recording → review → test → enable → run → Results journey. Screenshots and videos are saved under `test-output/recording-journey-*`. This uses fictional fixture credentials and an isolated database. Only this explicit test sets `RELAY_TEST_CAPTURE=1` to enable video and an ephemeral loopback DevTools port for the test driver. Never use that diagnostic flag with real account data. Normal recording has neither video capture nor a DevTools endpoint.

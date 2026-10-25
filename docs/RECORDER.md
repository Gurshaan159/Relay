# Browser recorder

## Install and pair

1. Start Relay. In Chrome or Chromium, open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
2. Select `packages/recorder-extension` from this repository. Packaged builds also include a `recorder-extension` directory in their resources.
3. In Relay's creator, open **Demonstrate → Pair browser recorder**.
4. Open the extension popup, paste the one-time code, and choose **Pair with Relay**. Codes expire after five minutes. The local bridge issues a random recorder token and stores only its hash.
5. Visit the website you intend to demonstrate. Choose **Start / add this tab** and grant the requested origin permission. Only explicitly added tabs are captured. A visible badge identifies recording tabs.
6. Use **Pause / resume**, **Stop and review**, or **Cancel recording**. Stop disables capture before review. Review/redact the JSON and choose **Send reviewed recording to Relay**, or export JSON for later import.
7. Select the received recording in Relay's Demonstrate stage. Review/redact again before deterministic conversion or optional AI interpretation.

Installation is manual: Relay does not pretend it can install a Chrome extension automatically. Extension tokens are scoped to the employee who initiated pairing. Pair separately after changing demo employees; use separate browser profiles when demonstrating workflows belonging to different people.

## What is captured

Navigation, deliberate clicks, completed form changes, select changes, Enter/Escape, upload intent, tab IDs, timestamps, labels, roles, stable locator candidates and frame context. Download notifications are advisory; review and replace their manual step with a download action associated with the triggering click. Recorded uploads do not contain local filesystem paths or file contents.

Password, hidden, email and telephone fields, and fields identifiable as tokens, secrets, verification codes or payment data are excluded. URL credentials, queries and fragments are stripped on import. This deliberately loses URL parameters; restore safe variable parameters as explicit workflow inputs during review. This is not a general-purpose data-loss prevention system: review ordinary field values and page text for private information.

Restricted pages such as browser settings and extension-store pages cannot be recorded. Cross-origin frames may be inaccessible unless their origins are granted; inaccessible frames require manual authoring/handoff. New tabs must be explicitly added. No OS-wide capture, desktop Excel recording, video inference, or coordinate-based replay is implemented.

The bridge listens only on loopback by default. `/pair` requires the expiring code; `/recordings` requires the issued bearer token. Exported files and extension storage can contain demonstrated business values—keep them private.

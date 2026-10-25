# Capabilities and current boundaries

This is an implemented application, not a static mockup. It is also a demo identity environment, not a production multi-tenant deployment. The following distinctions are deliberate and observable in the code and tests.

## Working

- Electron + React/TypeScript + Vite + Mantine light employee UI; exactly three primary navigation destinations; profile switching and Admin placeholder.
- Private agents, team visibility, owner-only edits, clean duplication, sharing, pause/delete, draft autosave and a six-stage creator with back navigation.
- Deterministic recording conversion, editable ordered steps, variable inputs, human recommendations, optional validated OpenAI-compatible interpretation.
- Explicit recorder pairing, opt-in selected-tab capture, pause/stop/cancel, review/redaction, imports and exports. Password and identifiable sensitive fields are excluded.
- Genuine Playwright browser sign-in and isolated employee/location/site profile directories. API bearer/API-key storage is supported for configured approved integrations. No OAuth flow is presented.
- Navigation, semantic clicks, fill/select/allowed keys, waits, text/JSON reads, tabs, downloads, uploads, human handoff, GET/POST HTTP and simple structured filtering. Browser operations have timeouts; uncertain actions pause rather than run blind loops. The browser remains available during a human pause in a running desktop/worker process.
- Real fixture report journey: XLSX download → overdue filtering → summary worksheet → human review → upload → confirmation. CSV filtering, sorting and aggregation into XLSX/CSV are implemented.
- SQLite state, immutable run workflow/version/input snapshots, checkpoints, cancellation, restart review, fixed-interval scheduling and scoped idempotent API submissions.
- Separate API and hosted worker; explicit hosted-browser login; authenticated outbound local runner claims/checkpoints; signed completion webhooks with bounded retry state.
- Activity for progress/history, and separate Results for searchable records, readable reports, source references, collection timestamps and run IDs. XLSX/CSV previews and downloads, CSV/XLSX table exports, append/update/per-run record storage and previous-value history are implemented.
- Hosted Results are retrieved through authenticated APIs and stay in backend storage. Team sharing does not share historical results. A team runner sees only their own outputs.

## Supported with explicit constraints

- **Demo identity:** service-level ownership checks isolate app data, but the profile switch intentionally impersonates seeded employees. It cannot protect against another person with access to the same OS account or filesystem. Real authentication is not implemented.
- **Websites:** add approved origins through configuration and seed corresponding permissions. One browser account scope is supported per workflow. External identity-provider/subresource origins must be explicitly approved. There is no general unrestricted web browsing mode.
- **Human review:** Keep manual steps do not run their action after approval. A reviewer can intervene in the retained browser and then resume. After a full process restart, a browser is reconstructed at the previous navigation; ephemeral form and popup state can require manual reconstruction. No automatic replay of prior writes is attempted.
- **Schedules:** minute intervals only; missed intervals coalesce. The runner must be awake. There is no timezone/calendar editor or catch-up queue for every missed tick.
- **Workbooks:** transformation reads ordinary values from the first sheet and creates a new workbook with Records and Summary, preserving the original download. Formulas, macros, charts, pivots, drawings, validation rules, rich text, tables and conditional formatting are rejected when detected. No formula engine runs. Preview shows at most 100 records per sheet. CSV output has one data sheet, so its summary is not a separate CSV worksheet.
- **Repeated outputs:** append and dated modes retain separate run-attributed records; update mode replaces matching unique keys and records prior values in history. Dated output is identified by run/time rather than creating a separate database/table for every run. Exports include provenance and all current visible records.
- **Hosted login:** requires an interactive display on the host (or your secured remote desktop). Relay does not provide an embedded VNC or browser-streaming product. Local sessions are never copied to the host.
- **Outbound local runner:** claims/checkpoints/cancellation work; local files and structured result rows are not uploaded to the backend. Use hosted execution for remote API artifact retrieval. One agent token per runner process. Do not run multiple workers against the same local browser profile.
- **Integrations:** approved HTTP GET/POST is a working general integration path. OpenAPI adapter accepts trusted operation definitions, not arbitrary uploaded specifications. MCP provides a typed transport/allowlist interface; no MCP server discovery/install UI is implemented. SerpApi is not implemented.
- **Secrets:** desktop provider/API tokens use Electron OS encryption; hosted API secrets use a deployment-supplied AES-GCM key. Chromium manages browser cookie encryption, but the entire profile is sensitive and not independently encrypted by Relay. Linux requires a functioning keyring; Windows relies on the user's data-directory ACLs.
- **Recovery:** deterministic locator checks and bounded timeouts are implemented; automatic model-driven recovery and generalized bounded iteration are not. Conditions support simple truthiness of an earlier named output. External page text cannot introduce new executable code or tools.
- **Recorder:** installation is manual. Cross-origin/restricted frames, browser-chrome pages and desktop actions require manual steps. Tab additions are explicit. Downloads are advisory events that need review. Recorder tokens are long-lived after pairing; re-pair when changing the employee being demonstrated.
- **AI interpretation:** the adapter is implemented and schema-validated; live provider calls have not been tested without supplied credentials. It does not claim to infer actions that were never captured.
- **Scale/reliability:** one trusted company seed and one worker per location/data directory. SQLite and profile locks are not a distributed job cluster. No enterprise authentication, operational monitoring, or tenant isolation is claimed.

## Not built by design

Admin workspace, employee registration/login, fine-tuning, budgets, enterprise analytics, global model page, OS-wide recording and desktop-application automation.

See [TEST-REPORT.md](TEST-REPORT.md) for actual checks and platform coverage. macOS/Linux runtime behavior and signed distribution must be verified on those platforms before release.

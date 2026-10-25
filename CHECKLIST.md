# Relay implementation checklist

## Live presentation verification

- [ ] Fresh employee workspace: real account sign-in, record, review, test, enable, repeat run and Results
- [ ] Employee edit/duplicate/share, team access, exports, cancellation and restart recovery
- [ ] Admin teams, website approvals, requests, CSV/XLSX collections, previews, reassignment and removal
- [ ] Actual app screenshots/video, error states and model setup screens
- [ ] Repeatable demo launch and concise presenter instructions

- [x] Shared schemas, SQLite persistence, permissions and isolated results
- [x] Browser runtime, spreadsheets, checkpoints and fixture journey
- [x] Employee app, creation flow, Activity and Results
- [x] Automatically connected managed recording browser and redaction
- [x] Real Electron recording-to-results journey and captured videos
- [x] Connections, provider settings and readiness
- [x] Authenticated API, schedules and separate workers
- [x] Automated regression tests and actual Electron visual inspection
- [x] Setup, recorder, API, deployment and capability documentation
- [ ] Final Windows installer build and packaged workflow verification

Decisions: Node 24+, SQLite through node:sqlite; ExcelJS supports ordinary XLSX tables (no formula recalculation); demo identity is explicitly not authentication. Browser profiles and results are scoped to employee and location. No historical results are shared through agent sharing.

Scope boundaries and unimplemented advanced operations are listed explicitly in [docs/CAPABILITIES.md](docs/CAPABILITIES.md). Actual test evidence and untested platforms are listed in [docs/TEST-REPORT.md](docs/TEST-REPORT.md).

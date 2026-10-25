# Relay implementation checklist

- [x] Shared schemas, SQLite persistence, permissions and isolated results
- [x] Browser runtime, spreadsheets, checkpoints and fixture journey
- [x] Employee app, creation flow, Activity and Results
- [x] Recorder with explicit pairing and redaction
- [x] Connections, provider settings and readiness
- [x] Authenticated API, schedules and separate workers
- [x] Automated regression tests and actual Electron visual inspection
- [x] Setup, recorder, API, deployment and capability documentation
- [ ] Final Windows installer build and packaged workflow verification

Decisions: Node 24+, SQLite through node:sqlite; ExcelJS supports ordinary XLSX tables (no formula recalculation); demo identity is explicitly not authentication. Browser profiles and results are scoped to employee and location. No historical results are shared through agent sharing.

Scope boundaries and unimplemented advanced operations are listed explicitly in [docs/CAPABILITIES.md](docs/CAPABILITIES.md). Actual test evidence and untested platforms are listed in [docs/TEST-REPORT.md](docs/TEST-REPORT.md).

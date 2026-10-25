# Backend, hosted worker and local runner

## Single-host backend

Use Node 24.13+, a persistent local disk, and the same pinned repository/lockfile on the backend. SQLite WAL is not intended for a shared network filesystem. Run **one worker per location/data directory**.

```sh
npm ci
npm run browsers
export RELAY_DATA_DIR="$PWD/.relay/backend"
export RELAY_MASTER_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
npm run seed
npm run server
```

Persist the master key in your deployment's secret manager; do not regenerate it between restarts. It is used for AES-256-GCM encryption of hosted API credentials. Electron uses OS-backed storage instead. Browser profiles are separate sensitive Chromium directories and are not encrypted by this vault.

In another terminal, use the same backend environment:

```sh
export RELAY_DATA_DIR="$PWD/.relay/backend"
export RELAY_HEADLESS=1
npm run worker
```

The API runs independently of the desktop. The worker polls durable queued runs and schedules. Use a process supervisor to restart both after host reboot. Graceful shutdown closes browser contexts. Unexpectedly interrupted runs become **Needs input**, never Completed.

For the fixture, run `npm run fixture` on the backend too. For a real approved site, update the catalog and employee permission seed before deployment.

## Explicit hosted browser sign-in

On a machine with an interactive graphical session, using the backend data directory:

```sh
npm run seed -- connect alex
```

Sign in in the genuine website browser, complete MFA yourself, then press Enter in the terminal. This creates the **hosted** profile for Alex. For a remote Linux host, use your own secured interactive display/VNC session; Relay does not supply a hosted-browser streaming service. Do not expose that display publicly. Subsequent worker executions can be headless. Re-run sign-in if the website expires the session. The fixture itself invalidates its sessions when the fixture server restarts.

## Connect the desktop to hosted execution

1. Save a personal draft in Relay. Its Settings → Integrations section displays the provisioning command with its agent ID.
2. On the backend, run that command, for example `npm run seed -- provision alex AGENT_ID`. It creates an empty private agent and prints a scoped token once.
3. Paste the backend URL and token into the desktop's agent Integrations section. Configure the agent's execution location as **Hosted worker**.
4. Establish the required hosted connections on the backend. Test from the desktop. The workflow configuration is sent to the authenticated backend; local browser profiles are not sent.
5. Activity and Results retrieve remote metadata, records, exports and files over authenticated APIs. Hosted result rows and artifacts remain in backend storage, rather than being mirrored into local SQLite.

For an initial same-computer test, use `http://127.0.0.1:4320` and **different desktop/backend data directories**. For an actual remote deployment, use HTTPS behind a reverse proxy. Set `RELAY_BIND` and `RELAY_PORT` deliberately; the default is `127.0.0.1:4320`. Do not expose the fixture or recorder bridge publicly. API endpoints always require scoped bearer tokens, apart from the explicitly code-protected recorder pairing operation.

## Outbound local runner

The separately runnable local runner polls the backend with an integration token. No inbound laptop port is needed. For the seeded **Find order records** workflow:

1. On the backend, issue `npm run seed -- token jordan team-records`.
2. On the laptop, select the local data directory and establish Jordan's local fixture browser connection (through the app, or set `RELAY_LOCATION=local` and run `npm run seed -- connect jordan`).
3. Configure the runner:

```sh
export RELAY_DATA_DIR="$PWD/.relay/desktop"
export RELAY_BACKEND_URL="https://your-relay-host.example"
export RELAY_RUNNER_TOKEN="TOKEN_FROM_BACKEND"
export RELAY_EMPLOYEE="jordan"
npm run runner
```

The runner announces connection availability metadata, not credentials or cookies. Submit runs using the backend API. When disconnected, requests remain **Waiting for runner**. Expired in-flight leases pause for review instead of silently replaying side effects. Cancellation propagates on the next checkpoint exchange.

Use a token belonging to `RELAY_EMPLOYEE`. A runner process handles one scoped agent token. Do not run the desktop worker and separate local runner against the same browser profiles concurrently. Local-run output files remain on the laptop; this runner currently uploads progress/checkpoints, not local artifact files or table-result rows. Retrieve local artifacts through the local employee application. Hosted execution is the supported path when API callers require remotely downloadable artifacts.

## Scheduling and webhooks

Schedules are fixed intervals in minutes. The worker must be running and the computer awake. Missed intervals during sleep/closure are coalesced to one attempt on wake/start; Relay does not replay every missed interval. Scheduled agents with required inputs need a workflow that can run without interactive input. Human handoffs still pause normally. There is no cron/timezone calendar editor.

Set `RELAY_WEBHOOK_URL` and `RELAY_WEBHOOK_SECRET` on the worker to enable completion notifications for that deployment. Payloads contain run ID, agent ID and terminal state, never credentials. Verify `Relay-Signature` as HMAC-SHA256 over `Relay-Timestamp + '.' + raw_body`, enforce a timestamp tolerance, and deduplicate by `Relay-Delivery`. Delivery attempts are persisted with exponential backoff and a maximum of five attempts. The deployment-level endpoint must be trusted; redirects are rejected.

## Production boundaries

The employee identity selector is not authentication. Run the demo under one trusted OS account. Before multi-user production deployment, replace it with real authentication/identity mapping, add tenant separation and operational monitoring, harden network egress/DNS controls, and sign/notarize distributions. Existing service ownership checks, typed workflow boundaries and token scopes provide extension points; they are not a claim of production certification.

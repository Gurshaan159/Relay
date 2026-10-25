# Authenticated API

Issue tokens under Agent Settings → Integrations for a shared local data directory, or using `npm run seed -- token EMPLOYEE AGENT_ID` on the backend. Tokens are random, stored as SHA-256 digests, shown once and scoped to one employee and one agent. Revocation blocks subsequent requests. Use HTTPS for remote endpoints.

```sh
curl -X POST http://127.0.0.1:4320/agents/team-records/runs \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: orders-request-001" \
  -d '{"inputs":{}}'
```

The response is HTTP **202** with a durable run `id` immediately. The backend does not wait for browser execution. Reusing an idempotency key for the same employee/agent returns the original run instead of creating another one.

| Method and route | Behavior |
| --- | --- |
| `POST /agents/:id/runs` | Queue a run; JSON `{ "inputs": { "name": "value" } }` |
| `GET /runs/:id` | State, checkpoint, preserved workflow/version/inputs and outputs |
| `POST /runs/:id/cancel` | Cancel a queued or active run |
| `POST /runs/:id/resume` | Explicitly approve/retry the current Needs input step |
| `GET /agents/:id/results` | Current private records and previous-value history |
| `GET /agents/:id/export?format=csv` | CSV export as `{name,base64}`; use `xlsx` for Excel |
| `GET /agents/:id/workspace` | Authorized run, connection and artifact metadata |
| `GET /artifacts/:id` | Authorized binary attachment |
| `GET /artifacts/:id/content?preview=1` | CSV/XLSX preview; omit query for base64 file content |
| `PUT /agents/:id/configuration` | Owner-only validated workflow configuration, used by desktop hosting |
| `POST /runner/hello` | Scoped outbound runner connection metadata |
| `POST /runner/claim` | Claim an eligible local run and establish a lease |
| `POST /runner/checkpoint` | Persist authorized progress and observe cancellation |

```sh
curl http://127.0.0.1:4320/runs/RUN_ID -H "Authorization: Bearer YOUR_TOKEN"
curl -X POST http://127.0.0.1:4320/runs/RUN_ID/resume -H "Authorization: Bearer YOUR_TOKEN"
curl http://127.0.0.1:4320/agents/AGENT_ID/results -H "Authorization: Bearer YOUR_TOKEN"
curl http://127.0.0.1:4320/artifacts/ARTIFACT_ID -H "Authorization: Bearer YOUR_TOKEN" -o report.xlsx
```

Unauthorized requests return 401; scope violations return 403; malformed or unavailable operations return JSON `{ "error": "..." }` with a 4xx status. Requests are limited to 2 MB. Run/result/file access is checked by the service; sharing an agent does not authorize someone else to read its owner's results.

The API supports a `test: true` submission for an authorized draft. The configuration endpoint's enable action explicitly accepts an untested workflow; API clients must perform their own test/review process. No provider secret or browser profile is returned by these endpoints.

## Published models

Create a token in **Admin → Data → (model) → Use the model**. Model tokens are scoped to one model and cannot call agent routes. The desktop app serves this route on its loopback bridge while it is open:

```sh
curl -X POST http://127.0.0.1:4319/models/MODEL_ID/predict \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"inputs":"Where is my parcel?"}'
```

The response is `{ "label": "...", "score": 0.91, "model": "MODEL_ID", "revision": "..." }`. Unpublished models return 400.


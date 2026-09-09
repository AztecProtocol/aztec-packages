# ci3 server API

ci3 stores CI logs, the test cache, run metadata and build artifacts through the HTTP API below. It knows
nothing about what sits behind it. Two implementations exist:

- `ci3/ci3_server --backend file`: the file-backed reference implementation. A local run starts it
  on demand (`http://localhost:4275`, files under `/tmp/ci3`). Put it behind a tunnel (ngrok etc.)
  and set `CI3_PUBLIC_URL` to share links.
- `ci3/ci3_server --backend compat`: transitional. Forwards to the redis and S3 stores the pre-API
  ci3 wrote to directly, with the key shapes the labs dashboard reads, so CI keeps its logs and test
  cache before that dashboard speaks the API. `bootstrap_ec2` starts it on the build instance when no
  `CI3_SERVER_URL` is configured; it is the implementation to upstream into the dashboard.
- The labs CI dashboard (`ci.aztec-labs.com`, in the aztec-node repository): the production
  implementation once it serves this API; then `CI3_SERVER_URL` points at it.

Every ci3 script reaches the server only through the `ci3/ci3_client_*` scripts, so a new backend
needs to implement exactly this document.

## Client configuration

| Variable | Meaning |
|---|---|
| `CI3_SERVER_URL` | Base URL of the server. Unset in a local run: `ci3_server` is started on localhost. Unset in CI (`CI=1`): the compat server if `CI3_SERVER_BACKEND=compat`, else no server and the run proceeds with no logs and no test cache. |
| `CI3_SERVER_BACKEND` | Which `ci3_server` backend a CI run (`CI=1`) starts on demand when no URL is configured: unset means no server, `compat` the compat backend. A local run (`CI=0`) always starts the file backend. The compat backend reads `CI3_COMPAT_REDIS_HOST`, `CI3_COMPAT_REDIS_PORT`, `CI3_COMPAT_S3_LOGS`, `CI3_COMPAT_S3_CACHE`, and `CI3_COMPAT_PUBLIC_URL` becomes the link base. |
| `CI3_SERVER_LOCAL` | Set to `1` by the client when it started the server on demand. Such a server exists only on this machine: `bootstrap_ec2` never forwards it to a build instance. |
| `CI3_LOG_EXPIRE`, `CI3_ARTIFACT_EXPIRE` | The `ttl` the clients ask for: logs 14 days in CI and 2 days locally, artifacts 7 days (so a local file server does not grow without bound; a CI backend may ignore it). |
| `CI3_SERVER_TOKEN` | Sent on every request as `Authorization: Bearer <token>`. Servers require it for writes and may allow anonymous reads. |
| `CI3_PUBLIC_URL` | Base of the URLs printed in terminal links (default `CI3_SERVER_URL`). |
| `CI3_LOCAL_DIR`, `CI3_LOCAL_PORT` | Storage directory and port of the on-demand local `ci3_server` (`/tmp/ci3`, `4275`). |

The client probes `GET /health` once per process tree and exports `CI3_SERVER_AVAILABLE=0|1`; every
`ci3_client_*` script is a no-op (draining stdin, returning empty results) when it is `0`.

## Conventions

- Ids, keys and names are `/`-separated paths whose segments match `[A-Za-z0-9._:+@=,-]+`; `.` and
  `..` segments are rejected (400), as are names ending in `.expires`, `.json` or `.jsonl` (the
  reference server's own files).
- `?ttl=<seconds>` on a write lets the server delete the entry after that long. Without it the
  server applies its own retention.
- Bodies are raw bytes. A write with `Content-Encoding: gzip` carries a gzipped body; the server
  stores the decompressed content.
- Writes answer 2xx. Reads answer 200 with the content, 404 when absent. 401 for a missing or wrong
  token, 400 for a bad path, 405 for an unsupported method.
- `GET /health` answers 200 with the body `ci3-server` (the probe checks the body, so a stale
  unrelated service on the port is not mistaken for a server). The reference server also returns an
  `X-CI3-Server` header naming its backend, storage and whether writes take a token, so a second
  `ci3_server start` with a different configuration refuses to reuse it.

## Logs

| | |
|---|---|
| `PUT /logs/<id>?ttl=&final=0\|1` | Body: the log text. Replaces any previous content. A running job re-PUTs its log every few seconds, so live logs are visible while it runs; its last write carries `final=1`, which a server may persist more durably (the compat server copies only final logs to S3). |
| `GET /logs/<id>` | `text/plain`. |
| `GET /logs/<prefix>/` | The ids directly under `<prefix>`, one per line (e.g. a run's `test-timings/<run id>/`). |
| `GET /<id>` | Browse URL: the human view of a log. This is what the terminal links point at (`<CI3_PUBLIC_URL>/<id>`). Plain text at minimum. |

Ids are opaque to the server: 16-hex uuids for command and test logs, a decimal timestamp for a
CI run's top-level log, and paths such as `test-timings/<run id>/<test log id>` (per-test timing
JSONL) or `bench/bb-breakdown/<key>` (benchmark breakdowns) for data files.

## Key/value

Used for the test cache (key: hash of the full test command, value: the id of its passing log)
and for run heartbeats.

| | |
|---|---|
| `PUT /kv/<key>?ttl=` | Body: the value. |
| `GET /kv/<key>` | The value. |
| `POST /kv/mget` | Body: one key per line. Answer: one line per key, in order, empty on a miss. |

## Lists

Test history and failed-test feeds: newest first, bounded.

| | |
|---|---|
| `POST /lists/<name>?max=N` | Body: one line, prepended. The server keeps at most `N` (default 1000) newest lines. |
| `GET /lists/<name>` | Newest first, one per line. |
| `GET /list/<name>` | Browse URL of a list. |

## Runs

The registry of CI runs a dashboard renders, grouped by section (`prs`, `next`, `releases`, ...).

| | |
|---|---|
| `PUT /runs/<section>/<id>` | Body: a JSON object. Replaces. `<id>` is the run's log id: a decimal millisecond timestamp, so ids sort chronologically. A section may contain `/` (a merge-train target branch); the id is always the last segment. |
| `GET /runs/<section>/<id>` | The JSON object. |
| `GET /runs/<section>` | JSON array of the newest 1000 objects, newest first. |

## Events

Fire-and-forget notifications (`ci:test:started`, `ci:test:passed`, `ci:test:failed`,
`ci:test:flaked`). A server may fan them out or discard them.

| | |
|---|---|
| `POST /events/<channel>` | Body: a JSON object. |

## Artifacts

The build cache: content-addressed tarballs.

| | |
|---|---|
| `PUT /artifacts/<name>` | Body: the bytes. A server may answer `307` with a `Location` to upload to directly (a presigned S3 URL); the client follows and re-sends the body there. |
| `GET /artifacts/<name>` | The bytes, or a `302` to a download URL. |
| `HEAD /artifacts/<name>` | 200 or 404 (redirects followed). |

Artifact reads fall back to the public build cache (`build-cache.aztec-labs.com`, plain HTTP) on a
miss, so a server only has to serve what was uploaded to it. ci3 never writes to S3 itself.

A local run uploads every artifact it builds to its file server (`NO_CACHE_UPLOAD=1` skips the tar
and upload), which is what makes switching back to a branch a cache hit.

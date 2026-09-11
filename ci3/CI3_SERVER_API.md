# ci3 server API

ci3 stores CI logs, the test cache, run metadata and build artifacts through the HTTP API below. It knows
nothing about what sits behind it. Two implementations exist:

- `ci3/ci3_server`: the file-backed reference implementation, what a local run uses
  (`http://localhost:4275`, files under `/tmp/ci3`).
- The deployed CI dashboard (`http://ci.aztec-labs.com`): the production implementation,
  behind its basic auth (user `aztec`). Its implementation belongs to the aztec-node repository.

Every ci3 script reaches the server only through `ci3/ci3_client <command>` (python, stdlib only),
so a new backend needs to implement exactly this document.

The full build (`./bootstrap.sh ci-full`, which runs `make full`) also builds and tests the
`labs/` submodule. Its own `ci3` still uses Redis and S3 directly, so the build instance still
passes `CI_REDIS` for labs. Migrating those scripts belongs in aztec-node; this client's tests
use the file-backed reference server and require neither service.

## Client configuration

Configuration uses environment variables only:

| Variable | Meaning |
|---|---|
| `CI3_SERVER` | Server URL. Unset outside CI: try `http://localhost:4275`. Explicitly empty outside CI: disable logs and test caching. |
| `CI3_PASSWORD` | The dashboard's basic-auth password (user `aztec`). |
| `CI3_PUBLIC_URL` | Link base, if different from `CI3_SERVER` (for example, a tunnel). |

Local `bootstrap.sh` starts the file-backed server when `CI3_SERVER` is unset. Other commands try
the default local endpoint and print setup instructions if it is unavailable. An explicitly selected
endpoint must be reachable and accept the supplied credentials; it never silently falls back.

```bash
ci3/ci3_server start
export CI3_SERVER=http://localhost:4275

# Or select production:
export CI3_SERVER=http://ci.aztec-labs.com
export CI3_PASSWORD='<dashboard password>'
ci3/ci3_client check
```

CI (`CI=1` or `CI=true`) requires the production URL and password. The runner, build instance,
bootstrap and post-actions check the API before proceeding. The check verifies the service identity
and an authenticated API request; missing settings, failed authentication and unavailable services
are errors. `ci-*` bootstrap commands select CI mode before this check.

`ci3_client env` exports the resolved endpoint and an internal check fingerprint to child processes.
Changing the endpoint or password forces another check. With local logging disabled, writes drain
stdin and do nothing; reads report a miss. Retention is fixed by the client: logs 14 days in CI and
2 days locally, artifacts 7 days (a CI backend may ignore it).

## Conventions

- Ids, keys and names are `/`-separated paths whose segments match `[A-Za-z0-9._:+@=,-]+`; `.` and
  `..` segments are rejected (400), as are names ending in `.expires`, `.json` or `.jsonl` (the
  reference server's own files).
- `?ttl=<seconds>` on a write lets the server delete the entry after that long. Without it the
  server applies its own retention.
- Bodies are raw bytes. A write with `Content-Encoding: gzip` carries a gzipped body; the server
  stores the decompressed content.
- Writes answer 2xx. Reads answer 200 with the content, 404 when absent. 400 for a bad path, 405 for
  an unsupported method, 411 for a body without a Content-Length.
- `GET /health` answers 200 with the body `ci3-server` (the probe checks the body, so a stale
  unrelated service on the port is not mistaken for a server). The reference servers also return an
  `X-CI3-Server` header naming their configuration, so a second `start` with a different one refuses
  to reuse them.
- Authentication: the reference servers take none (a local server is not exposed). The aztec server
  takes HTTP basic auth (`aztec:<password>`), supplied through `CI3_PASSWORD`.

## Logs

| | |
|---|---|
| `PUT /logs/<id>?ttl=&final=0\|1` | Body: the log text. Replaces any previous content. A running job re-PUTs its log every few seconds, so live logs are visible while it runs; its last write carries `final=1`, which a server may persist more durably. |
| `GET /logs/<id>` | `text/plain`. |
| `GET /logs/<prefix>/` | The ids directly under `<prefix>`, one per line (e.g. a run's `test-timings/<run id>/`). Meant for a run's own files: a server may list only persisted logs and cap the listing (the dashboard: 10000). |
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
| `PUT /runs/<section>/<id>` | Body: a JSON object with string `status`, `msg`, `name`, `author` and a numeric `timestamp` equal to `<id>`; a server may reject anything else (400). Replaces. `<id>` is the run's log id: decimal digits (a millisecond timestamp plus a random suffix), so ids sort chronologically. A section may contain `/` (a merge-train target branch); the id is always the last segment. |
| `GET /runs/<section>/<id>` | The JSON object. |
| `GET /runs/<section>` | JSON array of the newest 1000 objects, newest first. |

## Artifacts

The build cache: content-addressed tarballs.

| | |
|---|---|
| `PUT /artifacts/<name>` | Body: the bytes, never content-encoded (a tarball is already compressed). A server may answer `307` with a `Location` to upload to directly; the client follows and re-sends the body there. |
| `GET /artifacts/<name>` | The bytes, or a `302` to a download URL. |
| `HEAD /artifacts/<name>` | 200 or 404 (redirects followed). |

Build-cache reads fall back to the public HTTPS endpoint (`https://build-cache.aztec-labs.com`) on a
miss, so a server only has to serve what was uploaded to it. The npm publish job reads its release
artifact from the public HTTPS cache after verifying the production API, preserving secure downloads.

A local run uploads every artifact it builds to its file server (`NO_CACHE_UPLOAD=1` skips the tar
and upload), which is what makes switching back to a branch a cache hit.

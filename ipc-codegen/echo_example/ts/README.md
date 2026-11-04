# TypeScript Echo Example

Build from this directory:

```sh
./bootstrap.sh
```

The package consumes `@aztec-foundation/ipc-runtime` via a repo-relative `file:`
dependency. Build ipc-runtime first (`cd ../../../ipc-runtime && ./bootstrap.sh`).
This bootstrap links its `ts/dest` via `file:` and does not build it. The
bootstrap runs `npm install` (needs network) and type-checks with
`tsc --noEmit`; the scripts run through `tsx`.

Run locally:

```sh
node_modules/.bin/tsx src/echo_server.ts --socket /tmp/echo.sock
node_modules/.bin/tsx src/echo_client.ts --socket /tmp/echo.sock
```

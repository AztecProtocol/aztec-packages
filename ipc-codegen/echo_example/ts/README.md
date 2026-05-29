# TypeScript Echo Example

Build from this directory:

```sh
./bootstrap.sh
```

The package consumes `@aztec/ipc-runtime` via a repo-relative `file:`
dependency. The bootstrap builds `ipc-runtime/ts` before installing this
example so the file-linked package contains compiled output.

Run locally:

```sh
node_modules/.bin/tsx echo_server.ts --socket /tmp/echo.sock
node_modules/.bin/tsx echo_client.ts --socket /tmp/echo.sock
```

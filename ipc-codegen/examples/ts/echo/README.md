# TypeScript Echo Example

Build from this directory:

```sh
../../echo-schema/generate.sh
(cd ../../../../ipc-runtime && ./bootstrap.sh)
(cd ../../../../ipc-runtime/ts && yarn install --immutable && yarn build)
npm install --no-package-lock
```

The package consumes `@aztec/ipc-runtime` via a repo-relative `file:`
dependency, so build `ipc-runtime/ts` before installing this example.

Run locally:

```sh
node_modules/.bin/tsx echo_server.ts --socket /tmp/echo.sock
node_modules/.bin/tsx echo_client.ts --socket /tmp/echo.sock
```

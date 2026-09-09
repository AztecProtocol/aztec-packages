# @aztec/echo-ipc

Generated TypeScript package for the Echo service: the typed API
(`AsyncApi`/`SyncApi`, one method per command) over whichever backend reaches
the service on the current host.

```ts
import { EchoService } from '@aztec/echo-ipc';

const service = await EchoService.create();
try {
  const response = await service.bytes({ data: new Uint8Array([1, 2, 3]) });
} finally {
  await service.destroy();
}
```

`create` picks the process when the binary resolves. `options.backend` forces one, with no fallback:

- `'process'`: spawns the `echo_server` binary (node) and talks to it over uds or shm. The binary is resolved from `ECHO_SERVER_PATH`, an explicit `process.binaryPath`, or the installed arch package (one of this package's optional dependencies).
- an object: anything with `call(bytes)`/`destroy()`, for a transport of your own (a bridge to a natively linked library, for instance).

`threads` sets the service's parallelism for any backend
(the process reads it from `HARDWARE_CONCURRENCY`/`RAYON_NUM_THREADS`). `EchoServiceSync.create` is the synchronous form (shared memory for a process).
`createBackend`/`createBackendSync` expose the same policy for code that wraps
the generated API itself.

## Entries per host

The package resolves to a different entry per host through export conditions:
node (`default`) has every backend above; browsers have no backend of their own (this service has no wasm module); React Native (`react-native`) has no built-in backend, because Hermes has no WebAssembly or workers — a native backend package registers one with `registerBackend`, or the app passes `options.backend`.

## Build

The package shell (package.json, tsconfig, `src/*.ts`, scripts/) is
generated; build through the owning project's `./bootstrap.sh`, which
regenerates and then runs `npm install --omit=optional && npm run build`.

To prepare per-architecture binary packages:

```sh
npm run prepare_arch_packages -- linux-x64=/path/to/echo_server
```

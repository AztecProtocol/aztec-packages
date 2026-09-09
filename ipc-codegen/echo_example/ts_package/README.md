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

`create` picks the process when the binary resolves, otherwise the wasm module. `options.backend` forces one, with no fallback:

- `'process'`: spawns the `echo_server` binary (node) and talks to it over uds or shm. The binary is resolved from `ECHO_SERVER_PATH`, an explicit `process.binaryPath`, or the installed arch package (one of this package's optional dependencies).
- `'wasm'`: runs the service's wasm module in-process (node and browsers) through `@aztec-foundation/ipc-runtime/wasm`: the main instance in a worker, wasi threads on further workers where a shared memory is available (node, or a browser page served with COOP/COEP headers), otherwise the single-thread module. The worker scripts and the module are referenced with `new URL(..., import.meta.url)`, so bundlers emit them as chunks and assets of the application (Vite users: exclude the package from `optimizeDeps`).
- an object: anything with `call(bytes)`/`destroy()`, for a transport of your own (a bridge to a natively linked library, for instance).

`threads` sets the service's parallelism for any backend
(a process reads it from `HARDWARE_CONCURRENCY`/`RAYON_NUM_THREADS`; wasm runs that many
worker threads, and asking for more than one where no shared memory exists is an error rather than
a silent downgrade). `EchoServiceSync.create` is the synchronous form (shared memory for a process, else the single-threaded wasm module on the calling thread).
`createBackend`/`createBackendSync` expose the same policy for code that wraps
the generated API itself.

## Which thread the work runs on

The caller chooses. An asynchronous wasm backend runs the module in a worker by
default, so a long call never blocks the caller; `{ wasm: { worker: false } }`
runs it on the calling thread instead, blocking until it returns. The
synchronous backend always runs on the calling thread, which is what short work
such as hashing wants, including on a browser's main thread. A spawned process
is off the caller's thread either way.

## Entries per host

The package resolves to a different entry per host through export conditions:
node (`default`) has every backend above; browsers (`browser`) have the wasm module only; React Native (`react-native`) has no built-in backend, because Hermes has no WebAssembly or workers — a native backend package registers one with `registerBackend`, or the app passes `options.backend`.

## Build

The package shell (package.json, tsconfig, `src/*.ts`, scripts/) is
generated; build through the owning project's `./bootstrap.sh`, which
regenerates and then runs `npm install --omit=optional && npm run build`.

To prepare per-architecture binary packages:

```sh
npm run prepare_arch_packages -- linux-x64=/path/to/echo_server
```

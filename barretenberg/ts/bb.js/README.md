# bb.js

Prover/verifier library for barretenberg. It bundles support for the following:

- x86_64 on linux.
- aarch64 on linux.
- x86_64 on macos.
- aarch64 on macos.
- Single-threaded WASM.
- Multi-threaded WASM.

If running within node.js on a support os/architecture we will use appropriate native code.
If running within node.js on an unsupported architecture we will fallback to multi-threaded WASM.
If running within the browser and served without COOP/COEP headers, we use the single-threaded WASM.
If running within the browser served with COOP/COEP headers, we use the multi-threaded WASM.

### Installing

```
npm install @aztec-foundation/bb.js
```

or with yarn

```
yarn add @aztec-foundation/bb.js
```

### Usage

To create the API and do a blake2s hash:

```typescript
import { Crs, Barretenberg, RawBuffer } from './index.js';

const api = await Barretenberg.new({ threads: 1 });
const input = Buffer.from('hello world!');
const result = await api.blake2s(input);
await api.destroy();
```

All methods are asynchronous. If no threads are specified, will default to number of cores with a maximum of 32.
If `1` is specified, fallback to non multi-threaded wasm that doesn't need shared memory.

See `src/main.ts` for larger example of how to use.

### How bb is reached

The typed API (`Barretenberg` extends it) and every way of reaching bb come from the
`@aztec-foundation/bb.js-api` package, generated from bb's schema by ipc-codegen; bb.js adds the facades,
its `BackendType` options and CRS handling. That package ships the bb binary as per-platform optional
dependencies (override with `bbPath` or `BB_BINARY_PATH`) and bb's wasm modules (single-thread and threads
builds), run in-process through `@aztec-foundation/ipc-runtime/wasm`: the module in a worker, wasi threads
on further workers, `WebAssembly.compileStreaming` for loading (so browsers that cache compiled code start
warm on a repeat visit). Pass `wasmPath` (or set `BB_WASM_PATH` in node) to run another build of the
module, and `warmup: true` to run bb's `Warmup` command after initialization, which takes the prover's hot
loops through the engine's optimizing tier before the first real request. bb.js itself only bundles bb's
LMDB NAPI module (`findNapiBinary`).

### Browser Context

It's recommended to use a dynamic import. This allows the developer to pick the time at which the package (several MB
in size) is loaded and keeps page load times responsive.

```typescript
const { Barretenberg, RawBuffer, Crs } = await import('@aztec-foundation/bb.js');
```

The worker scripts and the wasm modules are referenced with `new URL('...', import.meta.url)` (the workers as
`new Worker(new URL(...), { type: 'module' })`), which webpack 5, Vite and similar bundlers turn into chunks and
assets of your application. Vite users should exclude `@aztec-foundation/bb.js` and `@aztec-foundation/bb.js-api`
from `optimizeDeps`, so those references are resolved from the packages rather than from a pre-bundled copy.

### Multithreading in browser

Multithreading in bb.js requires [`SharedArrayBuffer`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer) to be enabled. It is only enabled in browsers if COOP and COEP headers are set by the server. Read more [here](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements).

You can configure your server to set these headers for pages that perform proof generation. See [this example project](https://github.com/saleel/gitclaim/blob/main/app/next.config.mjs#L48-L67) that implements multi-threaded browser proving, which contains the below Next.js config:

```typescript
{
  ...
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
}
```

Note that adding COOP and COEP headers will disable loading of external scripts, which might be required by your application.

You can enable these headers for specific pages that perform proof generation, but this may be challenging, especially in single-page applications. One workaround is to move the proof generation to a separate page, load it in an invisible iframe within your main application, and then use `postMessage` to communicate between the pages for generating proofs.

## Debugging

Got an unhelpful stack trace in wasm? Point bb.js at the unstripped module the wasm build leaves next to the
stripped one:

```
BB_WASM_PATH=$(git rev-parse --show-toplevel)/barretenberg/cpp/build-wasm-threads/bin/barretenberg-debug.wasm
```

Run your test again to get a trace.

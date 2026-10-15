# bb.js

Prover/verifier library for barretenberg. It bundles support for the following:

- x86_64 on linux.
- aarch64 on linux.
- x86_64 on macos.
- aarch64 on macos.
- Single-threaded WASM.
- Multi-threaded WASM.

In node.js, `Barretenberg.new()` first tries the native backend: it spawns the platform `bb` binary and talks to it over a Unix socket. If no native `bb` is available, it falls back to multi-threaded WASM. Pass `backend` in the options to require one backend.
If running within the browser and served without COOP/COEP headers, we use the single-threaded WASM.
If running within the browser served with COOP/COEP headers, we use the multi-threaded WASM.

### Installing

```
npm install @aztec-foundation/bb.js@<version>
```

Pin a version: the npm `latest` tag can point at a nightly.

or with yarn

```
yarn add @aztec-foundation/bb.js@<version>
```

### Usage

To create the API and do a blake2s hash:

```typescript
import { Barretenberg } from '@aztec-foundation/bb.js';

const api = await Barretenberg.new({ threads: 1 });
const input = Buffer.from('hello world!');
const { hash } = await api.blake2s({ data: input });
await api.destroy();
```

All methods are asynchronous and take one command object. `threads` applies to the WASM backends only. If no threads are specified, will default to number of cores with a maximum of 32.
If `1` is specified, fallback to non multi-threaded wasm that doesn't need shared memory.

See the CLI in `src/bin/` and the tests under `src/` for larger examples.

### Browser Context

It's recommended to use a dynamic import. This allows the developer to pick the time at which the package (several MB
in size) is loaded and keeps page load times responsive.

```typescript
const { Barretenberg, Crs } = await import('@aztec-foundation/bb.js');
```

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

Got an unhelpful stack trace in wasm? Build the debug wasm and copy it over the stripped one. From `barretenberg/cpp`:

```
cmake --build --preset wasm-threads --target barretenberg-debug.wasm.gz
cp build-wasm-threads/bin/barretenberg-debug.wasm.gz ../ts/bb.js/dest/node/barretenberg_wasm/barretenberg-threads.wasm.gz
```

Run your test again to get a trace with function names. For full debug info, use the `wasm-threads-dbg` preset instead (takes more than 10 minutes).

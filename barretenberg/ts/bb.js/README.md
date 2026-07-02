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
npm install @aztec/bb.js
```

or with yarn

```
yarn add @aztec/bb.js
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

### Browser Context

It's recommended to use a dynamic import. This allows the developer to pick the time at which the package (several MB
in size) is loaded and keeps page load times responsive.

```typescript
const { Barretenberg, RawBuffer, Crs } = await import('@aztec/bb.js');
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

Got an unhelpful stack trace in wasm? Run:

```
BUILD_CPP=1 NO_STRIP=1 ./script/copy_wasm.sh
```

This will drop unstripped wasms into the dest folder. Run your test again to get a trace.

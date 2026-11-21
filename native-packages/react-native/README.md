# @aztec-foundation/react-native

Runs Aztec's client stack in a React Native app: a labs PXE or embedded wallet, bb.js (proving) and Noir
(witness generation). Hermes, React Native's JavaScript engine, has no WebAssembly and no workers, so the
package links bb and the ACVM (`@aztec-labs/acvm`, Noir's witness generation and ABI encoder) into the app as native
libraries and reaches them through JSI. The PXE's store is `@aztec-labs/kv-sqlite`, compiled into the module: the
same SQLite store the browser runs, encrypted the same way (SQLite3 Multiple Ciphers, ChaCha20).

## Requirements

- React Native 0.76 or later, with the new architecture (the default since 0.76) and Hermes.
- iOS 16.3 or later: devices, and the simulator on Apple silicon.
- Android API 24 or later: `arm64-v8a` devices and `x86_64` emulators. The module builds for 32-bit ABIs too, without
  bb and the ACVM; using them there fails.

## Setup

Install the package next to the stack's packages, all from the same release:

```sh
npm install @aztec-foundation/react-native @aztec-labs/wallets @aztec-labs/aztec.js
cd ios && pod install
```

Metro needs to resolve Node's built-in modules, which parts of the stack import, and to transform syntax React
Native's Babel preset leaves alone. In `metro.config.js`:

```js
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withAztec } = require('@aztec-foundation/react-native/metro');

module.exports = withAztec(mergeConfig(getDefaultConfig(__dirname), {}));
```

Import the package first in the app's entry file (`index.js`), before anything that uses the stack:

```js
import '@aztec-foundation/react-native';
```

That installs the native bindings and the built-ins Hermes lacks. Then use the stack as on the web:

```ts
import { createAztecNodeClient } from '@aztec-labs/aztec.js/node';
import { EmbeddedWallet } from '@aztec-labs/wallets/embedded';

const node = createAztecNodeClient('https://...');
const wallet = await EmbeddedWallet.create(node);
```

bb.js downloads the proving key material (CRS) it needs on first use and keeps it, and the PXE keeps its
databases, under the app's data directory: `<files dir>/aztec` on Android and `<Application Support>/aztec` on iOS
(`dataDirectory()` returns it).

## What is in the package

- `js/`: the entry the app imports. It calls the TurboModule's `install()`, which puts on the JavaScript runtime
  ipc-runtime's JSI binding (`__ipcRuntimeJsi`, through which bb.js, Noir's `acvm_js`/`noirc_abi` and the PXE's
  store reach their native libraries), `__aztecReactNative` (the app's files, SHA-256, UTF-8 and base64) and
  `crypto.getRandomValues`, and installs polyfills (`structuredClone`, the ES2025 `Set` methods, `TextDecoder`, ...).
- `metro/`: `withAztec`. Besides Node's built-ins, it resolves Noir's `acvm_js` and `noirc_abi` (wasm modules) to
  `js/noir/`, their API over the ACVM's service, and `hash.js`'s and `ohash`'s SHA-256 to the native one: Hermes has
  no JIT, and the PXE hashes every contract artifact and stored value.
- `cpp/`: the TurboModule (`NativeAztecReactNative`), the JSI functions, and kv-sqlite (`kv_sqlite_unit.cpp`, over
  the sources `scripts/vendor.sh` copies from `native-packages/kv-sqlite`).
- `android/`: the module's CMake build. Autolinking adds it to the app's native build as a pure C++ dependency.
- `ios/`, `AztecReactNative.podspec`: the module's pod.
- `prebuilt/`: bb (`libaztec_bb.so` on Android, a static library on iOS) and the ACVM (`libaztec_acvm.a`) for each
  platform, built by this repository's release.
- `third_party/`: SQLite3 Multiple Ciphers (its exported symbols renamed, so it links beside another SQLite),
  kv-sqlite's sources and its generated FFI, msgpack-c's headers and ipc-runtime's JSI binding.

## Development

`./bootstrap.sh` fetches `third_party/` (`scripts/vendor.sh`), builds Hermes for this machine
(`scripts/build_hermes.sh`) and the test host (`test/hermes_host.cpp`): Hermes with the module installed, as an app
has it. `./bootstrap.sh test` runs the tests in it (`scripts/run_test.sh <test>`): the module's own with kv-sqlite's,
bb.js's, and `acvm_js`'s and `noirc_abi`'s on the ACVM against Noir's own fixtures, all against this tree's builds
(`make react-native-tests` builds those first).

A release (`./bootstrap.sh release`) assembles `prebuilt/` from the Android and iOS cross builds
(`make react-native-mobile`, `scripts/build_prebuilt.sh`) and publishes the package.

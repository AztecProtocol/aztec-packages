import { Fr } from '@aztec/foundation/curves/bn254';

import { addExtension } from 'msgpackr';

// `@aztec/native/msgpack_channel` registers a msgpackr extension that packs `Fr` instances to
// their raw 32-byte buffer for the C++ world-state side to deserialize. Because `@aztec/native`
// is externalized in TXE's esbuild config (it loads a `.node` binary that can't be bundled),
// the `Fr` class the extension is keyed on belongs to the *external* `@aztec/foundation`
// module instance — a different class identity than the `Fr` bundled into the TXE worker /
// bin. msgpackr's extension match uses `instanceof`, so bundled `Fr` instances slip through
// and msgpackr falls back to `Fr.toJSON()` (returns `Fr.toString()` — a `0x...` hex string).
// The C++ side then sees a string where a 32-byte binary was expected and throws
// `msgpack::type_error` whose `what()` is literally `"std::bad_cast"`.
//
// Fix: register the same extension under the BUNDLED `Fr` class identity. msgpackr's extension
// table holds an entry per `Class`, so both Fr classes now resolve to the same `write` callback
// and produce the same wire format. Imported as a side-effect from `./index.js` so both the
// worker (via `./worker.ts`) and the main-thread RPC server (via `./rpc_server.ts`) get the
// registration before any `sendMessage` runs.
addExtension({
  Class: Fr,
  write: (fr: Fr) => fr.toBuffer(),
});

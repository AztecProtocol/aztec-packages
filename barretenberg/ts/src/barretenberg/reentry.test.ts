/**
 * Re-entry test: `Barretenberg.new` -> `destroy` -> `Barretenberg.new` again
 * inside a single Node process. Asserts the second instance is fully usable
 * by round-tripping a real wasm call (`blake2s`) and comparing the hash
 * against a known-correct constant.
 *
 * The historical bug class: under the previous wasm runtime, the pthread
 * polyfill leaked global state and the second `Barretenberg.new` would hang
 * waiting for a pool that never re-warmed, OR it would silently return a
 * broken instance whose calls produced garbage. Emscripten cleans up the
 * pool with `PThread.terminateAllThreads()` on destroy and the second
 * factory call spins up a fresh pool. We pin `backend: BackendType.Wasm`
 * so the test always exercises the wasm code path -- otherwise on a host
 * with a `bb` binary installed the default would route through the native
 * Unix-socket backend and never touch wasm.
 */

import { BackendType, Barretenberg } from './index.js';

// blake2s hash of the input below. Must match `blake2s.test.ts` (same
// input, same expected output). If barretenberg's blake2s ever changes,
// both tests should be updated in lockstep.
const BLAKE2S_INPUT = Buffer.from(
  'abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789',
);
const BLAKE2S_EXPECTED = new Uint8Array([
  0x44, 0xdd, 0xdb, 0x39, 0xbd, 0xb2, 0xaf, 0x80, 0xc1, 0x47, 0x89, 0x4c, 0x1d, 0x75, 0x6a, 0xda,
  0x3d, 0x1c, 0x2a, 0xc2, 0xb1, 0x00, 0x54, 0x1e, 0x04, 0xfe, 0x87, 0xb4, 0xa5, 0x9e, 0x12, 0x43,
]);

describe('Barretenberg re-entry after destroy', () => {
  it('a second Barretenberg.new() succeeds and the instance round-trips to wasm', async () => {
    const first = await Barretenberg.new({
      backend: BackendType.Wasm,
      threads: 2,
      skipSrsInit: true,
      logger: () => {},
    });
    expect(first).toBeDefined();

    // Sanity: the first instance answers correctly before destroy. This
    // anchors the expected-hash constant against the live build (so a
    // future change to barretenberg's blake2s surfaces as both halves of
    // the test failing in lockstep, not just the post-reentry half).
    const firstResp = await first.blake2s({ data: BLAKE2S_INPUT });
    expect(firstResp.hash).toEqual(BLAKE2S_EXPECTED);

    await first.destroy();

    const second = await Barretenberg.new({
      backend: BackendType.Wasm,
      threads: 2,
      skipSrsInit: true,
      logger: () => {},
    });
    expect(second).toBeDefined();

    // The bar for "the second instance is operational": a real wasm call
    // round-trips and produces the known-correct hash. `typeof destroy ===
    // 'function'` (the previous assertion) only proved the constructor
    // returned an object; this proves the wasm pthread pool re-initialised
    // cleanly and the message-passing path works end-to-end.
    const secondResp = await second.blake2s({ data: BLAKE2S_INPUT });
    expect(secondResp.hash).toEqual(BLAKE2S_EXPECTED);

    await second.destroy();
  }, 60_000);
});

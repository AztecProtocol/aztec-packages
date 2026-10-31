import { BbError } from '@aztec-foundation/bb.js-api';

import { BackendType, Barretenberg } from './index.js';

/**
 * A failure bb reports with BBAPI_ERROR: an off-curve point, rejected before any work is done.
 * The handler returns an error response, so the reply is an error frame on every backend.
 */
function reportedFailure(api: Barretenberg) {
  const one = new Uint8Array(32);
  one[31] = 1;
  const five = new Uint8Array(32);
  five[31] = 5;
  return api.bn254G1Mul({ point: { x: one, y: one }, scalar: five });
}

/**
 * A failure bb raises with throw_or_abort: a compressed SRS buffer that is not chunk-aligned.
 * The handler throws rather than returning; the dispatcher's catch turns it into an error response,
 * in wasm too now that it builds with exceptions.
 */
function thrownFailure(api: Barretenberg) {
  return api.srsInitSrs({ pointsBuf: new Uint8Array(32), numPoints: 1, g2Point: new Uint8Array(128) });
}

describe('command errors', () => {
  let native: Barretenberg;
  let wasm: Barretenberg;

  beforeAll(async () => {
    native = await Barretenberg.new({ backend: BackendType.NativeUnixSocket, threads: 1, skipSrsInit: true });
    wasm = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1, skipSrsInit: true });
  });

  afterAll(async () => {
    await native?.destroy();
    await wasm?.destroy();
  });

  it('reports a returned error as BbError on both backends', async () => {
    for (const api of [native, wasm]) {
      const err = await reportedFailure(api).catch(e => e);
      expect(err).toBeInstanceOf(BbError);
      expect(err.message).toMatch(/must be on the curve/);
    }
  });

  it('reports a thrown error as BbError on both backends', async () => {
    for (const api of [native, wasm]) {
      const err = await thrownFailure(api).catch(e => e);
      expect(err).toBeInstanceOf(BbError);
      expect(err.message).toMatch(/must be a positive multiple of/);
    }
  });
});

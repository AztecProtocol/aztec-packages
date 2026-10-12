import { BackendType, Barretenberg } from '../index.js';

/** Fields enough to get past bb's proof-length check, so the proof reaches the batch verifier. */
const LONG_PROOF = Array.from({ length: 20_000 }, () => new Uint8Array(32));

describe('chonkBatchVerifierVerify', () => {
  let bb: Barretenberg | undefined;

  afterEach(async () => {
    await bb?.destroy();
    bb = undefined;
  });

  it('answers each of several in-flight calls when bb runs with --reactor', async () => {
    bb = await Barretenberg.new({ backend: BackendType.NativeUnixSocket, reactor: true, skipSrsInit: true });
    // No result FIFO, so each proof is answered on its own call. No verification keys are registered either, so a
    // proof too short to be one is a verdict (invalid), while one naming a key that doesn't exist is an error.
    await bb.chonkBatchVerifierStart({ vks: [], numCores: 1, batchSize: 2, fifoPath: '' });

    const [tooShort, unknownKey, alsoTooShort] = await Promise.allSettled([
      bb.chonkBatchVerifierVerify({ vkIndex: 0, proofFields: [] }),
      bb.chonkBatchVerifierVerify({ vkIndex: 0, proofFields: LONG_PROOF }),
      bb.chonkBatchVerifierVerify({ vkIndex: 0, proofFields: [] }),
    ]);

    expect(tooShort).toEqual({ status: 'fulfilled', value: expect.objectContaining({ verified: false }) });
    expect(alsoTooShort).toEqual({ status: 'fulfilled', value: expect.objectContaining({ verified: false }) });
    expect(unknownKey.status).toBe('rejected');
    await bb.chonkBatchVerifierStop({});
  });

  it('is refused by a bb that answers each request before reading the next', async () => {
    bb = await Barretenberg.new({ backend: BackendType.NativeUnixSocket, skipSrsInit: true });
    await bb.chonkBatchVerifierStart({ vks: [], numCores: 1, batchSize: 2, fifoPath: '' });

    await expect(bb.chonkBatchVerifierVerify({ vkIndex: 0, proofFields: [] })).rejects.toThrow(/--reactor/);
    await bb.chonkBatchVerifierStop({});
  });
});

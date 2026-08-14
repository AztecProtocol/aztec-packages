import { TestCircuitVerifier } from '@aztec/bb-prover/test';

import { type RpcProofVerifierConfig, createRpcProofVerifier, usesRealProofVerifiers } from './rpc_proof_verifier.js';

describe('usesRealProofVerifiers', () => {
  it.each([
    [false, false, false],
    [true, false, true],
    [false, true, true],
    [true, true, true],
  ])('realProofs=%s debugForce=%s -> %s', (realProofs, debugForceTxProofVerification, expected) => {
    expect(usesRealProofVerifiers({ realProofs, debugForceTxProofVerification })).toBe(expected);
  });
});

describe('createRpcProofVerifier', () => {
  it('builds a test verifier when neither real proofs nor forced verification are on', async () => {
    const config: RpcProofVerifierConfig = {
      realProofs: false,
      debugForceTxProofVerification: false,
      bbBinaryPath: '',
      bbWorkingDirectory: '',
      bbSkipCleanup: false,
      numConcurrentIVCVerifiers: 1,
      bbIVCConcurrency: 1,
      bbChonkVerifyMaxBatch: 1,
      bbChonkVerifyConcurrency: 1,
      proverTestVerificationDelayMs: 0,
    };

    await expect(createRpcProofVerifier(config)).resolves.toBeInstanceOf(TestCircuitVerifier);
  });
});

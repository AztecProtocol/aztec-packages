import { BatchChonkVerifier } from '@aztec/bb-prover';
import type { IVCProofVerificationResult } from '@aztec/stdlib/interfaces/server';

/** Corrupt flat proof fields by flipping bytes in an early field element. */
export function corruptProofFields(fields: Uint8Array[]): Uint8Array[] {
  const corrupted = fields.map(f => Uint8Array.from(f));
  corrupted[2] = Uint8Array.from(corrupted[2]);
  corrupted[2][30] ^= 0xff;
  corrupted[2][31] ^= 0xff;
  return corrupted;
}

/** Create a BatchChonkVerifier, enqueue proofs, collect results, and stop. */
export async function runBatchVerifier(opts: {
  vks: Uint8Array[];
  numCores: number;
  batchSize: number;
  proofs: { vkIndex: number; proofFields: Uint8Array[] }[];
}): Promise<IVCProofVerificationResult[]> {
  const verifier = await BatchChonkVerifier.newForTesting(
    { bbChonkVerifyConcurrency: opts.numCores },
    opts.vks,
    opts.batchSize,
  );

  try {
    const promises = opts.proofs.map(p => verifier.enqueueProof(p.vkIndex, p.proofFields));
    return await Promise.all(promises);
  } finally {
    await verifier.stop();
  }
}

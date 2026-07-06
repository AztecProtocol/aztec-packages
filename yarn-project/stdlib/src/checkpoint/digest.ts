import type { Buffer32 } from '@aztec/foundation/buffer';
import type { Fr } from '@aztec/foundation/curves/bn254';

import { ConsensusPayload } from '../consensus/consensus_payload.js';
import { type CoordinationSignatureContext, getHashedSignaturePayloadTypedData } from '../consensus/signature_utils.js';
import { CheckpointHeader } from '../rollup/checkpoint_header.js';

/**
 * Computes the EIP-712 payload digest for a checkpoint proposal — the digest validators sign
 * and the L1 contract verifies during `propose()`. Mirrors `ProposeLib.digest(ProposePayload)` on L1.
 *
 * The result is the same `bytes32` that gets stored in `tempCheckpointLogs[checkpointNumber].payloadDigest`,
 * so this helper is also reused when constructing simulation state overrides for pipelined proposals.
 */
export function computeCheckpointPayloadDigest(args: {
  header: CheckpointHeader;
  archiveRoot: Fr;
  feeAssetPriceModifier: bigint;
  signatureContext: CoordinationSignatureContext;
}): Buffer32 {
  const consensusPayload = new ConsensusPayload(
    args.header,
    args.archiveRoot,
    args.feeAssetPriceModifier,
    args.signatureContext,
  );
  return getHashedSignaturePayloadTypedData(consensusPayload);
}

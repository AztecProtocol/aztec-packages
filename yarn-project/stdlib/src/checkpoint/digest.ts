import { Buffer32 } from '@aztec/foundation/buffer';
import type { Fr } from '@aztec/foundation/curves/bn254';

import { encodeCheckpointPayloadToSign } from '../p2p/consensus_payload.js';
import {
  type CoordinationSignatureContext,
  type Signable,
  getHashedSignaturePayloadTypedData,
} from '../p2p/signature_utils.js';
import type { CheckpointHeader } from '../rollup/checkpoint_header.js';

/**
 * Computes the EIP-712 payload digest for a checkpoint proposal — the digest validators sign
 * and the L1 contract verifies during `propose()`. Mirrors `ProposeLib.digest(ProposePayload)` on L1.
 *
 * The result is the same `bytes32` that gets stored in `tempCheckpointLogs[checkpointNumber].payloadDigest`,
 * so this helper is also reused when constructing simulation state overrides for pipelined proposals.
 *
 * Accepts either a validated `CheckpointHeader` (via `header`) or a raw header hash (via `headerHash`), and
 * an archive root as `Fr` or raw `Buffer32`. The raw-hash/raw-archive form lets the archiver verify the
 * digest of a malicious, possibly out-of-range, checkpoint without converting it into an `Fr`/`CheckpointHeader`.
 */
export function computeCheckpointPayloadDigest(
  args: {
    archiveRoot: Fr | Buffer32;
    feeAssetPriceModifier: bigint;
    signatureContext: CoordinationSignatureContext;
  } & ({ header: CheckpointHeader } | { headerHash: Fr }),
): Buffer32 {
  const headerHash = 'header' in args ? args.header.hash() : args.headerHash;
  const signable: Signable = {
    primaryType: 'CheckpointAttestation',
    signatureContext: args.signatureContext,
    getPayloadToSign: () => encodeCheckpointPayloadToSign(args.archiveRoot, headerHash, args.feeAssetPriceModifier),
  };
  return getHashedSignaturePayloadTypedData(signable);
}

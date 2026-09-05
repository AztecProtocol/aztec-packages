// Serde and consistency tests for the checkpoint proposal type
import { IndexWithinCheckpoint } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Signature } from '@aztec/foundation/eth-signature';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { InboxMessagePrefixRef } from '../messaging/inbox_message_prefix_ref.js';
import { CheckpointHeader } from '../rollup/checkpoint_header.js';
import { makeCheckpointProposal } from '../tests/mocks.js';
import { BlockHeader } from '../tx/block_header.js';
import { TxHash } from '../tx/tx_hash.js';
import { CheckpointProposal } from './checkpoint_proposal.js';
import { EMPTY_COORDINATION_SIGNATURE_CONTEXT } from './signature_utils.js';
import { LEGACY_CHECKPOINT_PROPOSAL_HEX } from './wire_compat_fixtures.js';

/**
 * Deterministic legacy-shaped checkpoint proposal (lastBlock without signedTxs or inboxPrefixRef) matching the golden
 * fixture in wire_compat_fixtures.ts. Constructed identically to how those bytes were captured on the pre-change code.
 */
const makeLegacyFixtureCheckpointProposal = () =>
  new CheckpointProposal(
    CheckpointHeader.empty(),
    new Fr(123n),
    0n,
    Signature.empty(),
    EMPTY_COORDINATION_SIGNATURE_CONTEXT,
    {
      blockHeader: BlockHeader.empty(),
      indexWithinCheckpoint: IndexWithinCheckpoint(4),
      txHashes: [TxHash.fromField(new Fr(7n))],
      signature: Signature.empty(),
    },
  );

describe('CheckpointProposal serialization / deserialization', () => {
  it('round-trips with a lastBlock', async () => {
    const proposal = await makeCheckpointProposal({ lastBlock: {} });
    const deserialized = CheckpointProposal.fromBuffer(proposal.toBuffer());
    // The mock supplies a BlockProposal as lastBlock while decoding rebuilds a plain CheckpointLastBlock, so compare
    // the re-serialized bytes rather than deep-equal.
    expect(deserialized.getSize()).toEqual(proposal.getSize());
    expect(deserialized.toBuffer()).toEqual(proposal.toBuffer());
  });

  describe('inbox prefix reference', () => {
    it('round-trips with a inbox prefix reference on the last block', async () => {
      const checkpointHeader = CheckpointHeader.random();
      const inboxPrefixRef = new InboxMessagePrefixRef(checkpointHeader.inboxRollingHash);
      const proposal = await makeCheckpointProposal({ checkpointHeader, lastBlock: { inboxPrefixRef } });

      const deserialized = CheckpointProposal.fromBuffer(proposal.toBuffer());

      expect(deserialized.lastBlock?.inboxPrefixRef?.equals(inboxPrefixRef)).toBe(true);
      expect(deserialized.getSize()).toEqual(proposal.getSize());
      expect(deserialized.toBuffer()).toEqual(proposal.toBuffer());
    });

    it('serializes byte-identically to the legacy format when unset', () => {
      const proposal = makeLegacyFixtureCheckpointProposal();
      expect(proposal.lastBlock?.inboxPrefixRef).toBeUndefined();
      expect(bufferToHex(proposal.toBuffer())).toEqual(LEGACY_CHECKPOINT_PROPOSAL_HEX);
    });

    it('decodes a legacy buffer (no tail) as having no inbox prefix reference', () => {
      const deserialized = CheckpointProposal.fromBuffer(hexToBuffer(LEGACY_CHECKPOINT_PROPOSAL_HEX));
      expect(deserialized.lastBlock).toBeDefined();
      expect(deserialized.lastBlock?.inboxPrefixRef).toBeUndefined();
      expect(bufferToHex(deserialized.toBuffer())).toEqual(LEGACY_CHECKPOINT_PROPOSAL_HEX);
    });

    it('carries the inbox prefix reference through getBlockProposal, covered by the block signature', async () => {
      const signer = Secp256k1Signer.random();
      const checkpointHeader = CheckpointHeader.random();
      const inboxPrefixRef = new InboxMessagePrefixRef(checkpointHeader.inboxRollingHash);
      const proposal = await makeCheckpointProposal({ signer, checkpointHeader, lastBlock: { inboxPrefixRef } });

      const blockProposal = proposal.getBlockProposal();
      expect(blockProposal?.inboxPrefixRef?.equals(inboxPrefixRef)).toBe(true);
      expect(blockProposal?.getSender()).toEqual(signer.address);
      expect(proposal.getSender()).toEqual(signer.address);
    });

    it('accepts a last-block reference whose rolling hash matches the checkpoint header', () => {
      const checkpointHeader = CheckpointHeader.random({ inboxRollingHash: new Fr(0x1234n) });
      expect(
        () =>
          new CheckpointProposal(
            checkpointHeader,
            Fr.random(),
            0n,
            Signature.empty(),
            EMPTY_COORDINATION_SIGNATURE_CONTEXT,
            {
              blockHeader: BlockHeader.empty(),
              indexWithinCheckpoint: IndexWithinCheckpoint(4),
              txHashes: [],
              signature: Signature.empty(),
              inboxPrefixRef: new InboxMessagePrefixRef(new Fr(0x1234n)),
            },
          ),
      ).not.toThrow();
    });

    it('throws when the last-block reference rolling hash does not match the checkpoint header', () => {
      const checkpointHeader = CheckpointHeader.random({ inboxRollingHash: new Fr(0x1234n) });
      expect(
        () =>
          new CheckpointProposal(
            checkpointHeader,
            Fr.random(),
            0n,
            Signature.empty(),
            EMPTY_COORDINATION_SIGNATURE_CONTEXT,
            {
              blockHeader: BlockHeader.empty(),
              indexWithinCheckpoint: IndexWithinCheckpoint(4),
              txHashes: [],
              signature: Signature.empty(),
              inboxPrefixRef: new InboxMessagePrefixRef(new Fr(0x5678n)),
            },
          ),
      ).toThrow(/inboxPrefixRef rolling hash/);
    });
  });
});

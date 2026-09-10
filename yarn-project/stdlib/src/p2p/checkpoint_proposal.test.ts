// Serde and consistency tests for the checkpoint proposal type
import { IndexWithinCheckpoint } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Signature } from '@aztec/foundation/eth-signature';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { InboxMessagePrefixRef } from '../messaging/inbox_message_prefix_ref.js';
import { CheckpointHeader } from '../rollup/checkpoint_header.js';
import { makeCheckpointProposal, mockTx } from '../tests/mocks.js';
import { BlockHeader } from '../tx/block_header.js';
import { TxHash } from '../tx/tx_hash.js';
import { BlockProposal } from './block_proposal.js';
import { CheckpointProposal } from './checkpoint_proposal.js';
import { EMPTY_COORDINATION_SIGNATURE_CONTEXT } from './signature_utils.js';
import { CHECKPOINT_PROPOSAL_HEX, PRE_REQUIRED_PREFIX_CHECKPOINT_PROPOSAL_HEX } from './wire_compat_fixtures.js';

/**
 * Deterministic checkpoint proposal (lastBlock without signedTxs) matching the golden fixture in
 * wire_compat_fixtures.ts. An empty checkpoint header's rolling hash is zero, so the last block's reference is the
 * empty prefix rather than an arbitrary value.
 */
const makeFixtureCheckpointProposal = () =>
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
      inboxPrefixRef: InboxMessagePrefixRef.empty(),
    },
  );

describe('CheckpointProposal serialization / deserialization', () => {
  it.each([
    ['no lastBlock', () => makeCheckpointProposal({})],
    ['a nonzero fee asset price modifier', () => makeCheckpointProposal({ feeAssetPriceModifier: -1234n })],
    ['a lastBlock', () => makeCheckpointProposal({ lastBlock: {} })],
    [
      'a lastBlock carrying its txs',
      async () => {
        const tx = await mockTx(1);
        return makeCheckpointProposal({ lastBlock: { txHashes: [tx.getTxHash()], txs: [tx] } });
      },
    ],
    [
      'a lastBlock with an inbox prefix reference',
      () => {
        const checkpointHeader = CheckpointHeader.random();
        return makeCheckpointProposal({
          checkpointHeader,
          lastBlock: { inboxPrefixRef: new InboxMessagePrefixRef(checkpointHeader.inboxRollingHash) },
        });
      },
    ],
  ])('reports the actual serialized size with %s', async (_name, build) => {
    const proposal = await build();
    expect(proposal.getSize()).toEqual(proposal.toBuffer().length);
  });

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

    it('serializes to the pinned wire bytes', () => {
      const proposal = makeFixtureCheckpointProposal();
      expect(bufferToHex(proposal.toBuffer())).toEqual(CHECKPOINT_PROPOSAL_HEX);
    });

    it('places the last block reference between its tx hashes and its signed-txs flag', async () => {
      const checkpointHeader = CheckpointHeader.random();
      const inboxPrefixRef = new InboxMessagePrefixRef(checkpointHeader.inboxRollingHash);
      const proposal = await makeCheckpointProposal({
        checkpointHeader,
        lastBlock: { txHashes: [TxHash.fromField(new Fr(7n))], inboxPrefixRef },
      });
      const buffer = proposal.toBuffer();

      const flagOffset = buffer.length - 4;
      const refOffset = flagOffset - InboxMessagePrefixRef.SIZE;
      expect(buffer.subarray(refOffset, flagOffset)).toEqual(inboxPrefixRef.toBuffer());
      expect(buffer.readUInt32BE(flagOffset)).toEqual(0);
      expect(buffer.subarray(refOffset - TxHash.SIZE, refOffset)).toEqual(TxHash.fromField(new Fr(7n)).toBuffer());
    });

    it('rejects a buffer written without the required reference', () => {
      expect(() => CheckpointProposal.fromBuffer(hexToBuffer(PRE_REQUIRED_PREFIX_CHECKPOINT_PROPOSAL_HEX))).toThrow(
        /beyond buffer length/,
      );
    });

    it('rejects a buffer whose last block reference is truncated', () => {
      const complete = makeFixtureCheckpointProposal().toBuffer();
      const truncated = complete.subarray(0, complete.length - 5);
      expect(() => CheckpointProposal.fromBuffer(truncated)).toThrow(/beyond buffer length/);
    });

    it('carries the inbox prefix reference through getBlockProposal, covered by the block signature', async () => {
      const signer = Secp256k1Signer.random();
      const checkpointHeader = CheckpointHeader.random();
      const inboxPrefixRef = new InboxMessagePrefixRef(checkpointHeader.inboxRollingHash);
      const proposal = await makeCheckpointProposal({ signer, checkpointHeader, lastBlock: { inboxPrefixRef } });

      const blockProposal = proposal.getBlockProposal();
      expect(blockProposal?.inboxPrefixRef.equals(inboxPrefixRef)).toBe(true);
      expect(blockProposal?.getSender()).toEqual(signer.address);
      expect(proposal.getSender()).toEqual(signer.address);
    });

    it('recovers the same signed block identity from the embedded block as from a standalone one', async () => {
      const signer = Secp256k1Signer.random();
      const checkpointHeader = CheckpointHeader.random();
      const inboxPrefixRef = new InboxMessagePrefixRef(checkpointHeader.inboxRollingHash);
      const proposal = await makeCheckpointProposal({ signer, checkpointHeader, lastBlock: { inboxPrefixRef } });

      const embedded = proposal.getBlockProposal()!;
      const roundTripped = CheckpointProposal.fromBuffer(proposal.toBuffer()).getBlockProposal()!;
      const standalone = BlockProposal.fromBuffer(embedded.toBuffer());

      expect(roundTripped.getPayloadHash().toString()).toEqual(embedded.getPayloadHash().toString());
      expect(standalone.getPayloadHash().toString()).toEqual(embedded.getPayloadHash().toString());
      expect(roundTripped.getSender()).toEqual(signer.address);
      expect(standalone.toBuffer()).toEqual(roundTripped.toBuffer());
    });

    it('rejects a well-formed buffer whose last block reference disagrees with the checkpoint header', async () => {
      const checkpointHeader = CheckpointHeader.random();
      const inboxPrefixRef = new InboxMessagePrefixRef(checkpointHeader.inboxRollingHash);
      const proposal = await makeCheckpointProposal({ checkpointHeader, lastBlock: { inboxPrefixRef } });

      // Overwrite the reference in place, leaving every length and every other field intact.
      const tampered = Buffer.from(proposal.toBuffer());
      const refOffset = tampered.length - 4 - InboxMessagePrefixRef.SIZE;
      new InboxMessagePrefixRef(new Fr(0xdeadn)).toBuffer().copy(tampered, refOffset);

      expect(() => CheckpointProposal.fromBuffer(tampered)).toThrow(/inboxPrefixRef rolling hash/);
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

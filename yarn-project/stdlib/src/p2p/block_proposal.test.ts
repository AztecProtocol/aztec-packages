// Serde test for the block proposal type
import { IndexWithinCheckpoint } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Signature } from '@aztec/foundation/eth-signature';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { InboxBucketRef } from '../messaging/inbox_bucket.js';
import { TEST_COORDINATION_SIGNATURE_CONTEXT, makeBlockProposal } from '../tests/mocks.js';
import { BlockHeader } from '../tx/block_header.js';
import { Tx } from '../tx/tx.js';
import { TxHash } from '../tx/tx_hash.js';
import { BlockProposal } from './block_proposal.js';
import { EMPTY_COORDINATION_SIGNATURE_CONTEXT } from './signature_utils.js';
import { SignedTxs } from './signed_txs.js';
import { LEGACY_BLOCK_PROPOSAL_HEX, LEGACY_BLOCK_PROPOSAL_PAYLOAD_HEX } from './wire_compat_fixtures.js';

/**
 * Deterministic legacy-shaped proposal (no signedTxs, no bucketRef) matching the golden fixtures in
 * wire_compat_fixtures.ts. Constructed identically to how those bytes were captured on the pre-change code.
 */
const makeLegacyFixtureProposal = () =>
  new BlockProposal(
    BlockHeader.empty(),
    IndexWithinCheckpoint(3),
    new Fr(42n),
    new Fr(99n),
    [TxHash.fromField(new Fr(7n)), TxHash.fromField(new Fr(8n))],
    Signature.empty(),
    EMPTY_COORDINATION_SIGNATURE_CONTEXT,
  );

describe('Block Proposal serialization / deserialization', () => {
  const checkEquivalence = (serialized: BlockProposal, deserialized: BlockProposal) => {
    expect(deserialized.getSize()).toEqual(serialized.getSize());
    expect(deserialized).toEqual(serialized);
  };

  it('Should serialize / deserialize', async () => {
    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const proposal = await makeBlockProposal({ txs });

    const serialized = proposal.toBuffer();
    const deserialized = BlockProposal.fromBuffer(serialized);
    checkEquivalence(proposal, deserialized);
  });

  it('Should serialize / deserialize without txs', async () => {
    const proposal = await makeBlockProposal();

    const serialized = proposal.toBuffer();
    const deserialized = BlockProposal.fromBuffer(serialized);

    expect(deserialized.archive).toEqual(proposal.archive);
    expect(deserialized.blockHeader.equals(proposal.blockHeader)).toBe(true);
    expect(deserialized.txHashes).toEqual(proposal.txHashes);
    expect(deserialized.txs).toBeUndefined();
  });

  it('Should serialize / deserialize with txs', async () => {
    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const proposal = await makeBlockProposal({ txs });

    const serialized = proposal.toBuffer();
    const deserialized = BlockProposal.fromBuffer(serialized);

    expect(deserialized.archive).toEqual(proposal.archive);
    expect(deserialized.blockHeader.equals(proposal.blockHeader)).toBe(true);
    expect(deserialized.txHashes).toEqual(proposal.txHashes);
    expect(deserialized.txs?.length).toEqual(txs.length);
  });

  it('Should serialize / deserialize + recover sender', async () => {
    const account = Secp256k1Signer.random();

    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const proposal = await makeBlockProposal({ txs, signer: account });
    const serialized = proposal.toBuffer();
    const deserialized = BlockProposal.fromBuffer(serialized);

    checkEquivalence(proposal, deserialized);

    // Recover signature
    const sender = deserialized.getSender();
    expect(sender).toEqual(account.address);
  });

  it('Should expose block info via accessor methods', async () => {
    const proposal = await makeBlockProposal();

    expect(proposal.slotNumber).toBe(proposal.blockHeader.getSlot());
    expect(proposal.blockNumber).toBe(proposal.blockHeader.getBlockNumber());
  });

  it('getSender returns undefined when inner signedTxs carries a foreign signing domain', async () => {
    const account = Secp256k1Signer.random();
    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const proposal = await makeBlockProposal({ txs, signer: account });

    const foreignContext = {
      ...TEST_COORDINATION_SIGNATURE_CONTEXT,
      chainId: TEST_COORDINATION_SIGNATURE_CONTEXT.chainId + 1,
    };
    const foreignSignedTxs = new SignedTxs(txs, Signature.random(), foreignContext);
    const tampered = new BlockProposal(
      proposal.blockHeader,
      proposal.indexWithinCheckpoint,
      proposal.inHash,
      proposal.archiveRoot,
      proposal.txHashes,
      proposal.signature,
      proposal.signatureContext,
      foreignSignedTxs,
    );

    expect(tampered.getSender()).toBeUndefined();
  });

  describe('bucket reference (AZIP-22 Fast Inbox)', () => {
    it('round-trips with a bucket reference set', async () => {
      const bucketRef = InboxBucketRef.random();
      const proposal = await makeBlockProposal({ bucketRef });

      const deserialized = BlockProposal.fromBuffer(proposal.toBuffer());

      expect(deserialized.bucketRef).toBeDefined();
      expect(deserialized.bucketRef!.equals(bucketRef)).toBe(true);
      expect(deserialized.getSize()).toEqual(proposal.getSize());
      expect(deserialized).toEqual(proposal);
    });

    it('round-trips with a bucket reference set alongside signed txs', async () => {
      const bucketRef = InboxBucketRef.random();
      const txs = await Promise.all([Tx.random(), Tx.random()]);
      const proposal = await makeBlockProposal({ txs, bucketRef });

      const deserialized = BlockProposal.fromBuffer(proposal.toBuffer());

      expect(deserialized.bucketRef!.equals(bucketRef)).toBe(true);
      expect(deserialized.txs?.length).toEqual(txs.length);
      expect(deserialized).toEqual(proposal);
    });

    it('serializes byte-identically to the legacy format when unset', () => {
      const proposal = makeLegacyFixtureProposal();
      expect(proposal.bucketRef).toBeUndefined();
      expect(bufferToHex(proposal.toBuffer())).toEqual(LEGACY_BLOCK_PROPOSAL_HEX);
      expect(bufferToHex(proposal.getPayloadToSign())).toEqual(LEGACY_BLOCK_PROPOSAL_PAYLOAD_HEX);
    });

    it('decodes a legacy buffer (no tail) as having no bucket reference', () => {
      const deserialized = BlockProposal.fromBuffer(hexToBuffer(LEGACY_BLOCK_PROPOSAL_HEX));
      expect(deserialized.bucketRef).toBeUndefined();
      // Re-encoding a legacy buffer yields the same legacy bytes: no phantom tail is introduced.
      expect(bufferToHex(deserialized.toBuffer())).toEqual(LEGACY_BLOCK_PROPOSAL_HEX);
    });

    it('appends the bucket reference only when set, changing the signed payload', async () => {
      const bucketRef = InboxBucketRef.random();
      const withRef = await makeBlockProposal({ bucketRef });
      const withoutRef = await makeBlockProposal({
        blockHeader: withRef.blockHeader,
        indexWithinCheckpoint: withRef.indexWithinCheckpoint,
        inHash: withRef.inHash,
        archiveRoot: withRef.archiveRoot,
        txHashes: withRef.txHashes,
      });

      const withRefPayload = withRef.getPayloadToSign();
      const withoutRefPayload = withoutRef.getPayloadToSign();

      // The set payload extends the unset payload by exactly the reference bytes (appended tail, no marker).
      expect(withRefPayload.length).toEqual(withoutRefPayload.length + InboxBucketRef.SIZE);
      expect(withRefPayload.subarray(0, withoutRefPayload.length)).toEqual(withoutRefPayload);
      // The payload hashes differ, so the attestation pool treats set-vs-unset as distinct payloads.
      expect(withRef.getPayloadHash().toString()).not.toEqual(withoutRef.getPayloadHash().toString());
    });

    it('covers the bucket reference under the proposal signature', async () => {
      const signer = Secp256k1Signer.random();
      const bucketRef = InboxBucketRef.random();
      const proposal = await makeBlockProposal({ signer, bucketRef });

      const deserialized = BlockProposal.fromBuffer(proposal.toBuffer());
      expect(deserialized.getSender()).toEqual(signer.address);
    });

    it('breaks sender recovery when the bucket reference is tampered with', async () => {
      const signer = Secp256k1Signer.random();
      const bucketRef = new InboxBucketRef(5n, 100n, new Fr(7n));
      const proposal = await makeBlockProposal({ signer, bucketRef });
      expect(proposal.getSender()).toEqual(signer.address);

      // A relay swapping the signed reference for a different one is not covered by the original signature.
      const tampered = new BlockProposal(
        proposal.blockHeader,
        proposal.indexWithinCheckpoint,
        proposal.inHash,
        proposal.archiveRoot,
        proposal.txHashes,
        proposal.signature,
        proposal.signatureContext,
        proposal.signedTxs,
        new InboxBucketRef(6n, 100n, new Fr(7n)),
      );
      expect(tampered.getSender()).not.toEqual(signer.address);
    });

    it('breaks sender recovery when a bucket reference is injected into an unsigned proposal', async () => {
      const signer = Secp256k1Signer.random();
      const proposal = await makeBlockProposal({ signer });
      expect(proposal.getSender()).toEqual(signer.address);

      // A relay injecting a reference the proposer never signed over is rejected by signature recovery.
      const injected = new BlockProposal(
        proposal.blockHeader,
        proposal.indexWithinCheckpoint,
        proposal.inHash,
        proposal.archiveRoot,
        proposal.txHashes,
        proposal.signature,
        proposal.signatureContext,
        proposal.signedTxs,
        InboxBucketRef.random(),
      );
      expect(injected.getSender()).not.toEqual(signer.address);
    });
  });
});

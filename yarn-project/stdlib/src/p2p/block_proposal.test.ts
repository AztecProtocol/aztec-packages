// Serde test for the block proposal type
import { IndexWithinCheckpoint } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Signature } from '@aztec/foundation/eth-signature';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { InboxMessagePrefixRef } from '../messaging/inbox_message_prefix_ref.js';
import { TEST_COORDINATION_SIGNATURE_CONTEXT, makeBlockProposal } from '../tests/mocks.js';
import { BlockHeader } from '../tx/block_header.js';
import { Tx } from '../tx/tx.js';
import { TxHash } from '../tx/tx_hash.js';
import { BlockProposal } from './block_proposal.js';
import { EMPTY_COORDINATION_SIGNATURE_CONTEXT } from './signature_utils.js';
import { SignedTxs } from './signed_txs.js';
import {
  BLOCK_PROPOSAL_HEX,
  BLOCK_PROPOSAL_PAYLOAD_HEX,
  PRE_REQUIRED_PREFIX_BLOCK_PROPOSAL_HEX,
} from './wire_compat_fixtures.js';

/**
 * Deterministic proposal (no signedTxs) matching the golden fixtures in wire_compat_fixtures.ts.
 */
const makeFixtureProposal = () =>
  new BlockProposal(
    BlockHeader.empty(),
    IndexWithinCheckpoint(3),
    new Fr(99n),
    [TxHash.fromField(new Fr(7n)), TxHash.fromField(new Fr(8n))],
    Signature.empty(),
    EMPTY_COORDINATION_SIGNATURE_CONTEXT,
    new InboxMessagePrefixRef(new Fr(42n)),
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
      proposal.archiveRoot,
      proposal.txHashes,
      proposal.signature,
      proposal.signatureContext,
      proposal.inboxPrefixRef,
      foreignSignedTxs,
    );

    expect(tampered.getSender()).toBeUndefined();
  });

  describe('inbox prefix reference', () => {
    it.each([
      ['no signed txs', () => makeBlockProposal({ inboxPrefixRef: InboxMessagePrefixRef.random() })],
      [
        'signed txs',
        async () =>
          makeBlockProposal({
            txs: await Promise.all([Tx.random(), Tx.random()]),
            inboxPrefixRef: InboxMessagePrefixRef.random(),
          }),
      ],
      ['the empty genesis prefix', () => makeBlockProposal({ inboxPrefixRef: InboxMessagePrefixRef.empty() })],
    ])('round-trips and reports its own size with %s', async (_name, build) => {
      const proposal = await build();

      const deserialized = BlockProposal.fromBuffer(proposal.toBuffer());

      expect(deserialized.inboxPrefixRef.equals(proposal.inboxPrefixRef)).toBe(true);
      expect(deserialized).toEqual(proposal);
      expect(proposal.getSize()).toEqual(proposal.toBuffer().length);
      expect(deserialized.getSize()).toEqual(proposal.getSize());
    });

    it('serializes to the pinned wire bytes', () => {
      const proposal = makeFixtureProposal();
      expect(bufferToHex(proposal.toBuffer())).toEqual(BLOCK_PROPOSAL_HEX);
      expect(bufferToHex(proposal.getPayloadToSign())).toEqual(BLOCK_PROPOSAL_PAYLOAD_HEX);
    });

    it('places the reference between the tx hashes and the signed-txs flag', async () => {
      const inboxPrefixRef = InboxMessagePrefixRef.random();
      const proposal = await makeBlockProposal({ inboxPrefixRef });
      const buffer = proposal.toBuffer();

      // The reference occupies the 32 bytes ending four bytes (the hasSignedTxs flag) before the end of a proposal
      // that carries no bundle, so nothing but the flag separates it from the end of the buffer.
      const flagOffset = buffer.length - 4;
      const refOffset = flagOffset - InboxMessagePrefixRef.SIZE;
      expect(buffer.subarray(refOffset, flagOffset)).toEqual(inboxPrefixRef.toBuffer());
      expect(buffer.readUInt32BE(flagOffset)).toEqual(0);
      // Immediately before the reference are the last tx hash's bytes, so no other field was inserted between them.
      const lastTxHash = proposal.txHashes[proposal.txHashes.length - 1];
      expect(buffer.subarray(refOffset - TxHash.SIZE, refOffset)).toEqual(lastTxHash.toBuffer());
    });

    it('rejects a buffer written without the required reference', () => {
      expect(() => BlockProposal.fromBuffer(hexToBuffer(PRE_REQUIRED_PREFIX_BLOCK_PROPOSAL_HEX))).toThrow(
        /beyond buffer length/,
      );
    });

    it('rejects a buffer whose reference is truncated', () => {
      const complete = makeFixtureProposal().toBuffer();
      // Drop one byte of the reference: the flag and the reference together are four bytes longer than what is left.
      const truncated = complete.subarray(0, complete.length - 5);
      expect(() => BlockProposal.fromBuffer(truncated)).toThrow(/beyond buffer length/);
    });

    it('signs a different payload for a different reference', async () => {
      const shared = {
        blockHeader: BlockHeader.empty(),
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
        archiveRoot: new Fr(5n),
        txHashes: [TxHash.fromField(new Fr(7n))],
      };
      const first = await makeBlockProposal({ ...shared, inboxPrefixRef: new InboxMessagePrefixRef(new Fr(11n)) });
      const second = await makeBlockProposal({ ...shared, inboxPrefixRef: new InboxMessagePrefixRef(new Fr(12n)) });

      const firstPayload = first.getPayloadToSign();
      const secondPayload = second.getPayloadToSign();

      // The reference is the payload's tail, so the payloads agree up to it and differ only over its bytes.
      expect(firstPayload.length).toEqual(secondPayload.length);
      const prefixLength = firstPayload.length - InboxMessagePrefixRef.SIZE;
      expect(firstPayload.subarray(0, prefixLength)).toEqual(secondPayload.subarray(0, prefixLength));
      expect(firstPayload.subarray(prefixLength)).toEqual(first.inboxPrefixRef.toBuffer());
      // Distinct payload hashes keep the attestation pool from treating the two as the same signed payload.
      expect(first.getPayloadHash().toString()).not.toEqual(second.getPayloadHash().toString());
    });

    it('covers the inbox prefix reference under the proposal signature', async () => {
      const signer = Secp256k1Signer.random();
      const inboxPrefixRef = InboxMessagePrefixRef.random();
      const proposal = await makeBlockProposal({ signer, inboxPrefixRef });

      const deserialized = BlockProposal.fromBuffer(proposal.toBuffer());
      expect(deserialized.getSender()).toEqual(signer.address);
    });

    it('breaks sender recovery when the inbox prefix reference is tampered with', async () => {
      const signer = Secp256k1Signer.random();
      const inboxPrefixRef = new InboxMessagePrefixRef(new Fr(7n));
      const proposal = await makeBlockProposal({ signer, inboxPrefixRef });
      expect(proposal.getSender()).toEqual(signer.address);

      // A relay swapping the signed reference for a different one is not covered by the original signature.
      const tampered = new BlockProposal(
        proposal.blockHeader,
        proposal.indexWithinCheckpoint,
        proposal.archiveRoot,
        proposal.txHashes,
        proposal.signature,
        proposal.signatureContext,
        new InboxMessagePrefixRef(new Fr(8n)),
        proposal.signedTxs,
      );
      expect(tampered.getSender()).not.toEqual(signer.address);
      expect(tampered.getPayloadHash().toString()).not.toEqual(proposal.getPayloadHash().toString());
    });
  });
});

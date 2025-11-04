import type { EpochCache, EpochCommitteeInfo } from '@aztec/epoch-cache';
import { Buffer32 } from '@aztec/foundation/buffer';
import { times } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { Signature } from '@aztec/foundation/eth-signature';
import { type Logger, createLogger } from '@aztec/foundation/log';
import {
  CommitteeAttestation,
  EthAddress,
  L1PublishedData,
  L2Block,
  PublishedL2Block,
  getAttestationInfoFromPublishedL2Block,
} from '@aztec/stdlib/block';
import { orderAttestations } from '@aztec/stdlib/p2p';
import { makeBlockAttestationFromBlock } from '@aztec/stdlib/testing';

import { type MockProxy, mock } from 'jest-mock-extended';
import assert from 'node:assert';

import { validateBlockAttestations } from './validation.js';

describe('validateBlockAttestations', () => {
  let epochCache: MockProxy<EpochCache>;
  let signers: Secp256k1Signer[];
  let committee: EthAddress[];
  let logger: Logger;

  const makeBlock = async (signers: Secp256k1Signer[], committee: EthAddress[], slot?: number) => {
    const block = await L2Block.random(slot ?? 1);
    const blockAttestations = signers.map(signer => makeBlockAttestationFromBlock(block, signer));
    const attestations = orderAttestations(blockAttestations, committee);
    return new PublishedL2Block(block, L1PublishedData.random(), attestations);
  };

  const constants = { epochDuration: 10 };

  const setCommittee = (committee: EthAddress[]) => {
    epochCache.getCommitteeForEpoch.mockResolvedValue({ committee } as EpochCommitteeInfo);
  };

  beforeEach(() => {
    epochCache = mock<EpochCache>();
    signers = times(5, () => Secp256k1Signer.random());
    committee = signers.map(signer => signer.address);
    logger = createLogger('archiver:test');
  });

  describe('with empty committee', () => {
    beforeEach(() => {
      setCommittee([]);
    });

    it('validates a block if no committee is found', async () => {
      const block = await makeBlock([], []);
      const result = await validateBlockAttestations(block, epochCache, constants, logger);

      expect(result.valid).toBe(true);
      expect(epochCache.getCommitteeForEpoch).toHaveBeenCalledWith(0n);
    });

    it('validates a block with no attestations if no committee is found', async () => {
      const block = await makeBlock(signers, committee);
      const result = await validateBlockAttestations(block, epochCache, constants, logger);

      expect(result.valid).toBe(true);
      expect(epochCache.getCommitteeForEpoch).toHaveBeenCalledWith(0n);
    });
  });

  describe('with committee', () => {
    beforeEach(() => {
      setCommittee(committee);
    });

    it('requests committee for the correct epoch', async () => {
      const block = await makeBlock(signers, committee, 28);
      await validateBlockAttestations(block, epochCache, constants, logger);
      expect(epochCache.getCommitteeForEpoch).toHaveBeenCalledWith(2n);
    });

    it('fails if there is an attestation is from a non-committee member', async () => {
      const badSigner = Secp256k1Signer.random();
      const block = await makeBlock([...signers, badSigner], [...committee, badSigner.address]);
      const result = await validateBlockAttestations(block, epochCache, constants, logger);
      assert(!result.valid);
      assert(result.reason === 'invalid-attestation');
      expect(result.block.blockNumber).toEqual(block.block.number);
      expect(result.block.archive.toString()).toEqual(block.block.archive.root.toString());
      expect(result.committee).toEqual(committee);
      expect(result.invalidIndex).toBe(5); // The bad signer is at index 5
    });

    it('fails if there is an empty attestation', async () => {
      const block = await makeBlock(signers.slice(0, 4), committee);
      block.attestations[1] = new CommitteeAttestation(EthAddress.ZERO, Signature.empty());
      const result = await validateBlockAttestations(block, epochCache, constants, logger);
      assert(!result.valid);
      assert(result.reason === 'invalid-attestation');
      expect(result.block.blockNumber).toEqual(block.block.number);
      expect(result.block.archive.toString()).toEqual(block.block.archive.root.toString());
      expect(result.committee).toEqual(committee);
      expect(result.invalidIndex).toBe(1); // The empty attestation is at index 1
    });

    it('fails if there is an attestation with an invalid signature', async () => {
      const block = await makeBlock(signers.slice(0, 4), committee);
      // Create an invalid signature that will fail curve point recovery with "Point is not on curve: Cannot find square root"
      // r = curve_order - 1, s = 1
      const invalidR = Buffer32.fromBuffer(
        Buffer.from('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364140', 'hex'),
      );
      const invalidS = Buffer32.fromBuffer(
        Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex'),
      );
      const invalidSig = new Signature(invalidR, invalidS, 27);
      block.attestations[0] = new CommitteeAttestation(EthAddress.ZERO, invalidSig);

      // Verify that the invalid signature is detected
      const attestations = getAttestationInfoFromPublishedL2Block(block);
      expect(attestations[0].status).toBe('invalid-signature');

      const result = await validateBlockAttestations(block, epochCache, constants, logger);
      assert(!result.valid);
      assert(result.reason === 'invalid-attestation');
      expect(result.block.blockNumber).toEqual(block.block.number);
      expect(result.block.archive.toString()).toEqual(block.block.archive.root.toString());
      expect(result.committee).toEqual(committee);
      expect(result.invalidIndex).toBe(0);
    });

    it('reports correct index when invalid attestation follows provided address', async () => {
      const block = await makeBlock(signers.slice(0, 3), committee);

      // Create an attestation with a provided address (index 0)
      block.attestations[0] = new CommitteeAttestation(signers[0].address, Signature.empty());

      // Create an invalid signature at index 1 - this should be reported as invalid at index 1, not 0
      block.attestations[1] = new CommitteeAttestation(EthAddress.ZERO, Signature.random());

      // Index 2 is a valid attestation from signers[2]

      const result = await validateBlockAttestations(block, epochCache, constants, logger);
      assert(!result.valid);
      assert(result.reason === 'invalid-attestation');
      expect(result.invalidIndex).toBe(1); // Should be 1 (the original index), not 0
    });

    it('returns false if insufficient attestations', async () => {
      const block = await makeBlock(signers.slice(0, 2), committee);
      const result = await validateBlockAttestations(block, epochCache, constants, logger);
      assert(!result.valid);
      expect(result.reason).toBe('insufficient-attestations');
      expect(result.block.blockNumber).toEqual(block.block.number);
      expect(result.block.archive.toString()).toEqual(block.block.archive.root.toString());
      expect(result.committee).toEqual(committee);
    });

    it('returns true if all attestations are valid and sufficient', async () => {
      const block = await makeBlock(signers.slice(0, 4), committee);
      const result = await validateBlockAttestations(block, epochCache, constants, logger);
      expect(result.valid).toBe(true);
    });
  });
});

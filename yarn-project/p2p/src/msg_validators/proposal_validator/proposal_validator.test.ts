import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { NoCommitteeError } from '@aztec/ethereum/contracts';
import { EpochNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { EthAddress } from '@aztec/foundation/eth-address';
import {
  TEST_COORDINATION_SIGNATURE_CONTEXT,
  makeBlockHeader,
  makeBlockProposal,
  makeCheckpointHeader,
  makeCheckpointProposal,
} from '@aztec/stdlib/testing';
import { TxHash } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { PeerErrorSeverity } from '../../types/index.js';
import { ProposalValidator } from './proposal_validator.js';

describe('ProposalValidator', () => {
  const currentSlot = SlotNumber(100);
  const nextSlot = SlotNumber(101);
  const previousSlot = SlotNumber(99);
  const foreignSignatureContext = {
    ...TEST_COORDINATION_SIGNATURE_CONTEXT,
    chainId: TEST_COORDINATION_SIGNATURE_CONTEXT.chainId + 1,
  };
  let epochCache: MockProxy<EpochCacheInterface>;
  let validator: ProposalValidator;

  function mockGetProposer(currentProposer: EthAddress, nextProposer: EthAddress, previousProposer?: EthAddress) {
    epochCache.getProposerAttesterAddressInSlot.mockImplementation(slot => {
      if (slot === currentSlot) {
        return Promise.resolve(currentProposer);
      }
      if (slot === nextSlot) {
        return Promise.resolve(nextProposer);
      }
      if (slot === previousSlot && previousProposer) {
        return Promise.resolve(previousProposer);
      }
      throw new Error('Unexpected argument');
    });
  }

  beforeEach(() => {
    epochCache = mock<EpochCacheInterface>();
    epochCache.getL1Constants.mockReturnValue({
      slotDuration: 72,
      ethereumSlotDuration: 12,
    } as any);
    validator = new ProposalValidator(
      epochCache,
      {
        txsPermitted: true,
        maxTxsPerBlock: undefined,
        p2pPropagationTime: 2,
        signatureContext: TEST_COORDINATION_SIGNATURE_CONTEXT,
      },
      'test',
    );
    epochCache.getEpochAndSlotNow.mockReturnValue({
      epoch: EpochNumber(1),
      slot: currentSlot,
      ts: 0n,
      nowMs: 0n,
    });
    epochCache.getTargetAndNextSlot.mockReturnValue({
      targetSlot: currentSlot,
      nextSlot,
    });
    epochCache.getTargetSlot.mockReturnValue(currentSlot);
    epochCache.getSlotNow.mockReturnValue(currentSlot);
  });

  describe.each([
    {
      name: 'block proposal',
      factory: (
        slotNumber: SlotNumber,
        signer: Secp256k1Signer,
        signatureContext = TEST_COORDINATION_SIGNATURE_CONTEXT,
      ) =>
        makeBlockProposal({
          blockHeader: makeBlockHeader(0, { slotNumber }),
          signer,
          signatureContext,
        }),
    },
    {
      name: 'checkpoint proposal',
      factory: (
        slotNumber: SlotNumber,
        signer: Secp256k1Signer,
        signatureContext = TEST_COORDINATION_SIGNATURE_CONTEXT,
      ) =>
        makeCheckpointProposal({
          checkpointHeader: makeCheckpointHeader(0, { slotNumber }),
          signer,
          signatureContext,
        }),
    },
  ])('validate with $name', ({ factory }) => {
    it('rejects foreign signature context with low tolerance error', async () => {
      const proposal = await factory(currentSlot, Secp256k1Signer.random(), foreignSignatureContext);

      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.LowToleranceError });
    });

    it('rejects with high tolerance error if slot is outside clock tolerance', async () => {
      const proposal = await factory(previousSlot, Secp256k1Signer.random());

      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: EpochNumber(1),
        slot: currentSlot,
        ts: 1000n,
        nowMs: 1001000n, // 1000ms elapsed, outside 500ms tolerance
      });

      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(EthAddress.random());
      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.HighToleranceError });
      expect(epochCache.getProposerAttesterAddressInSlot).not.toHaveBeenCalled();
    });

    it('ignores if previous slot proposal is within clock tolerance', async () => {
      const signer = Secp256k1Signer.random();
      const proposal = await factory(previousSlot, signer);

      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: EpochNumber(1),
        slot: currentSlot,
        ts: 1000n,
        nowMs: 1000100n, // 100ms elapsed, within 500ms tolerance
      });

      mockGetProposer(EthAddress.random(), EthAddress.random(), signer.address);
      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'ignore' });
    });

    it('rejects with mid tolerance error if signature is invalid', async () => {
      const signer = Secp256k1Signer.random();
      const proposal = await factory(currentSlot, signer);

      jest.spyOn(proposal as any, 'getSender').mockReturnValue(undefined);

      mockGetProposer(signer.address, EthAddress.random());
      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.MidToleranceError });
      expect(epochCache.getProposerAttesterAddressInSlot).not.toHaveBeenCalled();
    });

    it('rejects with mid tolerance error if proposer is wrong for current slot', async () => {
      const proposal = await factory(currentSlot, Secp256k1Signer.random());

      mockGetProposer(EthAddress.random(), EthAddress.random());
      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.MidToleranceError });
    });

    it('rejects with mid tolerance error if proposer is wrong for next slot', async () => {
      const proposal = await factory(nextSlot, Secp256k1Signer.random());

      mockGetProposer(EthAddress.random(), EthAddress.random());
      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.MidToleranceError });
    });

    it('rejects with mid tolerance error if current proposer sends for next slot', async () => {
      const currentProposer = Secp256k1Signer.random();
      const proposal = await factory(nextSlot, currentProposer);

      mockGetProposer(currentProposer.address, EthAddress.random());
      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.MidToleranceError });
    });

    it('accepts when proposer is undefined (open committee)', async () => {
      const proposal = await factory(currentSlot, Secp256k1Signer.random());

      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(undefined);
      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'accept' });
    });

    it('rejects with low tolerance error on NoCommitteeError', async () => {
      const proposal = await factory(currentSlot, Secp256k1Signer.random());

      epochCache.getProposerAttesterAddressInSlot.mockRejectedValue(new NoCommitteeError());
      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.LowToleranceError });
    });

    it('accepts valid proposal for current slot', async () => {
      const signer = Secp256k1Signer.random();
      const proposal = await factory(currentSlot, signer);

      mockGetProposer(signer.address, EthAddress.random());
      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'accept' });
    });

    it('accepts valid proposal for next slot', async () => {
      const signer = Secp256k1Signer.random();
      const proposal = await factory(nextSlot, signer);

      mockGetProposer(EthAddress.random(), signer.address);
      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'accept' });
    });

    it('accepts proposal for current slot within pipelining clock-disparity grace', async () => {
      // Simulate pipelining: targetSlot = 101, but proposal is for slot 100 (current wallclock slot).
      // Under early pipelining, proposalWindowIntoTargetSlot = 0, so only the 500ms clock-disparity grace applies.
      epochCache.getTargetAndNextSlot.mockReturnValue({
        targetSlot: SlotNumber(101),
        nextSlot: SlotNumber(102),
      });
      epochCache.getSlotNow.mockReturnValue(currentSlot); // slot 100

      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: EpochNumber(1),
        slot: currentSlot,
        ts: 1000n,
        nowMs: 1000400n, // 400ms elapsed, within 500ms grace
      });

      const signer = Secp256k1Signer.random();
      const proposal = await factory(currentSlot, signer);

      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);
      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'accept' });
    });

    it('rejects proposal for current slot outside pipelining clock-disparity grace', async () => {
      epochCache.getTargetAndNextSlot.mockReturnValue({
        targetSlot: SlotNumber(101),
        nextSlot: SlotNumber(102),
      });
      epochCache.getTargetSlot.mockReturnValue(SlotNumber(101));
      epochCache.getSlotNow.mockReturnValue(currentSlot); // slot 100

      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: EpochNumber(1),
        slot: currentSlot,
        ts: 1000n,
        nowMs: 1007000n, // 7000ms elapsed, well past 500ms grace
      });

      const signer = Secp256k1Signer.random();
      const proposal = await factory(currentSlot, signer);

      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);
      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.HighToleranceError });
    });
  });

  describe('validateTxs', () => {
    describe('txsPermitted', () => {
      it('rejects proposal with txHashes when txs not permitted', async () => {
        validator = new ProposalValidator(
          epochCache,
          {
            txsPermitted: false,
            maxTxsPerBlock: undefined,
            signatureContext: TEST_COORDINATION_SIGNATURE_CONTEXT,
          },
          'test',
        );

        const proposal = await makeBlockProposal({ txHashes: [TxHash.random(), TxHash.random()] });
        const result = await validator.validateTxs(proposal);
        expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.MidToleranceError });
      });

      it('accepts proposal with no txHashes when txs not permitted', async () => {
        validator = new ProposalValidator(
          epochCache,
          {
            txsPermitted: false,
            maxTxsPerBlock: undefined,
            signatureContext: TEST_COORDINATION_SIGNATURE_CONTEXT,
          },
          'test',
        );

        const proposal = await makeBlockProposal({ txHashes: [] });
        const result = await validator.validateTxs(proposal);
        expect(result).toEqual({ result: 'accept' });
      });

      it('accepts proposal with txHashes when txs permitted', async () => {
        const proposal = await makeBlockProposal({ txHashes: [TxHash.random(), TxHash.random()] });
        const result = await validator.validateTxs(proposal);
        expect(result).toEqual({ result: 'accept' });
      });
    });

    describe('embedded tx validation', () => {
      it('rejects if embedded txs are not listed in txHashes', async () => {
        const txHashes = [TxHash.random(), TxHash.random()];
        const proposal = await makeBlockProposal({ txHashes });

        const fakeTx = { getTxHash: () => TxHash.random(), validateTxHash: () => Promise.resolve(true) };
        Object.defineProperty(proposal, 'txs', { get: () => [fakeTx], configurable: true });

        const result = await validator.validateTxs(proposal);
        expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.MidToleranceError });
      });

      it('rejects if embedded tx has invalid tx hash', async () => {
        const txHashes = [TxHash.random(), TxHash.random()];
        const proposal = await makeBlockProposal({ txHashes });

        const fakeTx = { getTxHash: () => txHashes[0], validateTxHash: () => Promise.resolve(false) };
        Object.defineProperty(proposal, 'txs', { get: () => [fakeTx], configurable: true });

        const result = await validator.validateTxs(proposal);
        expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.LowToleranceError });
      });
    });

    describe('maxTxsPerBlock', () => {
      it('rejects when txHashes exceed maxTxsPerBlock', async () => {
        validator = new ProposalValidator(
          epochCache,
          {
            txsPermitted: true,
            maxTxsPerBlock: 2,
            signatureContext: TEST_COORDINATION_SIGNATURE_CONTEXT,
          },
          'test',
        );

        const proposal = await makeBlockProposal({ txHashes: Array.from({ length: 3 }, () => TxHash.random()) });
        const result = await validator.validateTxs(proposal);
        expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.MidToleranceError });
      });

      it('accepts when txHashes count equals maxTxsPerBlock', async () => {
        validator = new ProposalValidator(
          epochCache,
          {
            txsPermitted: true,
            maxTxsPerBlock: 2,
            signatureContext: TEST_COORDINATION_SIGNATURE_CONTEXT,
          },
          'test',
        );

        const proposal = await makeBlockProposal({ txHashes: Array.from({ length: 2 }, () => TxHash.random()) });
        const result = await validator.validateTxs(proposal);
        expect(result).toEqual({ result: 'accept' });
      });

      it('accepts when maxTxsPerBlock is not set (unlimited)', async () => {
        const proposal = await makeBlockProposal({ txHashes: Array.from({ length: 10 }, () => TxHash.random()) });
        const result = await validator.validateTxs(proposal);
        expect(result).toEqual({ result: 'accept' });
      });
    });
  });

  describe('maxBlocksPerCheckpoint', () => {
    const signer = Secp256k1Signer.random();

    beforeEach(() => {
      validator = new ProposalValidator(
        epochCache,
        {
          txsPermitted: true,
          maxBlocksPerCheckpoint: 5,
          signatureContext: TEST_COORDINATION_SIGNATURE_CONTEXT,
        },
        'test',
      );
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);
    });

    it('rejects a block proposal whose indexWithinCheckpoint equals the cap (5 >= 5)', async () => {
      const proposal = await makeBlockProposal({
        blockHeader: makeBlockHeader(0, { slotNumber: currentSlot }),
        indexWithinCheckpoint: IndexWithinCheckpoint(5),
        signer,
      });
      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.MidToleranceError });
    });

    it('accepts a block proposal whose indexWithinCheckpoint is below the cap (4 < 5)', async () => {
      const proposal = await makeBlockProposal({
        blockHeader: makeBlockHeader(0, { slotNumber: currentSlot }),
        indexWithinCheckpoint: IndexWithinCheckpoint(4),
        signer,
      });
      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'accept' });
    });
  });
});

import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { NoCommitteeError } from '@aztec/ethereum/contracts';
import { EpochNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT } from '@aztec/stdlib/deserialization';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import {
  TEST_COORDINATION_SIGNATURE_CONTEXT,
  makeBlockHeader,
  makeBlockProposal,
  makeCheckpointHeader,
  makeCheckpointProposal,
} from '@aztec/stdlib/testing';
import { ConsensusTimetable } from '@aztec/stdlib/timetable';
import { TxHash } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { CheckpointProposalValidator } from './checkpoint_proposal_validator.js';
import { ProposalValidator } from './proposal_validator.js';

/** Clock-disparity tolerance (ms) the validators are configured with in these tests. */
const TEST_CLOCK_DISPARITY_MS = 500;

/** Builds a multi-block timetable (S=72, E=12, D=6) matching the test's mocked l1 constants. */
function makeTimetable(blockDurationMs = 6000) {
  return new ConsensusTimetable({
    l1Constants: { l1GenesisTime: 0n, slotDuration: 72, ethereumSlotDuration: 12 },
    blockDuration: blockDurationMs / 1000,
  });
}

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
      l1GenesisTime: 0n,
      slotDuration: 72,
      ethereumSlotDuration: 12,
    } as any);
    validator = new ProposalValidator(
      epochCache,
      makeTimetable(),
      {
        txsPermitted: true,
        maxTxsPerBlock: undefined,
        signatureContext: TEST_COORDINATION_SIGNATURE_CONTEXT,
        clockDisparityMs: TEST_CLOCK_DISPARITY_MS,
      },
      'test',
    );
    // Default now sits inside the current slot's (100) checkpoint receive window [7116, 7182]s, so a
    // current-slot proposal is accepted by the unconditional receive-window gate. Next-slot (101) tests
    // override this with a now inside slot 101's window.
    epochCache.getEpochAndSlotNow.mockReturnValue({
      epoch: EpochNumber(1),
      slot: currentSlot,
      ts: 7150n,
      nowMs: 7150_000n,
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

    it('rejects with high tolerance error if slot is outside its receive window', async () => {
      // Proposal for slot 99 (previous). Past slot 99's checkpoint receive deadline (99*72 - E - D =
      // 7110s) so both block and checkpoint proposals, which share that window, are rejected.
      const proposal = await factory(previousSlot, Secp256k1Signer.random());

      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: EpochNumber(1),
        slot: currentSlot,
        ts: 7177n,
        nowMs: 7177_000n,
      });

      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(EthAddress.random());
      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.HighToleranceError });
      expect(epochCache.getProposerAttesterAddressInSlot).not.toHaveBeenCalled();
    });

    it('accepts a previous-slot proposal that is still within its receive window', async () => {
      // Proposal for slot 99 (previous). Slot 99 build frame opens at 99*72 - 84 = 7044s, before the
      // tight checkpoint deadline (99*72 - 18 = 7110s); now sits inside both windows, so it accepts.
      const signer = Secp256k1Signer.random();
      const proposal = await factory(previousSlot, signer);

      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: EpochNumber(1),
        slot: currentSlot,
        ts: 7050n,
        nowMs: 7050_000n,
      });

      mockGetProposer(EthAddress.random(), EthAddress.random(), signer.address);
      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'accept' });
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

      // Move now into slot 101's receive window [7188, 7254]s so the gate passes and we reach the
      // proposer check.
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: EpochNumber(1),
        slot: nextSlot,
        ts: 7200n,
        nowMs: 7200_000n,
      });
      mockGetProposer(EthAddress.random(), EthAddress.random());
      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.MidToleranceError });
    });

    it('rejects with mid tolerance error if current proposer sends for next slot', async () => {
      const currentProposer = Secp256k1Signer.random();
      const proposal = await factory(nextSlot, currentProposer);

      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: EpochNumber(1),
        slot: nextSlot,
        ts: 7200n,
        nowMs: 7200_000n,
      });
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

      // now inside slot 101's receive window [7188, 7254]s.
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: EpochNumber(1),
        slot: nextSlot,
        ts: 7200n,
        nowMs: 7200_000n,
      });
      mockGetProposer(EthAddress.random(), signer.address);
      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'accept' });
    });

    it('accepts proposal for current slot within its pipelined receive window', async () => {
      // Pipelining: targetSlot = 101, proposal is for slot 100 (current wallclock slot). Slot 100's
      // proposal receive window is [100*72-84, 100*72-18] = [7116, 7182]s, shared by block and checkpoint
      // proposals. now = 7150 sits inside it.
      epochCache.getTargetAndNextSlot.mockReturnValue({
        targetSlot: SlotNumber(101),
        nextSlot: SlotNumber(102),
      });
      epochCache.getSlotNow.mockReturnValue(currentSlot); // slot 100

      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: EpochNumber(1),
        slot: currentSlot,
        ts: 7150n,
        nowMs: 7150_000n,
      });

      const signer = Secp256k1Signer.random();
      const proposal = await factory(currentSlot, signer);

      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);
      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'accept' });
    });

    it('rejects proposal for current slot past its receive window', async () => {
      // Past slot 100's proposal receive deadline (100*72 - E - D = 7182s) so both block and checkpoint
      // proposals, which share that window, are rejected.
      epochCache.getTargetAndNextSlot.mockReturnValue({
        targetSlot: SlotNumber(101),
        nextSlot: SlotNumber(102),
      });
      epochCache.getTargetSlot.mockReturnValue(SlotNumber(101));
      epochCache.getSlotNow.mockReturnValue(currentSlot); // slot 100

      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: EpochNumber(1),
        slot: currentSlot,
        ts: 7249n,
        nowMs: 7249_000n,
      });

      const signer = Secp256k1Signer.random();
      const proposal = await factory(currentSlot, signer);

      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);
      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.HighToleranceError });
    });
  });

  describe('checkpoint receive-deadline gate on the common (messageSlot === targetSlot) path', () => {
    // Under pipelining the normal checkpoint proposal has messageSlot === targetSlot. The tight
    // checkpoint receive window for slot 100 is [7116, 7182]s (deadline = 100*72 - E - D = 7182).
    const signer = Secp256k1Signer.random();

    beforeEach(() => {
      epochCache.getTargetAndNextSlot.mockReturnValue({ targetSlot: currentSlot, nextSlot });
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);
    });

    it('rejects a checkpoint proposal for the target slot arriving after the receive deadline', async () => {
      const proposal = await makeCheckpointProposal({
        checkpointHeader: makeCheckpointHeader(0, { slotNumber: currentSlot }),
        signer,
      });

      // 7183s is past the deadline (7182) even allowing the +0.5s clock grace (upper bound 7182.5s).
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: EpochNumber(1),
        slot: currentSlot,
        ts: 7183n,
        nowMs: 7183_000n,
      });

      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.HighToleranceError });
    });

    it('accepts a checkpoint proposal for the target slot arriving within the receive window', async () => {
      const proposal = await makeCheckpointProposal({
        checkpointHeader: makeCheckpointHeader(0, { slotNumber: currentSlot }),
        signer,
      });

      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: EpochNumber(1),
        slot: currentSlot,
        ts: 7150n,
        nowMs: 7150_000n,
      });

      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'accept' });
    });

    it('rejects a block proposal for the target slot arriving after the checkpoint receive deadline', async () => {
      // Block proposals share the checkpoint proposal receive window [7116, 7182]s. Every block proposal
      // for the slot precedes the checkpoint proposal, so a block proposal arriving after the checkpoint
      // receive deadline (7182) is rejected at ingress just like the checkpoint proposal would be.
      const proposal = await makeBlockProposal({
        blockHeader: makeBlockHeader(0, { slotNumber: currentSlot }),
        signer,
      });

      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: EpochNumber(1),
        slot: currentSlot,
        ts: 7183n,
        nowMs: 7183_000n,
      });

      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.HighToleranceError });
    });
  });

  describe('clock-disparity widening of the proposal receive window', () => {
    // Proposal receive window for slot 100 is [buildFrameStart, proposalDeadline] = [7116, 7182]s,
    // widened by TEST_CLOCK_DISPARITY_MS (0.5s) on both ends. These pin the exact widened boundaries.
    const signer = Secp256k1Signer.random();
    const buildFrameStart = 100 * 72 - 72 - 12; // 7116
    const proposalDeadline = 100 * 72 - 12 - 6; // 7182
    const deltaSeconds = TEST_CLOCK_DISPARITY_MS / 1000;

    beforeEach(() => {
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);
    });

    async function validateAt(nowSeconds: number) {
      const proposal = await makeCheckpointProposal({
        checkpointHeader: makeCheckpointHeader(0, { slotNumber: currentSlot }),
        signer,
      });
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: EpochNumber(1),
        slot: currentSlot,
        ts: BigInt(Math.floor(nowSeconds)),
        nowMs: BigInt(Math.round(nowSeconds * 1000)),
      });
      return validator.validate(proposal);
    }

    it('accepts at the build frame start minus the disparity', async () => {
      expect(await validateAt(buildFrameStart - deltaSeconds)).toEqual({ result: 'accept' });
    });

    it('rejects just before the build frame start minus the disparity', async () => {
      expect(await validateAt(buildFrameStart - deltaSeconds - 0.001)).toEqual({
        result: 'reject',
        severity: PeerErrorSeverity.HighToleranceError,
      });
    });

    it('accepts at the receive deadline plus the disparity', async () => {
      expect(await validateAt(proposalDeadline + deltaSeconds)).toEqual({ result: 'accept' });
    });

    it('rejects just after the receive deadline plus the disparity', async () => {
      expect(await validateAt(proposalDeadline + deltaSeconds + 0.001)).toEqual({
        result: 'reject',
        severity: PeerErrorSeverity.HighToleranceError,
      });
    });
  });

  describe('validateTxs', () => {
    describe('txsPermitted', () => {
      it('rejects proposal with txHashes when txs not permitted', async () => {
        validator = new ProposalValidator(
          epochCache,
          makeTimetable(),
          {
            txsPermitted: false,
            maxTxsPerBlock: undefined,
            signatureContext: TEST_COORDINATION_SIGNATURE_CONTEXT,
            clockDisparityMs: TEST_CLOCK_DISPARITY_MS,
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
          makeTimetable(),
          {
            txsPermitted: false,
            maxTxsPerBlock: undefined,
            signatureContext: TEST_COORDINATION_SIGNATURE_CONTEXT,
            clockDisparityMs: TEST_CLOCK_DISPARITY_MS,
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
          makeTimetable(),
          {
            txsPermitted: true,
            maxTxsPerBlock: 2,
            signatureContext: TEST_COORDINATION_SIGNATURE_CONTEXT,
            clockDisparityMs: TEST_CLOCK_DISPARITY_MS,
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
          makeTimetable(),
          {
            txsPermitted: true,
            maxTxsPerBlock: 2,
            signatureContext: TEST_COORDINATION_SIGNATURE_CONTEXT,
            clockDisparityMs: TEST_CLOCK_DISPARITY_MS,
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
        makeTimetable(),
        {
          txsPermitted: true,
          maxBlocksPerCheckpoint: 5,
          signatureContext: TEST_COORDINATION_SIGNATURE_CONTEXT,
          clockDisparityMs: TEST_CLOCK_DISPARITY_MS,
        },
        'test',
      );
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);
    });

    it('accepts a block proposal whose indexWithinCheckpoint equals the consensus cap (5 >= 5) as slashing evidence', async () => {
      // Over the consensus limit but below the hard attestable ceiling: structurally valid proposer
      // misbehavior, so gossip validation accepts it for retention/re-broadcast rather than rejecting.
      const proposal = await makeBlockProposal({
        blockHeader: makeBlockHeader(0, { slotNumber: currentSlot }),
        indexWithinCheckpoint: IndexWithinCheckpoint(5),
        signer,
      });
      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'accept' });
    });

    it('accepts a block proposal at an over-consensus index well within the attestable ceiling', async () => {
      const proposal = await makeBlockProposal({
        blockHeader: makeBlockHeader(0, { slotNumber: currentSlot }),
        indexWithinCheckpoint: IndexWithinCheckpoint(MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT - 1),
        signer,
      });
      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'accept' });
    });

    it('rejects a block proposal at the hard attestable ceiling even with a lower consensus cap', async () => {
      const proposal = await makeBlockProposal({
        blockHeader: makeBlockHeader(0, { slotNumber: currentSlot }),
        indexWithinCheckpoint: IndexWithinCheckpoint(MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT),
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

  describe('maxBlocksPerCheckpoint hard ceiling', () => {
    const signer = Secp256k1Signer.random();

    beforeEach(() => {
      // No maxBlocksPerCheckpoint configured: the hard MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT ceiling must still apply.
      validator = new ProposalValidator(
        epochCache,
        makeTimetable(),
        {
          txsPermitted: true,
          signatureContext: TEST_COORDINATION_SIGNATURE_CONTEXT,
          clockDisparityMs: TEST_CLOCK_DISPARITY_MS,
        },
        'test',
      );
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);
    });

    it('rejects the block past the attestable limit even when maxBlocksPerCheckpoint is unset', async () => {
      // indexWithinCheckpoint is 0-based, so index 72 is the 73rd block.
      const proposal = await makeBlockProposal({
        blockHeader: makeBlockHeader(0, { slotNumber: currentSlot }),
        indexWithinCheckpoint: IndexWithinCheckpoint(MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT),
        signer,
      });
      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.MidToleranceError });
    });

    it('accepts the last block within the attestable limit', async () => {
      const proposal = await makeBlockProposal({
        blockHeader: makeBlockHeader(0, { slotNumber: currentSlot }),
        indexWithinCheckpoint: IndexWithinCheckpoint(MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT - 1),
        signer,
      });
      const result = await validator.validate(proposal);
      expect(result).toEqual({ result: 'accept' });
    });
  });

  describe('checkpoint proposal embedded last-block ceiling', () => {
    const signer = Secp256k1Signer.random();
    let checkpointValidator: CheckpointProposalValidator;

    beforeEach(() => {
      // No maxBlocksPerCheckpoint configured: the hard ceiling must still apply to the terminal block
      // carried inside the checkpoint proposal (it is not gossiped as a standalone block proposal).
      checkpointValidator = new CheckpointProposalValidator(epochCache, makeTimetable(), {
        txsPermitted: true,
        signatureContext: TEST_COORDINATION_SIGNATURE_CONTEXT,
        clockDisparityMs: TEST_CLOCK_DISPARITY_MS,
      });
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);
    });

    it('rejects when the embedded last block is past the attestable limit', async () => {
      const proposal = await makeCheckpointProposal({
        checkpointHeader: makeCheckpointHeader(0, { slotNumber: currentSlot }),
        signer,
        lastBlock: {
          blockHeader: makeBlockHeader(0, { slotNumber: currentSlot }),
          indexWithinCheckpoint: IndexWithinCheckpoint(MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT),
          txHashes: [],
        },
      });
      const result = await checkpointValidator.validate(proposal);
      expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.MidToleranceError });
    });

    it('accepts when the embedded last block is within the attestable limit', async () => {
      const proposal = await makeCheckpointProposal({
        checkpointHeader: makeCheckpointHeader(0, { slotNumber: currentSlot }),
        signer,
        lastBlock: {
          blockHeader: makeBlockHeader(0, { slotNumber: currentSlot }),
          indexWithinCheckpoint: IndexWithinCheckpoint(MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT - 1),
          txHashes: [],
        },
      });
      const result = await checkpointValidator.validate(proposal);
      expect(result).toEqual({ result: 'accept' });
    });
  });
});

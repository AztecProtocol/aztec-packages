import { BatchedBlob } from '@aztec/blob-lib/types';
import type { RollupContract } from '@aztec/ethereum/contracts';
import { randomL1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import type { L1TxUtils } from '@aztec/ethereum/l1-tx-utils';
import { CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { SecretValue } from '@aztec/foundation/config';
import { randomBytes } from '@aztec/foundation/crypto/random';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { PublisherConfig, TxSenderConfig } from '@aztec/sequencer-client';
import { Proof } from '@aztec/stdlib/proofs';
import { CheckpointHeader, RootRollupPublicInputs } from '@aztec/stdlib/rollup';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { ProverNodePublisher } from './prover-node-publisher.js';

const makeHeadersForRange = (fromCheckpoint: number, toCheckpoint: number) =>
  Array.from({ length: toCheckpoint - fromCheckpoint + 1 }, () => CheckpointHeader.random());

describe('prover-node-publisher', () => {
  // Prover publisher dependencies
  let rollup: MockProxy<RollupContract>;
  let l1Utils: MockProxy<L1TxUtils>;

  let publisher: ProverNodePublisher;

  let config: TxSenderConfig & PublisherConfig;

  beforeEach(() => {
    rollup = mock<RollupContract>();
    l1Utils = mock<L1TxUtils>();

    config = {
      l1ChainId: 1,
      l1RpcUrls: ['http://localhost:8545'],
      l1DebugRpcUrls: [],
      publisherPrivateKeys: [new SecretValue('0x1234')],
      viemPollingIntervalMS: 1000,
      ...randomL1ContractAddresses(),
    };
  });

  beforeEach(() => {
    publisher = new ProverNodePublisher(config, { rollupContract: rollup, l1TxUtils: l1Utils });
  });

  const setupPublishData = (pending: number, proven: number, fromCheckpoint: number, toCheckpoint: number) => {
    // Create public inputs for every checkpoint
    const checkpoints = Array.from({ length: 100 }, () => {
      return RootRollupPublicInputs.random();
    });

    // Return the tips specified by the test
    rollup.getTips.mockResolvedValue({
      pending: CheckpointNumber(pending),
      proven: CheckpointNumber(proven),
    });

    // Return the requested checkpoint
    rollup.getCheckpoint.mockImplementation((checkpointNumber: CheckpointNumber) =>
      Promise.resolve({
        archive: checkpoints[checkpointNumber - 1].endArchiveRoot,
        attestationsHash: Buffer32.ZERO, // unused,
        payloadDigest: Buffer32.ZERO, // unused,
        headerHash: Buffer32.ZERO, // unused,
        blobCommitmentsHash: Buffer32.ZERO, // unused,
        outHash: '0x', // unused,
        slotNumber: SlotNumber(0), // unused,
        feeHeader: {
          excessMana: 0n, // unused
          manaUsed: 0n, // unused
          ethPerFeeAsset: 0n, // unused
          congestionCost: 0n, // unused
          proverCost: 0n, // unused
        },
      }),
    );

    // We have built a rollup proof of the range fromCheckpoint - toCheckpoint
    // so we need to set our archives and hashes accordingly
    const ourPublicInputs = RootRollupPublicInputs.random();
    ourPublicInputs.previousArchiveRoot = checkpoints[fromCheckpoint - 2]?.endArchiveRoot ?? Fr.ZERO;
    ourPublicInputs.endArchiveRoot = checkpoints[toCheckpoint - 1]?.endArchiveRoot ?? Fr.ZERO;

    const ourBatchedBlob = new BatchedBlob(
      ourPublicInputs.blobPublicInputs.blobCommitmentsHash,
      ourPublicInputs.blobPublicInputs.z,
      ourPublicInputs.blobPublicInputs.y,
      ourPublicInputs.blobPublicInputs.c,
      ourPublicInputs.blobPublicInputs.c.negate(), // Fill with dummy value
    );

    // Return our public inputs
    const totalFields = ourPublicInputs.toFields();
    rollup.getEpochProofPublicInputs.mockResolvedValue(totalFields);

    return {
      epochNumber: EpochNumber(2),
      fromCheckpoint: CheckpointNumber(fromCheckpoint),
      toCheckpoint: CheckpointNumber(toCheckpoint),
      publicInputs: ourPublicInputs,
      headers: makeHeadersForRange(fromCheckpoint, toCheckpoint),
      proof: Proof.empty(),
      batchedBlobInputs: ourBatchedBlob,
      attestations: [],
    };
  };

  const testCases = [
    // Usual case of proving full epoch
    { pending: 65, proven: 32, fromCheckpoint: 33, toCheckpoint: 64, expectedPublish: true, message: '' },
    // Failure case of proving beyond the pending chain
    {
      pending: 65,
      proven: 32,
      fromCheckpoint: 33,
      toCheckpoint: 66,
      expectedPublish: false,
      message: 'Cannot submit epoch proof for 33-66 as proposed checkpoint is 65',
    },
    // Some successful partial epochs
    { pending: 33, proven: 32, fromCheckpoint: 33, toCheckpoint: 33, expectedPublish: true, message: '' },
    { pending: 65, proven: 32, fromCheckpoint: 33, toCheckpoint: 38, expectedPublish: true, message: '' },
    { pending: 40, proven: 32, fromCheckpoint: 33, toCheckpoint: 33, expectedPublish: true, message: '' },

    // Somebody else proved the entire epoch already

    // We try and prove the full epoch - succeeds
    { pending: 65, proven: 64, fromCheckpoint: 33, toCheckpoint: 64, expectedPublish: true, message: '' },

    // We try and prove a partial epoch that falls short of the end - fails as pointless to publish
    {
      pending: 65,
      proven: 64,
      fromCheckpoint: 33,
      toCheckpoint: 35,
      expectedPublish: false,
      message: 'Cannot submit epoch proof for 33-35 as proven checkpoint is 64',
    },

    // Somebody else partially proved the epoch already

    // We try and prove the rest of the epoch - succeeds
    { pending: 65, proven: 40, fromCheckpoint: 41, toCheckpoint: 64, expectedPublish: true, message: '' },

    // We try and prove all of the epoch - succeeds
    { pending: 65, proven: 40, fromCheckpoint: 33, toCheckpoint: 64, expectedPublish: true, message: '' },

    // We try and partially prove the epoch after their proof - succeeds again
    { pending: 65, proven: 40, fromCheckpoint: 41, toCheckpoint: 45, expectedPublish: true, message: '' },

    // We try and partially prove the epoch on top of their proof - succeeds again
    { pending: 65, proven: 40, fromCheckpoint: 33, toCheckpoint: 45, expectedPublish: true, message: '' },

    // We try and partially prove the epoch and partially on top of their proof - succeeds again
    { pending: 65, proven: 40, fromCheckpoint: 35, toCheckpoint: 45, expectedPublish: true, message: '' },

    // We try and partially prove the epoch but less than was already proven - fails as pointless
    {
      pending: 65,
      proven: 40,
      fromCheckpoint: 33,
      toCheckpoint: 39,
      expectedPublish: false,
      message: 'Cannot submit epoch proof for 33-39 as proven checkpoint is 40',
    },

    // We try and partially prove the epoch but the same as was already proven - should possibly fail but succeeds for now, quite an edge case
    {
      pending: 65,
      proven: 40,
      fromCheckpoint: 33,
      toCheckpoint: 40,
      expectedPublish: true,
    },
  ];

  test.each(testCases)(
    'submits proof for epoch with proposed checkpoint: $pending, proven checkpoint: $proven, fromCheckpoint: $fromCheckpoint, toCheckpoint: $toCheckpoint',
    async ({ pending, proven, fromCheckpoint, toCheckpoint, expectedPublish, message }) => {
      const publishData = setupPublishData(pending, proven, fromCheckpoint, toCheckpoint);

      const result = await publisher
        .submitEpochProof(publishData)
        .then(() => 'Success')
        .catch(error => error.message);

      if (expectedPublish) {
        expect(result).toBe('Success');
        expect(l1Utils.sendAndMonitorTransaction).toHaveBeenCalled();
      } else {
        expect(result).toBe(message);
        expect(l1Utils.sendAndMonitorTransaction).not.toHaveBeenCalled();
      }
    },
  );

  describe('proof submission target', () => {
    it('defaults the submit tx target to the rollup address', async () => {
      const rollupAddress = EthAddress.random().toString();
      (rollup as any).address = rollupAddress;
      publisher = new ProverNodePublisher(config, { rollupContract: rollup, l1TxUtils: l1Utils });

      await publisher.submitEpochProof(setupPublishData(65, 32, 33, 64));
      expect(l1Utils.sendAndMonitorTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ to: rollupAddress }),
        expect.anything(),
      );
    });

    it('redirects the submit tx to the configured proof submission target', async () => {
      (rollup as any).address = EthAddress.random().toString();
      const target = EthAddress.random();
      publisher = new ProverNodePublisher(config, {
        rollupContract: rollup,
        l1TxUtils: l1Utils,
        proofSubmissionTarget: target,
      });

      await publisher.submitEpochProof(setupPublishData(65, 32, 33, 64));
      expect(l1Utils.sendAndMonitorTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ to: target.toString() }),
        expect.anything(),
      );
    });
  });

  it('analyzeEpochProofSubmission validates, estimates, and does not send tx', async () => {
    const fromCheckpoint = 33;
    const toCheckpoint = 64;

    rollup.getTips.mockResolvedValue({ pending: CheckpointNumber(65), proven: CheckpointNumber(32) });

    const checkpoints = Array.from({ length: 100 }, () => RootRollupPublicInputs.random());
    rollup.getCheckpoint.mockImplementation((n: CheckpointNumber) =>
      Promise.resolve({
        archive: checkpoints[n - 1].endArchiveRoot,
        attestationsHash: Buffer32.ZERO,
        payloadDigest: Buffer32.ZERO,
        headerHash: Buffer32.ZERO,
        blobCommitmentsHash: Buffer32.ZERO,
        outHash: '0x',
        slotNumber: SlotNumber(0),
        feeHeader: { excessMana: 0n, manaUsed: 0n, ethPerFeeAsset: 0n, congestionCost: 0n, proverCost: 0n },
      }),
    );

    const ourPublicInputs = RootRollupPublicInputs.random();
    ourPublicInputs.previousArchiveRoot = checkpoints[fromCheckpoint - 2].endArchiveRoot;
    ourPublicInputs.endArchiveRoot = checkpoints[toCheckpoint - 1].endArchiveRoot;
    rollup.getEpochProofPublicInputs.mockResolvedValue([...ourPublicInputs.toFields()]);

    jest.spyOn(l1Utils, 'getSenderAddress').mockReturnValue(EthAddress.random());
    jest.spyOn(l1Utils, 'estimateGas').mockResolvedValue(500_000n);
    jest
      .spyOn(l1Utils, 'getGasPrice')
      .mockResolvedValue({ maxFeePerGas: 20_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n });
    (l1Utils as any).client = {
      getBlock: jest
        .fn<() => Promise<{ baseFeePerGas: bigint }>>()
        .mockResolvedValue({ baseFeePerGas: 10_000_000_000n }),
    };

    const batchedBlob = new BatchedBlob(
      ourPublicInputs.blobPublicInputs.blobCommitmentsHash,
      ourPublicInputs.blobPublicInputs.z,
      ourPublicInputs.blobPublicInputs.y,
      ourPublicInputs.blobPublicInputs.c,
      ourPublicInputs.blobPublicInputs.c.negate(),
    );

    await publisher.analyzeEpochProofSubmission({
      epochNumber: EpochNumber(2),
      fromCheckpoint: CheckpointNumber(fromCheckpoint),
      toCheckpoint: CheckpointNumber(toCheckpoint),
      publicInputs: ourPublicInputs,
      headers: makeHeadersForRange(fromCheckpoint, toCheckpoint),
      proof: Proof.empty(),
      batchedBlobInputs: batchedBlob,
      attestations: [],
    });

    expect(l1Utils.estimateGas).toHaveBeenCalled();
    expect(l1Utils.getGasPrice).toHaveBeenCalled();
    expect(l1Utils.sendAndMonitorTransaction).not.toHaveBeenCalled();
  });

  it('handles reverted txs correctly', async () => {
    const checkpoints = [RootRollupPublicInputs.random(), RootRollupPublicInputs.random()];

    // Return the tips specified by the test
    rollup.getTips.mockResolvedValue({
      pending: CheckpointNumber(2),
      proven: CheckpointNumber(1),
    });

    // Return the requested checkpoint
    rollup.getCheckpoint.mockImplementation((checkpointNumber: CheckpointNumber) =>
      Promise.resolve({
        archive: checkpoints[checkpointNumber - 1].endArchiveRoot,
        attestationsHash: Buffer32.ZERO, // unused,
        payloadDigest: Buffer32.ZERO, // unused,
        headerHash: Buffer32.ZERO, // unused,
        blobCommitmentsHash: Buffer32.ZERO, // unused,
        outHash: '0x', // unused,
        slotNumber: SlotNumber(0), // unused,
        feeHeader: {
          excessMana: 0n, // unused
          manaUsed: 0n, // unused
          ethPerFeeAsset: 0n, // unused
          congestionCost: 0n, // unused
          proverCost: 0n, // unused
        },
      }),
    );

    // We have built a rollup proof of the range fromCheckpoint - toCheckpoint
    // so we need to set our archives and hashes accordingly
    const ourPublicInputs = RootRollupPublicInputs.random();
    ourPublicInputs.previousArchiveRoot = checkpoints[0].endArchiveRoot ?? Fr.ZERO;
    ourPublicInputs.endArchiveRoot = checkpoints[1].endArchiveRoot ?? Fr.ZERO;

    const ourBatchedBlob = new BatchedBlob(
      ourPublicInputs.blobPublicInputs.blobCommitmentsHash,
      ourPublicInputs.blobPublicInputs.z,
      ourPublicInputs.blobPublicInputs.y,
      ourPublicInputs.blobPublicInputs.c,
      ourPublicInputs.blobPublicInputs.c.negate(), // Fill with dummy value
    );

    // Return our public inputs
    const totalFields = ourPublicInputs.toFields();
    rollup.getEpochProofPublicInputs.mockResolvedValue(totalFields);

    jest.spyOn(l1Utils, 'getSenderBalance').mockResolvedValue(42n);
    jest.spyOn(l1Utils, 'getSenderAddress').mockReturnValue(EthAddress.random());

    jest.spyOn(l1Utils, 'sendAndMonitorTransaction').mockResolvedValue({
      state: { gasPrice: {} as any } as any,
      receipt: {
        status: 'reverted',
        effectiveGasPrice: 1n,
        gasUsed: 1n,
        transactionHash: `0x${randomBytes(32).toString('hex')}`,
        cumulativeGasUsed: 1n,
        blockNumber: 42n,
        blockHash: `0x${randomBytes(32).toString('hex')}`,
        from: EthAddress.random().toString(),
      } as any,
    });

    jest.spyOn(l1Utils, 'getTransactionStats').mockResolvedValue({
      calldataGas: 1,
      calldataSize: 1,
      sender: EthAddress.random().toString(),
      transactionHash: `0x${randomBytes(32).toString('hex')}`,
    });

    const result = await publisher.submitEpochProof({
      epochNumber: EpochNumber(2),
      fromCheckpoint: CheckpointNumber(2),
      toCheckpoint: CheckpointNumber(2),
      publicInputs: ourPublicInputs,
      headers: makeHeadersForRange(2, 2),
      proof: Proof.empty(),
      batchedBlobInputs: ourBatchedBlob,
      attestations: [],
    });

    expect(result).toBe(false);
  });
});

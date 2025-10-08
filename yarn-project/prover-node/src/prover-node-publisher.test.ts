import { BatchedBlob } from '@aztec/blob-lib';
import type { L1TxUtils, RollupContract } from '@aztec/ethereum';
import { SecretValue } from '@aztec/foundation/config';
import { randomBytes } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import type { PublisherConfig, TxSenderConfig } from '@aztec/sequencer-client';
import { Proof } from '@aztec/stdlib/proofs';
import { RootRollupPublicInputs } from '@aztec/stdlib/rollup';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { ProverNodePublisher } from './prover-node-publisher.js';

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
      publisherPrivateKeys: [new SecretValue('0x1234')],
      viemPollingIntervalMS: 1000,
      l1Contracts: {
        rollupAddress: EthAddress.random(),
        registryAddress: EthAddress.random(),
        inboxAddress: EthAddress.random(),
        outboxAddress: EthAddress.random(),
        rewardDistributorAddress: EthAddress.random(),
        feeJuicePortalAddress: EthAddress.random(),
        coinIssuerAddress: EthAddress.random(),
        governanceAddress: EthAddress.random(),
        governanceProposerAddress: EthAddress.random(),
        feeJuiceAddress: EthAddress.random(),
        stakingAssetAddress: EthAddress.random(),
      },
    };
  });

  beforeEach(() => {
    publisher = new ProverNodePublisher(config, { rollupContract: rollup, l1TxUtils: l1Utils });
  });

  const testCases = [
    // Usual case of proving full epoch
    { pendingBlockNumber: 65n, provenBlockNumber: 32n, fromBlock: 33, toBlock: 64, expectedPublish: true, message: '' },
    // Failure case of proving beyond the pending chain
    {
      pendingBlockNumber: 65n,
      provenBlockNumber: 32n,
      fromBlock: 33,
      toBlock: 66,
      expectedPublish: false,
      message: 'Cannot submit epoch proof for 33-66 as pending block is 65',
    },
    // Some successful partial epochs
    { pendingBlockNumber: 33n, provenBlockNumber: 32n, fromBlock: 33, toBlock: 33, expectedPublish: true, message: '' },
    { pendingBlockNumber: 65n, provenBlockNumber: 32n, fromBlock: 33, toBlock: 38, expectedPublish: true, message: '' },
    { pendingBlockNumber: 40n, provenBlockNumber: 32n, fromBlock: 33, toBlock: 33, expectedPublish: true, message: '' },

    // Somebody else proved the entire epoch already

    // We try and prove the full epoch - succeeds
    { pendingBlockNumber: 65n, provenBlockNumber: 64n, fromBlock: 33, toBlock: 64, expectedPublish: true, message: '' },

    // We try and prove a partial epoch that falls short of the end - fails as pointless to publish
    {
      pendingBlockNumber: 65n,
      provenBlockNumber: 64n,
      fromBlock: 33,
      toBlock: 35,
      expectedPublish: false,
      message: 'Cannot submit epoch proof for 33-35 as proven block is 64',
    },

    // Somebody else partially proved the epoch already

    // We try and prove the rest of the epoch - succeeds
    { pendingBlockNumber: 65n, provenBlockNumber: 40n, fromBlock: 41, toBlock: 64, expectedPublish: true, message: '' },

    // We try and prove all of the epoch - succeeds
    { pendingBlockNumber: 65n, provenBlockNumber: 40n, fromBlock: 33, toBlock: 64, expectedPublish: true, message: '' },

    // We try and partially prove the epoch after their proof - succeeds again
    { pendingBlockNumber: 65n, provenBlockNumber: 40n, fromBlock: 41, toBlock: 45, expectedPublish: true, message: '' },

    // We try and partially prove the epoch on top of their proof - succeeds again
    { pendingBlockNumber: 65n, provenBlockNumber: 40n, fromBlock: 33, toBlock: 45, expectedPublish: true, message: '' },

    // We try and partially prove the epoch and partially on top of their proof - succeeds again
    { pendingBlockNumber: 65n, provenBlockNumber: 40n, fromBlock: 35, toBlock: 45, expectedPublish: true, message: '' },

    // We try and partially prove the epoch but less than was already proven - fails as pointless
    {
      pendingBlockNumber: 65n,
      provenBlockNumber: 40n,
      fromBlock: 33,
      toBlock: 39,
      expectedPublish: false,
      message: 'Cannot submit epoch proof for 33-39 as proven block is 40',
    },

    // We try and partially prove the epoch but the same as was already proven - should possibly fail but succeeds for now, quite an edge case
    {
      pendingBlockNumber: 65n,
      provenBlockNumber: 40n,
      fromBlock: 33,
      toBlock: 40,
      expectedPublish: true,
    },
  ];

  test.each(testCases)(
    'submits proof for epoch with pendingBlock: $pendingBlockNumber, provenBlock: $provenBlockNumber, fromBlock: $fromBlock, toBlock: $toBlock',
    async ({ pendingBlockNumber, provenBlockNumber, fromBlock, toBlock, expectedPublish, message }) => {
      // Create public inputs for every block
      const blocks = Array.from({ length: 100 }, () => {
        return RootRollupPublicInputs.random();
      });

      // Return the tips specified by the test
      rollup.getTips.mockResolvedValue({
        pendingBlockNumber,
        provenBlockNumber,
      });

      // Return the requested block
      rollup.getBlock.mockImplementation((blockNumber: bigint) =>
        Promise.resolve({
          archive: blocks[Number(blockNumber) - 1].endArchiveRoot.toString(),
          attestationsHash: '0x', // unused,
          payloadDigest: '0x', // unused,
          headerHash: '0x', // unused,
          blobCommitmentsHash: '0x', // unused,
          slotNumber: 0n, // unused,
          feeHeader: {
            excessMana: 0n, // unused
            manaUsed: 0n, // unused
            feeAssetPriceNumerator: 0n, // unused
            congestionCost: 0n, // unused
            proverCost: 0n, // unused
          },
        }),
      );

      // We have built a rollup proof of the range fromBlock - toBlock
      // so we need to set our archives and hashes accordingly
      const ourPublicInputs = RootRollupPublicInputs.random();
      ourPublicInputs.previousArchiveRoot = blocks[fromBlock - 2]?.endArchiveRoot ?? Fr.ZERO;
      ourPublicInputs.endArchiveRoot = blocks[toBlock - 1]?.endArchiveRoot ?? Fr.ZERO;

      const ourBatchedBlob = new BatchedBlob(
        ourPublicInputs.blobPublicInputs.blobCommitmentsHash,
        ourPublicInputs.blobPublicInputs.z,
        ourPublicInputs.blobPublicInputs.y,
        ourPublicInputs.blobPublicInputs.c,
        ourPublicInputs.blobPublicInputs.c.negate(), // Fill with dummy value
      );

      // Return our public inputs
      const totalFields = ourPublicInputs.toFields();
      rollup.getEpochProofPublicInputs.mockResolvedValue(totalFields.map(x => x.toString()));

      const result = await publisher
        .submitEpochProof({
          epochNumber: 2,
          fromBlock,
          toBlock,
          publicInputs: ourPublicInputs,
          proof: Proof.empty(),
          batchedBlobInputs: ourBatchedBlob,
          attestations: [],
        })
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

  it('handles reverted txs correctly', async () => {
    const blocks = [RootRollupPublicInputs.random(), RootRollupPublicInputs.random()];

    // Return the tips specified by the test
    rollup.getTips.mockResolvedValue({
      pendingBlockNumber: 2n,
      provenBlockNumber: 1n,
    });

    // Return the requested block
    rollup.getBlock.mockImplementation((i: bigint) =>
      Promise.resolve({
        archive: blocks[Number(i) - 1].endArchiveRoot.toString(),
        attestationsHash: '0x', // unused,
        payloadDigest: '0x', // unused,
        headerHash: '0x', // unused,
        blobCommitmentsHash: '0x', // unused,
        slotNumber: 0n, // unused,
        feeHeader: {
          excessMana: 0n, // unused
          manaUsed: 0n, // unused
          feeAssetPriceNumerator: 0n, // unused
          congestionCost: 0n, // unused
          proverCost: 0n, // unused
        },
      }),
    );

    // We have built a rollup proof of the range fromBlock - toBlock
    // so we need to set our archives and hashes accordingly
    const ourPublicInputs = RootRollupPublicInputs.random();
    ourPublicInputs.previousArchiveRoot = blocks[0].endArchiveRoot ?? Fr.ZERO;
    ourPublicInputs.endArchiveRoot = blocks[1].endArchiveRoot ?? Fr.ZERO;

    const ourBatchedBlob = new BatchedBlob(
      ourPublicInputs.blobPublicInputs.blobCommitmentsHash,
      ourPublicInputs.blobPublicInputs.z,
      ourPublicInputs.blobPublicInputs.y,
      ourPublicInputs.blobPublicInputs.c,
      ourPublicInputs.blobPublicInputs.c.negate(), // Fill with dummy value
    );

    // Return our public inputs
    const totalFields = ourPublicInputs.toFields();
    rollup.getEpochProofPublicInputs.mockResolvedValue(totalFields.map(x => x.toString()));

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
      epochNumber: 2,
      fromBlock: 2,
      toBlock: 2,
      publicInputs: ourPublicInputs,
      proof: Proof.empty(),
      batchedBlobInputs: ourBatchedBlob,
      attestations: [],
    });

    expect(result).toBe(false);
  });
});

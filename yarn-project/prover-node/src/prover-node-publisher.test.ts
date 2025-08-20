import { BatchedBlob } from '@aztec/blob-lib';
import type { L1TxUtils, RollupContract } from '@aztec/ethereum';
import { SecretValue } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import type { PublisherConfig, TxSenderConfig } from '@aztec/sequencer-client';
import { Proof } from '@aztec/stdlib/proofs';
import { RootRollupPublicInputs } from '@aztec/stdlib/rollup';

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
      publisherPrivateKey: new SecretValue('0x1234'),
      l1PublishRetryIntervalMS: 1000,
      viemPollingIntervalMS: 1000,
      customForwarderContractAddress: EthAddress.random(),
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
      rollup.getBlock.mockImplementation((blockNumber: bigint) => {
        const block = blocks[Number(blockNumber) - 1];
        const headerHash = block.proposedBlockHeaderHashes[Number(blockNumber) - fromBlock]?.toString() ?? '0x';
        return Promise.resolve({
          // only blocks at end of epoch have an archive
          archive:
            Number(blockNumber) === fromBlock - 1 ? blocks[Number(blockNumber) - 1].endArchiveRoot.toString() : '0x',
          headerHash: headerHash as `0x${string}`,
          attestationsHash: '0x', // unused,
          payloadDigest: '0x', // unused,
          blobCommitmentsHash: '0x', // unused,
          slotNumber: 0n, // unused,
          feeHeader: {
            excessMana: 0n, // unused
            manaUsed: 0n, // unused
            feeAssetPriceNumerator: 0n, // unused
            congestionCost: 0n, // unused
            proverCost: 0n, // unused
          },
        });
      });

      // We have built a rollup proof of the range fromBlock - toBlock
      // so we need to set our archives and hashes accordingly
      const ourPublicInputs = RootRollupPublicInputs.random();
      ourPublicInputs.previousArchiveRoot = blocks[fromBlock - 2]?.endArchiveRoot ?? Fr.ZERO;
      ourPublicInputs.proposedBlockHeaderHashes[toBlock - fromBlock] =
        blocks[toBlock - 1]?.proposedBlockHeaderHashes[toBlock - fromBlock] ?? Fr.ZERO;

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
});

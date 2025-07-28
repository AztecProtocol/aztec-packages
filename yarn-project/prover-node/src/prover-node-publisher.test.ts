import { BatchedBlob } from '@aztec/blob-lib';
import type { InboxContract, L1TxUtils, RollupContract } from '@aztec/ethereum';
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
  let inbox: MockProxy<InboxContract>;
  let l1Utils: MockProxy<L1TxUtils>;

  let publisher: ProverNodePublisher;

  let config: TxSenderConfig & PublisherConfig;

  beforeEach(() => {
    rollup = mock<RollupContract>();
    inbox = mock<InboxContract>();
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
    publisher = new ProverNodePublisher(config, {
      rollupContract: rollup,
      inboxContract: inbox,
      l1TxUtils: l1Utils,
    });
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

    // We create a case that will need to lower the anchor forcefully to ensure it will do so
    {
      pendingBlockNumber: 65n,
      provenBlockNumber: 32n,
      fromBlock: 33,
      toBlock: 64,
      expectedPublish: true,
      message: '',
      mustLowerAnchor: true,
    },
  ];

  test.each(testCases)(
    'submits proof for epoch with pendingBlock: $pendingBlockNumber, provenBlock: $provenBlockNumber, fromBlock: $fromBlock, toBlock: $toBlock',
    async ({
      pendingBlockNumber,
      provenBlockNumber,
      fromBlock,
      toBlock,
      expectedPublish,
      message,
      mustLowerAnchor,
    }) => {
      // Create public inputs for every block
      const blocks = Array.from({ length: 100 }, () => {
        return RootRollupPublicInputs.random();
      });

      inbox.getLastAnchorBlockNumber.mockResolvedValue(mustLowerAnchor ? BigInt(toBlock - 1) : pendingBlockNumber);

      if (mustLowerAnchor) {
        inbox.lowerAnchorForcefully.mockResolvedValue({
          receipt: {
            transactionHash: '0x',
            status: 'success',
            blockHash: '0x',
            blockNumber: 0n,
            contractAddress: '0x',
            cumulativeGasUsed: 0n,
            gasUsed: 0n,
            logs: [],
            logsBloom: '0x',
            transactionIndex: 0,
            from: '0x',
            to: '0x',
            type: '0x',
            effectiveGasPrice: 0n,
          },
          gasPrice: {
            maxFeePerGas: 0n,
            maxPriorityFeePerGas: 0n,
          },
        });
      }

      inbox.getAnchorChain.mockResolvedValue([]);

      // Return the tips specified by the test
      rollup.getTips.mockResolvedValue({
        pendingBlockNumber,
        provenBlockNumber,
      });

      // Return the requested block
      rollup.getBlock.mockImplementation((blockNumber: bigint) =>
        Promise.resolve({
          archive: blocks[Number(blockNumber) - 1].endArchiveRoot.toString(),
          headerHash: '0x', // unused,
          blobCommitmentsHash: '0x', // unused,
          inHash: '0x', // unused,
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

      if (mustLowerAnchor) {
        expect(inbox.lowerAnchorForcefully).toHaveBeenCalled();
      } else {
        expect(inbox.lowerAnchorForcefully).not.toHaveBeenCalled();
      }
    },
  );
});

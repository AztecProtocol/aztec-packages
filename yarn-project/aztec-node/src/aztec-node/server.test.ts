import { TestCircuitVerifier } from '@aztec/bb-prover';
import { EpochCache } from '@aztec/epoch-cache';
import type { RollupContract } from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { DateProvider } from '@aztec/foundation/timer';
import { unfreeze } from '@aztec/foundation/types';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import type { P2P } from '@aztec/p2p';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import type { GlobalVariableBuilder } from '@aztec/sequencer-client';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { EmptyL1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { GasFees } from '@aztec/stdlib/gas';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { L2LogsSource, MerkleTreeReadOperations, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { RollupValidationRequests } from '@aztec/stdlib/kernel';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { mockTx } from '@aztec/stdlib/testing';
import { MerkleTreeId, PublicDataTreeLeaf, PublicDataTreeLeafPreimage } from '@aztec/stdlib/trees';
import {
  BlockHeader,
  GlobalVariables,
  IncludeByTimestamp,
  TX_ERROR_DUPLICATE_NULLIFIER_IN_TX,
  TX_ERROR_INCORRECT_L1_CHAIN_ID,
  TX_ERROR_INCORRECT_ROLLUP_VERSION,
  TX_ERROR_INVALID_INCLUDE_BY_TIMESTAMP,
} from '@aztec/stdlib/tx';
import { getPackageVersion } from '@aztec/stdlib/update-checker';

import { readFileSync } from 'fs';
import { type MockProxy, mock } from 'jest-mock-extended';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { type AztecNodeConfig, getConfigEnvVars } from './config.js';
import { AztecNodeService } from './server.js';

// Arbitrary fixed timestamp for the mock date provider. DateProvider.now() returns milliseconds but IncludeByTimestamp
// is denominated in seconds.
const NOW_MS = 1718745600000;
const NOW_S = NOW_MS / 1000;

// We create a mock date provider to have control over the next slot timestamp.
class MockDateProvider extends DateProvider {
  public override now(): number {
    return NOW_MS;
  }
}

describe('aztec node', () => {
  let p2p: MockProxy<P2P>;
  let globalVariablesBuilder: MockProxy<GlobalVariableBuilder>;
  let merkleTreeOps: MockProxy<MerkleTreeReadOperations>;
  let l2BlockSource: MockProxy<L2BlockSource>;
  let lastBlockNumber: number;
  let node: AztecNode;
  let feePayer: AztecAddress;
  let epochCache: EpochCache;

  const chainId = new Fr(12345);
  const rollupVersion = new Fr(1);

  const mockTxForRollup = async (seed: number) => {
    return await mockTx(seed, {
      numberOfNonRevertiblePublicCallRequests: 0,
      numberOfRevertiblePublicCallRequests: 0,
      feePayer,
      chainId,
      version: rollupVersion,
      vkTreeRoot: getVKTreeRoot(),
      protocolContractTreeRoot,
    });
  };

  beforeEach(async () => {
    lastBlockNumber = 0;

    feePayer = await AztecAddress.random();
    const feePayerSlot = await computeFeePayerBalanceLeafSlot(feePayer);
    const feePayerSlotIndex = 87654n;
    const feePayerBalance = 10n ** 20n;

    p2p = mock<P2P>();

    globalVariablesBuilder = mock<GlobalVariableBuilder>();
    globalVariablesBuilder.getCurrentBaseFees.mockResolvedValue(new GasFees(0, 0));

    merkleTreeOps = mock<MerkleTreeReadOperations>();
    merkleTreeOps.findLeafIndices.mockImplementation((treeId: MerkleTreeId, _value: any[]) => {
      if (treeId === MerkleTreeId.ARCHIVE) {
        return Promise.resolve([1n]);
      } else {
        return Promise.resolve([undefined]);
      }
    });
    merkleTreeOps.getPreviousValueIndex.mockImplementation((treeId: MerkleTreeId, value: bigint) => {
      if (treeId === MerkleTreeId.PUBLIC_DATA_TREE && value === feePayerSlot.toBigInt()) {
        return Promise.resolve({ index: feePayerSlotIndex, alreadyPresent: true });
      } else {
        return Promise.resolve(undefined);
      }
    });
    merkleTreeOps.getLeafPreimage.mockImplementation((treeId: MerkleTreeId, index: bigint) => {
      if (treeId === MerkleTreeId.PUBLIC_DATA_TREE && index === feePayerSlotIndex) {
        return Promise.resolve(
          new PublicDataTreeLeafPreimage(
            new PublicDataTreeLeaf(feePayerSlot, new Fr(feePayerBalance)),
            Fr.random(),
            feePayerSlotIndex + 1n,
          ),
        );
      } else {
        return Promise.resolve(undefined);
      }
    });

    const worldState = mock<WorldStateSynchronizer>({
      getCommitted: () => merkleTreeOps,
    });

    l2BlockSource = mock<L2BlockSource>();
    l2BlockSource.getBlockNumber.mockImplementation(() => Promise.resolve(lastBlockNumber));

    const l2LogsSource = mock<L2LogsSource>();

    const l1ToL2MessageSource = mock<L1ToL2MessageSource>();

    // all txs use the same allowed FPC class
    const contractSource = mock<ContractDataSource>();

    const aztecNodeConfig: AztecNodeConfig = getConfigEnvVars();

    // We never request any info from the rollup contract here, since only the `getEpochAndSlotInNextL1Slot` method
    // on the epoch cache is used so a simple mock will suffice.
    const rollupContract = mock<RollupContract>();
    // We pass MockDateProvider to the epoch cache to have control over the next slot timestamp
    epochCache = new EpochCache(rollupContract, 0n, undefined, 0n, EmptyL1RollupConstants, new MockDateProvider());

    node = new AztecNodeService(
      {
        ...aztecNodeConfig,
        l1Contracts: {
          ...aztecNodeConfig.l1Contracts,
          rollupAddress: EthAddress.ZERO,
          registryAddress: EthAddress.ZERO,
          inboxAddress: EthAddress.ZERO,
          outboxAddress: EthAddress.ZERO,
        },
      },
      p2p,
      l2BlockSource,
      l2LogsSource,
      contractSource,
      l1ToL2MessageSource,
      worldState,
      undefined,
      undefined,
      undefined,
      undefined,
      12345,
      rollupVersion.toNumber(),
      globalVariablesBuilder,
      epochCache,
      getPackageVersion() ?? '',
      new TestCircuitVerifier(),
    );
  });

  describe('tx validation', () => {
    it('tests that the node correctly validates double spends', async () => {
      const txs = await Promise.all([mockTxForRollup(0x10000), mockTxForRollup(0x20000)]);
      const doubleSpendTx = txs[0];
      const doubleSpendWithExistingTx = txs[1];
      lastBlockNumber += 1;

      expect(await node.isValidTx(doubleSpendTx)).toEqual({ result: 'valid' });

      // We push a duplicate nullifier that was created in the same transaction
      doubleSpendTx.data.forRollup!.end.nullifiers[1] = doubleSpendTx.data.forRollup!.end.nullifiers[0];

      expect(await node.isValidTx(doubleSpendTx)).toEqual({
        result: 'invalid',
        reason: [TX_ERROR_DUPLICATE_NULLIFIER_IN_TX],
      });

      expect(await node.isValidTx(doubleSpendWithExistingTx)).toEqual({ result: 'valid' });

      // We make a nullifier from `doubleSpendWithExistingTx` a part of the nullifier tree, so it gets rejected as double spend
      const doubleSpendNullifier = doubleSpendWithExistingTx.data.forRollup!.end.nullifiers[0].toBuffer();
      merkleTreeOps.findLeafIndices.mockImplementation((treeId: MerkleTreeId, value: any[]) => {
        let retVal: [bigint | undefined] = [undefined];
        if (treeId === MerkleTreeId.ARCHIVE) {
          retVal = [1n];
        } else if (treeId === MerkleTreeId.NULLIFIER_TREE) {
          retVal = value[0].equals(doubleSpendNullifier) ? [1n] : [undefined];
        }
        return Promise.resolve(retVal);
      });

      expect(await node.isValidTx(doubleSpendWithExistingTx)).toEqual({
        result: 'invalid',
        reason: ['Existing nullifier'],
      });
      lastBlockNumber = 0;
    });

    it('tests that the node correctly validates chain id', async () => {
      const tx = await mockTxForRollup(0x10000);
      expect(await node.isValidTx(tx)).toEqual({ result: 'valid' });

      // We make the chain id on the tx not equal to the configured chain id
      tx.data.constants.txContext.chainId = new Fr(1n + chainId.toBigInt());

      expect(await node.isValidTx(tx)).toEqual({ result: 'invalid', reason: [TX_ERROR_INCORRECT_L1_CHAIN_ID] });
    });

    it('tests that the node correctly validates rollup version', async () => {
      const tx = await mockTxForRollup(0x10000);
      expect(await node.isValidTx(tx)).toEqual({ result: 'valid' });

      // We make the chain id on the tx not equal to the configured chain id
      tx.data.constants.txContext.version = new Fr(1n + rollupVersion.toBigInt());

      expect(await node.isValidTx(tx)).toEqual({ result: 'invalid', reason: [TX_ERROR_INCORRECT_ROLLUP_VERSION] });
    });

    it('tests that the node correctly validates expiration timestamps', async () => {
      const txs = await Promise.all([mockTxForRollup(0x10000), mockTxForRollup(0x20000), mockTxForRollup(0x30000)]);
      const noIncludeByTimestampMetadata = txs[0];
      const invalidIncludeByTimestampMetadata = txs[1];
      const validIncludeByTimestampMetadata = txs[2];

      invalidIncludeByTimestampMetadata.data.rollupValidationRequests = new RollupValidationRequests(
        new IncludeByTimestamp(true, BigInt(NOW_S)),
      );

      validIncludeByTimestampMetadata.data.rollupValidationRequests = new RollupValidationRequests(
        new IncludeByTimestamp(true, BigInt(NOW_S + 1)),
      );

      // We need to set the last block number to get this working properly because if it was set to 0, it would mean
      // that we are building block 1, and for block 1 the timestamp expiration check is skipped. For details on why
      // see the `validate_include_by_timestamp` function in
      // `noir-projects/noir-protocol-circuits/crates/rollup-lib/src/base/components/validation_requests.nr`.
      lastBlockNumber = 1;

      // Default tx with no should be valid
      expect(await node.isValidTx(noIncludeByTimestampMetadata)).toEqual({ result: 'valid' });
      // Tx with include by timestamp < current block number should be invalid
      expect(await node.isValidTx(invalidIncludeByTimestampMetadata)).toEqual({
        result: 'invalid',
        reason: [TX_ERROR_INVALID_INCLUDE_BY_TIMESTAMP],
      });
      // Tx with include by timestamp >= current block number should be valid
      expect(await node.isValidTx(validIncludeByTimestampMetadata)).toEqual({ result: 'valid' });
    });
  });

  describe('getters', () => {
    describe('node info', () => {
      it('returns the correct node version', async () => {
        const releasePleaseVersionFile = readFileSync(
          resolve(dirname(fileURLToPath(import.meta.url)), '../../../../.release-please-manifest.json'),
        ).toString();
        const releasePleaseVersion = JSON.parse(releasePleaseVersionFile)['.'];

        const nodeInfo = await node.getNodeInfo();
        expect(nodeInfo.nodeVersion).toBe(releasePleaseVersion);
      });
    });

    describe('getBlockHeader', () => {
      let initialHeader: BlockHeader;
      let header1: BlockHeader;
      let header2: BlockHeader;

      beforeEach(() => {
        initialHeader = BlockHeader.empty({ globalVariables: GlobalVariables.empty({ blockNumber: 0 }) });
        header1 = BlockHeader.empty({ globalVariables: GlobalVariables.empty({ blockNumber: 1 }) });
        header2 = BlockHeader.empty({ globalVariables: GlobalVariables.empty({ blockNumber: 2 }) });

        merkleTreeOps.getInitialHeader.mockReturnValue(initialHeader);
        l2BlockSource.getBlockNumber.mockResolvedValue(2);
      });

      it('returns requested block number', async () => {
        l2BlockSource.getBlockHeader.mockResolvedValue(header1);
        expect(await node.getBlockHeader(1)).toEqual(header1);
      });

      it('returns latest', async () => {
        l2BlockSource.getBlockHeader.mockResolvedValue(header2);
        expect(await node.getBlockHeader('latest')).toEqual(header2);
      });

      it('returns initial header on zero', async () => {
        expect(await node.getBlockHeader(0)).toEqual(initialHeader);
      });

      it('returns initial header if no blocks mined', async () => {
        l2BlockSource.getBlockNumber.mockResolvedValue(0);
        expect(await node.getBlockHeader('latest')).toEqual(initialHeader);
      });

      it('returns undefined for non-existent block', async () => {
        l2BlockSource.getBlockHeader.mockResolvedValue(undefined);
        expect(await node.getBlockHeader(3)).toEqual(undefined);
      });
    });
  });

  describe('simulatePublicCalls', () => {
    it('refuses to simulate public calls if the gas limit is too high', async () => {
      const tx = await mockTxForRollup(0x10000);
      unfreeze(tx.data.constants.txContext.gasSettings.gasLimits).l2Gas = 1e12;
      await expect(node.simulatePublicCalls(tx)).rejects.toThrow(/gas/i);
    });
  });
});

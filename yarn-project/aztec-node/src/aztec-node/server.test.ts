import { TestCircuitVerifier } from '@aztec/bb-prover';
import { EpochCache } from '@aztec/epoch-cache';
import type { RollupContract } from '@aztec/ethereum/contracts';
import {
  BlockNumber,
  CheckpointNumber,
  EpochNumber,
  IndexWithinCheckpoint,
  SlotNumber,
} from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { BadRequestError } from '@aztec/foundation/json-rpc';
import type { Hex } from '@aztec/foundation/string';
import { DateProvider } from '@aztec/foundation/timer';
import { unfreeze } from '@aztec/foundation/types';
import { type KeyStore, KeystoreManager, RemoteSigner, type ValidatorKeyStore } from '@aztec/node-keystore';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import type { P2P } from '@aztec/p2p';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import type { GlobalVariableBuilder, Sequencer, SequencerClient } from '@aztec/sequencer-client';
import type { SlasherClientInterface } from '@aztec/slasher';
import { RevertCode } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type BlockData,
  BlockHash,
  type BlockParameter,
  type BlockQuery,
  L2Block,
  type L2BlockSource,
  type L2Tips,
} from '@aztec/stdlib/block';
import type { CheckpointData, ProposedCheckpointData } from '@aztec/stdlib/checkpoint';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { EmptyL1RollupConstants, type L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { GasFees } from '@aztec/stdlib/gas';
import type { L2LogsSource, MerkleTreeReadOperations, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { InboxLeaf } from '@aztec/stdlib/messaging';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { mockTx } from '@aztec/stdlib/testing';
import {
  AppendOnlyTreeSnapshot,
  MerkleTreeId,
  PublicDataTreeLeaf,
  PublicDataTreeLeafPreimage,
} from '@aztec/stdlib/trees';
import type { FeeProvider, IndexedTxEffect } from '@aztec/stdlib/tx';
import {
  BlockHeader,
  DroppedTxReceipt,
  GlobalVariables,
  HashedValues,
  MinedTxReceipt,
  PendingTxReceipt,
  TX_ERROR_CALLDATA_COUNT_MISMATCH,
  TX_ERROR_DUPLICATE_NULLIFIER_IN_TX,
  TX_ERROR_INCORRECT_L1_CHAIN_ID,
  TX_ERROR_INCORRECT_ROLLUP_VERSION,
  TX_ERROR_INVALID_EXPIRATION_TIMESTAMP,
  TX_ERROR_SIZE_ABOVE_LIMIT,
  Tx,
  TxEffect,
  TxExecutionResult,
  TxHash,
  TxStatus,
} from '@aztec/stdlib/tx';
import { getPackageVersion } from '@aztec/stdlib/update-checker';
import type { ValidatorClient } from '@aztec/validator-client';

import { jest } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { type MockProxy, mock } from 'jest-mock-extended';
import { tmpdir } from 'os';
import { join } from 'path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import { type AztecNodeConfig, getConfigEnvVars } from './config.js';
import { AztecNodeService } from './server.js';

// Arbitrary fixed timestamp for the mock date provider. DateProvider.now() returns milliseconds but ExpirationTimestamp
// is denominated in seconds.
const NOW_MS = 1718745600000;
const NOW_S = NOW_MS / 1000;

// We create a mock date provider to have control over the next slot timestamp.
class MockDateProvider extends DateProvider {
  public override now(): number {
    return NOW_MS;
  }
}

class TestAztecNodeService extends AztecNodeService {
  public override getWorldState(block: BlockParameter) {
    return super.getWorldState(block);
  }
}

describe('aztec node', () => {
  let p2p: MockProxy<P2P>;
  let globalVariablesBuilder: MockProxy<GlobalVariableBuilder>;
  let feeProvider: MockProxy<FeeProvider>;
  let merkleTreeOps: MockProxy<MerkleTreeReadOperations>;
  let worldState: MockProxy<WorldStateSynchronizer>;
  let l2BlockSource: MockProxy<L2BlockSource>;
  let l1ToL2MessageSource: MockProxy<L1ToL2MessageSource>;
  let lastBlockNumber: BlockNumber;
  let node: TestAztecNodeService;
  let feePayer: AztecAddress;
  let epochCache: EpochCache;
  let nodeConfig: AztecNodeConfig;

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
      protocolContractsHash,
    });
  };

  beforeEach(async () => {
    lastBlockNumber = BlockNumber.ZERO;

    feePayer = await AztecAddress.random();
    const feePayerSlot = await computeFeePayerBalanceLeafSlot(feePayer);
    const feePayerSlotIndex = 87654n;
    const feePayerBalance = 10n ** 20n;

    p2p = mock<P2P>();

    globalVariablesBuilder = mock<GlobalVariableBuilder>();
    feeProvider = mock<FeeProvider>();
    feeProvider.getCurrentMinFees.mockResolvedValue(new GasFees(0, BlockNumber.ZERO));

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

    worldState = mock<WorldStateSynchronizer>({
      getCommitted: () => merkleTreeOps,
    });
    worldState.syncImmediate.mockImplementation(() => Promise.resolve(lastBlockNumber));

    l2BlockSource = mock<L2BlockSource>();
    l2BlockSource.getBlockNumber.mockImplementation(((query?: BlockQuery) => {
      if (!query) {
        return Promise.resolve(lastBlockNumber);
      }
      if ('number' in query) {
        return Promise.resolve(query.number);
      }
      return Promise.resolve(undefined);
    }) as L2BlockSource['getBlockNumber']);
    l2BlockSource.getL1Constants.mockResolvedValue(EmptyL1RollupConstants);
    l2BlockSource.getGenesisBlockHash.mockReturnValue(BlockHash.random());

    const l2LogsSource = mock<L2LogsSource>();

    l1ToL2MessageSource = mock<L1ToL2MessageSource>();

    // all txs use the same allowed FPC class
    const contractSource = mock<ContractDataSource>();

    const nodeConfigFromEnvVars: AztecNodeConfig = getConfigEnvVars();
    nodeConfig = {
      ...nodeConfigFromEnvVars,
      rollupAddress: EthAddress.ZERO,
      registryAddress: EthAddress.ZERO,
      inboxAddress: EthAddress.ZERO,
      outboxAddress: EthAddress.ZERO,
    };

    // Inject a spurious config value to test that the config is correctly picked up
    (nodeConfig as any).nonExistingConfig = 'foo';

    // We never request any info from the rollup contract here, since only the `getEpochAndSlotInNextL1Slot` method
    // on the epoch cache is used so a simple mock will suffice.
    const rollupContract = mock<RollupContract>();
    // We pass MockDateProvider to the epoch cache to have control over the next slot timestamp
    epochCache = new EpochCache(
      rollupContract,
      { ...EmptyL1RollupConstants, lagInEpochsForValidatorSet: 0, lagInEpochsForRandao: 0 },
      new MockDateProvider(),
    );

    node = new TestAztecNodeService(
      nodeConfig,
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
      async () => {},
      12345,
      rollupVersion.toNumber(),
      globalVariablesBuilder,
      feeProvider,
      epochCache,
      getPackageVersion(),
      new TestCircuitVerifier(),
      new TestCircuitVerifier(),
    );
  });

  describe('tx validation', () => {
    it('tests that the node correctly validates double spends', async () => {
      const txs = await Promise.all([mockTxForRollup(0x10000), mockTxForRollup(0x20000)]);
      const doubleSpendTx = txs[0];
      const doubleSpendWithExistingTx = txs[1];
      lastBlockNumber = BlockNumber(lastBlockNumber + 1);

      expect(await node.isValidTx(doubleSpendTx)).toEqual({ result: 'valid' });

      // We push a duplicate nullifier that was created in the same transaction
      doubleSpendTx.data.forRollup!.end.nullifiers[1] = doubleSpendTx.data.forRollup!.end.nullifiers[0];
      await doubleSpendTx.recomputeHash();

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
      lastBlockNumber = BlockNumber.ZERO;
    });

    it('tests that the node correctly validates chain id', async () => {
      const tx = await mockTxForRollup(0x10000);
      expect(await node.isValidTx(tx)).toEqual({ result: 'valid' });

      // We make the chain id on the tx not equal to the configured chain id
      tx.data.constants.txContext.chainId = new Fr(1n + chainId.toBigInt());
      await tx.recomputeHash();

      expect(await node.isValidTx(tx)).toEqual({
        result: 'invalid',
        reason: [expect.stringContaining(TX_ERROR_INCORRECT_L1_CHAIN_ID)],
      });
    });

    it('tests that the node correctly validates rollup version', async () => {
      const tx = await mockTxForRollup(0x10000);
      expect(await node.isValidTx(tx)).toEqual({ result: 'valid' });

      // We make the chain id on the tx not equal to the configured chain id
      tx.data.constants.txContext.version = new Fr(1n + rollupVersion.toBigInt());
      await tx.recomputeHash();

      expect(await node.isValidTx(tx)).toEqual({
        result: 'invalid',
        reason: [expect.stringContaining(TX_ERROR_INCORRECT_ROLLUP_VERSION)],
      });
    });

    it('tests that the node correctly validates oversized transactions', async () => {
      const originalTx = await mockTxForRollup(0x10000);
      const newPublicFunctionCalldata = [new HashedValues(Array(100000).fill(Fr.random()), Fr.random())];
      const tx = new Tx(
        originalTx.txHash,
        originalTx.data,
        originalTx.chonkProof,
        originalTx.contractClassLogFields,
        newPublicFunctionCalldata,
      );
      await tx.recomputeHash();
      expect(await node.isValidTx(tx)).toEqual({
        result: 'invalid',
        reason: [TX_ERROR_SIZE_ABOVE_LIMIT, TX_ERROR_CALLDATA_COUNT_MISMATCH],
      });
    });

    it('tests that the node correctly validates expiration timestamps', async () => {
      const txs = await Promise.all([mockTxForRollup(0x10000), mockTxForRollup(0x20000)]);
      const invalidExpirationTimestampMetadata = txs[0];
      const validExpirationTimestampMetadata = txs[1];

      invalidExpirationTimestampMetadata.data.expirationTimestamp = BigInt(NOW_S);
      await invalidExpirationTimestampMetadata.recomputeHash();

      validExpirationTimestampMetadata.data.expirationTimestamp = BigInt(NOW_S + 1);
      await validExpirationTimestampMetadata.recomputeHash();

      // We need to set the last block number to get this working properly because if it was set to 0, it would mean
      // that we are building block 1, and for block 1 the timestamp expiration check is skipped. For details on why
      // see the `validate_expiration_timestamp` function in
      // `noir-projects/noir-protocol-circuits/crates/rollup-lib/src/base/components/validation_requests.nr`.
      lastBlockNumber = BlockNumber(1);

      // Default tx with no should be valid
      // Tx with expiration timestamp < current block number should be invalid
      expect(await node.isValidTx(invalidExpirationTimestampMetadata)).toEqual({
        result: 'invalid',
        reason: [TX_ERROR_INVALID_EXPIRATION_TIMESTAMP],
      });
      // Tx with expiration timestamp >= current block number should be valid
      expect(await node.isValidTx(validExpirationTimestampMetadata)).toEqual({ result: 'valid' });
    });
  });

  describe('getters', () => {
    describe('config', () => {
      it('returns the correct config', async () => {
        const config = await node.getConfig();
        expect(config.maxPendingTxCount).toEqual(nodeConfig.maxPendingTxCount);
        expect('nonExistingConfig' in config).toBe(false);
      });
    });

    describe('node info', () => {
      it('returns the correct node version', async () => {
        const nodeInfo = await node.getNodeInfo();
        expect(nodeInfo.nodeVersion).toBe(getPackageVersion());
      });
    });

    describe('getBlock', () => {
      let blockData1: BlockData;
      let blockData2: BlockData;

      beforeEach(() => {
        blockData1 = {
          header: BlockHeader.empty({ globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(1) }) }),
          archive: L2Block.empty().archive,
          blockHash: BlockHash.random(),
          checkpointNumber: CheckpointNumber(1),
          indexWithinCheckpoint: IndexWithinCheckpoint(0),
        };
        blockData2 = {
          header: BlockHeader.empty({ globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(2) }) }),
          archive: L2Block.empty().archive,
          blockHash: BlockHash.random(),
          checkpointNumber: CheckpointNumber(1),
          indexWithinCheckpoint: IndexWithinCheckpoint(1),
        };

        l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(2));
      });

      it('returns requested block number', async () => {
        l2BlockSource.getBlockData.mockResolvedValue(blockData1);
        const result = await node.getBlock(BlockNumber(1));
        expect(result?.header).toEqual(blockData1.header);
        expect(result?.number).toEqual(BlockNumber(1));
      });

      it('returns latest block', async () => {
        l2BlockSource.getBlockData.mockResolvedValue(blockData2);
        const result = await node.getBlock('latest');
        expect(result?.header).toEqual(blockData2.header);
        expect(result?.number).toEqual(BlockNumber(2));
      });

      it('returns undefined for non-existent block', async () => {
        l2BlockSource.getBlockData.mockResolvedValue(undefined);
        expect(await node.getBlock(BlockNumber(3))).toEqual(undefined);
      });
    });

    describe('getLowNullifierMembershipWitness', () => {
      beforeEach(() => {
        lastBlockNumber = BlockNumber(1);
      });

      it('throws when nullifier already exists in the tree', async () => {
        const nullifier = Fr.random();
        merkleTreeOps.getPreviousValueIndex.mockImplementation((treeId: MerkleTreeId, value: bigint) => {
          if (treeId === MerkleTreeId.NULLIFIER_TREE && value === nullifier.toBigInt()) {
            return Promise.resolve({ index: 42n, alreadyPresent: true });
          }
          return Promise.resolve(undefined);
        });

        await expect(node.getLowNullifierMembershipWitness('latest', nullifier)).rejects.toThrow(
          /Cannot prove nullifier non-inclusion/,
        );
      });

      it('returns undefined when nullifier not found', async () => {
        merkleTreeOps.getPreviousValueIndex.mockResolvedValue(undefined);

        const result = await node.getLowNullifierMembershipWitness('latest', Fr.random());
        expect(result).toBeUndefined();
      });
    });

    describe('findLeavesIndexes', () => {
      const blockHash1 = Fr.random();
      const blockHash2 = Fr.random();

      beforeEach(() => {
        lastBlockNumber = BlockNumber(2);
      });

      it('returns results for all found leaves', async () => {
        merkleTreeOps.findLeafIndices.mockResolvedValue([10n, 20n]);
        merkleTreeOps.getBlockNumbersForLeafIndices.mockResolvedValue([BlockNumber(1), BlockNumber(2)]);
        (merkleTreeOps as any).getLeafValue.mockImplementation((_treeId: any, index: bigint) => {
          if (index === 1n) {
            return Promise.resolve(blockHash1);
          }
          if (index === 2n) {
            return Promise.resolve(blockHash2);
          }
          return Promise.resolve(undefined);
        });

        const result = await node.findLeavesIndexes('latest', MerkleTreeId.NOTE_HASH_TREE, [Fr.random(), Fr.random()]);

        expect(result).toEqual([
          { l2BlockNumber: BlockNumber(1), l2BlockHash: new BlockHash(blockHash1), data: 10n },
          { l2BlockNumber: BlockNumber(2), l2BlockHash: new BlockHash(blockHash2), data: 20n },
        ]);
      });

      it('returns undefined for leaves not found', async () => {
        merkleTreeOps.findLeafIndices.mockResolvedValue([undefined, undefined]);

        const result = await node.findLeavesIndexes('latest', MerkleTreeId.NOTE_HASH_TREE, [Fr.random(), Fr.random()]);

        expect(result).toEqual([undefined, undefined]);
      });

      it('returns correct results when some leaves are not found', async () => {
        merkleTreeOps.findLeafIndices.mockResolvedValue([undefined, 10n, 20n]);
        merkleTreeOps.getBlockNumbersForLeafIndices.mockResolvedValue([BlockNumber(1), BlockNumber(2)]);
        (merkleTreeOps as any).getLeafValue.mockImplementation((_treeId: any, index: bigint) => {
          if (index === 1n) {
            return Promise.resolve(blockHash1);
          }
          if (index === 2n) {
            return Promise.resolve(blockHash2);
          }
          return Promise.resolve(undefined);
        });

        const result = await node.findLeavesIndexes('latest', MerkleTreeId.NOTE_HASH_TREE, [
          Fr.random(),
          Fr.random(),
          Fr.random(),
        ]);

        expect(result).toEqual([
          undefined,
          { l2BlockNumber: BlockNumber(1), l2BlockHash: new BlockHash(blockHash1), data: 10n },
          { l2BlockNumber: BlockNumber(2), l2BlockHash: new BlockHash(blockHash2), data: 20n },
        ]);
        // Only defined indices should be passed
        expect(merkleTreeOps.getBlockNumbersForLeafIndices).toHaveBeenCalledWith(MerkleTreeId.NOTE_HASH_TREE, [
          10n,
          20n,
        ]);
      });

      it('handles multiple leaves in the same block', async () => {
        merkleTreeOps.findLeafIndices.mockResolvedValue([10n, 20n, 30n]);
        merkleTreeOps.getBlockNumbersForLeafIndices.mockResolvedValue([BlockNumber(1), BlockNumber(1), BlockNumber(2)]);
        (merkleTreeOps as any).getLeafValue.mockImplementation((_treeId: any, index: bigint) => {
          if (index === 1n) {
            return Promise.resolve(blockHash1);
          }
          if (index === 2n) {
            return Promise.resolve(blockHash2);
          }
          return Promise.resolve(undefined);
        });

        const result = await node.findLeavesIndexes('latest', MerkleTreeId.NOTE_HASH_TREE, [
          Fr.random(),
          Fr.random(),
          Fr.random(),
        ]);

        expect(result).toEqual([
          { l2BlockNumber: BlockNumber(1), l2BlockHash: new BlockHash(blockHash1), data: 10n },
          { l2BlockNumber: BlockNumber(1), l2BlockHash: new BlockHash(blockHash1), data: 20n },
          { l2BlockNumber: BlockNumber(2), l2BlockHash: new BlockHash(blockHash2), data: 30n },
        ]);
        // getLeafValue should be called only for unique block numbers
        expect(merkleTreeOps.getLeafValue).toHaveBeenCalledTimes(2);
      });

      it('returns empty array for empty input', async () => {
        merkleTreeOps.findLeafIndices.mockResolvedValue([]);

        const result = await node.findLeavesIndexes('latest', MerkleTreeId.NOTE_HASH_TREE, []);

        expect(result).toEqual([]);
      });

      it('throws when block number is undefined for a found leaf', async () => {
        merkleTreeOps.findLeafIndices.mockResolvedValue([10n]);
        merkleTreeOps.getBlockNumbersForLeafIndices.mockResolvedValue([undefined]);

        await expect(node.findLeavesIndexes('latest', MerkleTreeId.NOTE_HASH_TREE, [Fr.random()])).rejects.toThrow(
          /Block number is undefined/,
        );
      });

      it('throws when block hash is undefined for a found block number', async () => {
        merkleTreeOps.findLeafIndices.mockResolvedValue([10n]);
        merkleTreeOps.getBlockNumbersForLeafIndices.mockResolvedValue([BlockNumber(1)]);
        merkleTreeOps.getLeafValue.mockResolvedValue(undefined);

        await expect(node.findLeavesIndexes('latest', MerkleTreeId.NOTE_HASH_TREE, [Fr.random()])).rejects.toThrow(
          /Block hash is undefined/,
        );
      });
    });

    describe('getWorldState', () => {
      let snapshotMerkleTreeOps: MockProxy<MerkleTreeReadOperations>;
      let initialHeader: BlockHeader;

      beforeEach(async () => {
        lastBlockNumber = BlockNumber(5);
        initialHeader = BlockHeader.empty({
          globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber.ZERO }),
        });
        // Archiver resolves the initial block hash to block number 0 directly.
        const initialBlockHash = await initialHeader.hash();
        l2BlockSource.getBlockNumber.mockImplementation(((query?: BlockQuery) =>
          Promise.resolve(
            !query
              ? lastBlockNumber
              : 'number' in query
                ? query.number
                : 'hash' in query && query.hash.equals(initialBlockHash)
                  ? BlockNumber.ZERO
                  : undefined,
          )) as L2BlockSource['getBlockNumber']);
        // #getInitialHeaderHash still sources from worldStateSynchronizer (used in error messages).
        merkleTreeOps.getInitialHeader.mockReturnValue(initialHeader);
        snapshotMerkleTreeOps = mock<MerkleTreeReadOperations>();
        worldState.getSnapshot.mockReturnValue(snapshotMerkleTreeOps);
      });

      it('returns committed db for latest', async () => {
        const result = await node.getWorldState('latest');
        expect(result).toBe(merkleTreeOps);
        expect(worldState.getSnapshot).not.toHaveBeenCalled();
      });

      it('returns snapshot for a block number within sync range', async () => {
        const result = await node.getWorldState(BlockNumber(3));
        expect(result).toBe(snapshotMerkleTreeOps);
        expect(worldState.getSnapshot).toHaveBeenCalledWith(BlockNumber(3));
      });

      it('throws for a block number beyond sync range', async () => {
        await expect(node.getWorldState(BlockNumber(10))).rejects.toThrow(/not yet synced/);
      });

      it('throws for a block hash whose block number is beyond sync range', async () => {
        const blockHash = BlockHash.random();
        l2BlockSource.getBlockNumber.mockImplementation(((query?: BlockQuery) =>
          Promise.resolve(
            query && 'hash' in query ? BlockNumber(10) : lastBlockNumber,
          )) as L2BlockSource['getBlockNumber']);

        await expect(node.getWorldState(blockHash)).rejects.toThrow(/not yet synced/);
      });

      it('resolves block hash to block number via archiver and returns snapshot', async () => {
        const blockHash = BlockHash.random();
        l2BlockSource.getBlockNumber.mockImplementation(((query?: BlockQuery) =>
          Promise.resolve(
            query && 'hash' in query ? BlockNumber(3) : lastBlockNumber,
          )) as L2BlockSource['getBlockNumber']);
        snapshotMerkleTreeOps.getLeafValue.mockResolvedValue(blockHash);

        const result = await node.getWorldState(blockHash);
        expect(result).toBe(snapshotMerkleTreeOps);
        expect(worldState.getSnapshot).toHaveBeenCalledWith(BlockNumber(3));
      });

      it('drives a reorg-aware sync to the requested block hash', async () => {
        // A hash-anchored query resolves the hash against the archiver and then syncs world state to that
        // exact (number, hash) so the synchronizer barriers on the archive-tree commit and detects reorgs,
        // rather than syncing to bare latest height and racing the snapshot read.
        const blockHash = BlockHash.random();
        l2BlockSource.getBlockNumber.mockImplementation(((query?: BlockQuery) =>
          Promise.resolve(
            query && 'hash' in query ? BlockNumber(3) : lastBlockNumber,
          )) as L2BlockSource['getBlockNumber']);
        snapshotMerkleTreeOps.getLeafValue.mockResolvedValue(blockHash);

        await node.getWorldState(blockHash);

        expect(worldState.syncImmediate).toHaveBeenCalledWith(BlockNumber(3), blockHash);
      });

      it('syncs to latest height without a hash when querying by block number', async () => {
        await node.getWorldState(BlockNumber(3));
        expect(worldState.syncImmediate).toHaveBeenCalledWith(lastBlockNumber, undefined);
      });

      it('throws when block hash is not found in archiver', async () => {
        const blockHash = BlockHash.random();

        await expect(node.getWorldState(blockHash)).rejects.toThrow(/not found when querying world state/);
      });

      it('throws when world-state block hash does not match requested hash (reorg)', async () => {
        const blockHash = BlockHash.random();
        const differentHash = BlockHash.random();
        l2BlockSource.getBlockNumber.mockImplementation(((query?: BlockQuery) =>
          Promise.resolve(
            query && 'hash' in query ? BlockNumber(3) : lastBlockNumber,
          )) as L2BlockSource['getBlockNumber']);
        // World state returns a different hash for the same block number
        snapshotMerkleTreeOps.getLeafValue.mockResolvedValue(differentHash);

        await expect(node.getWorldState(blockHash)).rejects.toThrow(/not found in world state at block number/);
      });

      it('returns snapshot at block 0 for initial header hash', async () => {
        // Block 0 is a first-class historical block: its state lives in the trees' persisted block-0
        // payload. getWorldState resolves the genesis hash to block number 0 and returns the snapshot.
        const initialBlockHash = await initialHeader.hash();
        // The archive at block 0 contains the genesis header hash at index 0, which is what the
        // double-check compares against after the snapshot is resolved.
        snapshotMerkleTreeOps.getLeafValue.mockResolvedValue(initialBlockHash);

        const result = await node.getWorldState(initialBlockHash);
        expect(result).toBe(snapshotMerkleTreeOps);
        expect(worldState.getSnapshot).toHaveBeenCalledWith(BlockNumber.ZERO);
      });
    });

    describe('getBlockHashMembershipWitness', () => {
      it('returns undefined when reference block is the initial block hash', async () => {
        // Block 0 has an empty archive — no block hashes exist in it yet.
        // getBlockHashMembershipWitness short-circuits at block 0 and returns undefined.
        const initialHeader = BlockHeader.empty({
          globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber.ZERO }),
        });
        const initialBlockHash = await initialHeader.hash();
        l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber.ZERO);

        const someBlockHash = BlockHash.random();
        const result = await node.getBlockHashMembershipWitness(initialBlockHash, someBlockHash);
        expect(result).toBeUndefined();
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

  describe('reloadKeystore', () => {
    it('throws BadRequestError if no file-based keystore directory is configured', async () => {
      // Default node has no keyStoreDirectory set
      await expect(node.reloadKeystore()).rejects.toThrow(BadRequestError);
    });

    it('throws BadRequestError if keystore directory is set but validator client is not configured', async () => {
      // Satisfies the first check (directory exists) but validatorClient is undefined
      nodeConfig.keyStoreDirectory = '/tmp/fake-keystore-dir';
      await expect(node.reloadKeystore()).rejects.toThrow(BadRequestError);
    });

    describe('with file-based keystore', () => {
      let keyStoreDir: string;
      let validatorClient: MockProxy<ValidatorClient>;
      let slasherClient: MockProxy<SlasherClientInterface>;
      let validatorPrivateKey: string;
      let nodeWithValidator: AztecNodeService;

      // Helper to build a KeyStore with default coinbase/feeRecipient/remoteSigner.
      // Each entry needs only `attester` (required) and optionally `publisher`.
      const makeKeyStore = (
        ...validators: Array<Pick<ValidatorKeyStore, 'attester'> & Pick<Partial<ValidatorKeyStore>, 'publisher'>>
      ): KeyStore => ({
        schemaVersion: 1,
        validators: validators.map(v => ({
          attester: v.attester,
          coinbase: undefined,
          feeRecipient: AztecAddress.ZERO,
          remoteSigner: undefined,
          ...(v.publisher !== undefined ? { publisher: v.publisher } : {}),
        })),
      });

      beforeEach(() => {
        // Create a temp directory with a keystore file
        keyStoreDir = mkdtempSync(join(tmpdir(), 'keystore-test-'));
        validatorPrivateKey = generatePrivateKey();
        const keyStore = makeKeyStore({ attester: [validatorPrivateKey as Hex<32>] });
        writeFileSync(join(keyStoreDir, 'keystore.json'), JSON.stringify(keyStore));

        validatorClient = mock<ValidatorClient>();
        slasherClient = mock<SlasherClientInterface>();

        const validatorNodeConfig = { ...nodeConfig, keyStoreDirectory: keyStoreDir };

        nodeWithValidator = new AztecNodeService(
          validatorNodeConfig,
          p2p,
          l2BlockSource,
          mock<L2LogsSource>(),
          mock<ContractDataSource>(),
          mock<L1ToL2MessageSource>(),
          mock<WorldStateSynchronizer>({ getCommitted: () => merkleTreeOps }),
          undefined,
          undefined,
          slasherClient,
          undefined,
          async () => {},
          12345,
          rollupVersion.toNumber(),
          globalVariablesBuilder,
          feeProvider,
          epochCache,
          getPackageVersion(),
          new TestCircuitVerifier(),
          new TestCircuitVerifier(),
          undefined,
          undefined,
          undefined,
          validatorClient as unknown as ValidatorClient,
          new KeystoreManager(keyStore),
        );
      });

      afterEach(() => {
        rmSync(keyStoreDir, { recursive: true, force: true });
      });

      it('reloads keystore from disk and calls validatorClient.reloadKeystore', async () => {
        await nodeWithValidator.reloadKeystore();
        expect(validatorClient.reloadKeystore).toHaveBeenCalledTimes(1);
      });

      it('adds new validators to slasher dont-slash-self list on reload', async () => {
        // Write a new keystore file with an additional validator
        const newPrivateKey = generatePrivateKey();
        writeFileSync(
          join(keyStoreDir, 'keystore.json'),
          JSON.stringify(makeKeyStore({ attester: [validatorPrivateKey as Hex<32>, newPrivateKey as Hex<32>] })),
        );

        await nodeWithValidator.reloadKeystore();

        const updateArg = slasherClient.updateConfig.mock.calls[0][0];
        const neverSlashList = updateArg.slashValidatorsNever!;

        const originalAddress = EthAddress.fromString(
          privateKeyToAccount(validatorPrivateKey as `0x${string}`).address,
        );
        const newAddress = EthAddress.fromString(privateKeyToAccount(newPrivateKey as `0x${string}`).address);

        expect(neverSlashList.some(a => a.equals(originalAddress))).toBe(true);
        expect(neverSlashList.some(a => a.equals(newAddress))).toBe(true);
      });

      it('removes validators from slasher dont-slash-self list when removed from keystore', async () => {
        // First add two validators
        const secondPrivateKey = generatePrivateKey();
        writeFileSync(
          join(keyStoreDir, 'keystore.json'),
          JSON.stringify(makeKeyStore({ attester: [validatorPrivateKey as Hex<32>, secondPrivateKey as Hex<32>] })),
        );
        await nodeWithValidator.reloadKeystore();

        // Now remove the second validator, keeping only the original
        writeFileSync(
          join(keyStoreDir, 'keystore.json'),
          JSON.stringify(makeKeyStore({ attester: [validatorPrivateKey as Hex<32>] })),
        );
        await nodeWithValidator.reloadKeystore();

        // The second call to updateConfig should only contain the remaining validator
        const updateArg = slasherClient.updateConfig.mock.calls[1][0];
        const neverSlashList = updateArg.slashValidatorsNever!;

        const originalAddress = EthAddress.fromString(
          privateKeyToAccount(validatorPrivateKey as `0x${string}`).address,
        );
        const removedAddress = EthAddress.fromString(privateKeyToAccount(secondPrivateKey as `0x${string}`).address);

        expect(neverSlashList.some(a => a.equals(originalAddress))).toBe(true);
        expect(neverSlashList.some(a => a.equals(removedAddress))).toBe(false);
      });

      it('does not update slasher if slashSelfAllowed is true', async () => {
        (nodeWithValidator as any).config.slashSelfAllowed = true;
        await nodeWithValidator.reloadKeystore();

        expect(validatorClient.reloadKeystore).toHaveBeenCalledTimes(1);
        expect(slasherClient.updateConfig).not.toHaveBeenCalled();
      });

      it('reloads keystore with remote signer validators from disk', async () => {
        // Update keystore file to add a remote signer validator alongside the local key validator.
        // This verifies the full reload path supports mixed local + remote signer keystores:
        // file-on-disk -> loadKeystores -> KeystoreManager -> validateSigners (mocked) ->
        // ValidatorClient.reloadKeystore -> NodeKeystoreAdapter (creates RemoteSigner instances)
        const remoteSignerUrl = 'https://web3signer.example.com:9000';
        const remoteAttesterAddress = EthAddress.random();
        writeFileSync(
          join(keyStoreDir, 'keystore.json'),
          JSON.stringify(
            makeKeyStore(
              { attester: [validatorPrivateKey as Hex<32>] },
              { attester: { address: remoteAttesterAddress, remoteSignerUrl } },
            ),
          ),
        );

        // Mock RemoteSigner.validateAccess to avoid a real HTTP call to web3signer.
        // validateSigners() calls this to verify each remote signer URL is reachable
        // and that the requested addresses are available.
        const validateSpy = jest.spyOn(RemoteSigner, 'validateAccess').mockImplementation(() => Promise.resolve());

        try {
          await nodeWithValidator.reloadKeystore();

          // Verify RemoteSigner.validateAccess was called with the correct URL and address
          expect(validateSpy).toHaveBeenCalledTimes(1);
          expect(validateSpy).toHaveBeenCalledWith(
            remoteSignerUrl,
            expect.arrayContaining([remoteAttesterAddress.toString().toLowerCase()]),
          );

          // Verify validatorClient.reloadKeystore was called (reload succeeded)
          expect(validatorClient.reloadKeystore).toHaveBeenCalledTimes(1);

          // Verify the new KeystoreManager was passed through with both validators
          const passedManager = validatorClient.reloadKeystore.mock.calls[0][0] as KeystoreManager;
          expect(passedManager.getValidatorCount()).toBe(2);

          // Verify slasher list includes both the local and remote validator addresses
          const updateArg = slasherClient.updateConfig.mock.calls[0][0];
          const neverSlashList = updateArg.slashValidatorsNever!;
          expect(neverSlashList.some(a => a.equals(remoteAttesterAddress))).toBe(true);
        } finally {
          validateSpy.mockRestore();
        }
      });

      it('rejects reload when remote signer validation fails', async () => {
        // If RemoteSigner.validateAccess fails (e.g. web3signer unreachable or address not found),
        // the reload should be rejected and the old keystore should remain intact.
        const remoteSignerUrl = 'https://web3signer.example.com:9000';
        const remoteAttesterAddress = EthAddress.random();
        writeFileSync(
          join(keyStoreDir, 'keystore.json'),
          JSON.stringify(
            makeKeyStore(
              { attester: [validatorPrivateKey as Hex<32>] },
              // EthAddress has toJSON() so JSON.stringify serializes it as a hex string.
              { attester: { address: remoteAttesterAddress, remoteSignerUrl } },
            ),
          ),
        );

        // Mock RemoteSigner.validateAccess to reject — simulates unreachable web3signer
        const validateSpy = jest
          .spyOn(RemoteSigner, 'validateAccess')
          .mockRejectedValue(new Error('Unable to connect to web3signer'));

        try {
          await expect(nodeWithValidator.reloadKeystore()).rejects.toThrow(/Unable to connect to web3signer/);

          // Validator client should NOT have been called (reload rejected before mutation)
          expect(validatorClient.reloadKeystore).not.toHaveBeenCalled();
        } finally {
          validateSpy.mockRestore();
        }
      });

      it('rejects reload when new validator has a publisher key not in the L1 signers', async () => {
        // Initial keystore has validator with publisherKeyA
        const publisherKeyA = generatePrivateKey();
        const publisherKeyB = generatePrivateKey(); // different, not in L1 signers

        const initialKeyStore = makeKeyStore({
          attester: [validatorPrivateKey as Hex<32>],
          publisher: [publisherKeyA as Hex<32>],
        });

        // Recreate node with a truthy sequencer so the publisher validation path runs.
        // Only truthiness matters: the code checks `if (this.keyStoreManager && this.sequencer)`
        // and the validation logic uses keyStoreManager, not sequencer methods.
        // The test expects rejection before sequencer.updatePublisherNodeKeyStore() is reached.
        const nodeWithSequencer = new AztecNodeService(
          { ...nodeConfig, keyStoreDirectory: keyStoreDir },
          p2p,
          l2BlockSource,
          mock<L2LogsSource>(),
          mock<ContractDataSource>(),
          mock<L1ToL2MessageSource>(),
          mock<WorldStateSynchronizer>({ getCommitted: () => merkleTreeOps }),
          {} as SequencerClient,
          undefined,
          slasherClient,
          undefined,
          async () => {},
          12345,
          rollupVersion.toNumber(),
          globalVariablesBuilder,
          feeProvider,
          epochCache,
          getPackageVersion(),
          new TestCircuitVerifier(),
          new TestCircuitVerifier(),
          undefined,
          undefined,
          undefined,
          validatorClient as unknown as ValidatorClient,
          new KeystoreManager(initialKeyStore),
        );

        // Write new keystore: new validator uses publisherKeyB (not in the L1 signers)
        const newValidatorKey = generatePrivateKey();
        writeFileSync(
          join(keyStoreDir, 'keystore.json'),
          JSON.stringify(
            makeKeyStore(
              { attester: [validatorPrivateKey as Hex<32>], publisher: [publisherKeyA as Hex<32>] },
              { attester: [newValidatorKey as Hex<32>], publisher: [publisherKeyB as Hex<32>] },
            ),
          ),
        );

        await expect(nodeWithSequencer.reloadKeystore()).rejects.toThrow(BadRequestError);

        // reload rejected before mutation
        expect(validatorClient.reloadKeystore).not.toHaveBeenCalled();
      });
    });
  });

  describe('mineBlock', () => {
    const INITIAL_MIN_TXS_PER_BLOCK = 1;

    let sequencerClient: MockProxy<SequencerClient>;
    let nodeWithSequencer: AztecNodeService;

    /** Simulates block number advancing from `from` to `to` after the first call. */
    const mockBlockNumberAdvancing = (from: number, to: number) => {
      let callCount = 0;
      l2BlockSource.getBlockNumber.mockImplementation(() => {
        callCount++;
        return Promise.resolve(callCount > 1 ? BlockNumber(to) : BlockNumber(from));
      });
    };

    beforeEach(() => {
      const sequencer = mock<Sequencer>();
      sequencer.getConfig.mockReturnValue({ minTxsPerBlock: INITIAL_MIN_TXS_PER_BLOCK } as any);

      sequencerClient = mock<SequencerClient>();
      sequencerClient.getSequencer.mockReturnValue(sequencer);
      sequencerClient.trigger.mockReturnValue(Promise.resolve());

      nodeWithSequencer = new AztecNodeService(
        nodeConfig,
        p2p,
        l2BlockSource,
        mock(),
        mock(),
        mock(),
        worldState,
        sequencerClient,
        undefined,
        undefined,
        undefined,
        async () => {},
        12345,
        rollupVersion.toNumber(),
        globalVariablesBuilder,
        mock<FeeProvider>(),
        epochCache,
        getPackageVersion(),
        new TestCircuitVerifier(),
        new TestCircuitVerifier(),
      );
    });

    it('throws when no sequencer is running', async () => {
      await expect(node.mineBlock()).rejects.toThrow('Cannot mine block: no sequencer is running');
    });

    it('restores minTxsPerBlock after successful block production', async () => {
      mockBlockNumberAdvancing(5, 6);

      await nodeWithSequencer.mineBlock();

      const updateCalls = sequencerClient.updateConfig.mock.calls;
      expect(updateCalls[0][0]).toEqual({ minTxsPerBlock: 0 });
      // Last call to update calls should revert the value to the original
      expect(updateCalls[1][0]).toEqual({ minTxsPerBlock: INITIAL_MIN_TXS_PER_BLOCK });
    });
  });

  describe('pauseSequencer + setConfig', () => {
    const INITIAL_MIN_TXS_PER_BLOCK = 2;

    let sequencerClient: MockProxy<SequencerClient>;
    let nodeWithSequencer: AztecNodeService;

    beforeEach(() => {
      const sequencer = mock<Sequencer>();
      sequencer.getConfig.mockReturnValue({ minTxsPerBlock: INITIAL_MIN_TXS_PER_BLOCK } as any);

      sequencerClient = mock<SequencerClient>();
      sequencerClient.getSequencer.mockReturnValue(sequencer);

      nodeWithSequencer = new AztecNodeService(
        nodeConfig,
        p2p,
        l2BlockSource,
        mock(),
        mock(),
        mock(),
        worldState,
        sequencerClient,
        undefined,
        undefined,
        undefined,
        async () => {},
        12345,
        rollupVersion.toNumber(),
        globalVariablesBuilder,
        mock<FeeProvider>(),
        epochCache,
        getPackageVersion(),
        new TestCircuitVerifier(),
        new TestCircuitVerifier(),
      );
    });

    it('keeps the sequencer frozen when setConfig updates minTxsPerBlock while paused', async () => {
      await nodeWithSequencer.pauseSequencer();
      sequencerClient.updateConfig.mockClear();

      await nodeWithSequencer.setConfig({ minTxsPerBlock: 1 });

      // The sequencer must not receive the new minTxsPerBlock while paused; the freeze stays in place.
      const updateCalls = sequencerClient.updateConfig.mock.calls;
      const minTxsUpdates = updateCalls.filter(([cfg]) => 'minTxsPerBlock' in cfg);
      expect(minTxsUpdates).toEqual([]);
    });

    it('resumeSequencer applies the value set via setConfig during pause (not the pre-pause value)', async () => {
      await nodeWithSequencer.pauseSequencer();
      await nodeWithSequencer.setConfig({ minTxsPerBlock: 5 });
      sequencerClient.updateConfig.mockClear();

      await nodeWithSequencer.resumeSequencer();

      // Resume must use the test-supplied value (5), not the pre-pause snapshot (INITIAL_MIN_TXS_PER_BLOCK).
      expect(sequencerClient.updateConfig).toHaveBeenCalledWith({ minTxsPerBlock: 5 });
    });

    it('still forwards non-minTxsPerBlock config changes while paused', async () => {
      await nodeWithSequencer.pauseSequencer();
      sequencerClient.updateConfig.mockClear();

      const coinbase = EthAddress.random();
      await nodeWithSequencer.setConfig({ coinbase, minTxsPerBlock: 3 });

      // coinbase still reaches the sequencer; only minTxsPerBlock is filtered.
      const updateCalls = sequencerClient.updateConfig.mock.calls;
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0][0]).toEqual({ coinbase });
    });
  });

  describe('getL2ToL1Messages', () => {
    const makeBlock = (slotNumber: number, l2ToL1MsgsByTx: Fr[][]): L2Block => {
      const block = L2Block.empty(
        BlockHeader.empty({
          globalVariables: GlobalVariables.empty({ slotNumber: SlotNumber(slotNumber) }),
        }),
      );
      // Override the body's txEffects with our custom l2ToL1Msgs
      unfreeze(block.body).txEffects = l2ToL1MsgsByTx.map(msgs => ({ l2ToL1Msgs: msgs }) as TxEffect);
      return block;
    };

    it('groups blocks by slot number into checkpoints', async () => {
      const msg1 = Fr.random();
      const msg2 = Fr.random();
      const msg3 = Fr.random();

      // Two blocks in slot 1, one block in slot 2
      const blocks = [makeBlock(1, [[msg1]]), makeBlock(1, [[msg2]]), makeBlock(2, [[msg3]])];

      l2BlockSource.getBlocks.mockResolvedValue(blocks);

      const result = await node.getL2ToL1Messages(EpochNumber(0));

      // First checkpoint (slot 1): 2 blocks, each with 1 tx with 1 message
      // Second checkpoint (slot 2): 1 block with 1 tx with 1 message
      expect(result).toEqual([[[[msg1]], [[msg2]]], [[[msg3]]]]);
    });

    it('correctly includes blocks in slot zero', async () => {
      const msg1 = Fr.random();
      const msg2 = Fr.random();

      // Block in slot 0, block in slot 1
      const blocks = [makeBlock(0, [[msg1]]), makeBlock(1, [[msg2]])];

      l2BlockSource.getBlocks.mockResolvedValue(blocks);

      const result = await node.getL2ToL1Messages(EpochNumber(0));

      // First checkpoint (slot 0): 1 block with 1 tx with 1 message
      // Second checkpoint (slot 1): 1 block with 1 tx with 1 message
      expect(result).toEqual([[[[msg1]]], [[[msg2]]]]);
    });
  });

  /** Builds an L2Tips stub with the given checkpoint numbers per tip. */
  function makeTips(args: {
    proposedCheckpoint?: CheckpointNumber;
    checkpointed?: CheckpointNumber;
    proven?: CheckpointNumber;
    finalized?: CheckpointNumber;
  }): L2Tips {
    const emptyBlockId = { number: BlockNumber(0), hash: '' };
    const makeTipId = (n: CheckpointNumber) => ({ block: emptyBlockId, checkpoint: { number: n, hash: '' } });
    return {
      proposed: emptyBlockId,
      checkpointed: makeTipId(args.checkpointed ?? CheckpointNumber(0)),
      proposedCheckpoint: makeTipId(args.proposedCheckpoint ?? CheckpointNumber(0)),
      proven: makeTipId(args.proven ?? CheckpointNumber(0)),
      finalized: makeTipId(args.finalized ?? CheckpointNumber(0)),
    };
  }

  describe('getCheckpoint', () => {
    /** Builds a minimal ProposedCheckpointData stub. */
    function makeProposedCheckpointData(
      checkpointNumber: CheckpointNumber,
      slotNumber: SlotNumber,
    ): ProposedCheckpointData {
      return {
        checkpointNumber,
        header: CheckpointHeader.random({ slotNumber }),
        archive: AppendOnlyTreeSnapshot.empty(),
        checkpointOutHash: Fr.ZERO,
        startBlock: BlockNumber(Number(checkpointNumber)),
        blockCount: 1,
        totalManaUsed: 0n,
        feeAssetPriceModifier: 0n,
      };
    }

    /** Builds a minimal CheckpointData stub. */
    function makeCheckpointData(checkpointNumber: CheckpointNumber): CheckpointData {
      return {
        checkpointNumber,
        header: CheckpointHeader.empty(),
        archive: AppendOnlyTreeSnapshot.empty(),
        checkpointOutHash: Fr.ZERO,
        startBlock: BlockNumber(Number(checkpointNumber)),
        blockCount: 1,
        feeAssetPriceModifier: 0n,
        attestations: [],
        l1: { blockNumber: 10n, blockTimestamp: 1000n, blockHash: '0x0000' } as any,
      };
    }

    describe('throw guards', () => {
      it('throws BadRequestError when "proposed" resolves to a proposed entry and includeL1PublishInfo is requested', async () => {
        l2BlockSource.getL2Tips.mockResolvedValue(makeTips({ proposedCheckpoint: CheckpointNumber(5) }));
        l2BlockSource.getCheckpointData.mockResolvedValue(undefined);
        l2BlockSource.getProposedCheckpointData.mockResolvedValue(
          makeProposedCheckpointData(CheckpointNumber(5), SlotNumber(10)),
        );

        await expect(node.getCheckpoint('proposed', { includeL1PublishInfo: true })).rejects.toThrow(BadRequestError);
      });

      it('throws BadRequestError when "proposed" resolves to a proposed entry and includeAttestations is requested', async () => {
        l2BlockSource.getL2Tips.mockResolvedValue(makeTips({ proposedCheckpoint: CheckpointNumber(5) }));
        l2BlockSource.getCheckpointData.mockResolvedValue(undefined);
        l2BlockSource.getProposedCheckpointData.mockResolvedValue(
          makeProposedCheckpointData(CheckpointNumber(5), SlotNumber(10)),
        );

        await expect(node.getCheckpoint('proposed', { includeAttestations: true })).rejects.toThrow(BadRequestError);
      });

      it('throws BadRequestError when number lookup resolves to a proposed entry and includeL1PublishInfo is requested', async () => {
        l2BlockSource.getCheckpointData.mockResolvedValue(undefined);
        l2BlockSource.getProposedCheckpointData.mockResolvedValue(
          makeProposedCheckpointData(CheckpointNumber(5), SlotNumber(10)),
        );

        await expect(
          node.getCheckpoint({ number: CheckpointNumber(5) }, { includeL1PublishInfo: true }),
        ).rejects.toThrow(BadRequestError);
      });

      it('throws BadRequestError when slot lookup resolves to a proposed entry and includeAttestations is requested', async () => {
        l2BlockSource.getCheckpointData.mockResolvedValue(undefined);
        l2BlockSource.getProposedCheckpointData.mockResolvedValue(
          makeProposedCheckpointData(CheckpointNumber(3), SlotNumber(7)),
        );

        await expect(node.getCheckpoint({ slot: SlotNumber(7) }, { includeAttestations: true })).rejects.toThrow(
          BadRequestError,
        );
      });
    });

    describe('fallback semantics', () => {
      it('getCheckpoint("proposed") returns the projected proposed entry when one exists at the proposed-tip number', async () => {
        l2BlockSource.getL2Tips.mockResolvedValue(makeTips({ proposedCheckpoint: CheckpointNumber(2) }));
        l2BlockSource.getCheckpointData.mockResolvedValue(undefined);
        const proposed = makeProposedCheckpointData(CheckpointNumber(2), SlotNumber(5));
        l2BlockSource.getProposedCheckpointData.mockResolvedValue(proposed);

        const result = await node.getCheckpoint('proposed');
        expect(result).toBeDefined();
        expect(result!.number).toEqual(CheckpointNumber(2));
      });

      it('getCheckpoint("proposed") returns the latest confirmed checkpoint when no proposed entry exists', async () => {
        // When no proposed entry exists, the proposedCheckpoint tip falls back to the confirmed tip.
        l2BlockSource.getL2Tips.mockResolvedValue(
          makeTips({ proposedCheckpoint: CheckpointNumber(3), checkpointed: CheckpointNumber(3) }),
        );
        const confirmed = makeCheckpointData(CheckpointNumber(3));
        l2BlockSource.getCheckpointData.mockResolvedValue(confirmed);

        const result = await node.getCheckpoint('proposed');
        expect(result).toBeDefined();
        expect(result!.number).toEqual(CheckpointNumber(3));
      });

      it('getCheckpoint({ number }) returns the confirmed entry when one exists', async () => {
        const confirmed = makeCheckpointData(CheckpointNumber(3));
        l2BlockSource.getCheckpointData.mockResolvedValue(confirmed);
        l2BlockSource.getProposedCheckpointData.mockResolvedValue(
          makeProposedCheckpointData(CheckpointNumber(3), SlotNumber(99)),
        );

        const result = await node.getCheckpoint({ number: CheckpointNumber(3) });
        // The confirmed entry should be returned; proposed should not be reached
        expect(result).toBeDefined();
        expect(result!.number).toEqual(CheckpointNumber(3));
        // l1 is not included by default — confirm no throw and correct shape
        expect(result!.l1).toBeUndefined();
      });

      it('getCheckpoint({ number }) falls back to proposed entry when no confirmed match', async () => {
        l2BlockSource.getCheckpointData.mockResolvedValue(undefined);
        const proposed = makeProposedCheckpointData(CheckpointNumber(4), SlotNumber(8));
        l2BlockSource.getProposedCheckpointData.mockResolvedValue(proposed);

        const result = await node.getCheckpoint({ number: CheckpointNumber(4) });
        expect(result).toBeDefined();
        expect(result!.number).toEqual(CheckpointNumber(4));
      });

      it('getCheckpoint({ slot }) falls back to proposed entry when no confirmed match', async () => {
        l2BlockSource.getCheckpointData.mockResolvedValue(undefined);
        const proposed = makeProposedCheckpointData(CheckpointNumber(5), SlotNumber(11));
        l2BlockSource.getProposedCheckpointData.mockResolvedValue(proposed);

        const result = await node.getCheckpoint({ slot: SlotNumber(11) });
        expect(result).toBeDefined();
        expect(result!.number).toEqual(CheckpointNumber(5));
      });

      it('getCheckpoint("checkpointed") returns the confirmed entry at the checkpointed tip', async () => {
        l2BlockSource.getL2Tips.mockResolvedValue(makeTips({ checkpointed: CheckpointNumber(2) }));
        const confirmed = makeCheckpointData(CheckpointNumber(2));
        l2BlockSource.getCheckpointData.mockResolvedValue(confirmed);

        const result = await node.getCheckpoint('checkpointed');
        expect(result).toBeDefined();
        expect(result!.number).toEqual(CheckpointNumber(2));
      });

      it('getCheckpoint("checkpointed") returns undefined when neither store has the resolved number', async () => {
        l2BlockSource.getL2Tips.mockResolvedValue(makeTips({ checkpointed: CheckpointNumber(2) }));
        l2BlockSource.getCheckpointData.mockResolvedValue(undefined);
        l2BlockSource.getProposedCheckpointData.mockResolvedValue(undefined);

        const result = await node.getCheckpoint('checkpointed');
        expect(result).toBeUndefined();
      });

      it('getCheckpoint("proven") returns the confirmed entry at the proven tip', async () => {
        l2BlockSource.getL2Tips.mockResolvedValue(makeTips({ proven: CheckpointNumber(4) }));
        const confirmed = makeCheckpointData(CheckpointNumber(4));
        l2BlockSource.getCheckpointData.mockResolvedValue(confirmed);

        const result = await node.getCheckpoint('proven');
        expect(result).toBeDefined();
        expect(result!.number).toEqual(CheckpointNumber(4));
      });

      it('getCheckpoint("proven") returns undefined when neither store has the resolved number', async () => {
        l2BlockSource.getL2Tips.mockResolvedValue(makeTips({ proven: CheckpointNumber(4) }));
        l2BlockSource.getCheckpointData.mockResolvedValue(undefined);
        l2BlockSource.getProposedCheckpointData.mockResolvedValue(undefined);

        const result = await node.getCheckpoint('proven');
        expect(result).toBeUndefined();
      });

      it('getCheckpoint("finalized") returns undefined when neither store has the resolved number', async () => {
        l2BlockSource.getL2Tips.mockResolvedValue(makeTips({ finalized: CheckpointNumber(6) }));
        l2BlockSource.getCheckpointData.mockResolvedValue(undefined);
        l2BlockSource.getProposedCheckpointData.mockResolvedValue(undefined);

        const result = await node.getCheckpoint('finalized');
        expect(result).toBeUndefined();
      });

      it('getCheckpoint({ number }) returns undefined when neither confirmed nor proposed exist', async () => {
        l2BlockSource.getCheckpointData.mockResolvedValue(undefined);
        l2BlockSource.getProposedCheckpointData.mockResolvedValue(undefined);

        const result = await node.getCheckpoint({ number: CheckpointNumber(99) });
        expect(result).toBeUndefined();
      });
    });

    describe('includeBlocks on a proposed match', () => {
      it('pre-fetches inner blocks and passes them into the projected response', async () => {
        l2BlockSource.getCheckpointData.mockResolvedValue(undefined);
        const proposed = makeProposedCheckpointData(CheckpointNumber(2), SlotNumber(5));
        l2BlockSource.getProposedCheckpointData.mockResolvedValue(proposed);

        const fakeBlock = L2Block.empty();
        l2BlockSource.getBlocks.mockResolvedValue([fakeBlock]);

        const result = await node.getCheckpoint({ number: CheckpointNumber(2) }, { includeBlocks: true });
        expect(result).toBeDefined();
        expect(result!.blocks).toBeDefined();
        expect(result!.blocks!.length).toBe(1);
      });
    });
  });

  describe('getCheckpointNumber', () => {
    it('returns the proposed checkpoint number from proposedCheckpoint tip', async () => {
      l2BlockSource.getL2Tips.mockResolvedValue(
        makeTips({ proposedCheckpoint: CheckpointNumber(7), checkpointed: CheckpointNumber(5) }),
      );

      const result = await node.getCheckpointNumber('proposed');
      expect(result).toEqual(CheckpointNumber(7));
    });

    it('returns the proposedCheckpoint tip number when it equals the confirmed checkpoint (fallback already baked in)', async () => {
      l2BlockSource.getL2Tips.mockResolvedValue(
        makeTips({ proposedCheckpoint: CheckpointNumber(5), checkpointed: CheckpointNumber(5) }),
      );

      const result = await node.getCheckpointNumber('proposed');
      expect(result).toEqual(CheckpointNumber(5));
    });
  });

  describe('getL1ToL2MessageCheckpoint', () => {
    it('returns the checkpoint for a message at index 0n', async () => {
      const msg = Fr.random();
      l1ToL2MessageSource.getL1ToL2MessageIndex.mockResolvedValue(0n);

      const result = await node.getL1ToL2MessageCheckpoint(msg);
      expect(result).toEqual(InboxLeaf.checkpointNumberFromIndex(0n));
      expect(result).not.toBeUndefined();
    });

    it('returns undefined when the message is not found', async () => {
      const msg = Fr.random();
      l1ToL2MessageSource.getL1ToL2MessageIndex.mockResolvedValue(undefined);

      const result = await node.getL1ToL2MessageCheckpoint(msg);
      expect(result).toBeUndefined();
    });
  });

  describe('getTxReceipt', () => {
    // epochDuration of 4 means getEpochAtSlot(slot) === floor(slot / 4).
    const EPOCH_DURATION = 4;
    const l1Constants: L1RollupConstants = { ...EmptyL1RollupConstants, epochDuration: EPOCH_DURATION };

    /** Builds an L2Tips stub whose tip block numbers drive #deriveMinedStatus. */
    const makeTipsWithBlockNumbers = (args: {
      proposed: number;
      checkpointed: number;
      proven: number;
      finalized: number;
    }): L2Tips => {
      const blockId = (n: number) => ({ number: BlockNumber(n), hash: '0x01' });
      const tipId = (n: number) => ({ block: blockId(n), checkpoint: { number: CheckpointNumber(1), hash: '0x01' } });
      return {
        proposed: blockId(args.proposed),
        checkpointed: tipId(args.checkpointed),
        proposedCheckpoint: tipId(args.checkpointed),
        proven: tipId(args.proven),
        finalized: tipId(args.finalized),
      };
    };

    /** Builds an IndexedTxEffect for a tx mined in the given block at the given index. */
    const makeIndexedTxEffect = (
      txHash: TxHash,
      blockNumber: number,
      slotNumber: number,
      txIndexInBlock: number,
      revertCode: RevertCode,
      transactionFee: bigint,
    ): IndexedTxEffect => {
      const data = new TxEffect(revertCode, txHash, new Fr(transactionFee), [], [Fr.random()], [], [], [], [], []);
      return {
        data,
        l2BlockNumber: BlockNumber(blockNumber),
        l2BlockHash: BlockHash.random(),
        txIndexInBlock,
        slotNumber: SlotNumber(slotNumber),
      };
    };

    /** Wires the block source so the tx is mined in `blockNumber` at slot `slotNumber`, with the given tips. */
    const setUpMined = (opts: {
      txHash: TxHash;
      blockNumber: number;
      slotNumber: number;
      txIndexInBlock?: number;
      revertCode?: RevertCode;
      transactionFee?: bigint;
      tips: L2Tips;
    }) => {
      const indexed = makeIndexedTxEffect(
        opts.txHash,
        opts.blockNumber,
        opts.slotNumber,
        opts.txIndexInBlock ?? 0,
        opts.revertCode ?? RevertCode.OK,
        opts.transactionFee ?? 7n,
      );
      l2BlockSource.getTxEffect.mockResolvedValue(indexed);
      l2BlockSource.getL2Tips.mockResolvedValue(opts.tips);
      l2BlockSource.getL1Constants.mockResolvedValue(l1Constants);
      l2BlockSource.getBlockData.mockResolvedValue({
        header: BlockHeader.empty({
          globalVariables: GlobalVariables.empty({
            blockNumber: BlockNumber(opts.blockNumber),
            slotNumber: SlotNumber(opts.slotNumber),
          }),
        }),
        archive: L2Block.empty().archive,
        blockHash: indexed.l2BlockHash,
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });
      return indexed;
    };

    it('derives PROPOSED when the tx block is above all confirmed tips', async () => {
      const txHash = TxHash.random();
      p2p.getTxStatus.mockResolvedValue('mined');
      setUpMined({
        txHash,
        blockNumber: 10,
        slotNumber: 40,
        tips: makeTipsWithBlockNumbers({ proposed: 10, checkpointed: 5, proven: 3, finalized: 1 }),
      });

      const receipt = await node.getTxReceipt(txHash);
      expect(receipt).toBeInstanceOf(MinedTxReceipt);
      expect(receipt.status).toEqual(TxStatus.PROPOSED);
    });

    it('derives CHECKPOINTED at the checkpointed tip boundary', async () => {
      const txHash = TxHash.random();
      p2p.getTxStatus.mockResolvedValue('mined');
      setUpMined({
        txHash,
        blockNumber: 5,
        slotNumber: 20,
        tips: makeTipsWithBlockNumbers({ proposed: 10, checkpointed: 5, proven: 3, finalized: 1 }),
      });

      const receipt = await node.getTxReceipt(txHash);
      expect(receipt.status).toEqual(TxStatus.CHECKPOINTED);
    });

    it('derives PROVEN at the proven tip boundary', async () => {
      const txHash = TxHash.random();
      p2p.getTxStatus.mockResolvedValue('mined');
      setUpMined({
        txHash,
        blockNumber: 3,
        slotNumber: 12,
        tips: makeTipsWithBlockNumbers({ proposed: 10, checkpointed: 5, proven: 3, finalized: 1 }),
      });

      const receipt = await node.getTxReceipt(txHash);
      expect(receipt.status).toEqual(TxStatus.PROVEN);
    });

    it('derives FINALIZED at the finalized tip boundary', async () => {
      const txHash = TxHash.random();
      p2p.getTxStatus.mockResolvedValue('mined');
      setUpMined({
        txHash,
        blockNumber: 1,
        slotNumber: 4,
        tips: makeTipsWithBlockNumbers({ proposed: 10, checkpointed: 5, proven: 3, finalized: 1 }),
      });

      const receipt = await node.getTxReceipt(txHash);
      expect(receipt.status).toEqual(TxStatus.FINALIZED);
    });

    it('populates fee, block coordinates, execution result, and epoch from the indexed effect', async () => {
      const txHash = TxHash.random();
      p2p.getTxStatus.mockResolvedValue('mined');
      const indexed = setUpMined({
        txHash,
        blockNumber: 4,
        slotNumber: 17, // floor(17 / 4) === 4
        txIndexInBlock: 2,
        revertCode: RevertCode.REVERTED,
        transactionFee: 123n,
        tips: makeTipsWithBlockNumbers({ proposed: 10, checkpointed: 5, proven: 4, finalized: 1 }),
      });

      const receipt = await node.getTxReceipt(txHash);
      expect(receipt).toBeInstanceOf(MinedTxReceipt);
      const mined = receipt as MinedTxReceipt;
      expect(mined.status).toEqual(TxStatus.PROVEN);
      expect(mined.transactionFee).toEqual(123n);
      expect(mined.blockNumber).toEqual(BlockNumber(4));
      expect(mined.blockHash).toEqual(indexed.l2BlockHash);
      expect(mined.txIndexInBlock).toEqual(2);
      expect(mined.executionResult).toEqual(TxExecutionResult.REVERTED);
      expect(mined.hasExecutionReverted()).toBe(true);
      expect(mined.epochNumber).toEqual(EpochNumber(4));
    });

    it('attaches the txEffect only when includeTxEffect is set', async () => {
      const txHash = TxHash.random();
      p2p.getTxStatus.mockResolvedValue('mined');
      const indexed = setUpMined({
        txHash,
        blockNumber: 4,
        slotNumber: 16,
        tips: makeTipsWithBlockNumbers({ proposed: 10, checkpointed: 5, proven: 4, finalized: 1 }),
      });

      const withoutEffect = await node.getTxReceipt(txHash);
      expect(withoutEffect.txEffect).toBeUndefined();

      const withEffect = await node.getTxReceipt(txHash, { includeTxEffect: true });
      expect(withEffect.txEffect).toEqual(indexed.data);
    });

    it('returns a pending receipt when the tx is known to the pool but not mined', async () => {
      const txHash = TxHash.random();
      p2p.getTxStatus.mockResolvedValue('pending');
      l2BlockSource.getTxEffect.mockResolvedValue(undefined);

      const receipt = await node.getTxReceipt(txHash);
      expect(receipt).toBeInstanceOf(PendingTxReceipt);
      if (!receipt.isPending()) {
        throw new Error('expected a pending receipt');
      }
      expect(receipt.status).toEqual(TxStatus.PENDING);
      expect(receipt.tx).toBeUndefined();
    });

    it('attaches the stripped pending tx when includePendingTx is set without includeProof', async () => {
      const txHash = TxHash.random();
      p2p.getTxStatus.mockResolvedValue('pending');
      l2BlockSource.getTxEffect.mockResolvedValue(undefined);
      const pendingTx = await mockTx();
      p2p.getTxByHashFromPool.mockResolvedValue(pendingTx);

      const receipt = await node.getTxReceipt(txHash, { includePendingTx: true });
      expect(receipt).toBeInstanceOf(PendingTxReceipt);
      if (!receipt.isPending()) {
        throw new Error('expected a pending receipt');
      }
      expect(receipt.tx).toBeDefined();
      expect(receipt.tx!.chonkProof).toEqual(pendingTx.withoutProof().chonkProof);
    });

    it('returns a dropped receipt when the tx is unknown to the pool and not mined', async () => {
      const txHash = TxHash.random();
      p2p.getTxStatus.mockResolvedValue(undefined);
      l2BlockSource.getTxEffect.mockResolvedValue(undefined);

      const receipt = await node.getTxReceipt(txHash);
      expect(receipt).toBeInstanceOf(DroppedTxReceipt);
      expect(receipt.status).toEqual(TxStatus.DROPPED);
      expect(receipt.error).toEqual('Tx dropped by P2P node');
    });
  });
});

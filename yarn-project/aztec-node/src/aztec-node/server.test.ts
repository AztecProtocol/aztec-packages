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
import { DateProvider, Timer } from '@aztec/foundation/timer';
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
  type ArchiverEmitter,
  type BlockData,
  BlockHash,
  type BlockParameter,
  type BlockQuery,
  L2Block,
  type L2BlockSource,
  type L2BlockSourceEventEmitter,
  L2BlockSourceEvents,
  type L2Tips,
} from '@aztec/stdlib/block';
import type { CheckpointData, ProposedCheckpointData } from '@aztec/stdlib/checkpoint';
import type { ContractDataSource, ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { EmptyL1RollupConstants, type L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { GasFees } from '@aztec/stdlib/gas';
import type { L2LogsSource, MerkleTreeReadOperations, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { SiloedTag, Tag } from '@aztec/stdlib/logs';
import { InboxLeaf } from '@aztec/stdlib/messaging';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { mockTx, randomContractInstanceWithAddress } from '@aztec/stdlib/testing';
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
import { WorldStateSynchronizerError } from '@aztec/world-state';

import { jest } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { type MockProxy, mock } from 'jest-mock-extended';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'os';
import { join } from 'path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import { type AztecNodeConfig, getConfigEnvVars } from './config.js';
import { NextBlockPredictor } from './next_block/index.js';
import { AztecNodeService } from './server.js';

// Arbitrary fixed timestamp for the mock date provider. DateProvider.now() returns milliseconds but ExpirationTimestamp
// is denominated in seconds.
const NOW_MS = 1718745600000;
const NOW_S = NOW_MS / 1000;

// EmptyL1RollupConstants uses a 1s slot duration, which cannot fit a single block under the default 3s
// block duration the node config carries — buildProposerTimetable would derive a negative
// blocks-per-checkpoint and throw. Use a fast-profile geometry sized to one block per checkpoint (S=9, E=4)
// so the network per-tx gas admission limit equals the per-tx protocol maximum, leaving the maximal-gas mock
// txs these validation tests use admissible while still exercising the gas-limits validator at RPC.
const testL1Constants: L1RollupConstants = {
  ...EmptyL1RollupConstants,
  slotDuration: 9,
  ethereumSlotDuration: 4,
};

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

/** Builds minimal block metadata for a given block number and hash, as returned by the block source. */
const makeBlockData = (blockNumber: BlockNumber, blockHash: BlockHash = BlockHash.random()): BlockData => ({
  header: BlockHeader.empty({ globalVariables: GlobalVariables.empty({ blockNumber }) }),
  archive: L2Block.empty().archive,
  blockHash,
  checkpointNumber: CheckpointNumber(1),
  indexWithinCheckpoint: IndexWithinCheckpoint(0),
});

describe('aztec node', () => {
  let p2p: MockProxy<P2P>;
  let globalVariablesBuilder: MockProxy<GlobalVariableBuilder>;
  let feeProvider: MockProxy<FeeProvider>;
  let merkleTreeOps: MockProxy<MerkleTreeReadOperations>;
  let worldState: MockProxy<WorldStateSynchronizer>;
  let l2BlockSource: MockProxy<L2BlockSourceEventEmitter>;
  /** Stands in for the archiver's emitter: the node's hold-off wakes held requests off the updates reported here. */
  let l2BlockSourceEvents: EventEmitter;
  let l2LogsSource: MockProxy<L2LogsSource>;
  let contractSource: MockProxy<ContractDataSource>;
  let l1ToL2MessageSource: MockProxy<L1ToL2MessageSource>;
  let lastBlockNumber: BlockNumber;
  let node: TestAztecNodeService;
  /** Builds a node on the shared mocks, optionally overriding config entries. */
  let createNode: (configOverrides?: Partial<AztecNodeConfig>) => TestAztecNodeService;
  let feePayer: AztecAddress;
  let epochCache: EpochCache;
  let nextBlockPredictor: NextBlockPredictor;
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
    p2p.getP2PConnectivity.mockResolvedValue({ enabled: false, connectedPeers: 0 });

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
    // Mirrors the real synchronizer contract: resolves with the synced block, rejects when the target is
    // beyond what the block source can provide.
    worldState.syncImmediate.mockImplementation((target?: BlockNumber) =>
      target !== undefined && target > lastBlockNumber
        ? Promise.reject(
            new WorldStateSynchronizerError(
              `Unable to sync to block number ${target} (last synced is ${lastBlockNumber})`,
            ),
          )
        : Promise.resolve(lastBlockNumber),
    );

    l2BlockSourceEvents = new EventEmitter();
    l2BlockSource = mock<L2BlockSourceEventEmitter>({ events: l2BlockSourceEvents as ArchiverEmitter });
    l2BlockSource.getBlockNumber.mockImplementation(((query?: BlockQuery) => {
      if (!query || 'tag' in query) {
        return Promise.resolve(lastBlockNumber);
      }
      if ('number' in query) {
        return Promise.resolve(query.number);
      }
      return Promise.resolve(undefined);
    }) as L2BlockSource['getBlockNumber']);
    // World-state queries resolve every block parameter to a concrete (number, hash) via getBlockData, mirroring
    // the getBlockNumber resolution above but returning full block metadata.
    l2BlockSource.getBlockData.mockImplementation(((query?: BlockQuery) => {
      if (!query || 'tag' in query) {
        return Promise.resolve(makeBlockData(lastBlockNumber));
      }
      if ('number' in query) {
        return Promise.resolve(query.number <= lastBlockNumber ? makeBlockData(query.number) : undefined);
      }
      return Promise.resolve(undefined);
    }) as L2BlockSource['getBlockData']);
    l2BlockSource.getL1Constants.mockResolvedValue(testL1Constants);
    l2BlockSource.getGenesisBlockHash.mockReturnValue(BlockHash.random());

    l2LogsSource = mock<L2LogsSource>();

    l1ToL2MessageSource = mock<L1ToL2MessageSource>();

    // all txs use the same allowed FPC class
    contractSource = mock<ContractDataSource>();

    const nodeConfigFromEnvVars: AztecNodeConfig = getConfigEnvVars();
    nodeConfig = {
      ...nodeConfigFromEnvVars,
      rollupAddress: EthAddress.ZERO,
      registryAddress: EthAddress.ZERO,
      inboxAddress: EthAddress.ZERO,
      outboxAddress: EthAddress.ZERO,
      // Queries for blocks the node has not seen fail immediately by default here, so tests asserting miss
      // behavior do not sit through the hold-off. The 'unseen block hold-off' suite opts back in.
      rpcUnseenBlockByNumberWaitMs: 0,
      rpcUnseenBlockByHashWaitMs: 0,
    };

    // Inject a spurious config value to test that the config is correctly picked up
    (nodeConfig as any).nonExistingConfig = 'foo';

    const rollupContract = mock<RollupContract>();
    // EpochCache needs a rollup object for other methods, but these tests mock `getEpochAndSlotInNextL1Slot` directly.
    epochCache = new EpochCache(
      rollupContract,
      { ...EmptyL1RollupConstants, lagInEpochsForValidatorSet: 0, lagInEpochsForRandao: 0 },
      new MockDateProvider(),
    );

    nextBlockPredictor = NextBlockPredictor.create({
      blockSource: l2BlockSource,
      globalVariableBuilder: globalVariablesBuilder,
      rollupContract,
      epochCache,
      signatureContext: { chainId: 12345, rollupAddress: EthAddress.ZERO },
      dateProvider: new MockDateProvider(),
    });

    createNode = (configOverrides: Partial<AztecNodeConfig> = {}) =>
      new TestAztecNodeService({
        config: { ...nodeConfig, ...configOverrides },
        p2pClient: p2p,
        blockSource: l2BlockSource,
        logsSource: l2LogsSource,
        contractDataSource: contractSource,
        l1ToL2MessageSource,
        worldStateSynchronizer: worldState,
        sequencer: undefined,
        proverNode: undefined,
        slasherClient: undefined,
        validatorsSentinel: undefined,
        stopStartedWatchers: async () => {},
        l1ChainId: 12345,
        version: rollupVersion.toNumber(),
        globalVariableBuilder: globalVariablesBuilder,
        rollupContract,
        feeProvider,
        nextBlockPredictor,
        epochCache,
        packageVersion: getPackageVersion(),
        peerProofVerifier: new TestCircuitVerifier(),
        rpcProofVerifier: new TestCircuitVerifier(),
      });

    node = createNode();
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

  describe('sendTx', () => {
    it('rejects the tx when p2p is enabled but has no connected peers', async () => {
      p2p.getP2PConnectivity.mockResolvedValue({ enabled: true, connectedPeers: 0 });
      const tx = await mockTxForRollup(0x10000);

      await expect(node.sendTx(tx)).rejects.toThrow('no connected peers');
      expect(p2p.sendTx).not.toHaveBeenCalled();
    });

    it('accepts the tx when p2p is enabled and has connected peers', async () => {
      p2p.getP2PConnectivity.mockResolvedValue({ enabled: true, connectedPeers: 1 });
      const tx = await mockTxForRollup(0x10000);

      await node.sendTx(tx);
      expect(p2p.sendTx).toHaveBeenCalledWith(tx);
    });

    it('accepts the tx when p2p is disabled', async () => {
      p2p.getP2PConnectivity.mockResolvedValue({ enabled: false, connectedPeers: 0 });
      const tx = await mockTxForRollup(0x10000);

      await node.sendTx(tx);
      expect(p2p.sendTx).toHaveBeenCalledWith(tx);
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

    describe('getContract', () => {
      let address: AztecAddress;
      let instance: ContractInstanceWithAddress;
      const referenceTimestamp = 4242n;

      beforeEach(async () => {
        instance = await randomContractInstanceWithAddress();
        address = instance.address;

        l2BlockSource.getBlockData.mockResolvedValue({
          header: BlockHeader.empty({
            globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(1), timestamp: referenceTimestamp }),
          }),
          archive: L2Block.empty().archive,
          blockHash: BlockHash.random(),
          checkpointNumber: CheckpointNumber(1),
          indexWithinCheckpoint: IndexWithinCheckpoint(0),
        });

        contractSource.getContract.mockImplementation((_address, timestamp) =>
          Promise.resolve(timestamp === referenceTimestamp ? instance : undefined),
        );
      });

      it('resolves the reference block to its timestamp and reads the instance as of that block', async () => {
        expect(await node.getContract(address, BlockNumber(1))).toEqual(instance);
      });

      it('defaults to the latest block when no reference block is given', async () => {
        const getBlockData = jest.spyOn(node, 'getBlockData');
        expect(await node.getContract(address)).toEqual(instance);
        expect(getBlockData).toHaveBeenCalledWith('latest');
      });

      it('throws when the reference block is not part of the chain', async () => {
        l2BlockSource.getBlockData.mockResolvedValue(undefined);
        await expect(node.getContract(address, BlockHash.random())).rejects.toThrow(/not found/);
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
      let initialBlockHash: BlockHash;

      // A block's fork hash is derived deterministically from its number so tests can assert the exact hash
      // threaded through resolution -> sync -> snapshot. Block 0 hashes to the genesis header hash.
      const hashForBlock = (blockNumber: BlockNumber): BlockHash =>
        blockNumber === BlockNumber.ZERO ? initialBlockHash : new BlockHash(new Fr(1_000_000n + BigInt(blockNumber)));

      beforeEach(async () => {
        lastBlockNumber = BlockNumber(5);
        initialHeader = BlockHeader.empty({
          globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber.ZERO }),
        });
        initialBlockHash = await initialHeader.hash();
        // The block source resolves each query variant to concrete block metadata: tags and the no-arg case to
        // the latest block, numbers within range to themselves (undefined past the tip), and the genesis hash to
        // block 0. Unknown hashes resolve to undefined.
        l2BlockSource.getBlockData.mockImplementation(((query?: BlockQuery) =>
          Promise.resolve(
            !query || 'tag' in query
              ? makeBlockData(lastBlockNumber, hashForBlock(lastBlockNumber))
              : 'number' in query
                ? query.number <= lastBlockNumber
                  ? makeBlockData(query.number, hashForBlock(query.number))
                  : undefined
                : 'hash' in query && query.hash.equals(initialBlockHash)
                  ? makeBlockData(BlockNumber.ZERO, initialBlockHash)
                  : undefined,
          )) as L2BlockSource['getBlockData']);
        snapshotMerkleTreeOps = mock<MerkleTreeReadOperations>();
        worldState.getVerifiedSnapshot.mockResolvedValue(snapshotMerkleTreeOps);
      });

      it('returns committed db for latest', async () => {
        const result = await node.getWorldState('latest');
        expect(result).toBe(merkleTreeOps);
        expect(worldState.getVerifiedSnapshot).not.toHaveBeenCalled();
      });

      it('returns snapshot for a block number within sync range', async () => {
        const result = await node.getWorldState(BlockNumber(3));
        expect(result).toBe(snapshotMerkleTreeOps);
        expect(worldState.getVerifiedSnapshot).toHaveBeenCalledWith(BlockNumber(3), hashForBlock(BlockNumber(3)));
      });

      it('throws for a block number beyond sync range', async () => {
        // A number past the tip cannot be resolved to block metadata. This is transient (the block may still
        // arrive), so it is retried and then surfaced rather than serving state at the wrong height.
        await expect(node.getWorldState(BlockNumber(10))).rejects.toThrow(/Block not found for number=10/);
      });

      it('throws for a block hash whose block number is beyond sync range', async () => {
        const blockHash = BlockHash.random();
        l2BlockSource.getBlockData.mockImplementation(((query?: BlockQuery) =>
          Promise.resolve(
            query && 'hash' in query ? makeBlockData(BlockNumber(10), blockHash) : undefined,
          )) as L2BlockSource['getBlockData']);

        await expect(node.getWorldState(blockHash)).rejects.toThrow(/Unable to sync to block number 10/);
      });

      it('resolves block hash to block number via archiver and returns snapshot', async () => {
        const blockHash = BlockHash.random();
        l2BlockSource.getBlockData.mockImplementation(((query?: BlockQuery) =>
          Promise.resolve(
            query && 'hash' in query ? makeBlockData(BlockNumber(3), blockHash) : undefined,
          )) as L2BlockSource['getBlockData']);

        const result = await node.getWorldState(blockHash);
        expect(result).toBe(snapshotMerkleTreeOps);
        expect(worldState.getVerifiedSnapshot).toHaveBeenCalledWith(BlockNumber(3), blockHash);
      });

      it('drives a reorg-aware sync to the requested block hash', async () => {
        // A hash-anchored query resolves the hash against the archiver and then syncs world state to that
        // exact (number, hash) so the synchronizer barriers on the archive-tree commit and detects reorgs,
        // rather than syncing to bare latest height and racing the snapshot read.
        const blockHash = BlockHash.random();
        l2BlockSource.getBlockData.mockImplementation(((query?: BlockQuery) =>
          Promise.resolve(
            query && 'hash' in query ? makeBlockData(BlockNumber(3), blockHash) : undefined,
          )) as L2BlockSource['getBlockData']);

        await node.getWorldState(blockHash);

        expect(worldState.syncImmediate).toHaveBeenCalledWith(BlockNumber(3), blockHash);
      });

      it('syncs to the resolved fork hash when querying by block number', async () => {
        // Number queries pin a fork too: the resolved hash is threaded to the sync so a reorg that replaced
        // the block at that height is detected instead of silently served.
        await node.getWorldState(BlockNumber(3));
        expect(worldState.syncImmediate).toHaveBeenCalledWith(BlockNumber(3), hashForBlock(BlockNumber(3)));
      });

      it('throws when block hash is not found in archiver', async () => {
        const blockHash = BlockHash.random();

        await expect(node.getWorldState(blockHash)).rejects.toThrow(/not found when resolving query/);
      });

      it('propagates a reorg (block hash mismatch) error from the synchronizer', async () => {
        // The synchronizer verifies the requested hash against the synced fork and throws on mismatch;
        // getWorldState no longer re-checks the hash itself, so once retries are exhausted (the hash keeps
        // resolving, the sync keeps failing) it must surface that error to the caller.
        const blockHash = BlockHash.random();
        l2BlockSource.getBlockData.mockImplementation(((query?: BlockQuery) =>
          Promise.resolve(
            query && 'hash' in query ? makeBlockData(BlockNumber(3), blockHash) : undefined,
          )) as L2BlockSource['getBlockData']);
        worldState.syncImmediate.mockRejectedValue(new WorldStateSynchronizerError('Block hash mismatch at block 3'));

        await expect(node.getWorldState(blockHash)).rejects.toThrow(/Block hash mismatch/);
      });

      it('throws instead of returning stale committed state when sync fails', async () => {
        // Regression guard: a sync failure used to be swallowed and the latest committed db returned
        // regardless, serving stale state with no signal that synchronization had failed.
        worldState.syncImmediate.mockRejectedValue(new Error('sync failed'));

        await expect(node.getWorldState('latest')).rejects.toThrow(/sync failed/);
      });

      it('serves a tag query whose tip advances past the pre-sync latest block', async () => {
        // The tag tip can move while world state syncs (e.g. during catch-up, blocks arrive already proven),
        // so the query must resolve the tag up front and drive the sync to that exact block, instead of
        // syncing to a stale latest height and then failing the range check against a newer resolution.
        l2BlockSource.getBlockData.mockImplementation(((query?: BlockQuery) =>
          Promise.resolve(
            query && 'tag' in query && query.tag === 'proven'
              ? makeBlockData(BlockNumber(7), hashForBlock(BlockNumber(7)))
              : undefined,
          )) as L2BlockSource['getBlockData']);
        worldState.syncImmediate.mockImplementation((target?: BlockNumber) =>
          Promise.resolve(target ?? lastBlockNumber),
        );

        const result = await node.getWorldState('proven');

        expect(result).toBe(snapshotMerkleTreeOps);
        expect(worldState.getVerifiedSnapshot).toHaveBeenCalledWith(BlockNumber(7), hashForBlock(BlockNumber(7)));
      });

      it('retries with a re-resolved target when a prune makes the sync target unreachable', async () => {
        // A prune can land between resolving the query and syncing to the resolved block, making the
        // target permanently unreachable. The retry re-resolves the tag against the post-prune chain.
        let checkpointedTip = BlockNumber(4);
        l2BlockSource.getBlockData.mockImplementation(((query?: BlockQuery) =>
          Promise.resolve(
            query && 'tag' in query && query.tag === 'checkpointed'
              ? makeBlockData(checkpointedTip, hashForBlock(checkpointedTip))
              : undefined,
          )) as L2BlockSource['getBlockData']);
        worldState.syncImmediate.mockImplementationOnce(() => {
          checkpointedTip = BlockNumber(3);
          return Promise.reject(new WorldStateSynchronizerError('Unable to sync to block number 4 (last synced is 3)'));
        });

        const result = await node.getWorldState('checkpointed');

        expect(result).toBe(snapshotMerkleTreeOps);
        expect(worldState.getVerifiedSnapshot).toHaveBeenCalledWith(BlockNumber(3), hashForBlock(BlockNumber(3)));
      });

      it('converts a mid-query prune of a hash anchor into a clear reorg error', async () => {
        // The hash resolves before the prune, then the sync fails because the block is gone; the retry
        // re-resolves the (now unknown) hash, surfacing the descriptive reorg error instead of the raw
        // sync failure.
        const blockHash = BlockHash.random();
        let pruned = false;
        l2BlockSource.getBlockData.mockImplementation(((query?: BlockQuery) =>
          Promise.resolve(
            query && 'hash' in query ? (pruned ? undefined : makeBlockData(BlockNumber(3), blockHash)) : undefined,
          )) as L2BlockSource['getBlockData']);
        worldState.syncImmediate.mockImplementation(() => {
          pruned = true;
          return Promise.reject(new WorldStateSynchronizerError('Block hash mismatch at block 3'));
        });

        await expect(node.getWorldState(blockHash)).rejects.toThrow(/not found when resolving query/);
      });

      it('returns snapshot at block 0 for initial header hash', async () => {
        // Block 0 is a first-class historical block: its state lives in the trees' persisted block-0
        // payload. getWorldState resolves the genesis hash to block number 0 and returns the verified snapshot.
        const result = await node.getWorldState(initialBlockHash);
        expect(result).toBe(snapshotMerkleTreeOps);
        expect(worldState.getVerifiedSnapshot).toHaveBeenCalledWith(BlockNumber.ZERO, initialBlockHash);
      });

      it('re-resolves a tag query onto the new fork when a reorg flips the block hash mid-flight', async () => {
        // Proven tip is block 10 on fork A; a reorg replaces it with fork B while we sync. The sync rejects the
        // stale fork-A hash, and the retry must re-resolve the tag and serve fork B rather than silently
        // returning wrong-fork state.
        const hashA = new BlockHash(new Fr(0xaa));
        const hashB = new BlockHash(new Fr(0xbb));
        let reorged = false;
        l2BlockSource.getBlockData.mockImplementation(((query?: BlockQuery) =>
          Promise.resolve(
            query && 'tag' in query && query.tag === 'proven'
              ? makeBlockData(BlockNumber(10), reorged ? hashB : hashA)
              : undefined,
          )) as L2BlockSource['getBlockData']);
        worldState.syncImmediate.mockImplementation((target?: BlockNumber, blockHash?: BlockHash) => {
          reorged = true;
          return blockHash?.equals(hashB)
            ? Promise.resolve(target ?? lastBlockNumber)
            : Promise.reject(new WorldStateSynchronizerError(`Block hash mismatch at block ${target}`));
        });

        const result = await node.getWorldState('proven');

        expect(result).toBe(snapshotMerkleTreeOps);
        expect(worldState.getVerifiedSnapshot).toHaveBeenCalledWith(BlockNumber(10), hashB);
      });

      it('retries when snapshot-stage fork verification fails and heals after re-resolution', async () => {
        // syncImmediate reports success, but reading the snapshot back detects that the fork flipped
        // underneath. The retry re-resolves and the second verified snapshot succeeds.
        worldState.syncImmediate.mockResolvedValue(lastBlockNumber);
        worldState.getVerifiedSnapshot
          .mockRejectedValueOnce(new WorldStateSynchronizerError('Block hash mismatch at block 3'))
          .mockResolvedValue(snapshotMerkleTreeOps);

        const result = await node.getWorldState(BlockNumber(3));

        expect(result).toBe(snapshotMerkleTreeOps);
        expect(worldState.getVerifiedSnapshot).toHaveBeenCalledTimes(2);
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
        l2BlockSource.getBlockData.mockResolvedValue(makeBlockData(BlockNumber.ZERO, initialBlockHash));

        const someBlockHash = BlockHash.random();
        const result = await node.getBlockHashMembershipWitness(initialBlockHash, someBlockHash);
        expect(result).toBeUndefined();
      });
    });
  });

  describe('unseen block hold-off', () => {
    // Budgets small enough to keep the suite fast, but well above the delay each arrival below is scheduled after.
    const byNumberWaitMs = 1000;
    const byHashWaitMs = 600;

    let unseenBlockNumber: BlockNumber;
    let unseenBlockHash: BlockHash;
    let arrivalTimer: NodeJS.Timeout | undefined;

    const hashForBlock = (blockNumber: BlockNumber): BlockHash =>
      blockNumber === unseenBlockNumber ? unseenBlockHash : new BlockHash(new Fr(1_000_000n + BigInt(blockNumber)));

    /**
     * Makes the block the node had not seen available after `delayMs` and reports the update, as the archiver does
     * when the block arrives from the network. Cleared after each test so an arrival never lands in a later one.
     */
    const scheduleUnseenBlockArrival = (delayMs = 200) => {
      arrivalTimer = setTimeout(() => {
        lastBlockNumber = unseenBlockNumber;
        l2BlockSourceEvents.emit(L2BlockSourceEvents.L2BlockSourceUpdated);
      }, delayMs);
    };

    afterEach(() => {
      clearTimeout(arrivalTimer);
      arrivalTimer = undefined;
    });

    beforeEach(() => {
      lastBlockNumber = BlockNumber(5);
      unseenBlockNumber = BlockNumber(6);
      unseenBlockHash = BlockHash.random();

      l2BlockSource.getBlockData.mockImplementation(((query?: BlockQuery) => {
        if (!query || 'tag' in query) {
          return Promise.resolve(makeBlockData(lastBlockNumber, hashForBlock(lastBlockNumber)));
        }
        if ('number' in query) {
          return Promise.resolve(
            query.number <= lastBlockNumber ? makeBlockData(query.number, hashForBlock(query.number)) : undefined,
          );
        }
        if ('hash' in query) {
          return Promise.resolve(
            query.hash.equals(unseenBlockHash) && lastBlockNumber >= unseenBlockNumber
              ? makeBlockData(unseenBlockNumber, unseenBlockHash)
              : undefined,
          );
        }
        return Promise.resolve(undefined);
      }) as L2BlockSource['getBlockData']);

      worldState.getVerifiedSnapshot.mockResolvedValue(merkleTreeOps);
      node = createNode({ rpcUnseenBlockByNumberWaitMs: byNumberWaitMs, rpcUnseenBlockByHashWaitMs: byHashWaitMs });
    });

    it('serves findLeavesIndexes anchored on a block hash that arrives while the query is held', async () => {
      merkleTreeOps.findLeafIndices.mockResolvedValue([10n]);
      merkleTreeOps.getBlockNumbersForLeafIndices.mockResolvedValue([unseenBlockNumber]);
      merkleTreeOps.getLeafValue.mockResolvedValue(unseenBlockHash);
      scheduleUnseenBlockArrival();

      const result = await node.findLeavesIndexes(unseenBlockHash, MerkleTreeId.NOTE_HASH_TREE, [Fr.random()]);

      expect(result).toEqual([{ l2BlockNumber: unseenBlockNumber, l2BlockHash: unseenBlockHash, data: 10n }]);
    });

    it('serves getContract anchored on a block hash that arrives while the query is held', async () => {
      const instance = await randomContractInstanceWithAddress();
      contractSource.getContract.mockResolvedValue(instance);
      scheduleUnseenBlockArrival();

      expect(await node.getContract(instance.address, unseenBlockHash)).toEqual(instance);
    });

    it('serves getBlock for the block right after the tip once it arrives', async () => {
      scheduleUnseenBlockArrival();

      const block = await node.getBlock(unseenBlockNumber);

      expect(block?.number).toEqual(unseenBlockNumber);
      expect(block?.hash).toEqual(unseenBlockHash);
    });

    it('serves the block with transactions once it arrives', async () => {
      // A query wanting transactions waits on block metadata like any other, and reads the block with its
      // transactions once the metadata shows up.
      l2BlockSource.getBlock.mockImplementation(((query: BlockQuery) =>
        Promise.resolve(
          'number' in query && query.number <= lastBlockNumber ? L2Block.empty() : undefined,
        )) as L2BlockSource['getBlock']);
      scheduleUnseenBlockArrival();

      const block = await node.getBlock(unseenBlockNumber, { includeTransactions: true });

      expect(block?.body).toBeDefined();
    });

    it('holds a private logs query whose reference block has not arrived yet', async () => {
      // Stands in for the archiver's in-transaction anchor check: the reference block must be in the chain.
      l2LogsSource.getPrivateLogsByTags.mockImplementation(query =>
        query.referenceBlock !== undefined && lastBlockNumber < unseenBlockNumber
          ? Promise.reject(new Error(`Block ${query.referenceBlock} is not present`))
          : Promise.resolve([[]]),
      );
      scheduleUnseenBlockArrival();

      const result = await node.getPrivateLogsByTags({
        tags: [SiloedTag.random()],
        referenceBlock: unseenBlockHash,
      });

      expect(result).toEqual([[]]);
    });

    it('holds a public logs query whose reference block has not arrived yet', async () => {
      l2LogsSource.getPublicLogsByTags.mockImplementation(query =>
        query.referenceBlock !== undefined && lastBlockNumber < unseenBlockNumber
          ? Promise.reject(new Error(`Block ${query.referenceBlock} is not present`))
          : Promise.resolve([[]]),
      );
      scheduleUnseenBlockArrival();

      const result = await node.getPublicLogsByTags({
        contractAddress: await AztecAddress.random(),
        tags: [Tag.random()],
        referenceBlock: unseenBlockHash,
      });

      expect(result).toEqual([[]]);
    });

    it('holds a world-state query for a single budget and then fails', async () => {
      // getWorldState resolves the query once, before its sync-retry loop, so an anchor that never arrives costs
      // a client one budget rather than one per attempt. The upper bound is deliberately loose — it only has to
      // separate one budget from the three a per-attempt hold-off would spend.
      const timer = new Timer();

      await expect(node.getWorldState(unseenBlockNumber)).rejects.toThrow(/Block not found for number=6/);

      expect(timer.ms()).toBeGreaterThanOrEqual(byNumberWaitMs);
      expect(timer.ms()).toBeLessThan(2 * byNumberWaitMs);
    });

    it('does not hold off again when a sync retry re-resolves the query', async () => {
      // The block resolves, world state fails to sync to it, and a prune removes it again before the retry
      // re-resolves. That second miss must surface immediately instead of spending another hold-off budget.
      lastBlockNumber = unseenBlockNumber;
      worldState.syncImmediate.mockImplementation(() => {
        lastBlockNumber = BlockNumber(unseenBlockNumber - 1);
        return Promise.reject(
          new WorldStateSynchronizerError(`Unable to sync to block number ${unseenBlockNumber} (last synced is 5)`),
        );
      });
      const timer = new Timer();

      await expect(node.getWorldState(unseenBlockNumber)).rejects.toThrow(/Block not found for number=6/);

      expect(timer.ms()).toBeLessThan(byNumberWaitMs);
    });

    it('defaults the by-number budget to twice the block duration', async () => {
      const blockDurationMs = 400;
      const expectedWaitMs = 2 * blockDurationMs;
      node = createNode({ rpcUnseenBlockByNumberWaitMs: undefined, rpcUnseenBlockByHashWaitMs: 0, blockDurationMs });
      const timer = new Timer();

      expect(await node.getBlock(unseenBlockNumber)).toBeUndefined();

      expect(timer.ms()).toBeGreaterThanOrEqual(expectedWaitMs);
      // Loose enough to absorb a slow CI poll, tight enough to catch the default block duration (6s) being used.
      expect(timer.ms()).toBeLessThan(3 * expectedWaitMs);
    });

    it('does not hold a query for a block further ahead than the next one', async () => {
      expect(await node.getBlock(BlockNumber(unseenBlockNumber + 1))).toBeUndefined();

      // A single block-source read proves the query was never held: holding always issues further reads.
      expect(l2BlockSource.getBlockData).toHaveBeenCalledTimes(1);
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

        nodeWithValidator = new AztecNodeService({
          config: validatorNodeConfig,
          p2pClient: p2p,
          blockSource: l2BlockSource,
          logsSource: mock<L2LogsSource>(),
          contractDataSource: mock<ContractDataSource>(),
          l1ToL2MessageSource: mock<L1ToL2MessageSource>(),
          worldStateSynchronizer: mock<WorldStateSynchronizer>({ getCommitted: () => merkleTreeOps }),
          sequencer: undefined,
          proverNode: undefined,
          slasherClient,
          validatorsSentinel: undefined,
          stopStartedWatchers: async () => {},
          l1ChainId: 12345,
          version: rollupVersion.toNumber(),
          globalVariableBuilder: globalVariablesBuilder,
          rollupContract: undefined,
          feeProvider,
          nextBlockPredictor,
          epochCache,
          packageVersion: getPackageVersion(),
          peerProofVerifier: new TestCircuitVerifier(),
          rpcProofVerifier: new TestCircuitVerifier(),
          validatorClient: validatorClient as unknown as ValidatorClient,
          keyStoreManager: new KeystoreManager(keyStore),
        });
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
        const nodeWithSequencer = new AztecNodeService({
          config: { ...nodeConfig, keyStoreDirectory: keyStoreDir },
          p2pClient: p2p,
          blockSource: l2BlockSource,
          logsSource: mock<L2LogsSource>(),
          contractDataSource: mock<ContractDataSource>(),
          l1ToL2MessageSource: mock<L1ToL2MessageSource>(),
          worldStateSynchronizer: mock<WorldStateSynchronizer>({ getCommitted: () => merkleTreeOps }),
          sequencer: {} as SequencerClient,
          proverNode: undefined,
          slasherClient,
          validatorsSentinel: undefined,
          stopStartedWatchers: async () => {},
          l1ChainId: 12345,
          version: rollupVersion.toNumber(),
          globalVariableBuilder: globalVariablesBuilder,
          rollupContract: undefined,
          feeProvider,
          nextBlockPredictor,
          epochCache,
          packageVersion: getPackageVersion(),
          peerProofVerifier: new TestCircuitVerifier(),
          rpcProofVerifier: new TestCircuitVerifier(),
          validatorClient: validatorClient as unknown as ValidatorClient,
          keyStoreManager: new KeystoreManager(initialKeyStore),
        });

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

      nodeWithSequencer = new AztecNodeService({
        config: nodeConfig,
        p2pClient: p2p,
        blockSource: l2BlockSource,
        logsSource: mock(),
        contractDataSource: mock(),
        l1ToL2MessageSource: mock(),
        worldStateSynchronizer: worldState,
        sequencer: sequencerClient,
        proverNode: undefined,
        slasherClient: undefined,
        validatorsSentinel: undefined,
        stopStartedWatchers: async () => {},
        l1ChainId: 12345,
        version: rollupVersion.toNumber(),
        globalVariableBuilder: globalVariablesBuilder,
        rollupContract: undefined,
        feeProvider: mock<FeeProvider>(),
        nextBlockPredictor,
        epochCache,
        packageVersion: getPackageVersion(),
        peerProofVerifier: new TestCircuitVerifier(),
        rpcProofVerifier: new TestCircuitVerifier(),
      });
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

      nodeWithSequencer = new AztecNodeService({
        config: nodeConfig,
        p2pClient: p2p,
        blockSource: l2BlockSource,
        logsSource: mock(),
        contractDataSource: mock(),
        l1ToL2MessageSource: mock(),
        worldStateSynchronizer: worldState,
        sequencer: sequencerClient,
        proverNode: undefined,
        slasherClient: undefined,
        validatorsSentinel: undefined,
        stopStartedWatchers: async () => {},
        l1ChainId: 12345,
        version: rollupVersion.toNumber(),
        globalVariableBuilder: globalVariablesBuilder,
        rollupContract: undefined,
        feeProvider: mock<FeeProvider>(),
        nextBlockPredictor,
        epochCache,
        packageVersion: getPackageVersion(),
        peerProofVerifier: new TestCircuitVerifier(),
        rpcProofVerifier: new TestCircuitVerifier(),
      });
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
    proposed?: BlockNumber;
    checkpointed?: CheckpointNumber;
    checkpointedBlock?: BlockNumber;
    proven?: CheckpointNumber;
    finalized?: CheckpointNumber;
  }): L2Tips {
    const makeBlockId = (number = BlockNumber(0)) => ({ number, hash: '' });
    const makeTipId = (n: CheckpointNumber, blockNumber?: BlockNumber) => ({
      block: makeBlockId(blockNumber),
      checkpoint: { number: n, hash: '' },
    });
    return {
      proposed: makeBlockId(args.proposed),
      checkpointed: makeTipId(args.checkpointed ?? CheckpointNumber(0), args.checkpointedBlock),
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
    beforeEach(() => {
      l2BlockSource.getL2Tips.mockResolvedValue(
        makeTips({ checkpointed: CheckpointNumber(5), proven: CheckpointNumber(3), finalized: CheckpointNumber(2) }),
      );
    });

    it('returns the checkpointed number by default', async () => {
      expect(await node.getCheckpointNumber()).toEqual(CheckpointNumber(5));
      expect(await node.getCheckpointNumber('checkpointed')).toEqual(CheckpointNumber(5));
    });

    it('returns the proven checkpoint number', async () => {
      expect(await node.getCheckpointNumber('proven')).toEqual(CheckpointNumber(3));
    });

    it('returns the finalized checkpoint number', async () => {
      expect(await node.getCheckpointNumber('finalized')).toEqual(CheckpointNumber(2));
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
      p2p.getTxByHashFromPool.mockImplementation((_h, opts) =>
        Promise.resolve(opts?.includeProof === false ? pendingTx.withoutProof() : pendingTx),
      );

      const receipt = await node.getTxReceipt(txHash, { includePendingTx: true });
      expect(receipt).toBeInstanceOf(PendingTxReceipt);
      if (!receipt.isPending()) {
        throw new Error('expected a pending receipt');
      }
      expect(receipt.tx).toBeDefined();
      expect(receipt.tx!.chonkProof).toEqual(pendingTx.withoutProof().chonkProof);
    });

    it('attaches the pending tx with its proof when includePendingTx and includeProof are set', async () => {
      const txHash = TxHash.random();
      p2p.getTxStatus.mockResolvedValue('pending');
      l2BlockSource.getTxEffect.mockResolvedValue(undefined);
      const pendingTx = await mockTx();
      p2p.getTxByHashFromPool.mockImplementation((_h, opts) =>
        Promise.resolve(opts?.includeProof === false ? pendingTx.withoutProof() : pendingTx),
      );

      const receipt = await node.getTxReceipt(txHash, { includePendingTx: true, includeProof: true });
      expect(receipt).toBeInstanceOf(PendingTxReceipt);
      if (!receipt.isPending()) {
        throw new Error('expected a pending receipt');
      }
      expect(receipt.tx).toBeDefined();
      expect(receipt.tx!.chonkProof).toEqual(pendingTx.chonkProof);
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

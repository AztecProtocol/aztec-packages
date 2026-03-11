import { TestCircuitVerifier } from '@aztec/bb-prover';
import { EpochCache } from '@aztec/epoch-cache';
import type { RollupContract } from '@aztec/ethereum/contracts';
import { BlockNumber } from '@aztec/foundation/branded-types';
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
import type { GlobalVariableBuilder, SequencerClient } from '@aztec/sequencer-client';
import type { SlasherClientInterface } from '@aztec/slasher';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash, L2Block, type L2BlockSource } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { EmptyL1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { GasFees } from '@aztec/stdlib/gas';
import type { L2LogsSource, MerkleTreeReadOperations, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { mockTx } from '@aztec/stdlib/testing';
import { MerkleTreeId, PublicDataTreeLeaf, PublicDataTreeLeafPreimage } from '@aztec/stdlib/trees';
import {
  BlockHeader,
  GlobalVariables,
  HashedValues,
  TX_ERROR_CALLDATA_COUNT_MISMATCH,
  TX_ERROR_DUPLICATE_NULLIFIER_IN_TX,
  TX_ERROR_INCORRECT_L1_CHAIN_ID,
  TX_ERROR_INCORRECT_ROLLUP_VERSION,
  TX_ERROR_INVALID_EXPIRATION_TIMESTAMP,
  TX_ERROR_SIZE_ABOVE_LIMIT,
  Tx,
} from '@aztec/stdlib/tx';
import { getPackageVersion } from '@aztec/stdlib/update-checker';
import type { ValidatorClient } from '@aztec/validator-client';

import { jest } from '@jest/globals';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { type MockProxy, mock } from 'jest-mock-extended';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
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

describe('aztec node', () => {
  let p2p: MockProxy<P2P>;
  let globalVariablesBuilder: MockProxy<GlobalVariableBuilder>;
  let merkleTreeOps: MockProxy<MerkleTreeReadOperations>;
  let l2BlockSource: MockProxy<L2BlockSource>;
  let lastBlockNumber: BlockNumber;
  let node: AztecNodeService;
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
    globalVariablesBuilder.getCurrentMinFees.mockResolvedValue(new GasFees(0, BlockNumber.ZERO));

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
    l2BlockSource.getL1Constants.mockResolvedValue(EmptyL1RollupConstants);

    const l2LogsSource = mock<L2LogsSource>();

    const l1ToL2MessageSource = mock<L1ToL2MessageSource>();

    // all txs use the same allowed FPC class
    const contractSource = mock<ContractDataSource>();

    const nodeConfigFromEnvVars: AztecNodeConfig = getConfigEnvVars();
    nodeConfig = {
      ...nodeConfigFromEnvVars,
      l1Contracts: {
        ...nodeConfigFromEnvVars.l1Contracts,
        rollupAddress: EthAddress.ZERO,
        registryAddress: EthAddress.ZERO,
        inboxAddress: EthAddress.ZERO,
        outboxAddress: EthAddress.ZERO,
      },
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

    node = new AztecNodeService(
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
        initialHeader = BlockHeader.empty({
          globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber.ZERO }),
        });
        header1 = BlockHeader.empty({
          globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(1) }),
        });
        header2 = BlockHeader.empty({ globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(2) }) });

        merkleTreeOps.getInitialHeader.mockReturnValue(initialHeader);
        l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(2));
      });

      it('returns requested block number', async () => {
        l2BlockSource.getBlockHeader.mockResolvedValue(header1);
        expect(await node.getBlockHeader(BlockNumber(1))).toEqual(header1);
      });

      it('returns latest', async () => {
        l2BlockSource.getBlockHeader.mockResolvedValue(header2);
        expect(await node.getBlockHeader('latest')).toEqual(header2);
      });

      it('returns initial header on zero', async () => {
        expect(await node.getBlockHeader(BlockNumber.ZERO)).toEqual(initialHeader);
      });

      it('returns initial header if no blocks mined', async () => {
        l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber.ZERO);
        expect(await node.getBlockHeader('latest')).toEqual(initialHeader);
      });

      it('returns undefined for non-existent block', async () => {
        l2BlockSource.getBlockHeader.mockResolvedValue(undefined);
        expect(await node.getBlockHeader(BlockNumber(3))).toEqual(undefined);
      });
    });

    describe('getBlock', () => {
      let block1: L2Block;
      let block2: L2Block;

      beforeEach(() => {
        block1 = L2Block.empty();
        block2 = L2Block.empty();

        l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(2));
      });

      it('returns requested block number', async () => {
        l2BlockSource.getL2Block.mockResolvedValue(block1);
        expect(await node.getBlock(BlockNumber(1))).toEqual(block1);
        expect(l2BlockSource.getL2Block).toHaveBeenCalledWith(BlockNumber(1));
      });

      it('returns latest block', async () => {
        l2BlockSource.getL2Block.mockResolvedValue(block2);
        expect(await node.getBlock('latest')).toEqual(block2);
        expect(l2BlockSource.getL2Block).toHaveBeenCalledWith(2);
      });

      it('returns undefined for non-existent block', async () => {
        l2BlockSource.getL2Block.mockResolvedValue(undefined);
        expect(await node.getBlock(BlockNumber(3))).toEqual(undefined);
        expect(l2BlockSource.getL2Block).toHaveBeenCalledWith(3);
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
          undefined,
          12345,
          rollupVersion.toNumber(),
          globalVariablesBuilder,
          epochCache,
          getPackageVersion() ?? '',
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
          undefined,
          12345,
          rollupVersion.toNumber(),
          globalVariablesBuilder,
          epochCache,
          getPackageVersion() ?? '',
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
});

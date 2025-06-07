import { TestCircuitVerifier } from '@aztec/bb-prover';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { unfreeze } from '@aztec/foundation/types';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import type { P2P } from '@aztec/p2p';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import type { GlobalVariableBuilder } from '@aztec/sequencer-client';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
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
  MaxBlockNumber,
  TX_ERROR_DUPLICATE_NULLIFIER_IN_TX,
  TX_ERROR_INCORRECT_L1_CHAIN_ID,
  TX_ERROR_INCORRECT_ROLLUP_VERSION,
  TX_ERROR_INVALID_MAX_BLOCK_NUMBER,
} from '@aztec/stdlib/tx';
import { getPackageVersion } from '@aztec/stdlib/update-checker';

import { readFileSync } from 'fs';
import { type MockProxy, mock } from 'jest-mock-extended';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { type AztecNodeConfig, getConfigEnvVars } from './config.js';
import { AztecNodeService } from './server.js';

describe('aztec node', () => {
  let p2p: MockProxy<P2P>;
  let globalVariablesBuilder: MockProxy<GlobalVariableBuilder>;
  let merkleTreeOps: MockProxy<MerkleTreeReadOperations>;
  let l2BlockSource: MockProxy<L2BlockSource>;
  let lastBlockNumber: number;
  let node: AztecNode;
  let feePayer: AztecAddress;

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

    it('tests that the node correctly validates max block numbers', async () => {
      const txs = await Promise.all([mockTxForRollup(0x10000), mockTxForRollup(0x20000), mockTxForRollup(0x30000)]);
      const noMaxBlockNumberMetadata = txs[0];
      const invalidMaxBlockNumberMetadata = txs[1];
      const validMaxBlockNumberMetadata = txs[2];

      invalidMaxBlockNumberMetadata.data.rollupValidationRequests = new RollupValidationRequests(
        new MaxBlockNumber(true, new Fr(1)),
      );

      validMaxBlockNumberMetadata.data.rollupValidationRequests = new RollupValidationRequests(
        new MaxBlockNumber(true, new Fr(5)),
      );

      lastBlockNumber = 3;

      // Default tx with no max block number should be valid
      expect(await node.isValidTx(noMaxBlockNumberMetadata)).toEqual({ result: 'valid' });
      // Tx with max block number < current block number should be invalid
      expect(await node.isValidTx(invalidMaxBlockNumberMetadata)).toEqual({
        result: 'invalid',
        reason: [TX_ERROR_INVALID_MAX_BLOCK_NUMBER],
      });
      // Tx with max block number >= current block number should be valid
      expect(await node.isValidTx(validMaxBlockNumberMetadata)).toEqual({ result: 'valid' });
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
        initialHeader = BlockHeader.empty({ globalVariables: GlobalVariables.empty({ blockNumber: new Fr(0) }) });
        header1 = BlockHeader.empty({ globalVariables: GlobalVariables.empty({ blockNumber: new Fr(1) }) });
        header2 = BlockHeader.empty({ globalVariables: GlobalVariables.empty({ blockNumber: new Fr(2) }) });

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

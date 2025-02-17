import { TestCircuitVerifier } from '@aztec/bb-prover';
import {
  type AztecNode,
  type L1ToL2MessageSource,
  type L2BlockSource,
  type L2LogsSource,
  MerkleTreeId,
  type MerkleTreeReadOperations,
  type NullifierWithBlockSource,
  type WorldStateSynchronizer,
  mockTx,
} from '@aztec/circuit-types';
import {
  AztecAddress,
  type ContractDataSource,
  EthAddress,
  Fr,
  GasFees,
  MaxBlockNumber,
  PublicDataTreeLeafPreimage,
  RollupValidationRequests,
} from '@aztec/circuits.js';
import { type P2P } from '@aztec/p2p';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import { type GlobalVariableBuilder } from '@aztec/sequencer-client';

import { type MockProxy, mock } from 'jest-mock-extended';

import { type AztecNodeConfig, getConfigEnvVars } from './config.js';
import { AztecNodeService } from './server.js';

describe('aztec node', () => {
  let p2p: MockProxy<P2P>;
  let globalVariablesBuilder: MockProxy<GlobalVariableBuilder>;
  let merkleTreeOps: MockProxy<MerkleTreeReadOperations>;
  let lastBlockNumber: number;
  let node: AztecNode;
  let feePayer: AztecAddress;

  const chainId = new Fr(12345);

  const mockTxForRollup = async (seed: number) => {
    return await mockTx(seed, {
      numberOfNonRevertiblePublicCallRequests: 0,
      numberOfRevertiblePublicCallRequests: 0,
      feePayer,
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
          new PublicDataTreeLeafPreimage(feePayerSlot, new Fr(feePayerBalance), Fr.random(), feePayerSlotIndex + 1n),
        );
      } else {
        return Promise.resolve(undefined);
      }
    });

    const worldState = mock<WorldStateSynchronizer>({
      getCommitted: () => merkleTreeOps,
    });

    const l2BlockSource = mock<L2BlockSource>({
      getBlockNumber: () => Promise.resolve(lastBlockNumber),
    });

    const l2LogsSource = mock<L2LogsSource>();

    const l1ToL2MessageSource = mock<L1ToL2MessageSource>();

    // all txs use the same allowed FPC class
    const contractSource = mock<ContractDataSource>();

    const nullifierWithBlockSource = mock<NullifierWithBlockSource>();

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
      nullifierWithBlockSource,
      worldState,
      undefined,
      12345,
      1,
      globalVariablesBuilder,
      new TestCircuitVerifier(),
    );
  });

  describe('tx validation', () => {
    it('tests that the node correctly validates double spends', async () => {
      const txs = await Promise.all([mockTxForRollup(0x10000), mockTxForRollup(0x20000)]);
      txs.forEach(tx => {
        tx.data.constants.txContext.chainId = chainId;
      });
      const doubleSpendTx = txs[0];
      const doubleSpendWithExistingTx = txs[1];
      lastBlockNumber += 1;

      expect(await node.isValidTx(doubleSpendTx)).toEqual({ result: 'valid' });

      // We push a duplicate nullifier that was created in the same transaction
      doubleSpendTx.data.forRollup!.end.nullifiers[1] = doubleSpendTx.data.forRollup!.end.nullifiers[0];

      expect(await node.isValidTx(doubleSpendTx)).toEqual({ result: 'invalid', reason: ['Duplicate nullifier in tx'] });

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
      tx.data.constants.txContext.chainId = chainId;

      expect(await node.isValidTx(tx)).toEqual({ result: 'valid' });

      // We make the chain id on the tx not equal to the configured chain id
      tx.data.constants.txContext.chainId = new Fr(1n + chainId.toBigInt());

      expect(await node.isValidTx(tx)).toEqual({ result: 'invalid', reason: ['Incorrect chain id'] });
    });

    it('tests that the node correctly validates max block numbers', async () => {
      const txs = await Promise.all([mockTxForRollup(0x10000), mockTxForRollup(0x20000), mockTxForRollup(0x30000)]);
      txs.forEach(tx => {
        tx.data.constants.txContext.chainId = chainId;
      });

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
        reason: ['Invalid block number'],
      });
      // Tx with max block number >= current block number should be valid
      expect(await node.isValidTx(validMaxBlockNumberMetadata)).toEqual({ result: 'valid' });
    });
  });
});

import { DefaultL1ContractsConfig } from '@aztec/ethereum';
import { timesParallel } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { TestDateProvider } from '@aztec/foundation/timer';
import type { PublicProcessor } from '@aztec/simulator/server';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { GasFees } from '@aztec/stdlib/gas';
import {
  type PublicProcessorValidator,
  WorldStateRunningState,
  type WorldStateSynchronizer,
  type WorldStateSynchronizerStatus,
} from '@aztec/stdlib/interfaces/server';
import { makeStateReference, mockTxForRollup } from '@aztec/stdlib/testing';
import { MerkleTreeId, type MerkleTreeWriteOperations } from '@aztec/stdlib/trees';
import {
  BlockHeader,
  type FailedTx,
  GlobalVariables,
  type ProcessedTx,
  Tx,
  makeProcessedTxFromPrivateOnlyTx,
} from '@aztec/stdlib/tx';

import { type MockProxy, mock, mockFn } from 'jest-mock-extended';

import { FullNodeBlockBuilder } from './block_builder.js';

const logger = createLogger('BlockBuilderTest');

describe('BlockBuilder', () => {
  let blockBuilder: FullNodeBlockBuilder;
  let newSlotNumber: number;
  let initialBlockHeader: BlockHeader;
  const chainId: number = 12345;
  const version: number = 1;
  let hash: string;
  let lastBlockNumber: number;
  let newBlockNumber: number;
  let globalVariables: GlobalVariables;
  let worldState: MockProxy<WorldStateSynchronizer>;
  let fork: MockProxy<MerkleTreeWriteOperations>;
  let contractDataSource: MockProxy<ContractDataSource>;
  let publicProcessor: MockProxy<PublicProcessor>;
  let validator: MockProxy<PublicProcessorValidator>;

  const { aztecSlotDuration: slotDuration, ethereumSlotDuration } = DefaultL1ContractsConfig;

  const coinbase = EthAddress.random();
  let feeRecipient: AztecAddress;
  const gasFees = GasFees.empty();

  const mockTxIterator = async function* (txs: Tx[]): AsyncIterableIterator<Tx> {
    for (const tx of txs) {
      yield tx;
    }
  };

  const makeTx = async (seed?: number) => {
    const tx = await mockTxForRollup(seed);
    tx.data.constants.txContext.chainId = new Fr(chainId);
    return tx;
  };

  class TestBlockBuilder extends FullNodeBlockBuilder {
    public override makeBlockBuilderDeps(_globalVariables: GlobalVariables) {
      return Promise.resolve({
        publicProcessorDBFork: fork,
        processor: publicProcessor,
        validator,
      });
    }
  }

  beforeEach(async () => {
    feeRecipient = await AztecAddress.random();
    hash = Fr.ZERO.toString();
    initialBlockHeader = BlockHeader.empty();
    lastBlockNumber = 0;
    newBlockNumber = lastBlockNumber + 1;
    newSlotNumber = newBlockNumber + 1;
    globalVariables = new GlobalVariables(
      new Fr(chainId),
      new Fr(version),
      newBlockNumber,
      new Fr(newSlotNumber),
      /*timestamp=*/ 0n,
      coinbase,
      feeRecipient,
      gasFees,
    );

    const l1GenesisTime = BigInt(Math.floor(Date.now() / 1000));
    const l1Constants = {
      l1GenesisTime,
      slotDuration,
      ethereumSlotDuration,
      l1ChainId: chainId,
      rollupVersion: version,
    };

    fork = mock<MerkleTreeWriteOperations>({
      getInitialHeader: () => initialBlockHeader,
      getTreeInfo: (treeId: MerkleTreeId) =>
        Promise.resolve({ treeId, root: Fr.random().toBuffer(), size: 99n, depth: 5 }),
      findLeafIndices: (_treeId: MerkleTreeId, _values: any[]) => Promise.resolve([undefined]),
      getStateReference: () => Promise.resolve(makeStateReference()),
    });

    worldState = mock<WorldStateSynchronizer>({
      fork: () => Promise.resolve(fork),
      syncImmediate: () => Promise.resolve(lastBlockNumber),
      getCommitted: () => fork,
      status: mockFn().mockResolvedValue({
        state: WorldStateRunningState.IDLE,
        syncSummary: {
          latestBlockNumber: lastBlockNumber,
          latestBlockHash: hash,
          finalisedBlockNumber: 0,
          oldestHistoricBlockNumber: 0,
          treesAreSynched: true,
        },
      } satisfies WorldStateSynchronizerStatus),
    });

    contractDataSource = mock<ContractDataSource>();
    const dateProvider = new TestDateProvider();
    publicProcessor = mock<PublicProcessor>();
    validator = mock<PublicProcessorValidator>();

    publicProcessor.process.mockImplementation(async (pendingTxsIterator: AsyncIterable<Tx> | Iterable<Tx>) => {
      const processedTxs: ProcessedTx[] = [];
      const allTxs: Tx[] = [];

      for await (const tx of pendingTxsIterator) {
        allTxs.push(tx);
        const processedTx = await makeProcessedTxFromPrivateOnlyTx(
          tx,
          Fr.ZERO,
          new PublicDataWrite(Fr.random(), Fr.random()),
          globalVariables,
        );
        processedTxs.push(processedTx);
      }
      // Return [processedTxs, failedTxs, usedTxs, nestedReturnValues]
      // Assuming all txs are processed successfully and none failed for this mock
      return [processedTxs, [], allTxs, []] as any;
    });
    blockBuilder = new TestBlockBuilder(l1Constants, worldState, contractDataSource, dateProvider);
  });

  it('builds a block out of a single tx', async () => {
    const tx = await makeTx();
    const iterator = mockTxIterator([tx]);

    const blockResult = await blockBuilder.buildBlock(iterator, [], globalVariables, {});
    expect(publicProcessor.process).toHaveBeenCalledTimes(1);
    expect(publicProcessor.process).toHaveBeenCalledWith(iterator, {}, validator);
    logger.info('Built Block', blockResult.block);
    expect(blockResult.block.header.globalVariables.blockNumber).toBe(newBlockNumber);
    expect(blockResult.block.header.globalVariables.slotNumber.toNumber()).toBe(newSlotNumber);
    expect(blockResult.block.header.globalVariables.coinbase.toString()).toBe(coinbase.toString());
    expect(blockResult.block.header.globalVariables.feeRecipient.toString()).toBe(feeRecipient.toString());
    expect(blockResult.block.header.globalVariables.gasFees).toEqual(GasFees.empty());
    expect(blockResult.block.header.globalVariables.chainId.toNumber()).toBe(chainId);
    expect(blockResult.block.header.globalVariables.version.toNumber()).toBe(version);
    expect(blockResult.block.body.txEffects.length).toBe(1);
    expect(blockResult.block.body.txEffects[0].txHash).toBe(await tx.getTxHash());
  });

  it('builds a block with the correct options', async () => {
    const txs = await timesParallel(5, i => makeTx(i * 0x10000));
    const deadline = new Date(Date.now() + 1000);
    await blockBuilder.buildBlock(txs, [], globalVariables, {
      maxTransactions: 4,
      deadline,
    });

    expect(publicProcessor.process).toHaveBeenCalledWith(
      txs,
      {
        maxTransactions: 4,
        deadline,
      },
      validator,
    );
  });

  it('builds a block for validation ignoring limits', async () => {
    const txs = await timesParallel(5, i => makeTx(i * 0x10000));
    await blockBuilder.buildBlock(txs, [], globalVariables, {});

    expect(publicProcessor.process).toHaveBeenCalledWith(txs, {}, validator);
  });

  it('builds a block out of several txs rejecting invalid txs', async () => {
    const txs = await Promise.all([makeTx(0x10000), makeTx(0x20000), makeTx(0x30000)]);
    const validTxs = [txs[0], txs[2]];
    const invalidTx = txs[1];
    const validTxHashes = await Promise.all(validTxs.map(tx => tx.getTxHash()));

    publicProcessor.process.mockImplementation(async (pendingTxsIterator: AsyncIterable<Tx> | Iterable<Tx>) => {
      const processedTxs: ProcessedTx[] = [];
      const usedTxs: Tx[] = [];
      const failedTxs: FailedTx[] = [];

      for await (const tx of pendingTxsIterator) {
        if (validTxHashes.includes(await tx.getTxHash())) {
          usedTxs.push(tx);
          const processedTx = await makeProcessedTxFromPrivateOnlyTx(
            tx,
            Fr.ZERO,
            new PublicDataWrite(Fr.random(), Fr.random()),
            globalVariables,
          );

          processedTxs.push(processedTx);
        } else {
          failedTxs.push({ tx, error: new Error() });
        }
      }
      // Return [processedTxs, failedTxs, usedTxs, nestedReturnValues]
      // Assuming all txs are processed successfully and none failed for this mock
      return [processedTxs, failedTxs, usedTxs, []] as any;
    });

    const blockResult = await blockBuilder.buildBlock(txs, [], globalVariables, {});
    expect(blockResult.failedTxs).toEqual([{ tx: invalidTx, error: new Error() }]);
    expect(blockResult.usedTxs).toEqual(validTxs);
  });
});

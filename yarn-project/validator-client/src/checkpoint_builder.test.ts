import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { TestDateProvider } from '@aztec/foundation/timer';
import type { LightweightCheckpointBuilder } from '@aztec/prover-client/light';
import type { PublicProcessor } from '@aztec/simulator/server';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2Block } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { Gas, GasFees } from '@aztec/stdlib/gas';
import {
  type FullNodeBlockBuilderConfig,
  type MerkleTreeWriteOperations,
  NoValidTxsError,
  type PublicProcessorValidator,
} from '@aztec/stdlib/interfaces/server';
import type { CheckpointGlobalVariables, GlobalVariables, ProcessedTx, Tx } from '@aztec/stdlib/tx';
import type { TelemetryClient } from '@aztec/telemetry-client';

import { describe, expect, it } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { CheckpointBuilder } from './checkpoint_builder.js';

describe('CheckpointBuilder', () => {
  let checkpointBuilder: CheckpointBuilder;
  let lightweightCheckpointBuilder: MockProxy<LightweightCheckpointBuilder>;
  let fork: MockProxy<MerkleTreeWriteOperations>;
  let config: FullNodeBlockBuilderConfig;
  let contractDataSource: MockProxy<ContractDataSource>;
  let dateProvider: TestDateProvider;
  let telemetryClient: MockProxy<TelemetryClient>;
  let processor!: MockProxy<PublicProcessor>;
  let validator!: MockProxy<PublicProcessorValidator>;

  const checkpointNumber = CheckpointNumber(1);
  const slotNumber = SlotNumber(10);
  const blockNumber = BlockNumber(5);

  const constants: CheckpointGlobalVariables = {
    chainId: new Fr(1),
    version: new Fr(1),
    slotNumber,
    coinbase: EthAddress.random(),
    feeRecipient: AztecAddress.fromField(Fr.random()),
    gasFees: GasFees.empty(),
  };

  class TestCheckpointBuilder extends CheckpointBuilder {
    public override makeBlockBuilderDeps(_globalVariables: GlobalVariables, _fork: MerkleTreeWriteOperations) {
      return Promise.resolve({ processor, validator });
    }
  }

  beforeEach(() => {
    lightweightCheckpointBuilder = mock<LightweightCheckpointBuilder>({ checkpointNumber, constants });

    fork = mock<MerkleTreeWriteOperations>();
    config = {
      l1GenesisTime: 0n,
      slotDuration: 24,
      l1ChainId: 1,
      rollupVersion: 1,
    };
    contractDataSource = mock<ContractDataSource>();
    dateProvider = new TestDateProvider();
    telemetryClient = mock<TelemetryClient>();
    telemetryClient.getMeter.mockReturnValue(mock());
    telemetryClient.getTracer.mockReturnValue(mock());

    processor = mock<PublicProcessor>();
    validator = mock<PublicProcessorValidator>();

    checkpointBuilder = new TestCheckpointBuilder(
      lightweightCheckpointBuilder as unknown as LightweightCheckpointBuilder,
      fork,
      config,
      contractDataSource,
      dateProvider,
      telemetryClient,
    );
  });

  describe('buildBlock', () => {
    it('builds a block successfully when transactions are processed', async () => {
      lightweightCheckpointBuilder.getBlockCount.mockReturnValue(0);

      const expectedBlock = await L2Block.random(blockNumber);
      lightweightCheckpointBuilder.addBlock.mockResolvedValue(expectedBlock);

      processor.process.mockResolvedValue([
        [{ hash: Fr.random(), gasUsed: { publicGas: Gas.empty() } } as unknown as ProcessedTx],
        [], // failedTxs
        [], // usedTxs
        [], // returnValues
        0, // usedTxBlobFields
      ]);

      const result = await checkpointBuilder.buildBlock([], blockNumber, 1000n);

      expect(result.block).toBe(expectedBlock);
      expect(result.numTxs).toBe(1);
      expect(result.failedTxs).toEqual([]);
      expect(lightweightCheckpointBuilder.addBlock).toHaveBeenCalled();
    });

    it('allows building an empty first block in a checkpoint', async () => {
      lightweightCheckpointBuilder.getBlockCount.mockReturnValue(0);

      const expectedBlock = await L2Block.random(blockNumber, { txsPerBlock: 0 });
      lightweightCheckpointBuilder.addBlock.mockResolvedValue(expectedBlock);

      // No transactions processed
      processor.process.mockResolvedValue([
        [], // processedTxs - empty
        [], // failedTxs
        [], // usedTxs
        [], // returnValues
        0, // usedTxBlobFields
      ]);

      const result = await checkpointBuilder.buildBlock([], blockNumber, 1000n);

      expect(result.block).toBe(expectedBlock);
      expect(result.numTxs).toBe(0);
      expect(lightweightCheckpointBuilder.addBlock).toHaveBeenCalled();
    });

    it('throws NoValidTxsError when no valid transactions and not first block in checkpoint', async () => {
      lightweightCheckpointBuilder.getBlockCount.mockReturnValue(1);

      const failedTx = { tx: { txHash: Fr.random() } as unknown as Tx, error: new Error('tx failed') };
      processor.process.mockResolvedValue([
        [], // processedTxs - empty
        [failedTx], // failedTxs
        [], // usedTxs
        [], // returnValues
        0, // usedTxBlobFields
      ]);

      await expect(checkpointBuilder.buildBlock([], blockNumber, 1000n)).rejects.toThrow(NoValidTxsError);

      expect(lightweightCheckpointBuilder.addBlock).not.toHaveBeenCalled();
    });
  });
});

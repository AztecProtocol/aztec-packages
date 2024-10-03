import { type Tx, type TxValidator, type WorldStateSynchronizer } from '@aztec/circuit-types';
import { type GlobalVariables, type Header } from '@aztec/circuits.js';
import { AggregateTxValidator, DataTxValidator, DoubleSpendTxValidator, MetadataTxValidator } from '@aztec/p2p';
import { LightPublicProcessor, WorldStateDB } from '@aztec/simulator';
import { type TelemetryClient } from '@aztec/telemetry-client';
import { type ContractDataSource } from '@aztec/types/contracts';

export class LightPublicProcessorFactory {
  constructor(
    private worldStateSynchronizer: WorldStateSynchronizer,
    private contractDataSource: ContractDataSource,
    private telemetryClient: TelemetryClient,
  ) {}

  public async createWithSyncedState(
    targetBlockNumber: number,
    maybeHistoricalHeader: Header | undefined,
    globalVariables: GlobalVariables,
  ) {
    // Make sure the world state synchronizer is synced
    await this.worldStateSynchronizer.syncImmediate(targetBlockNumber);

    // We will sync again whenever the block is created this could be an inefficiency
    const merkleTrees = await this.worldStateSynchronizer.ephemeralFork();
    const historicalHeader = maybeHistoricalHeader ?? merkleTrees.getInitialHeader();
    const worldStateDB = new WorldStateDB(merkleTrees, this.contractDataSource);

    // Define tx validators - we assume proof verification is performed over the mempool
    // so we do not include it here
    const txValidaors: TxValidator<Tx>[] = [
      new DataTxValidator(),
      new MetadataTxValidator(globalVariables.chainId, globalVariables.blockNumber),
      new DoubleSpendTxValidator(worldStateDB),
    ];
    const txValidator: TxValidator<Tx> = new AggregateTxValidator(...txValidaors);

    return new LightPublicProcessor(
      merkleTrees,
      worldStateDB,
      globalVariables,
      historicalHeader,
      txValidator,
      this.telemetryClient,
    );
  }
}

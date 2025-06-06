import { elapsed } from '@aztec/aztec.js';
import { createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { DateProvider, Timer } from '@aztec/foundation/timer';
import { LightweightBlockFactory } from '@aztec/prover-client/block-factory';
import {
  GuardedMerkleTreeOperations,
  PublicContractsDB,
  PublicProcessor,
  TelemetryPublicTxSimulator,
} from '@aztec/simulator/server';
import type { ChainConfig } from '@aztec/stdlib/config';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { type L1RollupConstants, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import { Gas } from '@aztec/stdlib/gas';
import type {
  BuildBlockOptions,
  BuildBlockResult,
  IFullNodeBlockBuilder,
  MerkleTreeWriteOperations,
  PublicProcessorValidator,
  WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { GlobalVariables, Tx } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { createValidatorForBlockBuilding } from '../tx_validator/tx_validator_factory.js';

const log = createLogger('sequencer:block-builder');

export async function buildBlock(
  pendingTxs: Iterable<Tx> | AsyncIterable<Tx>,
  newGlobalVariables: GlobalVariables,
  opts: BuildBlockOptions = {},
  l1ToL2MessageSource: L1ToL2MessageSource,
  worldStateFork: MerkleTreeWriteOperations,
  processor: PublicProcessor,
  validator: PublicProcessorValidator,
  l1Constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration'>,
  dateProvider: DateProvider,
  telemetryClient: TelemetryClient = getTelemetryClient(),
): Promise<BuildBlockResult> {
  const blockBuildingTimer = new Timer();
  const blockNumber = newGlobalVariables.blockNumber.toNumber();
  const slot = newGlobalVariables.slotNumber.toBigInt();
  log.debug(`Requesting L1 to L2 messages from contract for block ${blockNumber}`);
  const l1ToL2Messages = await l1ToL2MessageSource.getL1ToL2Messages(BigInt(blockNumber));
  const msgCount = l1ToL2Messages.length;

  log.verbose(`Building block ${blockNumber} for slot ${slot}`, {
    slot,
    slotStart: new Date(Number(getTimestampForSlot(slot, l1Constants)) * 1000),
    now: new Date(dateProvider.now()),
    blockNumber,
    msgCount,
    opts,
  });

  try {
    const blockFactory = new LightweightBlockFactory(worldStateFork, telemetryClient);
    await blockFactory.startNewBlock(newGlobalVariables, l1ToL2Messages);

    const [publicProcessorDuration, [processedTxs, failedTxs, usedTxs]] = await elapsed(() =>
      processor.process(pendingTxs, opts, validator),
    );

    // All real transactions have been added, set the block as full and pad if needed
    await blockFactory.addTxs(processedTxs);
    const block = await blockFactory.setBlockCompleted();

    // How much public gas was processed
    const publicGas = processedTxs.reduce((acc, tx) => acc.add(tx.gasUsed.publicGas), Gas.empty());

    const res = {
      block,
      publicGas,
      publicProcessorDuration,
      numMsgs: l1ToL2Messages.length,
      numTxs: processedTxs.length,
      failedTxs: failedTxs,
      blockBuildingTimer,
      usedTxs,
    };
    log.trace('Built block', res.block.header);
    return res;
  } finally {
    // We wait a bit to close the forks since the processor may still be working on a dangling tx
    // which was interrupted due to the processingDeadline being hit.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    setTimeout(async () => {
      try {
        await worldStateFork.close();
      } catch (err) {
        // This can happen if the sequencer is stopped before we hit this timeout.
        log.warn(`Error closing forks for block processing`, err);
      }
    }, 5000);
  }
}

export class FullNodeBlockBuilder implements IFullNodeBlockBuilder {
  constructor(
    private config: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration'> &
      Pick<ChainConfig, 'l1ChainId' | 'rollupVersion'>,
    private l1ToL2MessageSource: L1ToL2MessageSource,
    private worldState: WorldStateSynchronizer,
    private contractDataSource: ContractDataSource,
    private dateProvider: DateProvider,
    private telemetryClient: TelemetryClient = getTelemetryClient(),
  ) {}

  public getConfig() {
    return {
      l1GenesisTime: this.config.l1GenesisTime,
      slotDuration: this.config.slotDuration,
      l1ChainId: this.config.l1ChainId,
      rollupVersion: this.config.rollupVersion,
    };
  }

  public async makeBlockBuilderDeps(globalVariables: GlobalVariables, opts: BuildBlockOptions) {
    const blockNumber = globalVariables.blockNumber.toNumber();
    const publicProcessorDBFork = await this.worldState.fork(blockNumber - 1);
    const contractsDB = new PublicContractsDB(this.contractDataSource);
    const guardedFork = new GuardedMerkleTreeOperations(publicProcessorDBFork);

    const publicTxSimulator = new TelemetryPublicTxSimulator(
      guardedFork,
      contractsDB,
      globalVariables,
      /*doMerkleOperations=*/ true,
      /*skipFeeEnforcement=*/ true,
      /*clientInitiatedSimulation=*/ false,
      this.telemetryClient,
    );

    const processor = new PublicProcessor(
      globalVariables,
      guardedFork,
      contractsDB,
      publicTxSimulator,
      this.dateProvider,
      this.telemetryClient,
    );
    const validator = createValidatorForBlockBuilding(
      publicProcessorDBFork,
      this.contractDataSource,
      globalVariables,
      opts.txPublicSetupAllowList ?? [],
    );

    return {
      publicProcessorDBFork,
      processor,
      validator,
    };
  }

  private async syncToPreviousBlock(parentBlockNumber: number, timeout: number | undefined) {
    await retryUntil(
      () => this.worldState.syncImmediate(parentBlockNumber, true).then(syncedTo => syncedTo >= parentBlockNumber),
      'sync to previous block',
      timeout,
      0.1,
    );
    log.debug(`Synced to previous block ${parentBlockNumber}`);
  }

  async buildBlock(
    pendingTxs: Iterable<Tx> | AsyncIterable<Tx>,
    globalVariables: GlobalVariables,
    opts: BuildBlockOptions,
  ): Promise<BuildBlockResult> {
    const parentBlockNumber = globalVariables.blockNumber.toNumber() - 1;
    const syncTimeout = opts.deadline ? (opts.deadline.getTime() - this.dateProvider.now()) / 1000 : undefined;
    await this.syncToPreviousBlock(parentBlockNumber, syncTimeout);
    const { publicProcessorDBFork, processor, validator } = await this.makeBlockBuilderDeps(globalVariables, opts);

    return buildBlock(
      pendingTxs,
      globalVariables,
      opts,
      this.l1ToL2MessageSource,
      publicProcessorDBFork,
      processor,
      validator,
      this.config,
      this.dateProvider,
      this.telemetryClient,
    );
  }
}

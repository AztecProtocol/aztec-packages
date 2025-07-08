import { MerkleTreeId, elapsed } from '@aztec/aztec.js';
import { pick } from '@aztec/foundation/collection';
import type { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { bufferToHex } from '@aztec/foundation/string';
import { DateProvider, Timer } from '@aztec/foundation/timer';
import { getDefaultAllowedSetupFunctions } from '@aztec/p2p/msg_validators';
import { LightweightBlockFactory } from '@aztec/prover-client/block-factory';
import {
  GuardedMerkleTreeOperations,
  PublicContractsDB,
  PublicProcessor,
  TelemetryPublicTxSimulator,
} from '@aztec/simulator/server';
import type { ChainConfig, SequencerConfig } from '@aztec/stdlib/config';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { type L1RollupConstants, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import { Gas } from '@aztec/stdlib/gas';
import type {
  BuildBlockResult,
  IFullNodeBlockBuilder,
  MerkleTreeWriteOperations,
  PublicProcessorLimits,
  PublicProcessorValidator,
  WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import { GlobalVariables, Tx } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { createValidatorForBlockBuilding } from '../tx_validator/tx_validator_factory.js';

const log = createLogger('block-builder');

export async function buildBlock(
  pendingTxs: Iterable<Tx> | AsyncIterable<Tx>,
  l1ToL2Messages: Fr[],
  newGlobalVariables: GlobalVariables,
  opts: PublicProcessorLimits = {},
  worldStateFork: MerkleTreeWriteOperations,
  processor: PublicProcessor,
  validator: PublicProcessorValidator,
  l1Constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration'>,
  dateProvider: DateProvider,
  telemetryClient: TelemetryClient = getTelemetryClient(),
): Promise<BuildBlockResult> {
  const blockBuildingTimer = new Timer();
  const blockNumber = newGlobalVariables.blockNumber;
  const slot = newGlobalVariables.slotNumber.toBigInt();
  const msgCount = l1ToL2Messages.length;
  const stateReference = await worldStateFork.getStateReference();
  const archiveTree = await worldStateFork.getTreeInfo(MerkleTreeId.ARCHIVE);

  log.verbose(`Building block ${blockNumber} for slot ${slot}`, {
    slot,
    slotStart: new Date(Number(getTimestampForSlot(slot, l1Constants)) * 1000),
    now: new Date(dateProvider.now()),
    blockNumber,
    msgCount,
    initialStateReference: stateReference.toInspect(),
    initialArchiveRoot: bufferToHex(archiveTree.root),
    opts,
  });
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
}

type FullNodeBlockBuilderConfig = Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration'> &
  Pick<ChainConfig, 'l1ChainId' | 'rollupVersion'> &
  Pick<SequencerConfig, 'txPublicSetupAllowList' | 'fakeProcessingDelayPerTxMs'>;

export class FullNodeBlockBuilder implements IFullNodeBlockBuilder {
  constructor(
    private config: FullNodeBlockBuilderConfig,
    private worldState: WorldStateSynchronizer,
    private contractDataSource: ContractDataSource,
    private dateProvider: DateProvider,
    private telemetryClient: TelemetryClient = getTelemetryClient(),
  ) {}

  public getConfig(): FullNodeBlockBuilderConfig {
    return pick(
      this.config,
      'l1GenesisTime',
      'slotDuration',
      'l1ChainId',
      'rollupVersion',
      'txPublicSetupAllowList',
      'fakeProcessingDelayPerTxMs',
    );
  }

  public updateConfig(config: FullNodeBlockBuilderConfig) {
    this.config = config;
  }

  public async makeBlockBuilderDeps(globalVariables: GlobalVariables, fork: MerkleTreeWriteOperations) {
    const txPublicSetupAllowList = this.config.txPublicSetupAllowList ?? (await getDefaultAllowedSetupFunctions());
    const contractsDB = new PublicContractsDB(this.contractDataSource);
    const guardedFork = new GuardedMerkleTreeOperations(fork);

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
      undefined,
      this.config,
    );

    const validator = createValidatorForBlockBuilding(
      fork,
      this.contractDataSource,
      globalVariables,
      txPublicSetupAllowList,
    );

    return {
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
    l1ToL2Messages: Fr[],
    globalVariables: GlobalVariables,
    opts: PublicProcessorLimits,
    suppliedFork?: MerkleTreeWriteOperations,
  ): Promise<BuildBlockResult> {
    const parentBlockNumber = globalVariables.blockNumber - 1;
    const syncTimeout = opts.deadline ? (opts.deadline.getTime() - this.dateProvider.now()) / 1000 : undefined;
    await this.syncToPreviousBlock(parentBlockNumber, syncTimeout);
    const fork = suppliedFork ?? (await this.worldState.fork(parentBlockNumber));

    try {
      const { processor, validator } = await this.makeBlockBuilderDeps(globalVariables, fork);
      const res = await buildBlock(
        pendingTxs,
        l1ToL2Messages,
        globalVariables,
        opts,
        fork,
        processor,
        validator,
        this.config,
        this.dateProvider,
        this.telemetryClient,
      );
      return res;
    } finally {
      // If the fork was supplied, we don't close it.
      // Otherwise, we wait a bit to close the fork we just created,
      // since the processor may still be working on a dangling tx
      // which was interrupted due to the processingDeadline being hit.
      if (!suppliedFork) {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        setTimeout(async () => {
          try {
            await fork.close();
          } catch (err) {
            // This can happen if the sequencer is stopped before we hit this timeout.
            log.warn(`Error closing forks for block processing`, err);
          }
        }, 5000);
      }
    }
  }

  getFork(blockNumber: number): Promise<MerkleTreeWriteOperations> {
    return this.worldState.fork(blockNumber);
  }
}

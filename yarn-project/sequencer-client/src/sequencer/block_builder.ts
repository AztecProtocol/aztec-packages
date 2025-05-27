import { Fr, elapsed } from '@aztec/aztec.js';
import { createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { DateProvider, Timer } from '@aztec/foundation/timer';
import { LightweightBlockBuilder } from '@aztec/prover-client/block-builder';
import {
  PublicContractsDB,
  PublicProcessor,
  type PublicProcessorValidator,
  TelemetryPublicTxSimulator,
} from '@aztec/simulator/server';
import type { ChainConfig } from '@aztec/stdlib/config';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { Gas } from '@aztec/stdlib/gas';
import type {
  BuildBlockOptions,
  BuildBlockResult,
  FullNodeBlockBuilder,
  MerkleTreeWriteOperations,
  WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { GlobalVariables, ProposedBlockHeader, Tx } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { createValidatorForBlockBuilding } from '../tx_validator/tx_validator_factory.js';

const log = createLogger('sequencer:block-builder');

function getSlotStartTimestamp(
  slotNumber: number | bigint,
  l1Constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration'>,
): number {
  return Number(l1Constants.l1GenesisTime) + Number(slotNumber) * l1Constants.slotDuration;
}

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
  const blockNumber = newGlobalVariables.blockNumber.toNumber();
  const slot = newGlobalVariables.slotNumber.toBigInt();
  log.debug(`Requesting L1 to L2 messages from contract for block ${blockNumber}`);
  const l1ToL2Messages = await l1ToL2MessageSource.getL1ToL2Messages(BigInt(blockNumber));
  const msgCount = l1ToL2Messages.length;

  log.verbose(`Building block ${blockNumber} for slot ${slot}`, {
    slot,
    blockNumber,
    msgCount,
    validator: opts.validateOnly,
  });

  try {
    const blockBuildingTimer = new Timer();
    const blockBuilder = new LightweightBlockBuilder(worldStateFork, telemetryClient);
    await blockBuilder.startNewBlock(newGlobalVariables, l1ToL2Messages);

    log.verbose(`Processing pending txs`, {
      slot,
      slotStart: new Date(getSlotStartTimestamp(slot, l1Constants) * 1000),
      now: new Date(dateProvider.now()),
      deadline: opts.deadline,
    });

    const [publicProcessorDuration, [processedTxs, failedTxs, usedTxs]] = await elapsed(() =>
      processor.process(pendingTxs, opts, validator),
    );

    if (
      !opts.validateOnly && // We check for minTxCount only if we are proposing a block, not if we are validating it
      opts.minTxsPerBlock !== undefined &&
      processedTxs.length < opts.minTxsPerBlock
    ) {
      log.warn(
        `Block ${blockNumber} has too few txs to be proposed (got ${processedTxs.length} but required ${opts.minTxsPerBlock})`,
        { slot, blockNumber, processedTxCount: processedTxs.length },
      );
      throw new Error(`Block has too few successful txs to be proposed`);
    }

    // All real transactions have been added, set the block as full and pad if needed
    await blockBuilder.addTxs(processedTxs);
    const block = await blockBuilder.setBlockCompleted();

    // How much public gas was processed
    const publicGas = processedTxs.reduce((acc, tx) => acc.add(tx.gasUsed.publicGas), Gas.empty());

    return {
      block,
      publicGas,
      publicProcessorDuration,
      numMsgs: l1ToL2Messages.length,
      numTxs: processedTxs.length,
      failedTxs: failedTxs,
      blockBuildingTimer,
      usedTxs,
    };
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

export class BlockBuilder implements FullNodeBlockBuilder {
  constructor(
    private config: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration'> &
      Pick<ChainConfig, 'l1ChainId' | 'rollupVersion'>,
    private l1ToL2MessageSource: L1ToL2MessageSource,
    private worldState: WorldStateSynchronizer,
    private contractDataSource: ContractDataSource,
    private dateProvider: DateProvider,
    private telemetryClient: TelemetryClient = getTelemetryClient(),
  ) {}

  protected async makeBlockBuilderDeps(globalVariables: GlobalVariables, opts: BuildBlockOptions) {
    const publicProcessorDBFork = await this.worldState.fork();
    const contractsDB = new PublicContractsDB(this.contractDataSource);

    const publicTxSimulator = new TelemetryPublicTxSimulator(
      publicProcessorDBFork,
      contractsDB,
      globalVariables,
      /*doMerkleOperations=*/ true,
      /*skipFeeEnforcement=*/ true,
      /*clientInitiatedSimulation=*/ false,
      this.telemetryClient,
    );

    const processor = new PublicProcessor(
      globalVariables,
      publicProcessorDBFork,
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

  private async syncToPreviousBlock(globalVariables: GlobalVariables, opts: BuildBlockOptions) {
    const parentBlockNumber = globalVariables.blockNumber.toNumber() - 1;
    const deadline = opts.deadline ? opts.deadline.getTime() - this.dateProvider.now() : undefined;
    await retryUntil(
      () =>
        !opts.validateOnly ||
        this.worldState.syncImmediate(parentBlockNumber, true).then(syncedTo => syncedTo >= parentBlockNumber),
      'sync to previous block',
      deadline,
      0.1,
    );
    log.debug(`Synced to previous block ${parentBlockNumber}`);
  }

  async buildBlockAsProposer(
    pendingTxs: Iterable<Tx> | AsyncIterable<Tx>,
    globalVariables: GlobalVariables,
    opts: BuildBlockOptions,
  ): Promise<BuildBlockResult> {
    await this.syncToPreviousBlock(globalVariables, opts);
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

  async buildBlockAsValidator(
    pendingTxs: Iterable<Tx> | AsyncIterable<Tx>,
    blockNumber: Fr,
    header: ProposedBlockHeader,
    opts: BuildBlockOptions,
  ): Promise<BuildBlockResult> {
    const globalVariables = GlobalVariables.from({
      ...header,
      blockNumber,
      timestamp: new Fr(header.timestamp),
      chainId: new Fr(this.config.l1ChainId),
      version: new Fr(this.config.rollupVersion),
    });
    await this.syncToPreviousBlock(globalVariables, opts);
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

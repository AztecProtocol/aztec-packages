import { Fr, elapsed } from '@aztec/aztec.js';
import { createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { DateProvider, Timer } from '@aztec/foundation/timer';
import { LightweightBlockBuilder } from '@aztec/prover-client/block-builder';
import { PublicContractsDB, PublicProcessor, TelemetryPublicTxSimulator } from '@aztec/simulator/server';
import type { ChainConfig } from '@aztec/stdlib/config';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { Gas } from '@aztec/stdlib/gas';
import type { BuildBlockOptions, FullNodeBlockBuilder, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
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
  worldState: WorldStateSynchronizer,
  contractDataSource: ContractDataSource,
  l1Constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration'>,
  dateProvider: DateProvider,
  telemetryClient: TelemetryClient = getTelemetryClient(),
) {
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

  // Sync to the previous block at least. If we cannot sync to that block because the archiver hasn't caught up,
  // we keep retrying until the reexecution deadline. Note that this could only happen when we are a validator,
  // for if we are the proposer, then world-state should already be caught up, as we check this earlier.
  await retryUntil(
    () =>
      !opts.validateOnly ||
      worldState.syncImmediate(blockNumber - 1, true).then(syncedTo => syncedTo >= blockNumber - 1),
    'sync to previous block',
    l1Constants.slotDuration,
    0.1,
  );
  log.debug(`Synced to previous block ${blockNumber - 1}`);

  const publicProcessorDBFork = await worldState.fork();

  try {
    const contractsDB = new PublicContractsDB(contractDataSource);

    const publicTxSimulator = new TelemetryPublicTxSimulator(
      publicProcessorDBFork,
      contractsDB,
      newGlobalVariables,
      /*doMerkleOperations=*/ true,
      /*skipFeeEnforcement=*/ true,
      /*clientInitiatedSimulation=*/ false,
      telemetryClient,
    );

    const processor = new PublicProcessor(
      newGlobalVariables,
      publicProcessorDBFork,
      contractsDB,
      publicTxSimulator,
      dateProvider,
      telemetryClient,
    );
    const blockBuildingTimer = new Timer();
    const blockBuilder = new LightweightBlockBuilder(publicProcessorDBFork, telemetryClient);
    await blockBuilder.startNewBlock(newGlobalVariables, l1ToL2Messages);

    log.verbose(`Processing pending txs`, {
      slot,
      slotStart: new Date(getSlotStartTimestamp(slot, l1Constants) * 1000),
      now: new Date(dateProvider.now()),
      deadline: opts.deadline,
    });

    const validator = createValidatorForBlockBuilding(
      publicProcessorDBFork,
      contractDataSource,
      newGlobalVariables,
      opts.txPublicSetupAllowList ?? [],
    );

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
    // We create a fresh processor each time to reset any cached state (eg storage writes)
    // We wait a bit to close the forks since the processor may still be working on a dangling tx
    // which was interrupted due to the processingDeadline being hit.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    setTimeout(async () => {
      try {
        await publicProcessorDBFork.close();
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

  buildBlockAsProposer(
    pendingTxs: Iterable<Tx> | AsyncIterable<Tx>,
    globalVariables: GlobalVariables,
    opts: BuildBlockOptions,
  ) {
    return buildBlock(
      pendingTxs,
      globalVariables,
      opts,
      this.l1ToL2MessageSource,
      this.worldState,
      this.contractDataSource,
      this.config,
      this.dateProvider,
      this.telemetryClient,
    );
  }

  buildBlockAsValidator(
    pendingTxs: Iterable<Tx> | AsyncIterable<Tx>,
    blockNumber: Fr,
    header: ProposedBlockHeader,
    opts: BuildBlockOptions,
  ) {
    const globalVariables = GlobalVariables.from({
      ...header,
      blockNumber,
      timestamp: new Fr(header.timestamp),
      chainId: new Fr(this.config.l1ChainId),
      version: new Fr(this.config.rollupVersion),
    });
    return buildBlock(
      pendingTxs,
      globalVariables,
      opts,
      this.l1ToL2MessageSource,
      this.worldState,
      this.contractDataSource,
      this.config,
      this.dateProvider,
      this.telemetryClient,
    );
  }
}

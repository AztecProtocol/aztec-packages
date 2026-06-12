import { L1ToL2MessagesNotReadyError } from '@aztec/archiver';
import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { compactArray } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { BadRequestError } from '@aztec/foundation/json-rpc';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { isErrorClass } from '@aztec/foundation/types';
import { PublicContractsDB, PublicProcessorFactory } from '@aztec/simulator/server';
import { CollectionLimitsConfig, PublicSimulatorConfig } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { type L1ToL2MessageSource, appendL1ToL2MessagesToTree } from '@aztec/stdlib/messaging';
import {
  type GlobalVariableBuilder,
  GlobalVariables,
  PublicSimulationOutput,
  type SimulationOverrides,
  type Tx,
} from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { applyPublicDataOverrides } from './public_data_overrides.js';

/** Config fields the simulator needs — a narrow subset of `AztecNodeConfig`. */
export interface NodePublicCallsSimulatorConfig {
  /** Maximum total gas limit accepted for an incoming simulation. */
  rpcSimulatePublicMaxGasLimit: number;
  /** Maximum number of debug-log memory reads collected during simulation. */
  rpcSimulatePublicMaxDebugLogMemoryReads: number;
}

/** Dependencies required to build a {@link NodePublicCallsSimulator}. */
export interface NodePublicCallsSimulatorDeps {
  blockSource: L2BlockSource;
  worldStateSynchronizer: WorldStateSynchronizer;
  l1ToL2MessageSource: L1ToL2MessageSource;
  contractDataSource: ContractDataSource;
  globalVariableBuilder: GlobalVariableBuilder;
  epochCache: EpochCacheInterface;
  config: NodePublicCallsSimulatorConfig;
  telemetry?: TelemetryClient;
  log?: Logger;
}

/**
 * Simulates the public part of a transaction against a fresh world-state fork.
 *
 * Extracted verbatim from `AztecNodeService` so the slot/globals selection can be unit-tested without
 * standing up the whole node, and to keep `server.ts` smaller.
 */
export class NodePublicCallsSimulator {
  private readonly blockSource: L2BlockSource;
  private readonly worldStateSynchronizer: WorldStateSynchronizer;
  private readonly l1ToL2MessageSource: L1ToL2MessageSource;
  private readonly contractDataSource: ContractDataSource;
  private readonly globalVariableBuilder: GlobalVariableBuilder;
  private readonly epochCache: EpochCacheInterface;
  private readonly config: NodePublicCallsSimulatorConfig;
  private readonly telemetry: TelemetryClient;
  private readonly log: Logger;

  constructor(deps: NodePublicCallsSimulatorDeps) {
    this.blockSource = deps.blockSource;
    this.worldStateSynchronizer = deps.worldStateSynchronizer;
    this.l1ToL2MessageSource = deps.l1ToL2MessageSource;
    this.contractDataSource = deps.contractDataSource;
    this.globalVariableBuilder = deps.globalVariableBuilder;
    this.epochCache = deps.epochCache;
    this.config = deps.config;
    this.telemetry = deps.telemetry ?? getTelemetryClient();
    this.log = deps.log ?? createLogger('node:public-calls-simulator');
  }

  /**
   * Simulates the public part of a transaction with the current state.
   * @param tx - The transaction to simulate.
   * @param skipFeeEnforcement - If true, fee enforcement is skipped.
   * @param overrides - Optional pre-simulation overrides applied to the ephemeral fork and contract DB.
   */
  public async simulate(
    tx: Tx,
    skipFeeEnforcement = false,
    overrides?: SimulationOverrides,
  ): Promise<PublicSimulationOutput> {
    // Check total gas limit for simulation
    const gasSettings = tx.data.constants.txContext.gasSettings;
    const txGasLimit = gasSettings.gasLimits.l2Gas;
    const teardownGasLimit = gasSettings.teardownGasLimits.l2Gas;
    if (txGasLimit + teardownGasLimit > this.config.rpcSimulatePublicMaxGasLimit) {
      throw new BadRequestError(
        `Transaction total gas limit ${
          txGasLimit + teardownGasLimit
        } (${txGasLimit} + ${teardownGasLimit}) exceeds maximum gas limit ${
          this.config.rpcSimulatePublicMaxGasLimit
        } for simulation`,
      );
    }

    const txHash = tx.getTxHash();
    const l2Tips = await this.blockSource.getL2Tips();
    const latestBlockNumber = l2Tips.proposed.number;
    const blockNumber = BlockNumber.add(latestBlockNumber, 1);

    // If sequencer is not initialized, we just set these values to zero for simulation.
    const coinbase = EthAddress.ZERO;
    const feeRecipient = AztecAddress.ZERO;

    // Define the slot for simulation as the max of the next L1 timestamp slot, the slot after the proposed
    // checkpoint, and the latest proposed block's slot.
    const proposedCheckpointBlockData = await this.blockSource.getBlockData({
      number: l2Tips.proposedCheckpoint.block.number,
    });
    const proposedCheckpointSlot = proposedCheckpointBlockData?.header.getSlot();
    let slotAfterProposedCheckpoint: SlotNumber | undefined;
    if (proposedCheckpointSlot !== undefined) {
      slotAfterProposedCheckpoint = SlotNumber.fromBigInt(BigInt(proposedCheckpointSlot) + 1n);
    }

    let latestProposedBlockSlot: SlotNumber | undefined;
    if (l2Tips.proposed.number > l2Tips.proposedCheckpoint.block.number) {
      latestProposedBlockSlot = (
        await this.blockSource.getBlockData({ number: l2Tips.proposed.number })
      )?.header.getSlot();
    }
    const slotFromNextL1Timestamp = this.epochCache.getEpochAndSlotInNextL1Slot().slot;
    const targetSlot = SlotNumber(
      Math.max(...compactArray([slotFromNextL1Timestamp, slotAfterProposedCheckpoint, latestProposedBlockSlot])),
    );

    const checkpointGlobalVariables = await this.globalVariableBuilder.buildCheckpointGlobalVariables(
      coinbase,
      feeRecipient,
      targetSlot,
    );
    const newGlobalVariables = GlobalVariables.from({ blockNumber, ...checkpointGlobalVariables });

    const publicProcessorFactory = new PublicProcessorFactory(
      this.contractDataSource,
      new DateProvider(),
      this.telemetry,
      this.log.getBindings(),
    );

    this.log.verbose(`Simulating public calls for tx ${txHash}`, {
      globalVariables: newGlobalVariables.toInspect(),
      txHash,
      blockNumber,
    });

    // Ensure world-state has caught up with the latest block we loaded from the archiver
    await this.worldStateSynchronizer.syncImmediate(latestBlockNumber);

    // If we detect the next block would start a new checkpoint, then insert L1-to-L2 messages into
    // the world state tree so simulation can take them into account. We detect if the next block would
    // start a new checkpoint by checking if the proposed checkpoint's block number matches the latest block number,
    // which means the next block would be the first block of the next checkpoint.
    const targetCheckpoint = CheckpointNumber(
      (l2Tips.proposedCheckpoint.checkpoint.number ?? CheckpointNumber.ZERO) + 1,
    );
    const nextCheckpointMessages: Fr[] | undefined =
      l2Tips.proposedCheckpoint.block.number === l2Tips.proposed.number
        ? await this.l1ToL2MessageSource.getL1ToL2Messages(targetCheckpoint).catch(err => {
            if (isErrorClass(err, L1ToL2MessagesNotReadyError)) {
              this.log.warn(
                `L1-to-L2 messages for checkpoint ${targetCheckpoint} are not ready yet (simulating without them)`,
              );
            } else {
              this.log.error(
                `Failed to get L1-to-L2 messages for checkpoint ${targetCheckpoint} (simulating without them)`,
                err,
              );
            }
            return undefined;
          })
        : undefined;

    // Request a new fork of the world state at the latest block number, and apply any overrides and next checkpoint messages to it before simulation
    await using merkleTreeFork = await this.worldStateSynchronizer.fork(latestBlockNumber);

    if (nextCheckpointMessages !== undefined) {
      this.log.debug(
        `Appending ${nextCheckpointMessages.length} L1-to-L2 messages to the world state tree for the next checkpoint`,
        { checkpointNumber: l2Tips.proposedCheckpoint.checkpoint.number + 1 },
      );
      await appendL1ToL2MessagesToTree(merkleTreeFork, nextCheckpointMessages);
    }
    await applyPublicDataOverrides(merkleTreeFork, overrides?.publicStorage);

    const config = PublicSimulatorConfig.from({
      skipFeeEnforcement,
      collectDebugLogs: true,
      collectHints: false,
      collectCallMetadata: true,
      collectStatistics: false,
      collectionLimits: CollectionLimitsConfig.from({
        maxDebugLogMemoryReads: this.config.rpcSimulatePublicMaxDebugLogMemoryReads,
      }),
    });

    const contractsDB = new PublicContractsDB(this.contractDataSource, this.log.getBindings());
    if (overrides?.contracts) {
      contractsDB.addContracts(Object.values(overrides.contracts).map(({ instance }) => instance));
    }
    const processor = publicProcessorFactory.create(merkleTreeFork, newGlobalVariables, config, contractsDB);

    // REFACTOR: Consider merging ProcessReturnValues into ProcessedTx
    const [processedTxs, failedTxs, _usedTxs, returns, debugLogs] = await processor.process([tx]);
    // REFACTOR: Consider returning the error rather than throwing
    if (failedTxs.length) {
      this.log.warn(`Simulated tx ${txHash} fails: ${failedTxs[0].error}`, { txHash });
      throw failedTxs[0].error;
    }

    const [processedTx] = processedTxs;
    return new PublicSimulationOutput(
      processedTx.revertReason,
      processedTx.globalVariables,
      processedTx.txEffect,
      returns,
      processedTx.gasUsed,
      debugLogs,
    );
  }
}

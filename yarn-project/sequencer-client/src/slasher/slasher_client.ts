import type { EpochCache } from '@aztec/epoch-cache';
import { type ExtendedViemWalletClient, type L1ContractsConfig, type L1ReaderConfig, L1TxUtils } from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { SlashFactoryAbi } from '@aztec/l1-artifacts';
import type { L2BlockId, L2BlockSourceEventEmitter } from '@aztec/stdlib/block';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { type TelemetryClient, WithTracer, getTelemetryClient } from '@aztec/telemetry-client';

import {
  type GetContractEventsReturnType,
  type GetContractReturnType,
  encodeFunctionData,
  getAddress,
  getContract,
} from 'viem';

import { Offence, type SlasherConfig, WANT_TO_SLASH_EVENT, type WantToSlashArgs, bigIntToOffence } from './config.js';
import { EpochPruneWatcher } from './epoch_prune_watcher.js';

/**
 * Enum defining the possible states of the Slasher client.
 */
export enum SlasherClientState {
  IDLE,
  RUNNING,
  STOPPED,
}

/**
 * The synchronization status of the Slasher client.
 */
export interface SlasherSyncState {
  /**
   * The current state of the slasher client.
   */
  state: SlasherClientState;
  /**
   * The block number that the slasher client is synced to.
   */
  syncedToL2Block: L2BlockId;
}

// Renamed from SlashEvent and updated for new event structure
type MonitoredSlashPayload = {
  payloadAddress: EthAddress;
  validators: readonly EthAddress[];
  amounts: readonly bigint[];
  offenses: readonly Offence[];
  // For TTL management, using L1 block number when event was seen
  // Alternatively, could be a timestamp if preferred and L1 gives us reliable timestamps.
  // slotNumber seems to map to L2 slots, L1 event monitoring will give L1 blockNumber.
  observedAtL1BlockNumber: bigint;
  // The 'lifetime' concept from the old SlashEvent (calculated based on slashingRoundSize)
  // might still be relevant for deciding *when* to vote within a round,
  // distinct from the overall TTL of the payload.
  // For now, focusing on the new fields. The old lifetime was related to which slot it should be active for.
  totalAmount: bigint;
};

/**
 * @notice A Hypomeiones slasher client implementation
 *
 * Hypomeiones: a class of individuals in ancient Sparta who were considered inferior or lesser citizens compared
 * to the full Spartan citizens.
 *
 * How it works:
 *
 * The constructor creates instances of classes that correspond to specific offences. These "watchers" do two things:
 * - watch for their offence conditions and emit an event when they are detected
 * - confirm/deny whether they agree with a proposed offence
 *
 * The SlasherClient class is responsible for:
 * - listening for events from the watchers and creating a corresponding payload
 * - listening for the payloads from L1 filtering them through the watchers
 * - ordering the payloads and discarding stale payloads
 * - presenting the payload that ought to be currently voted for
 *
 *
 *
 * A few improvements:
 * - Only vote on the proposal if it is possible to reach, e.g., if 6 votes are needed and only 4 slots are left don't vote.
 * - Stop voting on a payload once it is processed.
 * - Only vote on the proposal if it have not already been executed
 *  - Caveat, we need to fully decide if it is acceptable to have the same payload address multiple times. In the current
 *    slash factory that could mean slashing the same committee for the same error multiple times.
 * - Decide how to deal with multiple slashing events in the same round.
 *  - This could be that multiple epochs are pruned in the same round, but with the current naive implementation we could end up
 *    slashing only the first, because the "lifetime" of the second would have passed after that vote
 */
export class SlasherClient extends WithTracer {
  private monitoredPayloads: MonitoredSlashPayload[] = [];

  protected slashFactoryContract?: GetContractReturnType<typeof SlashFactoryAbi, ExtendedViemWalletClient> = undefined;

  static new(
    config: SlasherConfig & L1ContractsConfig & L1ReaderConfig,
    l1Constants: L1RollupConstants,
    epochCache: EpochCache,
    l2BlockSource: L2BlockSourceEventEmitter,
    l1TxUtils: L1TxUtils,
    telemetry: TelemetryClient = getTelemetryClient(),
  ) {
    const epochPruneWatcher = new EpochPruneWatcher(l2BlockSource, l1Constants, epochCache, config.slashPrunePenalty);
    return new SlasherClient(config, l2BlockSource, l1TxUtils, epochPruneWatcher, telemetry);
  }

  constructor(
    private config: SlasherConfig & L1ContractsConfig & L1ReaderConfig,
    private l2BlockSource: L2BlockSourceEventEmitter,
    private l1TxUtils: L1TxUtils,
    private epochPruneWatcher: EpochPruneWatcher,
    telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('slasher'),
  ) {
    super(telemetry, 'slasher');

    if (config.l1Contracts.slashFactoryAddress && !config.l1Contracts.slashFactoryAddress.equals(EthAddress.ZERO)) {
      this.slashFactoryContract = getContract({
        address: getAddress(config.l1Contracts.slashFactoryAddress.toString()),
        abi: SlashFactoryAbi,
        client: this.l1TxUtils.client,
      });
      this.log.info(`Monitoring SlashFactory at ${config.l1Contracts.slashFactoryAddress.toString()}`);
    } else {
      this.log.warn('No slash factory address found, slashing will not be enabled');
    }

    this.log.info(
      `Slasher client initialized. Prune Create: ${config.slashPruneCreate}, Prune Penalty: ${config.slashPrunePenalty}`,
    );
  }

  public start() {
    this.log.info('Starting Slasher client...');
    if (!this.slashFactoryContract) {
      this.log.warn('No slash factory contract found, skipping slash factory event watching');
      return;
    }

    this.watchSlashFactoryEvents();
    this.epochPruneWatcher.on(WANT_TO_SLASH_EVENT, this.handleWantsToSlash.bind(this));

    this.epochPruneWatcher.start();
  }

  private handleWantsToSlash(args: WantToSlashArgs) {
    this.log.info('Wants to slash', args);
    if (!this.slashFactoryContract) {
      this.log.error('No slash factory contract found, skipping slash');
      return;
    }
    this.l1TxUtils
      .sendAndMonitorTransaction({
        to: this.slashFactoryContract.address,
        data: encodeFunctionData({
          abi: SlashFactoryAbi,
          functionName: 'createSlashPayload',
          args: [args.validators, args.amounts, args.offenses.map(offense => BigInt(offense))],
        }),
      })
      // note, we don't need to monitor the logs here,
      // it is handled by watchSlashFactoryEvents
      .catch(e => {
        this.log.error('Error slashing', e);
      });
  }

  private *factoryEventsToMonitoredPayloads(
    args: GetContractEventsReturnType<typeof SlashFactoryAbi, 'SlashPayloadCreated'>,
  ): IterableIterator<MonitoredSlashPayload> {
    for (const event of args) {
      if (!event.args) {
        continue;
      }
      const args = event.args;
      if (!args.payloadAddress || !args.validators || !args.amounts || !args.offences) {
        continue;
      }
      yield {
        payloadAddress: EthAddress.fromString(args.payloadAddress),
        validators: args.validators.map(EthAddress.fromString),
        amounts: args.amounts,
        offenses: args.offences.map(offense => bigIntToOffence(offense)),
        observedAtL1BlockNumber: event.blockNumber,
        totalAmount: args.amounts.reduce((acc, amount) => acc + amount, BigInt(0)),
      };
    }
  }

  private sortMonitoredPayloads() {
    // sort by total amount in descending order
    this.monitoredPayloads.sort((a, b) => Number(b.totalAmount) - Number(a.totalAmount));
  }

  private addMonitoredPayload(payload: MonitoredSlashPayload) {
    if (this.doIAgreeWithPayload(payload)) {
      this.monitoredPayloads.push(payload);
    }
  }

  private filterExpiredPayloads(currentL1Block: bigint, payloadTtlSlots: bigint) {
    // filter out payloads that have expired
    // or we disagree with

    // TODO: check on race condition with sortMonitoredPayloads here
    this.monitoredPayloads = this.monitoredPayloads.filter(payload => {
      return payload.observedAtL1BlockNumber + payloadTtlSlots > currentL1Block;
    });
  }

  /**
   * Allows consumers to stop the instance of the slasher client.
   * 'ready' will now return 'false' and the running promise that keeps the client synced is interrupted.
   */
  public stop() {
    this.log.debug('Stopping Slasher client...');
    if (this.unwatchSlashFactoryEvents) {
      this.unwatchSlashFactoryEvents();
    }
    this.epochPruneWatcher.stop();
    this.log.info('Slasher client stopped.');
  }

  private unwatchSlashFactoryEvents?: () => void;

  private watchSlashFactoryEvents() {
    if (!this.slashFactoryContract) {
      return;
    }

    this.unwatchSlashFactoryEvents = this.slashFactoryContract.watchEvent.SlashPayloadCreated({
      onLogs: logs => {
        for (const payload of this.factoryEventsToMonitoredPayloads(logs)) {
          this.addMonitoredPayload(payload);
        }
        this.sortMonitoredPayloads();
      },
    });
  }

  private doIAgreeWithPayload(payload: MonitoredSlashPayload) {
    // zip offenses and validators together
    const offensesAndValidators = payload.offenses.map((offense, index) => ({
      offense,
      validator: payload.validators[index],
      amount: payload.amounts[index],
    }));

    // check each offense
    for (const offenseAndValidator of offensesAndValidators) {
      switch (offenseAndValidator.offense) {
        case Offence.UNKNOWN:
          continue;
        case Offence.EPOCH_PRUNE:
          if (!this.epochPruneWatcher.wantToSlash(offenseAndValidator.validator, offenseAndValidator.amount)) {
            return false;
          }
          break;
        case Offence.INACTIVITY:
          // TODO: Implement inactivity slashing
          continue;
      }
    }
    return true;
  }

  public async getSlashPayload(_slotNumber: bigint): Promise<EthAddress | undefined> {
    if (this.config.slashOverridePayload && !this.config.slashOverridePayload.isZero()) {
      this.log.info(`Overriding slash payload to: ${this.config.slashOverridePayload.toString()}`);
      return Promise.resolve(this.config.slashOverridePayload);
    }

    const currentL1Block = await this.l1TxUtils.client.getBlockNumber();
    this.filterExpiredPayloads(currentL1Block, BigInt(this.config.slashPayloadTtlSlots));

    if (this.monitoredPayloads.length === 0) {
      this.log.debug('No monitored payloads, returning undefined');
      return Promise.resolve(undefined);
    }

    const selectedPayload = this.monitoredPayloads[0];
    this.log.debug(
      `getSlashPayload: Placeholder logic. Oldest monitored payload: ${selectedPayload.payloadAddress.toString()}. Full selection logic pending.`,
    );

    return Promise.resolve(selectedPayload.payloadAddress);
  }
}

import { type ExtendedViemWalletClient, type L1ContractsConfig, type L1ReaderConfig, L1TxUtils } from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { SlashFactoryAbi } from '@aztec/l1-artifacts';
import {
  type L2BlockId,
  type L2BlockSourceEvent,
  type L2BlockSourceEventEmitter,
  L2BlockSourceEvents,
} from '@aztec/stdlib/block';
import { type TelemetryClient, WithTracer, getTelemetryClient } from '@aztec/telemetry-client';

import { type GetContractReturnType, encodeFunctionData, getAddress, getContract } from 'viem';

import type { SlasherConfig } from './config.js';

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

// Corresponds to ISlashFactory.Offense enum
export enum Offense {
  Unknown,
  EpochPruned,
  Inactivity,
}

// Renamed from SlashEvent and updated for new event structure
type MonitoredSlashPayload = {
  payloadAddress: EthAddress;
  validators: readonly EthAddress[];
  amounts: readonly bigint[];
  offenses: readonly Offense[];
  // For TTL management, using L1 block number when event was seen
  // Alternatively, could be a timestamp if preferred and L1 gives us reliable timestamps.
  // slotNumber seems to map to L2 slots, L1 event monitoring will give L1 blockNumber.
  observedAtL1BlockNumber: bigint;
  // The 'lifetime' concept from the old SlashEvent (calculated based on slashingRoundSize)
  // might still be relevant for deciding *when* to vote within a round,
  // distinct from the overall TTL of the payload.
  // For now, focusing on the new fields. The old lifetime was related to which slot it should be active for.
};

/**
 * @notice A Hypomeiones slasher client implementation
 *
 * Hypomeiones: a class of individuals in ancient Sparta who were considered inferior or lesser citizens compared
 * to the full Spartan citizens.
 *
 * How it works:
 *
 *
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

  constructor(
    private config: SlasherConfig & L1ContractsConfig & L1ReaderConfig,
    private l2BlockSource: L2BlockSourceEventEmitter,
    private l1TxUtils: L1TxUtils,
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
    this.l2BlockSource.on(L2BlockSourceEvents.L2PruneDetected, this.handlePruneL2Blocks.bind(this));
    if (this.slashFactoryContract) {
      this.watchSlashFactoryEvents();
    }
  }

  public getSlashPayload(_slotNumber: bigint): Promise<EthAddress | undefined> {
    // This function will be entirely rewritten based on the new selection logic.
    // The monitoredPayloads array will be filtered and sorted here.

    // 1. Override check (this.config.slashOverridePayload)
    if (this.config.slashOverridePayload && !this.config.slashOverridePayload.isZero()) {
      this.log.info(`Overriding slash payload to: ${this.config.slashOverridePayload.toString()}`);
      return Promise.resolve(this.config.slashOverridePayload);
    }

    // --- TODO: Implement new payload selection logic based on design document ---
    // 2. TTL filter this.monitoredPayloads based on _slotNumber (or current L1 block)
    // 3. Calculate total slash amount for each
    // 4. Sort by total amount
    // 5. Agree and pick (checking offenses, validator activity etc.)

    // Placeholder: if monitored payloads exist, log about one, but still return undefined.
    if (this.monitoredPayloads.length > 0) {
      const selectedPayload = this.monitoredPayloads[0];
      this.log.debug(
        `getSlashPayload: Placeholder logic. Oldest monitored payload: ${selectedPayload.payloadAddress.toString()}. Full selection logic pending.`,
      );
    }
    // --- End TODO ---

    this.log.debug('getSlashPayload: Placeholder, returning undefined pending full implementation.');
    return Promise.resolve(undefined);
  }

  /**
   * Allows consumers to stop the instance of the slasher client.
   * 'ready' will now return 'false' and the running promise that keeps the client synced is interrupted.
   */
  public stop() {
    this.log.debug('Stopping Slasher client...');
    this.l2BlockSource.removeListener(L2BlockSourceEvents.L2PruneDetected, this.handlePruneL2Blocks.bind(this));
    // TODO: Properly stop watching SlashFactory events (viem returns an unwatch function)
    if (this.unwatchSlashFactoryEvents) {
      this.unwatchSlashFactoryEvents();
    }
    this.log.info('Slasher client stopped.');
  }

  private handlePruneL2Blocks(event: L2BlockSourceEvent): void {
    if (!this.config.slashPruneCreate || this.config.slashPrunePenalty === 0n) {
      this.log.debug('Prune slashing creation disabled or penalty is zero.');
      return;
    }

    const { /*_slotNumber,*/ epochNumber } = event; // L2 slotNumber might be used for timing
    this.log.info(`Detected chain prune. Attempting to create slash for epoch ${epochNumber}`, event);

    // get the validators for the epoch
    const validators = this.getValidatorsForEpoch(epochNumber);
    if (validators.length === 0) {
      this.log.debug('No validators found for epoch, skipping slash creation.');
      return;
    }

    const amounts = Array(validators.length).fill(this.config.slashPrunePenalty);
    const offenses = Array(validators.length).fill(Offense.EpochPruned);

    // create the slash payload
    this.l1TxUtils
      .sendAndMonitorTransaction({
        to: this.slashFactoryContract!.address,
        data: encodeFunctionData({
          abi: SlashFactoryAbi,
          functionName: 'createSlashPayload',
          args: [[...validators], [...amounts], [...offenses]],
        }),
      })
      .catch(error => {
        this.log.error('Error creating slash payload:', error);
      });
  }

  private getValidatorsForEpoch(_epochNumber: bigint): `0x${string}`[] {
    // TODO: Implement this
    return [];
  }

  private unwatchSlashFactoryEvents?: () => void;

  private watchSlashFactoryEvents() {
    if (!this.slashFactoryContract) {
      return;
    }

    this.log.info('Watching for SlashPayloadCreated events...');
    // Ensure SlashFactoryAbi has the event defined correctly:
    // event SlashPayloadCreated(address payloadAddress, address[] validators, uint256[] amounts, Offense[] offences);
    this.unwatchSlashFactoryEvents = this.slashFactoryContract.watchEvent.SlashPayloadCreated({
      onLogs: logs => {
        logs.forEach(log => {
          // Type assertion for log.args based on the event signature
          // The `unknown` type is a safe default if ABI isn't perfectly matched by viem for complex types initially.

          if (!log.args || !log.args.payloadAddress) {
            this.log.warn('Received SlashPayloadCreated event with missing args', log);
            return;
          }

          const newPayload: MonitoredSlashPayload = {
            payloadAddress: EthAddress.fromString(log.args.payloadAddress),
            validators: log.args.validators?.map(EthAddress.fromString) ?? [],
            amounts: log.args.amounts ?? [],
            // Ensure mapping from number to Offense enum. Solidity enums are uint8.
            offenses: log.args.offences?.map(o => o as Offense) ?? [],
            observedAtL1BlockNumber: log.blockNumber, // Correctly capture L1 block number
          };

          this.log.info(
            `New SlashPayloadCreated event received: Payload ${newPayload.payloadAddress.toString()}, Validators: ${
              newPayload.validators.length
            }, L1Block: ${newPayload.observedAtL1BlockNumber}`,
          );
          this.monitoredPayloads.push(newPayload);
          // TODO: Optionally sort monitoredPayloads here if beneficial, e.g., by block number or total amount for quicker access in getSlashPayload
        });
      },
    });
  }

  // TODO: Implement _maybeCreateSlashFactoryPayload(validators, amounts, offenses)
  // This would call: await this.slashFactoryContract.write.createSlashPayload([...]);
  // And would require a connected wallet/signer to the Viem client for 'write' operations.

  // TODO: Implement method to get validators for an epoch (likely via ValidatorSelection contract)
  // private async getValidatorsForEpoch(epochNumber: bigint): Promise<EthAddress[]> { ... }
}

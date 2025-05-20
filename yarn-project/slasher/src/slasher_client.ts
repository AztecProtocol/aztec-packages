import {
  type ExtendedViemWalletClient,
  type L1ReaderConfig,
  L1TxUtils,
  ProposalAlreadyExecutedError,
  RollupContract,
  SlashingProposerContract,
} from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import type { DateProvider } from '@aztec/foundation/timer';
import { SlashFactoryAbi } from '@aztec/l1-artifacts';
import { type TelemetryClient, WithTracer, getTelemetryClient } from '@aztec/telemetry-client';

import {
  type GetContractEventsReturnType,
  type GetContractReturnType,
  encodeFunctionData,
  getAddress,
  getContract,
} from 'viem';

import {
  Offence,
  type SlasherConfig,
  WANT_TO_SLASH_EVENT,
  type WantToSlashArgs,
  type Watcher,
  bigIntToOffence,
} from './config.js';

type MonitoredSlashPayload = {
  payloadAddress: EthAddress;
  validators: readonly EthAddress[];
  amounts: readonly bigint[];
  offenses: readonly Offence[];
  observedAtSeconds: number;
  totalAmount: bigint;
};

/**
 * A Spartiate slasher client implementation
 *
 * Spartiates: a full citizen of the ancient polis of Sparta, member of an elite warrior class.
 *
 * How it works:
 *
 * The constructor accepts instances of Watcher classes that correspond to specific offences. These "watchers" do two things:
 * - watch for their offence conditions and emit an event when they are detected
 * - confirm/deny whether they agree with a proposed offence
 *
 * The SlasherClient class is responsible for:
 * - listening for events from the watchers and creating a corresponding payload
 * - listening for the payloads from L1 filtering them through the watchers
 * - ordering the payloads and discarding stale payloads
 * - presenting the payload that ought to be currently voted for
 * - detecting when it wants to execute a round
 * - executing a round
 * - listening for the round to be executed
 * - removing the executed round from the list of monitored payloads
 *
 * A few improvements:
 * - TODO(#14421): Only vote on the proposal if it is possible to reach quorum, e.g., if 6 votes are needed and only 4 slots are left don't vote.
 */
export class SlasherClient extends WithTracer {
  private monitoredPayloads: MonitoredSlashPayload[] = [];
  private unwatchCallbacks: (() => void)[] = [];

  static async new(
    config: SlasherConfig,
    l1Contracts: Pick<L1ReaderConfig['l1Contracts'], 'rollupAddress' | 'slashFactoryAddress'>,
    l1TxUtils: L1TxUtils,
    watchers: Watcher[],
    dateProvider: DateProvider,
    telemetry: TelemetryClient = getTelemetryClient(),
  ) {
    if (!l1Contracts.rollupAddress) {
      throw new Error('Cannot initialize SlasherClient without a rollup address');
    }
    if (!l1Contracts.slashFactoryAddress) {
      throw new Error('Cannot initialize SlasherClient without a slashFactory address');
    }

    const rollup = new RollupContract(l1TxUtils.client, l1Contracts.rollupAddress);
    const slashingProposer = await rollup.getSlashingProposer();
    const slashFactoryContract = getContract({
      address: getAddress(l1Contracts.slashFactoryAddress.toString()),
      abi: SlashFactoryAbi,
      client: l1TxUtils.client,
    });
    return new SlasherClient(
      config,
      slashFactoryContract,
      slashingProposer,
      l1TxUtils,
      watchers,
      dateProvider,
      telemetry,
    );
  }

  constructor(
    public config: SlasherConfig,
    protected slashFactoryContract: GetContractReturnType<typeof SlashFactoryAbi, ExtendedViemWalletClient>,
    private slashingProposer: SlashingProposerContract,
    private l1TxUtils: L1TxUtils,
    private watchers: Watcher[],
    private dateProvider: DateProvider,
    telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('slasher'),
  ) {
    super(telemetry, 'slasher');
  }

  //////////////////// Public methods ////////////////////

  public async start() {
    this.log.info('Starting Slasher client...');

    // detect when new payloads are created
    this.unwatchCallbacks.push(this.watchSlashFactoryEvents());

    // detect when a proposal is executable
    this.unwatchCallbacks.push(this.slashingProposer.listenToExecutableProposals(this.executeRoundIfAgree.bind(this)));

    // detect when a proposal is executed
    this.unwatchCallbacks.push(this.slashingProposer.listenToProposalExecuted(this.proposalExecuted.bind(this)));

    // start each watcher, who will signal the slasher client when they want to slash
    const wantToSlashCb = this.wantToSlash.bind(this);
    for (const watcher of this.watchers) {
      if (watcher.start) {
        await watcher.start();
      }
      watcher.on(WANT_TO_SLASH_EVENT, wantToSlashCb);
      this.unwatchCallbacks.push(() => watcher.removeListener(WANT_TO_SLASH_EVENT, wantToSlashCb));
    }
  }

  /**
   * Allows consumers to stop the instance of the slasher client.
   * 'ready' will now return 'false' and the running promise that keeps the client synced is interrupted.
   */
  public async stop() {
    this.log.debug('Stopping Slasher client...');
    for (const cb of this.unwatchCallbacks) {
      cb();
    }
    for (const watcher of this.watchers) {
      if (watcher.stop) {
        await watcher.stop();
      }
    }
    this.log.info('Slasher client stopped.');
  }

  /**
   * Get the payload to slash
   *
   * @param _slotNumber the current slot number (unused)
   * @returns the payload to slash or undefined if there is no payload to slash
   */
  public getSlashPayload(_slotNumber: bigint): Promise<EthAddress | undefined> {
    if (this.config.slashOverridePayload && !this.config.slashOverridePayload.isZero()) {
      this.log.info(`Overriding slash payload to: ${this.config.slashOverridePayload.toString()}`);
      return Promise.resolve(this.config.slashOverridePayload);
    }

    const currentTime = this.dateProvider.now();
    this.filterExpiredPayloads(currentTime, this.config.slashPayloadTtlSeconds);

    if (this.monitoredPayloads.length === 0) {
      this.log.debug('No monitored payloads, returning undefined');
      return Promise.resolve(undefined);
    }

    const selectedPayload = this.monitoredPayloads[0];
    this.log.info('selectedPayload', selectedPayload);

    return Promise.resolve(selectedPayload.payloadAddress);
  }

  /**
   * Get the list of monitored payloads
   *
   * Useful for tests.
   *
   * @returns the list of monitored payloads
   */
  public getMonitoredPayloads(): MonitoredSlashPayload[] {
    return this.monitoredPayloads;
  }

  //////////////////// Private methods ////////////////////

  /**
   * This is called when a watcher emits WANT_TO_SLASH_EVENT.
   *
   * @param args - the arguments from the watcher, including the validators, amounts, and offenses
   */
  private wantToSlash(args: WantToSlashArgs) {
    // TODO: need to sort the payloads by attester address
    this.log.info('Wants to slash', args);
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

  /**
   * Watch for new payloads created by the slash factory
   *
   * Whenever a log has events, we iterate over them and convert them to MonitoredSlashPayloads
   *
   * We then add the payloads to the list of monitored payloads if we agree with them
   *
   * @returns a callback to remove the watcher
   */
  private watchSlashFactoryEvents() {
    return this.slashFactoryContract.watchEvent.SlashPayloadCreated({
      onLogs: logs => {
        for (const payload of this.factoryEventsToMonitoredPayloads(logs)) {
          this.log.info('Slash payload created', payload);
          this.addMonitoredPayload(payload).catch(e => {
            this.log.error('Error adding monitored payload', e);
          });
        }
        this.sortMonitoredPayloads();
      },
    });
  }

  /**
   * Convert a list of factory events to an iterable of monitored payloads
   *
   * @param args
   * @returns the list of monitored payloads
   */
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
        observedAtSeconds: this.dateProvider.now() / 1000,
        totalAmount: args.amounts.reduce((acc, amount) => acc + amount, BigInt(0)),
      };
    }
  }

  /**
   * Add a payload to the list of monitored payloads if we agree with it
   *
   * @param payload
   */
  private async addMonitoredPayload(payload: MonitoredSlashPayload) {
    if (await this.doIAgreeWithPayload(payload)) {
      this.log.info('Adding monitored payload', payload);
      this.monitoredPayloads.push(payload);
    } else {
      this.log.info('Disagreeing with payload', payload);
    }
  }

  /**
   * Check if we agree with a payload
   *
   * We check each offense and validator pair against the watchers
   *
   * @param payload
   * @returns true if any watcher agrees with the payload, false otherwise
   */
  private async doIAgreeWithPayload(payload: MonitoredSlashPayload) {
    // zip offenses and validators together
    const offensesAndValidators = payload.offenses.map((offense, index) => ({
      offense,
      validator: payload.validators[index],
      amount: payload.amounts[index],
    }));

    // check each offense
    for (const offenseAndValidator of offensesAndValidators) {
      const watcherResponses = await Promise.all(
        this.watchers.map(watcher =>
          watcher.shouldSlash(
            offenseAndValidator.validator.toString(),
            offenseAndValidator.amount,
            offenseAndValidator.offense,
          ),
        ),
      );
      // if no watcher agrees, return false
      if (watcherResponses.every(response => !response)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Sort the monitored payloads by total amount in descending order
   */
  private sortMonitoredPayloads() {
    this.monitoredPayloads.sort((a, b) => Number(b.totalAmount) - Number(a.totalAmount));
  }

  /**
   * Filter out payloads that have expired
   *
   * @param currentL1Block
   * @param payloadTtlSeconds
   */
  private filterExpiredPayloads(currentL1BlockTimestamp: number, payloadTtlSeconds: number) {
    this.monitoredPayloads = this.monitoredPayloads.filter(payload => {
      return payload.observedAtSeconds + payloadTtlSeconds > currentL1BlockTimestamp;
    });
  }

  /**
   * Execute a round if we agree with the proposal.
   *
   * Bound to the slashing proposer contract's listenToExecutableProposals method in the constructor.
   *
   * @param {proposal: `0x${string}`; round: bigint} param0
   */
  private async executeRoundIfAgree({ proposal, round }: { proposal: `0x${string}`; round: bigint }) {
    const payload = EthAddress.fromString(proposal);
    if (!this.monitoredPayloads.find(p => p.payloadAddress.equals(payload))) {
      this.log.debug('Round executable, but we disagree', { proposal, round });
      return;
    }

    const nextRound = round + 1n;
    this.log.info(`Waiting for round ${nextRound} to be reached`);
    await this.slashingProposer.waitForRound(nextRound, this.config.slashProposerRoundPollingIntervalSeconds);
    this.log.info('Executing round', { proposal, round });

    await this.slashingProposer
      .executeRound(this.l1TxUtils, round)
      .then(() => {
        this.log.info('Round executed', { round });
      })
      .catch(err => {
        if (err instanceof ProposalAlreadyExecutedError) {
          this.log.debug('Round already executed', { round });
          return;
        }
        throw err;
      });
  }

  /**
   * Handler for when a proposal is executed.
   *
   * Removes the first matching payload from the list of monitored payloads.
   *
   * Bound to the slashing proposer contract's listenToProposalExecuted method in the constructor.
   *
   * @param {round: bigint; proposal: `0x${string}`} param0
   */
  private proposalExecuted({ round, proposal }: { round: bigint; proposal: `0x${string}` }) {
    this.log.info('Proposal executed', { round, proposal });
    const index = this.monitoredPayloads.findIndex(p => p.payloadAddress.equals(EthAddress.fromString(proposal)));
    if (index === -1) {
      return;
    }
    this.monitoredPayloads.splice(index, 1);
  }
}

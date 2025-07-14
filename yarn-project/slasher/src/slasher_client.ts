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
import { sleep } from '@aztec/foundation/sleep';
import type { DateProvider } from '@aztec/foundation/timer';
import { SlashFactoryAbi } from '@aztec/l1-artifacts';

import {
  type GetContractEventsReturnType,
  type GetContractReturnType,
  type Hex,
  encodeFunctionData,
  getAddress,
  getContract,
} from 'viem';

import {
  Offense,
  type SlasherConfig,
  WANT_TO_SLASH_EVENT,
  type WantToSlashArgs,
  type Watcher,
  bigIntToOffense,
} from './config.js';

type MonitoredSlashPayload = {
  payloadAddress: EthAddress;
  validators: readonly EthAddress[];
  amounts: readonly bigint[];
  offenses: readonly Offense[];
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
 * The constructor accepts instances of Watcher classes that correspond to specific offenses. These "watchers" do two things:
 * - watch for their offense conditions and emit an event when they are detected
 * - confirm/deny whether they agree with a proposed offense
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
export class SlasherClient {
  private monitoredPayloads: MonitoredSlashPayload[] = [];
  private unwatchCallbacks: (() => void)[] = [];
  private overridePayloadActive = false;

  static async new(
    config: SlasherConfig,
    l1Contracts: Pick<L1ReaderConfig['l1Contracts'], 'rollupAddress' | 'slashFactoryAddress'>,
    l1TxUtils: L1TxUtils,
    watchers: Watcher[],
    dateProvider: DateProvider,
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

    return new SlasherClient(config, slashFactoryContract, slashingProposer, l1TxUtils, watchers, dateProvider);
  }

  constructor(
    public config: SlasherConfig,
    protected slashFactoryContract: GetContractReturnType<typeof SlashFactoryAbi, ExtendedViemWalletClient>,
    private slashingProposer: SlashingProposerContract,
    private l1TxUtils: L1TxUtils,
    private watchers: Watcher[],
    private dateProvider: DateProvider,
    private log = createLogger('slasher'),
  ) {
    this.overridePayloadActive = config.slashOverridePayload !== undefined && !config.slashOverridePayload.isZero();
  }

  //////////////////// Public methods ////////////////////

  public start() {
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
    // Viem calls eth_uninstallFilter under the hood when uninstalling event watchers, but these calls are not awaited,
    // meaning that any error that happens during the uninstallation will not be caught. This causes errors during jest teardowns,
    // where we stop anvil after all other processes are stopped, so sometimes the eth_uninstallFilter call fails because anvil
    // is already stopped. We add a sleep here to give the uninstallation some time to complete, but the proper fix is for
    // viem to await the eth_uninstallFilter calls, or to catch any errors that happen during the uninstallation.
    // See https://github.com/wevm/viem/issues/3714.
    await sleep(2000);
    this.log.info('Slasher client stopped.');
  }

  public clearMonitoredPayloads() {
    this.log.warn('Clearing monitored payloads', this.monitoredPayloads);
    this.monitoredPayloads = [];
  }

  /**
   * Update the config of the slasher client
   *
   * @param config - the new config. Can only update the following fields:
   * - slashOverridePayload
   * - slashPayloadTtlSeconds
   * - slashProposerRoundPollingIntervalSeconds
   */
  public updateConfig(config: Partial<SlasherConfig>) {
    const newConfig: SlasherConfig = {
      ...this.config,
      slashOverridePayload: config.slashOverridePayload ?? this.config.slashOverridePayload,
      slashPayloadTtlSeconds: config.slashPayloadTtlSeconds ?? this.config.slashPayloadTtlSeconds,
      slashProposerRoundPollingIntervalSeconds:
        config.slashProposerRoundPollingIntervalSeconds ?? this.config.slashProposerRoundPollingIntervalSeconds,
    };
    this.overridePayloadActive = config.slashOverridePayload !== undefined && !config.slashOverridePayload.isZero();
    this.config = newConfig;
  }

  /**
   * Get the payload to slash
   *
   * @param _slotNumber the current slot number (unused)
   * @returns the payload to slash or undefined if there is no payload to slash
   */
  public getSlashPayload(_slotNumber: bigint): Promise<EthAddress | undefined> {
    if (this.overridePayloadActive && this.config.slashOverridePayload && !this.config.slashOverridePayload.isZero()) {
      this.log.info(`Overriding slash payload to: ${this.config.slashOverridePayload.toString()}`);
      return Promise.resolve(this.config.slashOverridePayload);
    }

    const currentTimeSeconds = this.dateProvider.now() / 1000;
    this.filterExpiredPayloads(currentTimeSeconds, this.config.slashPayloadTtlSeconds);

    if (this.monitoredPayloads.length === 0) {
      this.log.debug('No monitored payloads, returning undefined');
      return Promise.resolve(undefined);
    }

    const selectedPayload = this.monitoredPayloads[0];
    this.log.info(`Selected slash payload at ${selectedPayload.payloadAddress}`, selectedPayload);

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

  //////////////////// Protected methods ////////////////////

  /**
   * Handler for when a proposal is executed.
   *
   * Removes the first matching payload from the list of monitored payloads.
   *
   * Bound to the slashing proposer contract's listenToProposalExecuted method in `.start()`.
   *
   * @param {round: bigint; proposal: `0x${string}`} param0
   */
  protected proposalExecuted({ round, proposal }: { round: bigint; proposal: `0x${string}` }) {
    this.log.info('Proposal executed', { round, proposal });
    const payload = EthAddress.fromString(proposal);
    // Stop signaling for the override payload if it was executed
    if (this.overridePayloadActive && this.config.slashOverridePayload?.equals(payload)) {
      this.overridePayloadActive = false;
    }

    const index = this.monitoredPayloads.findIndex(p => p.payloadAddress.equals(payload));
    if (index === -1) {
      return;
    }
    this.monitoredPayloads.splice(index, 1);
  }

  //////////////////// Private methods ////////////////////

  /**
   * This is called when a watcher emits WANT_TO_SLASH_EVENT.
   *
   * @param args - the arguments from the watcher, including the validators, amounts, and offenses
   */
  private wantToSlash(args: WantToSlashArgs[]) {
    const sortedArgs = [...args].sort((a, b) => a.validator.toString().localeCompare(b.validator.toString()));
    this.log.info('Wants to slash', sortedArgs);
    this.l1TxUtils
      .sendAndMonitorTransaction({
        to: this.slashFactoryContract.address,
        data: encodeFunctionData({
          abi: SlashFactoryAbi,
          functionName: 'createSlashPayload',
          args: [
            sortedArgs.map(a => a.validator.toString()),
            sortedArgs.map(a => a.amount),
            sortedArgs.map(a => BigInt(a.offense)),
          ],
        }),
      })
      .then(tx => {
        if (tx.receipt.status !== 'success') {
          this.log.error('Slash payload creation failed', tx);
          // TODO
          // this.l1TxUtils.tryGetErrorFromRevertedTx()
          throw new Error('Slash payload creation failed');
        }
        return this.getAddressAndIsDeployed(
          sortedArgs.map(a => a.validator),
          sortedArgs.map(a => a.amount),
        );
      })
      .then(({ address, salt, isDeployed }) => {
        if (!isDeployed) {
          this.log.info('Slash payload not deployed', { address, salt });
          throw new Error('Slash payload not deployed');
        }
        const payload = this.slashPayloadToMonitoredPayload({
          payloadAddress: address.toString(),
          validators: sortedArgs.map(a => a.validator.toString()),
          amounts: sortedArgs.map(a => a.amount),
          offenses: sortedArgs.map(a => BigInt(a.offense)),
        });
        if (!payload) {
          this.log.error('Invalid payload', { address, salt });
          throw new Error('Invalid payload');
        }
        return this.addMonitoredPayload(payload);
      })
      .then(added => {
        if (!added) {
          this.log.warn('Failed to add monitored payload that we created');
        } else {
          this.sortMonitoredPayloads();
          this.log.info('Added monitored payload that we created');
        }
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
  private watchSlashFactoryEvents(): () => void {
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
      const payload = this.slashPayloadToMonitoredPayload(event.args);
      if (!payload) {
        continue;
      }
      yield payload;
    }
  }

  private slashPayloadToMonitoredPayload(
    payload: GetContractEventsReturnType<typeof SlashFactoryAbi, 'SlashPayloadCreated'>[number]['args'],
  ): MonitoredSlashPayload | undefined {
    if (!payload.payloadAddress || !payload.validators || !payload.amounts || !payload.offenses) {
      return undefined;
    }
    return {
      payloadAddress: EthAddress.fromString(payload.payloadAddress),
      validators: payload.validators.map(EthAddress.fromString),
      amounts: payload.amounts,
      offenses: payload.offenses.map(offense => bigIntToOffense(offense)),
      observedAtSeconds: this.dateProvider.now() / 1000,
      totalAmount: payload.amounts.reduce((acc, amount) => acc + amount, BigInt(0)),
    };
  }

  /**
   * Add a payload to the list of monitored payloads if we agree with it
   *
   * @param payload
   */
  private async addMonitoredPayload(payload: MonitoredSlashPayload): Promise<boolean> {
    const duplicate = this.monitoredPayloads.find(p => p.payloadAddress.equals(payload.payloadAddress));
    if (duplicate) {
      this.log.verbose('Duplicate payload. Not adding to monitored payloads', payload);
      return false;
    }
    if (await this.doIAgreeWithPayload(payload)) {
      this.log.info('Adding monitored payload', payload);
      this.monitoredPayloads.push(payload);
      return true;
    } else {
      this.log.info('Disagree with payload. Not adding to monitored payloads', payload);
      return false;
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
        this.watchers.map(watcher => watcher.shouldSlash(offenseAndValidator)),
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
    this.monitoredPayloads.sort((a, b) => {
      const diff = b.totalAmount - a.totalAmount;
      return diff > 0n ? 1 : -1;
    });
  }

  /**
   * Filter out payloads that have expired
   *
   * @param currentTimeSeconds
   * @param payloadTtlSeconds
   */
  private filterExpiredPayloads(currentTimeSeconds: number, payloadTtlSeconds: number) {
    this.monitoredPayloads = this.monitoredPayloads.filter(payload => {
      return payload.observedAtSeconds + payloadTtlSeconds > currentTimeSeconds;
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
    const reached = await this.slashingProposer.waitForRound(
      nextRound,
      this.config.slashProposerRoundPollingIntervalSeconds,
    );
    if (!reached) {
      this.log.warn('Round not reached', { proposal, round });
      return;
    }
    this.log.info('Executing round', { proposal, round });

    await this.slashingProposer
      .executeRound(this.l1TxUtils, round)
      .then(({ receipt }) => {
        this.log.info('Round executed', { round, receipt });
      })
      .catch(err => {
        if (err instanceof ProposalAlreadyExecutedError) {
          this.log.debug('Round already executed', { round });
          return;
        } else {
          this.log.warn('Error executing round', err);
        }
      });
  }

  private async getAddressAndIsDeployed(
    validators: EthAddress[],
    amounts: bigint[],
  ): Promise<{ address: EthAddress; salt: Hex; isDeployed: boolean }> {
    const [address, salt, isDeployed] = await this.slashFactoryContract.read.getAddressAndIsDeployed([
      validators.map(v => v.toString()),
      amounts,
    ]);
    return { address: EthAddress.fromString(address), salt, isDeployed };
  }
}

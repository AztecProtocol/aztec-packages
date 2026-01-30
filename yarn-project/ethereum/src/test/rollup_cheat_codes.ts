import { OutboxContract, RollupContract } from '@aztec/ethereum/contracts';
import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import type { DateProvider } from '@aztec/foundation/timer';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';

import {
  type GetContractReturnType,
  type Hex,
  createPublicClient,
  fallback,
  getContract,
  hexToBigInt,
  http,
} from 'viem';

import { EthCheatCodes } from './eth_cheat_codes.js';

/** Cheat codes for the L1 rollup contract. */
export class RollupCheatCodes {
  private client: ViemPublicClient;
  private rollup: GetContractReturnType<typeof RollupAbi, ViemPublicClient>;

  private logger = createLogger('aztecjs:cheat_codes');

  constructor(
    private ethCheatCodes: EthCheatCodes,
    addresses: Pick<L1ContractAddresses, 'rollupAddress'>,
  ) {
    this.client = createPublicClient({
      chain: ethCheatCodes.chain,
      transport: fallback(ethCheatCodes.rpcUrls.map(url => http(url, { batch: false }))),
    });
    this.rollup = getContract({
      abi: RollupAbi,
      address: addresses.rollupAddress.toString(),
      client: this.client,
    });
  }

  static create(
    rpcUrls: string[],
    addresses: Pick<L1ContractAddresses, 'rollupAddress'>,
    dateProvider: DateProvider,
  ): RollupCheatCodes {
    const ethCheatCodes = new EthCheatCodes(rpcUrls, dateProvider);
    return new RollupCheatCodes(ethCheatCodes, addresses);
  }

  /** Returns the current slot */
  public async getSlot(): Promise<SlotNumber> {
    const ts = BigInt((await this.client.getBlock()).timestamp);
    return SlotNumber.fromBigInt(await this.rollup.read.getSlotAt([ts]));
  }

  /** Returns the number of seconds until the start of the given slot based on L1 block timestamp. */
  public async getSecondsUntilSlot(slot: SlotNumber): Promise<number> {
    const [currentTimestamp, targetTimestamp] = await Promise.all([
      this.client.getBlock().then(b => BigInt(b.timestamp)),
      this.rollup.read.getTimestampForSlot([BigInt(slot)]),
    ]);
    return Math.max(0, Number(targetTimestamp - currentTimestamp));
  }

  /** Returns the current epoch */
  public async getEpoch(): Promise<EpochNumber> {
    const slotNumber = await this.getSlot();
    return EpochNumber.fromBigInt(await this.rollup.read.getEpochAtSlot([BigInt(slotNumber)]));
  }

  /**
   * Returns the pending and proven chain tips
   * @returns The pending and proven chain tips
   */
  public async getTips(): Promise<{
    /** The pending chain tip */ pending: CheckpointNumber;
    /** The proven chain tip */ proven: CheckpointNumber;
  }> {
    const { pending, proven } = await this.rollup.read.getTips();
    return {
      pending: CheckpointNumber.fromBigInt(pending),
      proven: CheckpointNumber.fromBigInt(proven),
    };
  }

  /**
   * Logs the current state of the rollup contract.
   */
  public async debugRollup() {
    const rollup = new RollupContract(this.client, this.rollup.address);
    const pendingNum = await rollup.getCheckpointNumber();
    const provenNum = await rollup.getProvenCheckpointNumber();
    const validators = await rollup.getAttesters();
    const committee = await rollup.getCurrentEpochCommittee();
    const archive = await rollup.archive();
    const slot = await this.getSlot();
    const epochNum = await rollup.getEpochNumberForSlotNumber(slot);

    this.logger.info(`Pending checkpoint num: ${pendingNum}`);
    this.logger.info(`Proven checkpoint num: ${provenNum}`);
    this.logger.info(`Validators: ${validators.map(v => v.toString()).join(', ')}`);
    this.logger.info(`Committee: ${committee?.map(v => v.toString()).join(', ')}`);
    this.logger.info(`Archive: ${archive}`);
    this.logger.info(`Epoch num: ${epochNum}`);
    this.logger.info(`Slot: ${slot}`);
  }

  /** Fetches the epoch and slot duration config from the rollup contract */
  public async getConfig(): Promise<{
    /** Epoch duration */ epochDuration: bigint;
    /** Slot duration */ slotDuration: number;
  }> {
    const [epochDuration, slotDuration] = await Promise.all([
      this.rollup.read.getEpochDuration(),
      this.rollup.read.getSlotDuration(),
    ]);
    return { epochDuration, slotDuration: Number(slotDuration) };
  }

  /**
   * Advances time to the beginning of the given epoch
   * @param epoch - The epoch to advance to
   * @param opts - Options
   */
  public async advanceToEpoch(
    epoch: EpochNumber,
    opts: {
      /** Offset in seconds */
      offset?: number;
    } = {},
  ) {
    const { epochDuration: slotsInEpoch } = await this.getConfig();
    const slotNumber = SlotNumber(Number(epoch) * Number(slotsInEpoch));
    const timestamp = (await this.rollup.read.getTimestampForSlot([BigInt(slotNumber)])) + BigInt(opts.offset ?? 0);
    try {
      await this.ethCheatCodes.warp(Number(timestamp), { ...opts, silent: true, resetBlockInterval: true });
      this.logger.warn(`Warped to epoch ${epoch}`, { offset: opts.offset, timestamp });
    } catch (err) {
      this.logger.warn(`Warp to epoch ${epoch} failed: ${err}`);
    }
    return timestamp;
  }

  /** Warps time in L1 until the next epoch */
  public async advanceToNextEpoch() {
    const slot = await this.getSlot();
    const { epochDuration, slotDuration } = await this.getConfig();
    const slotsUntilNextEpoch = epochDuration - (BigInt(slot) % epochDuration) + 1n;
    const timeToNextEpoch = slotsUntilNextEpoch * BigInt(slotDuration);
    const l1Timestamp = BigInt((await this.client.getBlock()).timestamp);
    await this.ethCheatCodes.warp(Number(l1Timestamp + timeToNextEpoch), {
      silent: true,
      resetBlockInterval: true,
    });
    this.logger.warn(`Advanced to next epoch`);
  }

  /** Warps time in L1 until the beginning of the next slot. */
  public async advanceToNextSlot() {
    const currentSlot = await this.getSlot();
    const nextSlot = SlotNumber(currentSlot + 1);
    const timestamp = await this.rollup.read.getTimestampForSlot([BigInt(nextSlot)]);
    await this.ethCheatCodes.warp(Number(timestamp), { silent: true, resetBlockInterval: true });
    this.logger.warn(`Advanced to slot ${nextSlot}`);
    return [timestamp, nextSlot];
  }

  /**
   * Warps time in L1 equivalent to however many slots.
   * @param howMany - The number of slots to advance.
   */
  public async advanceSlots(howMany: number) {
    const l1Timestamp = (await this.client.getBlock()).timestamp;
    const slotDuration = Number(await this.rollup.read.getSlotDuration());
    const timeToWarp = BigInt(howMany) * BigInt(slotDuration);
    await this.ethCheatCodes.warp(l1Timestamp + timeToWarp, { silent: true, resetBlockInterval: true });
    const [slot, epoch] = await Promise.all([this.getSlot(), this.getEpoch()]);
    this.logger.warn(`Advanced ${howMany} slots up to slot ${slot} in epoch ${epoch}`);
  }

  /**
   * Marks the specified checkpoint (or latest if none) as proven
   * @param maybeCheckpointNumber - The checkpoint number to mark as proven (defaults to latest pending)
   */
  public markAsProven(maybeCheckpointNumber?: CheckpointNumber) {
    return this.ethCheatCodes.execWithPausedAnvil(async () => {
      const tipsBefore = await this.getTips();
      const { pending, proven } = tipsBefore;

      let checkpointNumber = maybeCheckpointNumber;
      if (checkpointNumber === undefined || checkpointNumber > pending) {
        checkpointNumber = pending;
      }
      if (checkpointNumber <= proven) {
        this.logger.debug(`Checkpoint ${checkpointNumber} is already proven`);
        return;
      }

      // @note @LHerskind this is heavily dependent on the storage layout and size of values
      // The rollupStore is a struct and if the size of elements or the struct changes, this can break
      const provenCheckpointNumberSlot = hexToBigInt(RollupContract.stfStorageSlot);

      // Need to pack it as a single 32 byte word
      const newValue = (BigInt(tipsBefore.pending) << 128n) | BigInt(checkpointNumber);
      await this.ethCheatCodes.store(EthAddress.fromString(this.rollup.address), provenCheckpointNumberSlot, newValue);

      const tipsAfter = await this.getTips();
      if (tipsAfter.pending < tipsAfter.proven) {
        throw new Error('Overwrote pending tip to a checkpoint in the past');
      }

      this.logger.info(
        `Proven tip moved: ${tipsBefore.proven} -> ${tipsAfter.proven}. Pending tip: ${tipsAfter.pending}.`,
      );
    });
  }

  /**
   * Overrides the inProgress field of the Inbox contract state
   * @param howMuch - How many checkpoints to move it forward
   */
  public advanceInboxInProgress(howMuch: number | bigint): Promise<bigint> {
    return this.ethCheatCodes.execWithPausedAnvil(async () => {
      // Storage slot 2 contains the InboxState struct
      const inboxStateSlot = 2n;

      // Get inbox and its current state values
      const inboxAddress = await this.rollup.read.getInbox();
      const currentStateValue = await this.ethCheatCodes.load(EthAddress.fromString(inboxAddress), inboxStateSlot);

      // Extract current values from the packed storage slot
      // Storage layout: rollingHash (128 bits) | totalMessagesInserted (64 bits) | inProgress (64 bits)
      const currentRollingHash = currentStateValue & ((1n << 128n) - 1n);
      const currentTotalMessages = (currentStateValue >> 128n) & ((1n << 64n) - 1n);
      const currentInProgress = currentStateValue >> 192n;
      const newInProgress = currentInProgress + BigInt(howMuch);

      // Pack new values: rollingHash (low 128 bits) | totalMessages (middle 64 bits) | inProgress (high 64 bits)
      const newValue = (BigInt(newInProgress) << 192n) | (currentTotalMessages << 128n) | currentRollingHash;

      await this.ethCheatCodes.store(EthAddress.fromString(inboxAddress), inboxStateSlot, newValue, {
        silent: true,
      });

      this.logger.warn(`Inbox inProgress advanced from ${currentInProgress} to ${newInProgress}`, {
        inbox: inboxAddress,
        oldValue: '0x' + currentStateValue.toString(16),
        newValue: '0x' + newValue.toString(16),
        rollingHash: currentRollingHash,
        totalMessages: currentTotalMessages,
        oldInProgress: currentInProgress,
        newInProgress,
      });

      return newInProgress;
    });
  }

  public insertOutbox(epoch: EpochNumber, outHash: bigint) {
    return this.ethCheatCodes.execWithPausedAnvil(async () => {
      const outboxAddress = await this.rollup.read.getOutbox();
      const epochRootSlot = OutboxContract.getEpochRootStorageSlot(epoch);
      await this.ethCheatCodes.store(EthAddress.fromString(outboxAddress), epochRootSlot, outHash);
      this.logger.warn(`Advanced outbox to epoch ${epoch} with out hash ${outHash}`);
    });
  }

  /**
   * Executes an action impersonated as the owner of the Rollup contract.
   * @param action - The action to execute
   */
  public async asOwner(
    action: (owner: Hex, rollup: GetContractReturnType<typeof RollupAbi, ViemPublicClient>) => Promise<void>,
  ) {
    const owner = await this.rollup.read.owner();
    await this.ethCheatCodes.startImpersonating(owner);
    await action(owner, this.rollup);
    await this.ethCheatCodes.stopImpersonating(owner);
  }

  /**
   * Sets up the epoch.
   */
  public async setupEpoch() {
    // Doesn't need to be done as owner, but the functionality is here...
    await this.asOwner(async (account, rollup) => {
      const hash = await rollup.write.setupEpoch({ account });
      await this.client.waitForTransactionReceipt({ hash });
      this.logger.warn(`Setup epoch`);
    });
  }

  /** Directly calls the L1 gas fee oracle. */
  public async updateL1GasFeeOracle() {
    await this.asOwner(async (account, rollup) => {
      const hash = await rollup.write.updateL1GasFeeOracle({ account, chain: this.client.chain });
      await this.client.waitForTransactionReceipt({ hash });
      this.logger.warn(`Updated L1 gas fee oracle`);
    });
  }

  /**
   * Bumps proving cost per mana.
   * @param bumper - Callback to calculate the new proving cost per mana based on current value.
   */
  public async bumpProvingCostPerMana(bumper: (before: bigint) => bigint) {
    const currentCost = await this.rollup.read.getProvingCostPerManaInEth();
    const newCost = bumper(currentCost);
    await this.setProvingCostPerMana(newCost);
  }

  /**
   * Directly updates proving cost per mana.
   * @param ethValue - The new proving cost per mana in ETH
   */
  public async setProvingCostPerMana(ethValue: bigint) {
    await this.asOwner(async (account, rollup) => {
      const hash = await rollup.write.setProvingCostPerMana([ethValue], {
        account,
        chain: this.client.chain,
        gasLimit: 1000000n,
      });
      await this.client.waitForTransactionReceipt({ hash });
      this.logger.warn(`Updated proving cost per mana to ${ethValue}`);
    });
  }
}

import type { ViemPublicClient } from '@aztec/ethereum';
import { EthCheatCodes } from '@aztec/ethereum/eth-cheatcodes';
import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { RollupAbi } from '@aztec/l1-artifacts';

import { type GetContractReturnType, type Hex, createPublicClient, fallback, getContract, http, keccak256 } from 'viem';
import { foundry } from 'viem/chains';

export { EthCheatCodes };

/** Cheat codes for the L1 rollup contract. */
export class RollupCheatCodes {
  private client: ViemPublicClient;
  private rollup: GetContractReturnType<typeof RollupAbi, ViemPublicClient>;

  private logger = createLogger('aztecjs:cheat_codes');

  constructor(private ethCheatCodes: EthCheatCodes, addresses: Pick<L1ContractAddresses, 'rollupAddress'>) {
    this.client = createPublicClient({
      chain: foundry,
      transport: fallback(ethCheatCodes.rpcUrls.map(url => http(url))),
    });
    this.rollup = getContract({
      abi: RollupAbi,
      address: addresses.rollupAddress.toString(),
      client: this.client,
    });
  }

  /** Returns the current slot */
  public async getSlot() {
    const ts = BigInt((await this.client.getBlock()).timestamp);
    return await this.rollup.read.getSlotAt([ts]);
  }

  /** Returns the current epoch */
  public async getEpoch() {
    const slotNumber = await this.getSlot();
    return await this.rollup.read.getEpochAtSlot([slotNumber]);
  }

  /**
   * Returns the pending and proven chain tips
   * @returns The pending and proven chain tips
   */
  public async getTips(): Promise<{
    /** The pending chain tip */ pending: bigint;
    /** The proven chain tip */ proven: bigint;
  }> {
    const res = await this.rollup.read.getTips();
    return {
      pending: res.pendingBlockNumber,
      proven: res.provenBlockNumber,
    };
  }

  /** Fetches the epoch and slot duration config from the rollup contract */
  public async getConfig(): Promise<{
    /** Epoch duration */ epochDuration: bigint;
    /** Slot duration */ slotDuration: bigint;
  }> {
    const [epochDuration, slotDuration] = await Promise.all([
      this.rollup.read.getEpochDuration(),
      this.rollup.read.getSlotDuration(),
    ]);
    return { epochDuration, slotDuration };
  }

  /** Warps time in L1 until the next epoch */
  public async advanceToNextEpoch() {
    const slot = await this.getSlot();
    const { epochDuration, slotDuration } = await this.getConfig();
    const slotsUntilNextEpoch = epochDuration - (slot % epochDuration) + 1n;
    const timeToNextEpoch = slotsUntilNextEpoch * slotDuration;
    const l1Timestamp = BigInt((await this.client.getBlock()).timestamp);
    await this.ethCheatCodes.warp(Number(l1Timestamp + timeToNextEpoch), true);
    this.logger.warn(`Advanced to next epoch`);
  }

  /** Warps time in L1 until the beginning of the next slot. */
  public async advanceToNextSlot() {
    const currentSlot = await this.getSlot();
    const timestamp = await this.rollup.read.getTimestampForSlot([currentSlot + 1n]);
    await this.ethCheatCodes.warp(Number(timestamp));
    this.logger.warn(`Advanced to slot ${currentSlot + 1n}`);
    return [timestamp, currentSlot + 1n];
  }

  /**
   * Warps time in L1 equivalent to however many slots.
   * @param howMany - The number of slots to advance.
   */
  public async advanceSlots(howMany: number) {
    const l1Timestamp = (await this.client.getBlock()).timestamp;
    const slotDuration = await this.rollup.read.getSlotDuration();
    const timeToWarp = BigInt(howMany) * slotDuration;
    await this.ethCheatCodes.warp(l1Timestamp + timeToWarp, true);
    const [slot, epoch] = await Promise.all([this.getSlot(), this.getEpoch()]);
    this.logger.warn(`Advanced ${howMany} slots up to slot ${slot} in epoch ${epoch}`);
  }

  /**
   * Marks the specified block (or latest if none) as proven
   * @param maybeBlockNumber - The block number to mark as proven (defaults to latest pending)
   */
  public async markAsProven(maybeBlockNumber?: number | bigint) {
    const { pending, proven } = await this.getTips();

    let blockNumber = maybeBlockNumber;
    if (blockNumber === undefined || blockNumber > pending) {
      blockNumber = pending;
    }
    if (blockNumber <= proven) {
      this.logger.warn(`Block ${blockNumber} is already proven`);
      return;
    }

    // @note @LHerskind this is heavily dependent on the storage layout and size of values
    // The rollupStore is a struct and if the size of elements or the struct changes, this can break

    // Convert string to bytes and then compute keccak256
    const storageSlot = keccak256(Buffer.from('aztec.stf.storage', 'utf-8'));
    const provenBlockNumberSlot = BigInt(storageSlot) + 1n;

    const tipsBefore = await this.getTips();

    await this.ethCheatCodes.store(
      EthAddress.fromString(this.rollup.address),
      provenBlockNumberSlot,
      BigInt(blockNumber),
    );

    const tipsAfter = await this.getTips();
    this.logger.info(
      `Proven tip moved: ${tipsBefore.proven} -> ${tipsAfter.proven}. Pending tip: ${tipsAfter.pending}.`,
    );
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
      const hash = await rollup.write.setProvingCostPerMana([ethValue], { account, chain: this.client.chain });
      await this.client.waitForTransactionReceipt({ hash });
      this.logger.warn(`Updated proving cost per mana to ${ethValue}`);
    });
  }
}

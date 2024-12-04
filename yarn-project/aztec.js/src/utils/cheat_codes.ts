import { type EpochProofClaim, type Note, type PXE } from '@aztec/circuit-types';
import { type AztecAddress, EthAddress, Fr } from '@aztec/circuits.js';
import { deriveStorageSlotInMap } from '@aztec/circuits.js/hash';
import { EthCheatCodes, type L1ContractAddresses } from '@aztec/ethereum';
import { createDebugLogger } from '@aztec/foundation/log';
import { RollupAbi } from '@aztec/l1-artifacts';

import {
  type GetContractReturnType,
  type Hex,
  type PublicClient,
  type WalletClient,
  createWalletClient,
  getContract,
  http,
  publicActions,
} from 'viem';
import { foundry } from 'viem/chains';

/**
 * A class that provides utility functions for interacting with the chain.
 */
export class CheatCodes {
  constructor(
    /** Cheat codes for L1.*/
    public eth: EthCheatCodes,
    /** Cheat codes for Aztec L2. */
    public aztec: AztecCheatCodes,
    /** Cheat codes for the Aztec Rollup contract on L1. */
    public rollup: RollupCheatCodes,
  ) {}

  static async create(rpcUrl: string, pxe: PXE): Promise<CheatCodes> {
    const ethCheatCodes = new EthCheatCodes(rpcUrl);
    const aztecCheatCodes = new AztecCheatCodes(pxe, ethCheatCodes);
    const rollupCheatCodes = new RollupCheatCodes(
      ethCheatCodes,
      await pxe.getNodeInfo().then(n => n.l1ContractAddresses),
    );
    return new CheatCodes(ethCheatCodes, aztecCheatCodes, rollupCheatCodes);
  }

  static createRollup(rpcUrl: string, addresses: Pick<L1ContractAddresses, 'rollupAddress'>): RollupCheatCodes {
    const ethCheatCodes = new EthCheatCodes(rpcUrl);
    return new RollupCheatCodes(ethCheatCodes, addresses);
  }
}

/** Cheat codes for the L1 rollup contract. */
export class RollupCheatCodes {
  private client: WalletClient & PublicClient;
  private rollup: GetContractReturnType<typeof RollupAbi, WalletClient>;

  private logger = createDebugLogger('aztec:js:cheat_codes');

  constructor(private ethCheatCodes: EthCheatCodes, addresses: Pick<L1ContractAddresses, 'rollupAddress'>) {
    this.client = createWalletClient({ chain: foundry, transport: http(ethCheatCodes.rpcUrl) }).extend(publicActions);
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
      this.rollup.read.EPOCH_DURATION(),
      this.rollup.read.SLOT_DURATION(),
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
    await this.ethCheatCodes.warp(Number(l1Timestamp + timeToNextEpoch));
    this.logger.verbose(`Advanced to next epoch`);
  }

  /**
   * Warps time in L1 equivalent to however many slots.
   * @param howMany - The number of slots to advance.
   */
  public async advanceSlots(howMany: number) {
    const l1Timestamp = (await this.client.getBlock()).timestamp;
    const slotDuration = await this.rollup.read.SLOT_DURATION();
    const timeToWarp = BigInt(howMany) * slotDuration;
    await this.ethCheatCodes.warp(l1Timestamp + timeToWarp);
    const [slot, epoch] = await Promise.all([this.getSlot(), this.getEpoch()]);
    this.logger.verbose(`Advanced ${howMany} slots up to slot ${slot} in epoch ${epoch}`);
  }

  /** Returns the current proof claim (if any) */
  public async getProofClaim(): Promise<EpochProofClaim | undefined> {
    // REFACTOR: This code is duplicated from l1-publisher
    const {
      epochToProve,
      basisPointFee,
      bondAmount,
      bondProvider: bondProviderHex,
      proposerClaimant: proposerClaimantHex,
    } = await this.rollup.read.getProofClaim();

    const bondProvider = EthAddress.fromString(bondProviderHex);
    const proposerClaimant = EthAddress.fromString(proposerClaimantHex);

    if (bondProvider.isZero() && proposerClaimant.isZero() && epochToProve === 0n) {
      return undefined;
    }

    return {
      epochToProve,
      basisPointFee,
      bondAmount,
      bondProvider,
      proposerClaimant,
    };
  }

  /**
   * Marks the specified block (or latest if none) as proven
   * @param maybeBlockNumber - The block number to mark as proven (defaults to latest pending)
   */
  public async markAsProven(maybeBlockNumber?: number | bigint) {
    const blockNumber = maybeBlockNumber
      ? BigInt(maybeBlockNumber)
      : await this.rollup.read.getTips().then(({ pendingBlockNumber }) => pendingBlockNumber);

    await this.asOwner(async account => {
      await this.rollup.write.setAssumeProvenThroughBlockNumber([blockNumber], { account, chain: this.client.chain });
      this.logger.verbose(`Marked ${blockNumber} as proven`);
    });
  }

  /**
   * Executes an action impersonated as the owner of the Rollup contract.
   * @param action - The action to execute
   */
  public async asOwner(
    action: (owner: Hex, rollup: GetContractReturnType<typeof RollupAbi, WalletClient>) => Promise<void>,
  ) {
    const owner = await this.rollup.read.owner();
    await this.ethCheatCodes.startImpersonating(owner);
    await action(owner, this.rollup);
    await this.ethCheatCodes.stopImpersonating(owner);
  }
}

/**
 * A class that provides utility functions for interacting with the aztec chain.
 */
export class AztecCheatCodes {
  constructor(
    /**
     * The PXE Service to use for interacting with the chain
     */
    public pxe: PXE,
    /**
     * The eth cheat codes.
     */
    public eth: EthCheatCodes,
    /**
     * The logger to use for the aztec cheatcodes
     */
    public logger = createDebugLogger('aztec:cheat_codes:aztec'),
  ) {}

  /**
   * Computes the slot value for a given map and key.
   * @param mapSlot - The slot of the map (specified in Aztec.nr contract)
   * @param key - The key to lookup in the map
   * @returns The storage slot of the value in the map
   */
  public computeSlotInMap(mapSlot: Fr | bigint, key: Fr | bigint | AztecAddress): Fr {
    const keyFr = typeof key === 'bigint' ? new Fr(key) : key.toField();
    return deriveStorageSlotInMap(mapSlot, keyFr);
  }

  /**
   * Get the current blocknumber
   * @returns The current block number
   */
  public async blockNumber(): Promise<number> {
    return await this.pxe.getBlockNumber();
  }

  /**
   * Get the current timestamp
   * @returns The current timestamp
   */
  public async timestamp(): Promise<number> {
    const res = await this.pxe.getBlock(await this.blockNumber());
    return res?.header.globalVariables.timestamp.toNumber() ?? 0;
  }

  /**
   * Loads the value stored at the given slot in the public storage of the given contract.
   * @param who - The address of the contract
   * @param slot - The storage slot to lookup
   * @returns The value stored at the given slot
   */
  public async loadPublic(who: AztecAddress, slot: Fr | bigint): Promise<Fr> {
    const storageValue = await this.pxe.getPublicStorageAt(who, new Fr(slot));
    return storageValue;
  }

  /**
   * Loads the value stored at the given slot in the private storage of the given contract.
   * @param contract - The address of the contract
   * @param owner - The owner for whom the notes are encrypted
   * @param slot - The storage slot to lookup
   * @returns The notes stored at the given slot
   */
  public async loadPrivate(owner: AztecAddress, contract: AztecAddress, slot: Fr | bigint): Promise<Note[]> {
    const extendedNotes = await this.pxe.getIncomingNotes({
      owner,
      contractAddress: contract,
      storageSlot: new Fr(slot),
    });
    return extendedNotes.map(extendedNote => extendedNote.note);
  }
}

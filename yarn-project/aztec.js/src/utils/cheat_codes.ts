import { type EpochProofClaim, type Note, type PXE } from '@aztec/circuit-types';
import { AZTEC_EPOCH_DURATION, AZTEC_SLOT_DURATION, type AztecAddress, EthAddress, Fr } from '@aztec/circuits.js';
import { deriveStorageSlotInMap } from '@aztec/circuits.js/hash';
import { type L1ContractAddresses } from '@aztec/ethereum';
import { toBigIntBE, toHex } from '@aztec/foundation/bigint-buffer';
import { keccak256 } from '@aztec/foundation/crypto';
import { createDebugLogger } from '@aztec/foundation/log';
import { RollupAbi } from '@aztec/l1-artifacts';

import fs from 'fs';
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

/**
 * A class that provides utility functions for interacting with ethereum (L1).
 */
export class EthCheatCodes {
  constructor(
    /**
     * The RPC URL to use for interacting with the chain
     */
    public rpcUrl: string,
    /**
     * The logger to use for the eth cheatcodes
     */
    public logger = createDebugLogger('aztec:cheat_codes:eth'),
  ) {}

  async rpcCall(method: string, params: any[]) {
    const paramsString = JSON.stringify(params);
    const content = {
      body: `{"jsonrpc":"2.0", "method": "${method}", "params": ${paramsString}, "id": 1}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    };
    return await (await fetch(this.rpcUrl, content)).json();
  }

  /**
   * Get the auto mine status of the underlying chain
   * @returns True if automine is on, false otherwise
   */
  public async isAutoMining(): Promise<boolean> {
    try {
      const res = await this.rpcCall('anvil_getAutomine', []);
      return res.result;
    } catch (err) {
      this.logger.error(`Calling "anvil_getAutomine" failed with:`, err);
    }
    return false;
  }

  /**
   * Get the current blocknumber
   * @returns The current block number
   */
  public async blockNumber(): Promise<number> {
    const res = await this.rpcCall('eth_blockNumber', []);
    return parseInt(res.result, 16);
  }

  /**
   * Get the current chainId
   * @returns The current chainId
   */
  public async chainId(): Promise<number> {
    const res = await this.rpcCall('eth_chainId', []);
    return parseInt(res.result, 16);
  }

  /**
   * Get the current timestamp
   * @returns The current timestamp
   */
  public async timestamp(): Promise<number> {
    const res = await this.rpcCall('eth_getBlockByNumber', ['latest', true]);
    return parseInt(res.result.timestamp, 16);
  }

  /**
   * Advance the chain by a number of blocks
   * @param numberOfBlocks - The number of blocks to mine
   * @returns The current chainId
   */
  public async mine(numberOfBlocks = 1): Promise<void> {
    const res = await this.rpcCall('hardhat_mine', [numberOfBlocks]);
    if (res.error) {
      throw new Error(`Error mining: ${res.error.message}`);
    }
    this.logger.verbose(`Mined ${numberOfBlocks} L1 blocks`);
  }

  /**
   * Set the balance of an account
   * @param account - The account to set the balance for
   * @param balance - The balance to set
   */
  public async setBalance(account: EthAddress, balance: bigint): Promise<void> {
    const res = await this.rpcCall('anvil_setBalance', [account.toString(), toHex(balance)]);
    if (res.error) {
      throw new Error(`Error setting balance for ${account}: ${res.error.message}`);
    }
    this.logger.verbose(`Set balance for ${account} to ${balance}`);
  }

  /**
   * Set the interval between blocks (block time)
   * @param interval - The interval to use between blocks
   */
  public async setBlockInterval(interval: number): Promise<void> {
    const res = await this.rpcCall('anvil_setBlockTimestampInterval', [interval]);
    if (res.error) {
      throw new Error(`Error setting block interval: ${res.error.message}`);
    }
    this.logger.verbose(`Set L1 block interval to ${interval}`);
  }

  /**
   * Set the next block timestamp
   * @param timestamp - The timestamp to set the next block to
   */
  public async setNextBlockTimestamp(timestamp: number): Promise<void> {
    const res = await this.rpcCall('evm_setNextBlockTimestamp', [timestamp]);
    if (res.error) {
      throw new Error(`Error setting next block timestamp: ${res.error.message}`);
    }
    this.logger.verbose(`Set L1 next block timestamp to ${timestamp}`);
  }

  /**
   * Set the next block timestamp and mines the block
   * @param timestamp - The timestamp to set the next block to
   */
  public async warp(timestamp: number): Promise<void> {
    const res = await this.rpcCall('evm_setNextBlockTimestamp', [timestamp]);
    if (res.error) {
      throw new Error(`Error warping: ${res.error.message}`);
    }
    await this.mine();
    this.logger.verbose(`Warped L1 timestamp to ${timestamp}`);
  }

  /**
   * Dumps the current chain state to a file.
   * @param fileName - The file name to dump state into
   */
  public async dumpChainState(fileName: string): Promise<void> {
    const res = await this.rpcCall('hardhat_dumpState', []);
    if (res.error) {
      throw new Error(`Error dumping state: ${res.error.message}`);
    }
    const jsonContent = JSON.stringify(res.result);
    fs.writeFileSync(`${fileName}.json`, jsonContent, 'utf8');
    this.logger.verbose(`Dumped state to ${fileName}`);
  }

  /**
   * Loads the chain state from a file.
   * @param fileName - The file name to load state from
   */
  public async loadChainState(fileName: string): Promise<void> {
    const data = JSON.parse(fs.readFileSync(`${fileName}.json`, 'utf8'));
    const res = await this.rpcCall('hardhat_loadState', [data]);
    if (res.error) {
      throw new Error(`Error loading state: ${res.error.message}`);
    }
    this.logger.verbose(`Loaded state from ${fileName}`);
  }

  /**
   * Load the value at a storage slot of a contract address on eth
   * @param contract - The contract address
   * @param slot - The storage slot
   * @returns - The value at the storage slot
   */
  public async load(contract: EthAddress, slot: bigint): Promise<bigint> {
    const res = await this.rpcCall('eth_getStorageAt', [contract.toString(), toHex(slot), 'latest']);
    return BigInt(res.result);
  }

  /**
   * Set the value at a storage slot of a contract address on eth
   * @param contract - The contract address
   * @param slot - The storage slot
   * @param value - The value to set the storage slot to
   */
  public async store(contract: EthAddress, slot: bigint, value: bigint): Promise<void> {
    // for the rpc call, we need to change value to be a 32 byte hex string.
    const res = await this.rpcCall('hardhat_setStorageAt', [contract.toString(), toHex(slot), toHex(value, true)]);
    if (res.error) {
      throw new Error(`Error setting storage for contract ${contract} at ${slot}: ${res.error.message}`);
    }
    this.logger.verbose(`Set L1 storage for contract ${contract} at ${slot} to ${value}`);
  }

  /**
   * Computes the slot value for a given map and key.
   * @param baseSlot - The base slot of the map (specified in Aztec.nr contract)
   * @param key - The key to lookup in the map
   * @returns The storage slot of the value in the map
   */
  public keccak256(baseSlot: bigint, key: bigint): bigint {
    // abi encode (removing the 0x) - concat key and baseSlot (both padded to 32 bytes)
    const abiEncoded = toHex(key, true).substring(2) + toHex(baseSlot, true).substring(2);
    return toBigIntBE(keccak256(Buffer.from(abiEncoded, 'hex')));
  }

  /**
   * Send transactions impersonating an externally owned account or contract.
   * @param who - The address to impersonate
   */
  public async startImpersonating(who: EthAddress | Hex): Promise<void> {
    const res = await this.rpcCall('hardhat_impersonateAccount', [who.toString()]);
    if (res.error) {
      throw new Error(`Error impersonating ${who}: ${res.error.message}`);
    }
    this.logger.verbose(`Impersonating ${who}`);
  }

  /**
   * Stop impersonating an account that you are currently impersonating.
   * @param who - The address to stop impersonating
   */
  public async stopImpersonating(who: EthAddress | Hex): Promise<void> {
    const res = await this.rpcCall('hardhat_stopImpersonatingAccount', [who.toString()]);
    if (res.error) {
      throw new Error(`Error when stopping the impersonation of ${who}: ${res.error.message}`);
    }
    this.logger.verbose(`Stopped impersonating ${who}`);
  }

  /**
   * Set the bytecode for a contract
   * @param contract - The contract address
   * @param bytecode - The bytecode to set
   */
  public async etch(contract: EthAddress, bytecode: `0x${string}`): Promise<void> {
    const res = await this.rpcCall('hardhat_setCode', [contract.toString(), bytecode]);
    if (res.error) {
      throw new Error(`Error setting bytecode for ${contract}: ${res.error.message}`);
    }
    this.logger.verbose(`Set bytecode for ${contract} to ${bytecode}`);
  }

  /**
   * Get the bytecode for a contract
   * @param contract - The contract address
   * @returns The bytecode for the contract
   */
  public async getBytecode(contract: EthAddress): Promise<`0x${string}`> {
    const res = await this.rpcCall('eth_getCode', [contract.toString(), 'latest']);
    return res.result;
  }
}

/** Cheat codes for the L1 rollup contract. */
export class RollupCheatCodes {
  private client: WalletClient & PublicClient;
  private rollup: GetContractReturnType<typeof RollupAbi, WalletClient>;

  private logger = createDebugLogger('aztec:js:cheat_codes');

  constructor(private ethCheatCodes: EthCheatCodes, private addresses: Pick<L1ContractAddresses, 'rollupAddress'>) {
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
    /** The pending chain tip */
    pending: bigint;
    /** The proven chain tip */
    proven: bigint;
  }> {
    const [pending, proven] = await this.rollup.read.tips();
    return { pending, proven };
  }

  /** Warps time in L1 until the next epoch */
  public async advanceToNextEpoch() {
    const slot = await this.getSlot();
    const slotsUntilNextEpoch = BigInt(AZTEC_EPOCH_DURATION) - (slot % BigInt(AZTEC_EPOCH_DURATION)) + 1n;
    const timeToNextEpoch = slotsUntilNextEpoch * BigInt(AZTEC_SLOT_DURATION);
    const l1Timestamp = BigInt((await this.client.getBlock()).timestamp);
    await this.ethCheatCodes.warp(Number(l1Timestamp + timeToNextEpoch));
    this.logger.verbose(`Advanced to next epoch`);
  }

  /**
   * Warps time in L1 equivalent to however many slots.
   * @param howMany - The number of slots to advance.
   */
  public async advanceSlots(howMany: number) {
    const l1Timestamp = Number((await this.client.getBlock()).timestamp);
    const timeToWarp = howMany * AZTEC_SLOT_DURATION;
    await this.ethCheatCodes.warp(l1Timestamp + timeToWarp);
    const [slot, epoch] = await Promise.all([this.getSlot(), this.getEpoch()]);
    this.logger.verbose(`Advanced ${howMany} slots up to slot ${slot} in epoch ${epoch}`);
  }

  /** Returns the current proof claim (if any) */
  public async getProofClaim(): Promise<EpochProofClaim | undefined> {
    // REFACTOR: This code is duplicated from l1-publisher
    const [epochToProve, basisPointFee, bondAmount, bondProviderHex, proposerClaimantHex] =
      await this.rollup.read.proofClaim();

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
      : await this.rollup.read.tips().then(([pending]) => pending);

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
    return deriveStorageSlotInMap(mapSlot, new Fr(key));
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

import { toBigIntBE, toHex } from '@aztec/foundation/bigint-buffer';
import { keccak256 } from '@aztec/foundation/crypto';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { createLogger } from '@aztec/foundation/log';
import type { TestDateProvider } from '@aztec/foundation/timer';

import { type Hex, createPublicClient, fallback, http } from 'viem';

import type { ViemPublicClient } from './types.js';

/**
 * A class that provides utility functions for interacting with ethereum (L1).
 */
export class EthCheatCodes {
  private publicClient: ViemPublicClient;
  constructor(
    /**
     * The RPC URL to use for interacting with the chain
     */
    public rpcUrls: string[],
    /**
     * The logger to use for the eth cheatcodes
     */
    public logger = createLogger('ethereum:cheat_codes'),
  ) {
    this.publicClient = createPublicClient({
      transport: fallback(this.rpcUrls.map(url => http(url))),
    });
  }

  async rpcCall(method: string, params: any[]) {
    const paramsString = jsonStringify(params);
    this.logger.debug(`Calling ${method} with params: ${paramsString} on ${this.rpcUrls.join(', ')}`);
    return (await this.publicClient.transport.request({
      method,
      params,
    })) as any;
  }

  /**
   * Get the auto mine status of the underlying chain
   * @returns True if automine is on, false otherwise
   */
  public async isAutoMining(): Promise<boolean> {
    try {
      const res = await this.rpcCall('anvil_getAutomine', []);
      return res;
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
    return parseInt(res, 16);
  }

  /**
   * Get the current chainId
   * @returns The current chainId
   */
  public async chainId(): Promise<number> {
    const res = await this.rpcCall('eth_chainId', []);
    return parseInt(res, 16);
  }

  /**
   * Get the current timestamp
   * @returns The current timestamp
   */
  public async timestamp(): Promise<number> {
    const res = await this.rpcCall('eth_getBlockByNumber', ['latest', true]);
    return parseInt(res.timestamp, 16);
  }

  /**
   * Advance the chain by a number of blocks
   * @param numberOfBlocks - The number of blocks to mine
   */
  public async mine(numberOfBlocks = 1): Promise<void> {
    await this.doMine(numberOfBlocks);
    this.logger.warn(`Mined ${numberOfBlocks} L1 blocks`);
  }

  private async doMine(numberOfBlocks = 1): Promise<void> {
    try {
      await this.rpcCall('hardhat_mine', [numberOfBlocks]);
    } catch (err) {
      throw new Error(`Error mining: ${err}`);
    }
  }

  /**
   * Mines a single block with evm_mine
   */
  public async evmMine(): Promise<void> {
    try {
      await this.rpcCall('evm_mine', []);
    } catch (err) {
      throw new Error(`Error mining: ${err}`);
    }
  }

  /**
   * Set the balance of an account
   * @param account - The account to set the balance for
   * @param balance - The balance to set
   */
  public async setBalance(account: EthAddress, balance: bigint): Promise<void> {
    try {
      await this.rpcCall('anvil_setBalance', [account.toString(), toHex(balance)]);
    } catch (err) {
      throw new Error(`Error setting balance for ${account}: ${err}`);
    }
    this.logger.warn(`Set balance for ${account} to ${balance}`);
  }

  /**
   * Set the interval between successive blocks (block time). This does NOT enable interval mining.
   * @param interval - The interval to use between blocks
   */
  public async setBlockInterval(interval: number): Promise<void> {
    try {
      await this.rpcCall('anvil_setBlockTimestampInterval', [interval]);
    } catch (err) {
      throw new Error(`Error setting block interval: ${err}`);
    }
    this.logger.warn(`Set L1 block interval to ${interval}`);
  }

  /**
   * Set the next block base fee per gas
   * @param baseFee - The base fee to set
   */
  public async setNextBlockBaseFeePerGas(baseFee: bigint | number): Promise<void> {
    try {
      await this.rpcCall('anvil_setNextBlockBaseFeePerGas', [baseFee.toString()]);
    } catch (err) {
      throw new Error(`Error setting next block base fee per gas: ${err}`);
    }
    this.logger.warn(`Set L1 next block base fee per gas to ${baseFee}`);
  }

  /**
   * Get interval mining if set.
   * @param seconds - The interval to use between blocks
   */
  public getIntervalMining(): Promise<number | null> {
    try {
      return this.rpcCall('anvil_getIntervalMining', []);
    } catch (err) {
      throw new Error(`Error getting interval mining: ${err}`);
    }
  }

  /**
   * Enable interval mining at the given interval (block time)
   * @param seconds - The interval to use between blocks
   */
  public async setIntervalMining(seconds: number): Promise<void> {
    try {
      await this.rpcCall('anvil_setIntervalMining', [seconds]);
    } catch (err) {
      throw new Error(`Error setting interval mining: ${err}`);
    }
    this.logger.warn(`Set L1 interval mining to ${seconds} seconds`);
  }

  /**
   * Set the automine status of the underlying anvil chain
   * @param automine - The automine status to set
   */
  public async setAutomine(automine: boolean): Promise<void> {
    try {
      await this.rpcCall('anvil_setAutomine', [automine]);
    } catch (err) {
      throw new Error(`Error setting automine: ${err}`);
    }
    this.logger.warn(`Set L1 automine to ${automine}`);
  }

  /**
   * Drop a transaction from the mempool
   * @param txHash - The transaction hash
   */
  public async dropTransaction(txHash: Hex): Promise<void> {
    try {
      await this.rpcCall('anvil_dropTransaction', [txHash]);
    } catch (err) {
      throw new Error(`Error dropping transaction: ${err}`);
    }
    this.logger.warn(`Dropped transaction ${txHash}`);
  }

  /**
   * Set the next block timestamp
   * @param timestamp - The timestamp to set the next block to
   */
  public async setNextBlockTimestamp(timestamp: number): Promise<void> {
    try {
      await this.rpcCall('evm_setNextBlockTimestamp', [timestamp]);
    } catch (err: any) {
      throw new Error(`Error setting next block timestamp: ${err.message}`);
    }
    this.logger.warn(`Set L1 next block timestamp to ${timestamp}`);
  }

  /**
   * Set the next block timestamp and mines the block.
   * Optionally resets interval mining so the next block is mined in `blockInterval` seconds from now.
   * Optionally updates a provided date provider to follow L1 time.
   * @param timestamp - The timestamp to set the next block to
   */
  public async warp(
    timestamp: number | bigint,
    opts: { silent?: boolean; resetBlockInterval?: boolean; updateDateProvider?: TestDateProvider } = {},
  ): Promise<void> {
    let blockInterval: number | null = null;
    try {
      // Load current block interval and disable it
      if (opts.resetBlockInterval) {
        blockInterval = await this.getIntervalMining();
        if (blockInterval !== null) {
          await this.setIntervalMining(0);
        }
      }
      // Set the timestamp of the next block to be mined
      await this.rpcCall('evm_setNextBlockTimestamp', [Number(timestamp)]);
      // And mine a block so the timestamp goes into effect now
      await this.doMine();
      // Update the date provider if provided so it follows L1 time
      opts.updateDateProvider?.setTime(Number(timestamp) * 1000);
    } catch (err) {
      throw new Error(`Error warping: ${err}`);
    } finally {
      // Restore interval mining so the next block is mined in `blockInterval` seconds from this one
      if (opts.resetBlockInterval && blockInterval !== null && blockInterval > 0) {
        await this.setIntervalMining(blockInterval);
      }
    }
    if (!opts.silent) {
      this.logger.warn(`Warped L1 timestamp to ${timestamp}`);
    }
  }

  /**
   * Load the value at a storage slot of a contract address on eth
   * @param contract - The contract address
   * @param slot - The storage slot
   * @returns - The value at the storage slot
   */
  public async load(contract: EthAddress, slot: bigint): Promise<bigint> {
    const res = await this.rpcCall('eth_getStorageAt', [contract.toString(), toHex(slot), 'latest']);
    return BigInt(res);
  }

  /**
   * Set the value at a storage slot of a contract address on eth
   * @param contract - The contract address
   * @param slot - The storage slot
   * @param value - The value to set the storage slot to
   */
  public async store(contract: EthAddress, slot: bigint, value: bigint): Promise<void> {
    // for the rpc call, we need to change value to be a 32 byte hex string.
    try {
      await this.rpcCall('hardhat_setStorageAt', [contract.toString(), toHex(slot), toHex(value, true)]);
    } catch (err) {
      throw new Error(`Error setting storage for contract ${contract} at ${slot}: ${err}`);
    }
    this.logger.warn(`Set L1 storage for contract ${contract} at ${slot} to ${value}`);
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
    try {
      await this.rpcCall('hardhat_impersonateAccount', [who.toString()]);
    } catch (err) {
      throw new Error(`Error impersonating ${who}: ${err}`);
    }
    this.logger.warn(`Impersonating ${who}`);
  }

  /**
   * Stop impersonating an account that you are currently impersonating.
   * @param who - The address to stop impersonating
   */
  public async stopImpersonating(who: EthAddress | Hex): Promise<void> {
    try {
      await this.rpcCall('hardhat_stopImpersonatingAccount', [who.toString()]);
    } catch (err) {
      throw new Error(`Error when stopping the impersonation of ${who}: ${err}`);
    }
    this.logger.warn(`Stopped impersonating ${who}`);
  }

  /**
   * Set the bytecode for a contract
   * @param contract - The contract address
   * @param bytecode - The bytecode to set
   */
  public async etch(contract: EthAddress, bytecode: `0x${string}`): Promise<void> {
    try {
      await this.rpcCall('hardhat_setCode', [contract.toString(), bytecode]);
    } catch (err) {
      throw new Error(`Error setting bytecode for ${contract}: ${err}`);
    }
    this.logger.warn(`Set bytecode for ${contract} to ${bytecode}`);
  }

  /**
   * Get the bytecode for a contract
   * @param contract - The contract address
   * @returns The bytecode for the contract
   */
  public async getBytecode(contract: EthAddress): Promise<`0x${string}`> {
    const res = await this.rpcCall('eth_getCode', [contract.toString(), 'latest']);
    return res;
  }

  /**
   * Get the raw transaction object for a given transaction hash
   * @param txHash - The transaction hash
   * @returns The raw transaction
   */
  public async getRawTransaction(txHash: Hex): Promise<`0x${string}`> {
    const res = await this.rpcCall('debug_getRawTransaction', [txHash]);
    return res;
  }

  /**
   * Get the trace for a given transaction hash
   * @param txHash - The transaction hash
   * @returns The trace
   */
  public async debugTraceTransaction(txHash: Hex): Promise<any> {
    const res = await this.rpcCall('debug_traceTransaction', [txHash]);
    return res;
  }

  /**
   * Triggers a reorg of the given depth, removing those blocks from the chain.
   * @param depth - The depth of the reorg
   */
  public reorg(depth: number): Promise<void> {
    return this.execWithPausedAnvil(() => {
      return this.rpcCall('anvil_rollback', [depth]);
    });
  }

  /**
   * Causes Anvil to reorg until the given block number is the new tip
   * @param blockNumber - The block number that's going to be the new tip
   */
  public reorgTo(blockNumber: number): Promise<void> {
    if (blockNumber <= 0) {
      throw new Error(`Can't reorg to block before genesis: ${blockNumber}`);
    }

    return this.execWithPausedAnvil(async () => {
      const currentTip = await this.publicClient.getBlockNumber();
      if (currentTip < BigInt(blockNumber)) {
        this.logger.warn(
          `Can't call anvil_rollback, chain tip is behind target block: ${currentTip} < ${BigInt(blockNumber)}`,
        );
        return;
      }

      const depth = Number(currentTip - BigInt(blockNumber) + 1n);
      await this.rpcCall('anvil_rollback', [depth]);
    });
  }

  /**
   * Triggers a reorg of the given depth, optionally replacing it with new blocks.
   * The resulting block height will be the same as the original chain.
   * @param depth - The depth of the reorg
   * @param newBlocks - The blocks to replace the old ones with, each represented as a list of txs.
   */
  public async reorgWithReplacement(
    depth: number,
    newBlocks: (Hex | { to: EthAddress | Hex; input?: Hex; from?: EthAddress | Hex; value?: number | bigint })[][] = [],
  ): Promise<void> {
    this.logger.verbose(`Preparing L1 reorg with depth ${depth}`);
    try {
      await this.rpcCall('anvil_reorg', [
        depth,
        newBlocks.flatMap((txs, index) => txs.map(tx => [typeof tx === 'string' ? tx : { value: 0, ...tx }, index])),
      ]);
    } catch (err) {
      throw new Error(`Error reorging: ${err}`);
    }
    this.logger.warn(`Reorged L1 chain with depth ${depth} and ${newBlocks.length} new blocks`, { depth, newBlocks });
  }

  public traceTransaction(txHash: Hex): Promise<any> {
    return this.rpcCall('trace_transaction', [txHash]);
  }

  private async execWithPausedAnvil(fn: () => Promise<void>): Promise<void> {
    const [blockInterval, wasAutoMining] = await Promise.all([this.getIntervalMining(), this.isAutoMining()]);
    try {
      if (blockInterval !== null) {
        await this.setIntervalMining(0);
      }

      if (wasAutoMining) {
        await this.setAutomine(false);
      }

      await fn();
    } finally {
      try {
        // restore automine if necessary
        if (wasAutoMining) {
          await this.setAutomine(true);
        }
      } catch (err) {
        this.logger.warn(`Failed to reenable automining: ${err}`);
      }

      try {
        // restore automine if necessary
        if (blockInterval !== null) {
          await this.setIntervalMining(blockInterval);
        }
      } catch (err) {
        this.logger.warn(`Failed to reenable interval mining: ${err}`);
      }
    }
  }
}

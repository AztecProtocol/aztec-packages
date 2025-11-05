import { toBigIntBE, toHex } from '@aztec/foundation/bigint-buffer';
import { keccak256 } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { createLogger } from '@aztec/foundation/log';
import { pluralize } from '@aztec/foundation/string';
import type { DateProvider, TestDateProvider } from '@aztec/foundation/timer';

import { type Hex, type Transaction, createPublicClient, fallback, hexToNumber, http } from 'viem';

import type { ViemPublicClient } from '../types.js';

/**
 * A class that provides utility functions for interacting with ethereum (L1).
 */
export class EthCheatCodes {
  public readonly publicClient: ViemPublicClient;
  constructor(
    /**
     * The RPC URL to use for interacting with the chain
     */
    public rpcUrls: string[],
    /**
     * The date provider to use for time operations
     */
    public dateProvider: DateProvider | TestDateProvider,
    /**
     * The logger to use for the eth cheatcodes
     */
    public logger = createLogger('ethereum:cheat_codes'),
  ) {
    this.publicClient = createPublicClient({
      transport: fallback(this.rpcUrls.map(url => http(url))),
    });
  }

  public rpcCall(method: string, params: any[]) {
    this.logger.debug(`Calling ${method} with params: ${jsonStringify(params)} on ${this.rpcUrls.join(', ')}`);
    return this.doRpcCall(method, params);
  }

  private async doRpcCall(method: string, params: any[]) {
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
      const res = await this.doRpcCall('anvil_getAutomine', []);
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
    const res = await this.doRpcCall('eth_blockNumber', []);
    return parseInt(res, 16);
  }

  /**
   * Get the current chainId
   * @returns The current chainId
   */
  public async chainId(): Promise<number> {
    const res = await this.doRpcCall('eth_chainId', []);
    return parseInt(res, 16);
  }

  /**
   * Get the current timestamp
   * @returns The current timestamp
   */
  public async timestamp(): Promise<number> {
    const res = await this.doRpcCall('eth_getBlockByNumber', ['latest', true]);
    return parseInt(res.timestamp, 16);
  }

  /**
   * Advance the chain by a number of blocks
   * @param numberOfBlocks - The number of blocks to mine
   */
  public async mine(numberOfBlocks: number | bigint = 1): Promise<void> {
    await this.doMine(Number(numberOfBlocks));
    this.logger.warn(`Mined ${numberOfBlocks} L1 blocks`);
  }

  private async doMine(numberOfBlocks = 1): Promise<void> {
    try {
      await this.doRpcCall('hardhat_mine', [numberOfBlocks]);
    } catch (err) {
      throw new Error(`Error mining: ${err}`);
    }
  }

  /**
   * Mines a single block with evm_mine
   */
  public async evmMine(): Promise<void> {
    try {
      await this.doRpcCall('evm_mine', []);
      this.logger.warn(`Mined 1 L1 block with evm_mine`);
    } catch (err) {
      throw new Error(`Error mining: ${err}`);
    }
  }

  /**
   * Set the balance of an account
   * @param account - The account to set the balance for
   * @param balance - The balance to set
   */
  public async setBalance(account: EthAddress | Hex, balance: bigint): Promise<void> {
    try {
      await this.rpcCall('anvil_setBalance', [account.toString(), toHex(balance)]);
    } catch (err) {
      throw new Error(`Error setting balance for ${account}: ${err}`);
    }
    this.logger.warn(`Set balance for ${account} to ${balance}`);
  }

  public async getBalance(account: EthAddress | Hex): Promise<bigint> {
    const res = await this.doRpcCall('eth_getBalance', [account.toString(), 'latest']);
    return BigInt(res);
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
      return this.doRpcCall('anvil_getIntervalMining', []);
    } catch (err) {
      throw new Error(`Error getting interval mining: ${err}`);
    }
  }

  /**
   * Enable interval mining at the given interval (block time)
   * @param seconds - The interval to use between blocks
   */
  public async setIntervalMining(seconds: number, opts: { silent?: boolean } = {}): Promise<void> {
    try {
      await this.rpcCall('anvil_setIntervalMining', [seconds]);
    } catch (err) {
      throw new Error(`Error setting interval mining: ${err}`);
    }
    if (!opts.silent) {
      this.logger.warn(`Set L1 interval mining to ${seconds} seconds`);
    }
  }

  /**
   * Set the automine status of the underlying anvil chain
   * @param automine - The automine status to set
   */
  public async setAutomine(automine: boolean, opts: { silent?: boolean } = {}): Promise<void> {
    try {
      await this.rpcCall('anvil_setAutomine', [automine]);
    } catch (err) {
      throw new Error(`Error setting automine: ${err}`);
    }
    if (!opts.silent) {
      this.logger.warn(`Set L1 automine to ${automine}`);
    }
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
  public async setNextBlockTimestamp(timestamp: number | Date): Promise<void> {
    try {
      await this.rpcCall('evm_setNextBlockTimestamp', [
        timestamp instanceof Date ? Math.floor(timestamp.getTime() / 1000) : timestamp,
      ]);
    } catch (err: any) {
      throw new Error(`Error setting next block timestamp: ${err.message}`);
    }
    this.logger.warn(`Set L1 next block timestamp to ${timestamp}`);
  }

  /**
   * Set the next block timestamp and mines the block.
   * Optionally resets interval mining so the next block is mined in `blockInterval` seconds from now.
   * Always updates the injected date provider to follow L1 time.
   * @param timestamp - The timestamp to set the next block to
   */
  public async warp(
    timestamp: number | bigint,
    opts: { silent?: boolean; resetBlockInterval?: boolean } = {},
  ): Promise<void> {
    let blockInterval: number | null = null;
    try {
      // Load current block interval and disable it
      if (opts.resetBlockInterval) {
        blockInterval = await this.getIntervalMining();
        if (blockInterval !== null) {
          await this.setIntervalMining(0, { silent: true });
        }
      }
      // Set the timestamp of the next block to be mined
      await this.rpcCall('evm_setNextBlockTimestamp', [Number(timestamp)]);
      // And mine a block so the timestamp goes into effect now
      await this.doMine();
      // Update the injected date provider so it follows L1 time
      if ('setTime' in this.dateProvider) {
        this.dateProvider.setTime(Number(timestamp) * 1000);
      }
    } catch (err) {
      throw new Error(`Error warping: ${err}`);
    } finally {
      // Restore interval mining so the next block is mined in `blockInterval` seconds from this one
      if (opts.resetBlockInterval && blockInterval !== null && blockInterval > 0) {
        await this.setIntervalMining(blockInterval, { silent: true });
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
  public async store(
    contract: EthAddress,
    slot: bigint,
    value: bigint,
    opts: { silent?: boolean } = {},
  ): Promise<void> {
    // for the rpc call, we need to change value to be a 32 byte hex string.
    try {
      await this.rpcCall('hardhat_setStorageAt', [contract.toString(), toHex(slot), toHex(value, true)]);
    } catch (err) {
      throw new Error(`Error setting storage for contract ${contract} at ${slot}: ${err}`);
    }
    if (!opts.silent) {
      this.logger.warn(`Set L1 storage for contract ${contract} at ${slot} to ${value}`);
    }
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
      // Since the `who` impersonated will sometimes be a contract without funds, we fund it if needed.
      if ((await this.getBalance(who)) === 0n) {
        await this.setBalance(who, 10n * 10n ** 18n);
      }

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
    return await this.doRpcCall('eth_getCode', [contract.toString(), 'latest']);
  }

  /**
   * Get the raw transaction object for a given transaction hash
   * @param txHash - The transaction hash
   * @returns The raw transaction
   */
  public async getRawTransaction(txHash: Hex): Promise<`0x${string}`> {
    return await this.doRpcCall('debug_getRawTransaction', [txHash]);
  }

  /**
   * Get the trace for a given transaction hash
   * @param txHash - The transaction hash
   * @returns The trace
   */
  public async debugTraceTransaction(txHash: Hex): Promise<any> {
    return await this.doRpcCall('debug_traceTransaction', [txHash]);
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
      this.logger.warn(`Reorged L1 chain to block number ${blockNumber} (depth ${depth})`);
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
    return this.doRpcCall('trace_transaction', [txHash]);
  }

  public async getTxPoolStatus(): Promise<{ pending: number; queued: number }> {
    const { pending, queued } = await this.doRpcCall('txpool_status', []);
    return { pending: hexToNumber(pending), queued: hexToNumber(queued) };
  }

  public async getTxPoolContents(): Promise<TxPoolTransaction[]> {
    const txpoolContent = await this.doRpcCall('txpool_content', []);
    return mapTxPoolContent(txpoolContent);
  }

  /**
   * Mines an empty block by temporarily removing all pending transactions from the mempool,
   * mining a block, and then re-adding the transactions back to the pool.
   */
  public async mineEmptyBlock(blockCount: number = 1): Promise<void> {
    await this.execWithPausedAnvil(async () => {
      // Get all pending and queued transactions from the pool
      const txs = await this.getTxPoolContents();

      this.logger.debug(`Found ${txs.length} transactions in pool`);

      // Get raw transactions before dropping them
      const rawTxs: Hex[] = [];
      for (const tx of txs) {
        try {
          const rawTx = await this.doRpcCall('debug_getRawTransaction', [tx.hash]);
          if (rawTx) {
            rawTxs.push(rawTx);
            this.logger.debug(`Got raw tx for ${tx.hash}`);
          } else {
            this.logger.warn(`No raw tx found for ${tx.hash}`);
          }
        } catch {
          this.logger.warn(`Failed to get raw transaction for ${tx.hash}`);
        }
      }

      this.logger.debug(`Retrieved ${rawTxs.length} raw transactions`);

      // Drop all transactions from the mempool
      await this.doRpcCall('anvil_dropAllTransactions', []);

      // Mine an empty block
      await this.doMine(blockCount);

      // Re-add the transactions to the pool
      for (const rawTx of rawTxs) {
        try {
          const txHash = await this.doRpcCall('eth_sendRawTransaction', [rawTx]);
          this.logger.debug(`Re-added transaction ${txHash}`);
        } catch (err) {
          this.logger.warn(`Failed to re-add transaction: ${err}`);
        }
      }

      if (rawTxs.length !== txs.length) {
        this.logger.warn(`Failed to add all txs back: had ${txs.length} but re-added ${rawTxs.length}`);
      }
    });

    this.logger.warn(`Mined ${blockCount} empty L1 ${pluralize('block', blockCount)}`);
  }

  public async execWithPausedAnvil<T>(fn: () => Promise<T>): Promise<T> {
    const [blockInterval, wasAutoMining] = await Promise.all([this.getIntervalMining(), this.isAutoMining()]);
    try {
      if (blockInterval !== null) {
        await this.setIntervalMining(0, { silent: true });
      }

      if (wasAutoMining) {
        await this.setAutomine(false, { silent: true });
      }

      return await fn();
    } finally {
      try {
        // restore automine if necessary
        if (wasAutoMining) {
          await this.setAutomine(true, { silent: true });
        }
      } catch (err) {
        this.logger.warn(`Failed to reenable automining: ${err}`);
      }

      try {
        // restore automine if necessary
        if (blockInterval !== null) {
          await this.setIntervalMining(blockInterval, { silent: true });
        }
      } catch (err) {
        this.logger.warn(`Failed to reenable interval mining: ${err}`);
      }
    }
  }

  public async syncDateProvider() {
    const timestamp = await this.timestamp();
    if ('setTime' in this.dateProvider) {
      this.dateProvider.setTime(timestamp * 1000);
    }
  }
}

type TxPoolState = 'pending' | 'queued';

interface TxPoolContent {
  pending: Record<Hex, Record<string, Transaction>>;
  queued: Record<Hex, Record<string, Transaction>>;
}

export type TxPoolTransaction = Transaction & {
  poolState: TxPoolState;
};

function mapTxPoolContent(content: TxPoolContent): TxPoolTransaction[] {
  const result: TxPoolTransaction[] = [];

  const processPool = (pool: Record<Hex, Record<string, Transaction>>, poolState: TxPoolState) => {
    for (const txsByNonce of Object.values(pool)) {
      for (const tx of Object.values(txsByNonce)) {
        result.push({ ...tx, poolState });
      }
    }
  };

  processPool(content.pending, 'pending');
  processPool(content.queued, 'queued');

  return result;
}

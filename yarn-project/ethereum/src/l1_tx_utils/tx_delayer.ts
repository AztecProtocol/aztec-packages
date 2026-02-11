import { omit } from '@aztec/foundation/collection';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import type { DateProvider } from '@aztec/foundation/timer';

import { inspect } from 'util';
import {
  type Client,
  type Hex,
  type PublicClient,
  type TransactionSerializableEIP4844,
  type TransactionSerialized,
  keccak256,
  parseTransaction,
  publicActions,
  recoverTransactionAddress,
  serializeTransaction,
  walletActions,
} from 'viem';

import type { ExtendedViemWalletClient, ViemClient } from '../types.js';

const MAX_WAIT_TIME_SECONDS = 180;

export function waitUntilBlock<T extends Client>(
  client: T,
  blockNumber: number | bigint,
  logger?: Logger,
  timeout?: number,
) {
  const publicClient =
    'getBlockNumber' in client && typeof client.getBlockNumber === 'function'
      ? (client as unknown as PublicClient)
      : client.extend(publicActions);

  return retryUntil(
    async () => {
      const currentBlockNumber = await publicClient.getBlockNumber({ cacheTime: 0 });
      logger?.debug(`Block number is ${currentBlockNumber} (waiting until ${blockNumber})`);
      return currentBlockNumber >= BigInt(blockNumber);
    },
    `Wait until L1 block ${blockNumber}`,
    timeout ?? MAX_WAIT_TIME_SECONDS,
    0.1,
  );
}

export function waitUntilL1Timestamp<T extends Client>(
  client: T,
  timestamp: number | bigint,
  logger?: Logger,
  timeout?: number,
) {
  const publicClient =
    'getBlockNumber' in client && typeof client.getBlockNumber === 'function'
      ? (client as unknown as PublicClient)
      : client.extend(publicActions);

  let lastBlock: bigint | undefined = undefined;
  return retryUntil(
    async () => {
      const currentBlockNumber = await publicClient.getBlockNumber({ cacheTime: 0 });
      if (currentBlockNumber === lastBlock) {
        return false;
      }
      lastBlock = currentBlockNumber;
      const currentBlock = await publicClient.getBlock({ includeTransactions: false, blockNumber: currentBlockNumber });
      const currentTs = currentBlock.timestamp;
      logger?.debug(`Block timstamp is ${currentTs} (waiting until ${timestamp})`);
      return currentTs >= BigInt(timestamp);
    },
    `Wait until L1 timestamp ${timestamp}`,
    timeout ?? MAX_WAIT_TIME_SECONDS,
    0.1,
  );
}

/** Manages tx delaying for testing, intercepting sendRawTransaction calls to delay or cancel them. */
export class Delayer {
  private logger: Logger;

  public maxInclusionTimeIntoSlot: number | undefined = undefined;
  public ethereumSlotDuration: bigint;
  public nextWait: { l1Timestamp: bigint } | { l1BlockNumber: bigint } | { indefinitely: true } | undefined = undefined;
  public sentTxHashes: Hex[] = [];
  public cancelledTxs: Hex[] = [];

  constructor(
    public dateProvider: DateProvider,
    opts: { ethereumSlotDuration: bigint | number },
    bindings: LoggerBindings,
  ) {
    this.ethereumSlotDuration = BigInt(opts.ethereumSlotDuration);
    this.logger = createLogger('ethereum:tx_delayer', bindings);
  }

  /** Returns the logger instance used by this delayer. */
  getLogger(): Logger {
    return this.logger;
  }

  /** Returns the hashes of all effectively sent txs. */
  getSentTxHashes() {
    return this.sentTxHashes;
  }

  /** Returns the raw hex for all cancelled txs. */
  getCancelledTxs(): Hex[] {
    return this.cancelledTxs;
  }

  /** Delays the next tx to be sent so it lands on the given L1 block number. */
  pauseNextTxUntilBlock(l1BlockNumber: number | bigint) {
    this.nextWait = { l1BlockNumber: BigInt(l1BlockNumber) };
  }

  /** Delays the next tx to be sent so it lands on the given timestamp. */
  pauseNextTxUntilTimestamp(l1Timestamp: number | bigint) {
    this.nextWait = { l1Timestamp: BigInt(l1Timestamp) };
  }

  /** Delays the next tx to be sent indefinitely. */
  cancelNextTx() {
    this.nextWait = { indefinitely: true };
  }

  /**
   * Sets max inclusion time into slot. If more than this many seconds have passed
   * since the last L1 block was mined, then any tx will not be mined in the current
   * L1 slot but will be deferred for the next one.
   */
  setMaxInclusionTimeIntoSlot(seconds: number | undefined) {
    this.maxInclusionTimeIntoSlot = seconds;
  }
}

/**
 * Creates a new Delayer instance. Exposed so callers can create a single shared delayer
 * and pass it to multiple `wrapClientWithDelayer` calls.
 */
export function createDelayer(
  dateProvider: DateProvider,
  opts: { ethereumSlotDuration: bigint | number },
  bindings: LoggerBindings,
): Delayer {
  return new Delayer(dateProvider, opts, bindings);
}

/** Tries to recover the sender address from a serialized signed transaction. */
async function tryRecoverSender(serializedTransaction: Hex): Promise<string | undefined> {
  try {
    return await recoverTransactionAddress({
      serializedTransaction: serializedTransaction as TransactionSerialized,
    });
  } catch {
    return undefined;
  }
}

/**
 * Wraps a viem client with tx delaying logic. Returns the wrapped client.
 * The delayer intercepts sendRawTransaction calls and delays them based on the delayer's state.
 */
export function wrapClientWithDelayer<T extends ViemClient>(client: T, delayer: Delayer): T {
  const logger = delayer.getLogger();

  // Cast to ExtendedViemWalletClient for the extend chain since it has sendRawTransaction.
  // The sendRawTransaction override is applied to all clients regardless of type.
  const withRawTx = (client as unknown as ExtendedViemWalletClient)
    // Tweak sendRawTransaction so it uses the delay defined in the delayer.
    // Note that this will only work with local accounts (ie accounts for which we have the private key).
    // Transactions signed by the node will not be delayed since they use sendTransaction directly,
    // but we do not use them in our codebase at all.
    .extend(client => ({
      async sendRawTransaction(...args) {
        let wait: Promise<unknown> | undefined;
        let txHash: Hex | undefined;

        const { serializedTransaction } = args[0];
        const publicClient = client as unknown as PublicClient;
        const sender = await tryRecoverSender(serializedTransaction);

        if (delayer.nextWait !== undefined) {
          // Check if we have been instructed to delay the next tx.
          const waitUntil = delayer.nextWait;
          delayer.nextWait = undefined;

          // Compute the tx hash manually so we emulate sendRawTransaction response
          txHash = computeTxHash(serializedTransaction);

          // Cancel tx outright if instructed
          if ('indefinitely' in waitUntil && waitUntil.indefinitely) {
            logger.info(`Cancelling tx ${txHash}`, { sender });
            delayer.cancelledTxs.push(serializedTransaction);
            return Promise.resolve(txHash);
          }

          // Or wait until the desired block number or timestamp
          wait =
            'l1BlockNumber' in waitUntil
              ? waitUntilBlock(publicClient, waitUntil.l1BlockNumber - 1n, logger)
              : 'l1Timestamp' in waitUntil
                ? waitUntilL1Timestamp(publicClient, waitUntil.l1Timestamp - delayer.ethereumSlotDuration, logger)
                : undefined;

          logger.info(`Delaying tx ${txHash} until ${inspect(waitUntil)}`, {
            sender,
            argsLen: args.length,
            ...omit(parseTransaction(serializedTransaction), 'data', 'sidecars'),
          });
        } else if (delayer.maxInclusionTimeIntoSlot !== undefined) {
          // Check if we need to delay txs sent too close to the end of the slot.
          const currentBlock = await publicClient.getBlock({ includeTransactions: false });
          const { timestamp: lastBlockTimestamp, number } = currentBlock;
          const now = delayer.dateProvider.now();

          txHash = computeTxHash(serializedTransaction);
          const logData = {
            sender,
            ...omit(parseTransaction(serializedTransaction), 'data', 'sidecars'),
            lastBlockTimestamp,
            now,
            maxInclusionTimeIntoSlot: delayer.maxInclusionTimeIntoSlot,
          };

          if (now / 1000 - Number(lastBlockTimestamp) > delayer.maxInclusionTimeIntoSlot) {
            // If the last block was mined more than `maxInclusionTimeIntoSlot` seconds ago, then we cannot include
            // any txs in the current slot, so we delay the tx until the next slot.
            logger.info(`Delaying inclusion of tx ${txHash} until the next slot since it was sent too late`, logData);
            wait = waitUntilBlock(publicClient, number + 1n, logger);
          } else {
            logger.debug(`Immediately sending tx ${txHash} as it was received early enough in the slot`, logData);
          }
        }

        if (wait !== undefined) {
          // Do not await here so we can return the tx hash immediately as if it had been sent on the spot.
          // Instead, delay it so it lands on the desired block number or timestamp, assuming anvil will
          // mine it immediately.
          void wait!
            .then(async () => {
              const clientTxHash = await client.sendRawTransaction(...args);
              if (clientTxHash !== txHash) {
                logger.error(`Tx hash returned by the client does not match computed one`, {
                  clientTxHash,
                  computedTxHash: txHash,
                });
              }
              logger.info(`Sent previously delayed tx ${clientTxHash}`, { sender });
              delayer.sentTxHashes.push(clientTxHash);
            })
            .catch(err => logger.error(`Error sending tx after delay`, err));
          return Promise.resolve(txHash!);
        } else {
          const txHash = await client.sendRawTransaction(...args);
          logger.debug(`Sent tx immediately ${txHash}`, { sender });
          delayer.sentTxHashes.push(txHash);
          return txHash;
        }
      },
    }));

  // Only re-bind wallet actions (sendTransaction, writeContract, deployContract) for wallet clients.
  // This is needed for tests that use wallet actions directly rather than sendRawTransaction.
  const isWalletClient = 'account' in client && client.account !== undefined;
  const extended = isWalletClient
    ? withRawTx
        // Re-extend with sendTransaction so it uses the modified sendRawTransaction.
        .extend(client => ({ sendTransaction: walletActions(client).sendTransaction }))
        // And with the actions that depend on the modified sendTransaction
        .extend(client => ({
          writeContract: walletActions(client).writeContract,
          deployContract: walletActions(client).deployContract,
        }))
    : withRawTx;

  return extended as T;
}

/**
 * Compute the tx hash given the serialized tx. Note that if this is a blob tx, we need to
 * exclude the blobs, commitments, and proofs from the hash.
 */
function computeTxHash(serializedTransaction: Hex) {
  if (serializedTransaction.startsWith('0x03')) {
    const parsed = parseTransaction(serializedTransaction);
    if (parsed.blobs || parsed.sidecars) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { blobs, sidecars, ...rest } = parsed;
      return keccak256(serializeTransaction({ type: 'eip4844', ...rest } as TransactionSerializableEIP4844));
    }
  }
  return keccak256(serializedTransaction);
}

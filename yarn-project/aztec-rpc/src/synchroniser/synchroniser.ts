import { AztecNode } from '@aztec/aztec-node';
import { Grumpkin } from '@aztec/barretenberg.js/crypto';
import { L2BlockContext, TxHash } from '@aztec/types';
import { AccountState } from '../account_state/index.js';
import { Database, TxDao } from '../database/index.js';
import { InterruptableSleep } from '@aztec/foundation/sleep';
import { createDebugLogger } from '@aztec/foundation/log';
import { AztecAddress } from '@aztec/foundation/aztec-address';

/**
 * The Synchroniser class manages the synchronization of account states and interacts with the Aztec node
 * to obtain unverified data, blocks, and other necessary information for the accounts.
 * It provides methods to start or stop the synchronization process, add new accounts, retrieve account
 * details, and fetch transactions by hash. The Synchroniser ensures that it maintains the account states
 * in sync with the blockchain while handling retries and errors gracefully.
 */
export class Synchroniser {
  private runningPromise?: Promise<void>;
  private accountStates: AccountState[] = [];
  private interruptableSleep = new InterruptableSleep();
  private running = false;

  constructor(
    private node: AztecNode,
    private db: Database,
    private log = createDebugLogger('aztec:aztec_rpc_synchroniser'),
  ) {}

  /**
   * Starts the synchronisation process by fetching unverified data and blocks from a specified position.
   * Continuously processes the fetched data for all account states until stopped. If there is no data
   * available, it retries after a specified interval.
   *
   * @param from - The starting position for fetching unverified data and blocks.
   * @param take - The number of unverified data and blocks to fetch in each iteration.
   * @param retryInterval - The time interval (in ms) to wait before retrying if no data is available.
   */
  public start(from = 1, take = 1, retryInterval = 1000) {
    if (this.running) {
      return;
    }

    this.running = true;

    const run = async () => {
      while (this.running) {
        try {
          let unverifiedData = await this.node.getUnverifiedData(from, take);
          if (!unverifiedData.length) {
            await this.interruptableSleep.sleep(retryInterval);
            continue;
          }

          // Note: If less than `take` unverified data is returned, then I fetch only that number of blocks.
          const blocks = await this.node.getBlocks(from, unverifiedData.length);
          if (!blocks.length) {
            await this.interruptableSleep.sleep(retryInterval);
            continue;
          }

          if (blocks.length !== unverifiedData.length) {
            // "Trim" the unverified data to match the number of blocks.
            unverifiedData = unverifiedData.slice(0, blocks.length);
          }

          // Wrap blocks in block contexts.
          const blockContexts = blocks.map(block => new L2BlockContext(block));

          this.log(
            `Forwarding ${unverifiedData.length} unverified data and blocks to ${this.accountStates.length} account states`,
          );
          for (const accountState of this.accountStates) {
            await accountState.process(blockContexts, unverifiedData);
          }

          from += unverifiedData.length;
        } catch (err) {
          console.log(err);
          await this.interruptableSleep.sleep(retryInterval);
        }
      }
    };

    this.runningPromise = run();
    this.log('Started');
  }

  /**
   * Stops the synchronizer gracefully, interrupting any ongoing sleep and waiting for the current
   * iteration to complete before setting the running state to false. Once stopped, the synchronizer
   * will no longer process blocks or unverified data and must be restarted using the start method.
   *
   * @returns A promise that resolves when the synchronizer has successfully stopped.
   */
  public async stop() {
    this.running = false;
    this.interruptableSleep.interrupt();
    await this.runningPromise;
    this.log('Stopped');
  }

  /**
   * Add a new account to the Synchroniser with the specified private key.
   * Creates an AccountState instance for the account and pushes it into the accountStates array.
   * The method resolves immediately after pushing the new account state.
   *
   * @param privKey - The private key buffer to initialize the account state.
   * @returns A promise that resolves once the account is added to the Synchroniser.
   */
  public async addAccount(privKey: Buffer) {
    const accountState = new AccountState(privKey, this.db, this.node, await Grumpkin.new());
    this.accountStates.push(accountState);
    await Promise.resolve();
  }

  /**
   * Retrieve an account state by its AztecAddress from the list of managed account states.
   * If no account state with the given address is found, returns undefined.
   *
   * @param account - The AztecAddress instance representing the account to search for.
   * @returns The AccountState instance associated with the provided AztecAddress or undefined if not found.
   */
  public getAccount(account: AztecAddress) {
    return this.accountStates.find(as => as.getPublicKey().toAddress().equals(account));
  }

  /**
   * Retrieve a shallow copy of the array containing all account states.
   * The returned array includes all AccountState instances added to the synchronizer.
   *
   * @returns An array of AccountState instances.
   */
  public getAccounts() {
    return [...this.accountStates];
  }

  /**
   * Retrieve a transaction by its hash from the database.
   * Throws an error if the transaction is not found in the database or if the account associated with the transaction is unauthorized.
   *
   * @param txHash - The hash of the transaction to be fetched.
   * @returns A TxDao instance representing the retrieved transaction.
   */
  public async getTxByHash(txHash: TxHash): Promise<TxDao> {
    const tx = await this.db.getTx(txHash);
    if (!tx) {
      throw new Error('Transaction not found in RPC database');
    }

    const account = this.getAccount(tx.from);
    if (!account) {
      throw new Error('Unauthorised account.');
    }

    return tx;
  }
}

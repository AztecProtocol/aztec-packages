import { AztecNode } from '@aztec/aztec-node';
import { AztecAddress, Fr } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { InterruptableSleep } from '@aztec/foundation/sleep';
import { KeyStore, PublicKey } from '@aztec/key-store';
import { L2BlockContext, LogType, MerkleTreeId } from '@aztec/types';
import { Database } from '../database/index.js';
import { NoteProcessor } from '../note_processor/index.js';

/**
 * The Synchroniser class manages the synchronization of account states and interacts with the Aztec node
 * to obtain encrypted logs, blocks, and other necessary information for the accounts.
 * It provides methods to start or stop the synchronization process, add new accounts, retrieve account
 * details, and fetch transactions by hash. The Synchroniser ensures that it maintains the account states
 * in sync with the blockchain while handling retries and errors gracefully.
 */
export class Synchroniser {
  private runningPromise?: Promise<void>;
  private noteProcessors: NoteProcessor[] = [];
  private interruptableSleep = new InterruptableSleep();
  private running = false;
  private initialSyncBlockHeight = 0;

  constructor(
    private node: AztecNode,
    private db: Database,
    private log = createDebugLogger('aztec:aztec_rpc_synchroniser'),
  ) {}

  /**
   * Starts the synchronisation process by fetching encrypted logs and blocks from a specified position.
   * Continuously processes the fetched data for all account states until stopped. If there is no data
   * available, it retries after a specified interval.
   *
   * @param from - The starting position for fetching encrypted logs and blocks.
   * @param take - The number of encrypted logs and blocks to fetch in each iteration.
   * @param retryInterval - The time interval (in ms) to wait before retrying if no data is available.
   */
  public async start(from = 1, take = 1, retryInterval = 1000) {
    if (this.running) return;
    this.running = true;

    await this.initialSync();

    const run = async () => {
      while (this.running) {
        from = await this.work(from, take, retryInterval);
      }
    };

    this.runningPromise = run();
    this.log('Started');
  }

  protected async initialSync() {
    const [blockNumber, treeRoots] = await Promise.all([
      this.node.getBlockHeight(),
      Promise.resolve(this.node.getTreeRoots()),
    ]);
    this.initialSyncBlockHeight = blockNumber;
    await this.db.setTreeRoots(treeRoots);
  }

  protected async work(from = 1, take = 1, retryInterval = 1000): Promise<number> {
    try {
      let encryptedLogs = await this.node.getLogs(from, take, LogType.ENCRYPTED);
      if (!encryptedLogs.length) {
        await this.interruptableSleep.sleep(retryInterval);
        return from;
      }

      let unencryptedLogs = await this.node.getLogs(from, take, LogType.UNENCRYPTED);
      if (!unencryptedLogs.length) {
        await this.interruptableSleep.sleep(retryInterval);
        return from;
      }

      // Note: If less than `take` encrypted logs is returned, then we fetch only that number of blocks.
      const blocks = await this.node.getBlocks(from, encryptedLogs.length);
      if (!blocks.length) {
        await this.interruptableSleep.sleep(retryInterval);
        return from;
      }

      if (blocks.length !== encryptedLogs.length) {
        // "Trim" the encrypted logs to match the number of blocks.
        encryptedLogs = encryptedLogs.slice(0, blocks.length);
      }

      if (blocks.length !== unencryptedLogs.length) {
        // "Trim" the unencrypted logs to match the number of blocks.
        unencryptedLogs = unencryptedLogs.slice(0, blocks.length);
      }

      // attach logs to blocks
      blocks.forEach((block, i) => {
        block.attachLogs(encryptedLogs[i], LogType.ENCRYPTED);
        block.attachLogs(unencryptedLogs[i], LogType.UNENCRYPTED);
      });

      // Wrap blocks in block contexts.
      const blockContexts = blocks.map(block => new L2BlockContext(block));

      // Update latest tree roots from the most recent block
      const latestBlock = blockContexts[blockContexts.length - 1];
      await this.setTreeRootsFromBlock(latestBlock);

      this.log(
        `Forwarding ${encryptedLogs.length} encrypted logs and blocks to ${this.noteProcessors.length} account states`,
      );
      for (const noteProcessor of this.noteProcessors) {
        await noteProcessor.process(blockContexts, encryptedLogs);
      }

      from += encryptedLogs.length;
      return from;
    } catch (err) {
      this.log(err);
      await this.interruptableSleep.sleep(retryInterval);
      return from;
    }
  }

  private async setTreeRootsFromBlock(latestBlock: L2BlockContext) {
    const { block } = latestBlock;
    if (block.number < this.initialSyncBlockHeight) return;

    const roots: Record<MerkleTreeId, Fr> = {
      [MerkleTreeId.CONTRACT_TREE]: block.endContractTreeSnapshot.root,
      [MerkleTreeId.PRIVATE_DATA_TREE]: block.endPrivateDataTreeSnapshot.root,
      [MerkleTreeId.NULLIFIER_TREE]: block.endNullifierTreeSnapshot.root,
      [MerkleTreeId.PUBLIC_DATA_TREE]: block.endPublicDataTreeRoot,
      [MerkleTreeId.L1_TO_L2_MESSAGES_TREE]: block.endL1ToL2MessageTreeSnapshot.root,
      [MerkleTreeId.L1_TO_L2_MESSAGES_ROOTS_TREE]: block.endTreeOfHistoricL1ToL2MessageTreeRootsSnapshot.root,
      [MerkleTreeId.CONTRACT_TREE_ROOTS_TREE]: block.endTreeOfHistoricContractTreeRootsSnapshot.root,
      [MerkleTreeId.PRIVATE_DATA_TREE_ROOTS_TREE]: block.endTreeOfHistoricPrivateDataTreeRootsSnapshot.root,
    };
    await this.db.setTreeRoots(roots);
  }

  /**
   * Stops the synchronizer gracefully, interrupting any ongoing sleep and waiting for the current
   * iteration to complete before setting the running state to false. Once stopped, the synchronizer
   * will no longer process blocks or encrypted logs and must be restarted using the start method.
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
   * @param publicKey - The public key for the account.
   * @param keyStore - The key store.
   * @returns A promise that resolves once the account is added to the Synchroniser.
   */
  public addAccount(publicKey: PublicKey, keyStore: KeyStore) {
    const processor = this.noteProcessors.find(x => x.publicKey.equals(publicKey));
    if (processor) {
      return;
    }
    this.noteProcessors.push(new NoteProcessor(publicKey, keyStore, this.db, this.node));
  }

  /**
   * Returns true if the account specified by the given address is synched to the latest block
   * @param account - The aztec address for which to query the sync status
   * @returns True if the account is fully synched, false otherwise
   */
  public async isAccountSynchronised(account: AztecAddress) {
    const result = await this.db.getPublicKey(account);
    if (!result) {
      return false;
    }
    const publicKey = result[0];
    const processor = this.noteProcessors.find(x => x.publicKey.equals(publicKey));
    if (!processor) {
      return false;
    }
    return await processor.isSynchronised();
  }
}

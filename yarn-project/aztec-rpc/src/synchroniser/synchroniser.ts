import { AztecNode } from '@aztec/aztec-node';
import { AztecAddress } from '@aztec/circuits.js';
import { InterruptableSleep, createDebugLogger, keccak } from '@aztec/foundation';
import { L2Block } from '@aztec/l2-block';
import { TxHash, createTxHashes } from '@aztec/tx';
import { AccountState } from '../account_state/index.js';
import { Database, TxDao } from '../database/index.js';

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

  public start(from = 1, take = 1, retryInterval = 1000) {
    if (this.running) {
      return;
    }

    this.running = true;

    const run = async () => {
      while (this.running) {
        try {
          const blocks = await this.node.getBlocks(from, take);

          if (!blocks.length) {
            await this.interruptableSleep.sleep(retryInterval);
            continue;
          }

          await this.decodeBlocks(blocks);

          from += blocks.length;
        } catch (err) {
          console.log(err);
          await this.interruptableSleep.sleep(retryInterval);
        }
      }
    };

    this.runningPromise = run();
    this.log('Started');
  }

  public async stop() {
    this.running = false;
    this.interruptableSleep.interrupt();
    await this.runningPromise;
    this.log('Stopped');
  }

  public async addAccount(account: AztecAddress) {
    this.accountStates.push(new AccountState(account, this.db));
    await Promise.resolve();
  }

  public getAccount(account: AztecAddress) {
    return this.accountStates.find(as => as.publicKey.equals(account));
  }

  public getAccounts() {
    return [...this.accountStates];
  }

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

  private async decodeBlocks(l2Blocks: L2Block[]) {
    for (const block of l2Blocks) {
      for (const txHash of createTxHashes(block)) {
        const txDao: TxDao | undefined = await this.db.getTx(txHash);
        if (txDao !== undefined) {
          txDao.blockHash = keccak(block.encode());
          txDao.blockNumber = block.number;
          await this.db.addOrUpdateTx(txDao);
          this.log(`Added tx with hash ${txHash.toString()} from block ${block.number}`);
        } else {
          this.log(`Tx with hash ${txHash.toString()} from block ${block.number} not found in db`);
        }
      }

      for (const key in this.accountStates) {
        this.accountStates[key].syncToBlock(block);
      }
      this.log(`Synched block ${block.number}`);
    }
  }
}

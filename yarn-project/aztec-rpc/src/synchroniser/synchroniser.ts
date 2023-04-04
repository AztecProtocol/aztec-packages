import { AztecNode } from '@aztec/aztec-node';
import { AztecAddress, createDebugLogger, InterruptableSleep, keccak } from '@aztec/foundation';
import { Grumpkin } from '@aztec/barretenberg.js/crypto';
import { BarretenbergWasm } from '@aztec/barretenberg.js/wasm';
import { TxHash, createTxHashes } from '@aztec/tx';
import { AccountState } from '../account_state/index.js';
import { Database, TxDao } from '../database/index.js';
import { L2Block } from '@aztec/l2-block';

export class Synchroniser {
  private runningPromise?: Promise<void>;
  private accountStates: AccountState[] = [];
  private interruptableSleep = new InterruptableSleep();
  private running = false;

  constructor(
    private node: AztecNode,
    private db: Database,
    private bbWasm: BarretenbergWasm,
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
          const unverifiedData = await this.node.getUnverifiedData(from, take);
          if (!unverifiedData.length) {
            await this.interruptableSleep.sleep(retryInterval);
            continue;
          }

          // Note: If less than `take` unverified data is returned, then I fetch only that number of blocks.
          const blocks = await this.node.getBlocks(from, unverifiedData.length);
          if (blocks.length !== unverifiedData.length) {
            this.log(`Warning: Received less blocks than unverified data. Expected ${unverifiedData.length} blocks, got ${blocks.length}`);
          }


          this.log(`Forwarded ${unverifiedData.length} unverified data to ${this.accountStates.length} account states`);
          for (const accountState of this.accountStates) {
            await accountState.processUnverifiedData(unverifiedData, fromUnverifiedData, take);
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

  public async stop() {
    this.running = false;
    this.interruptableSleep.interrupt();
    await this.runningPromise;
    this.log('Stopped');
  }

  public async addAccount(privKey: Buffer) {
    this.accountStates.push(new AccountState(privKey, this.db, this.node, new Grumpkin(this.bbWasm)));
    await Promise.resolve();
  }

  public getAccount(account: AztecAddress) {
    return this.accountStates.find(as => as.getPublicKey().toAddress().equals(account));
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
}

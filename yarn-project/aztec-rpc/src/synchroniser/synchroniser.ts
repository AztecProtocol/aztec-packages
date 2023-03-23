import { AztecNode } from '@aztec/aztec-node';
import { AccountState } from '../account_state/index.js';
import { AztecAddress } from '../circuits.js';
import { Database } from '../database/index.js';

export class Synchroniser {
  private accountStates: AccountState[] = [];

  constructor(private node: AztecNode, private db: Database) {}

  getAccount(account: AztecAddress) {
    return this.accountStates.find(as => as.publicKey.equals(account));
  }
}

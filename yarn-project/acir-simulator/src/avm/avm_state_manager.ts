// The state manager is a wrapper around the node state
// It has access to all of the data bases
// It is responsible for tracking the state during a function call
// It is also responsible for populating the journal as time goes on
import { BlockHeader } from '@aztec/circuits.js';

import { AvmJournal, HostStorage } from './journal/index.js';

export class AvmStateManager {
  public readonly blockHeader: BlockHeader;
  public readonly journal: AvmJournal;

  constructor(blockHeader: BlockHeader, hostStorage: HostStorage) {
    this.blockHeader = blockHeader;
    this.journal = new AvmJournal(hostStorage);
  }
}

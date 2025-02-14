import { serializeToFields } from '@aztec/foundation/serialize';

import { BlockHeader } from '../blocks/block_header.js';
import { TxContext } from '../txs/tx_context.js';
import { CallContext } from './call_context.js';

export class PrivateContextInputs {
  constructor(
    public callContext: CallContext,
    public historicalHeader: BlockHeader,
    public txContext: TxContext,
    public startSideEffectCounter: number,
  ) {}

  public static empty(): PrivateContextInputs {
    return new PrivateContextInputs(CallContext.empty(), BlockHeader.empty(), TxContext.empty(), 0);
  }

  public toFields() {
    return serializeToFields([this.callContext, this.historicalHeader, this.txContext, this.startSideEffectCounter]);
  }
}

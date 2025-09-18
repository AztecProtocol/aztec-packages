import type { Fr } from '@aztec/foundation/fields';
import { serializeToFields } from '@aztec/foundation/serialize';

import { BlockHeader } from '../tx/block_header.js';
import { CallContext } from '../tx/call_context.js';
import { TxContext } from '../tx/tx_context.js';

export class PrivateContextInputs {
  constructor(
    public callContext: CallContext,
    public anchorBlockHeader: BlockHeader,
    public txContext: TxContext,
    public startSideEffectCounter: number,
  ) {}

  public static empty(): PrivateContextInputs {
    return new PrivateContextInputs(CallContext.empty(), BlockHeader.empty(), TxContext.empty(), 0);
  }

  public toFields(): Fr[] {
    return serializeToFields([this.callContext, this.anchorBlockHeader, this.txContext, this.startSideEffectCounter]);
  }
}

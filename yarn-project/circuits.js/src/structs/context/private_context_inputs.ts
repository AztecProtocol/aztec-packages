import { Fr } from '@aztec/foundation/fields';
import { serializeToFields } from '@aztec/foundation/serialize';

import { CallContext } from '../call_context.js';
import { GasSettings } from '../gas_settings.js';
import { Header } from '../header.js';

export class PrivateContextInputs {
  constructor(
    public callContext: CallContext,
    public historicalHeader: Header,
    public privateGlobalVariables: PrivateGlobalVariables,
    public startSideEffectCounter: number,
    public gasSettings: GasSettings,
  ) {}

  public static empty(): PrivateContextInputs {
    return new PrivateContextInputs(
      CallContext.empty(),
      Header.empty(),
      PrivateGlobalVariables.empty(),
      0,
      GasSettings.empty(),
    );
  }

  public toFields() {
    return serializeToFields([
      this.callContext,
      this.historicalHeader,
      this.privateGlobalVariables,
      this.startSideEffectCounter,
      this.gasSettings,
    ]);
  }
}

export class PrivateGlobalVariables {
  constructor(
    /** ChainId for the L2 block. */
    public chainId: Fr,
    /** Version for the L2 block. */
    public version: Fr,
  ) {}

  public static empty(): PrivateGlobalVariables {
    return new PrivateGlobalVariables(Fr.ZERO, Fr.ZERO);
  }

  public toFields() {
    return serializeToFields([this.chainId, this.version]);
  }
}

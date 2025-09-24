import type { Fr } from '@aztec/foundation/fields';
import type { LogLevel } from '@aztec/foundation/log';

import type { AztecAddress } from '../aztec-address/index.js';

/*
 * Represents a debug log emitted by public bytecode.
 */
export class DebugLog {
  constructor(
    public contractAddress: AztecAddress,
    public level: LogLevel,
    public message: string,
    public fields: Fr[],
  ) {}
}

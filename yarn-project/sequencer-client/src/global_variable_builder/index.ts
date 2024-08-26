import { type AztecAddress, type EthAddress, type GlobalVariables } from '@aztec/circuits.js';
import { IS_DEV_NET } from '@aztec/circuits.js';
import { type L1ReaderConfig } from '@aztec/ethereum';
import { type Fr } from '@aztec/foundation/fields';

import { DevnetGlobalVariableBuilder } from './devnet_global_builder.js';
import { SimpleGlobalVariableBuilder } from './simple_global_builder.js';

export { DevnetGlobalVariableBuilder } from './devnet_global_builder.js';
export { SimpleGlobalVariableBuilder } from './simple_global_builder.js';

export function createGlobalVariableBuilder(config: L1ReaderConfig): GlobalVariableBuilder {
  return IS_DEV_NET ? new DevnetGlobalVariableBuilder(config) : new SimpleGlobalVariableBuilder(config);
}

/** Builds global variables for a block. */
export interface GlobalVariableBuilder {
  buildGlobalVariables(blockNumber: Fr, coinbase: EthAddress, feeRecipient: AztecAddress): Promise<GlobalVariables>;
}

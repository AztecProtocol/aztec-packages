import { type Fr } from '@aztec/foundation/fields';

import { type InBlock } from './in_block.js';

export interface NullifierWithBlockSource {
  findNullifiersIndexesWithBlock(blockNumber: number, nullifiers: Fr[]): Promise<(InBlock<bigint> | undefined)[]>;
}

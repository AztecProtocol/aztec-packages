import type { BlockReference } from '../../storage/fact_store/index.js';
import type { Option } from './option.js';

/** TypeScript counterpart of `NullifierStatus` in Aztec.nr. */
export type NullifierStatus = {
  exists: boolean;
  /** The block the nullifier was included in. Absent when it does not exist or is pending in the current transaction. */
  originBlock: Option<BlockReference>;
};

import type { FieldsOf } from '@aztec/foundation/types';
import type { FlatPublicLogs } from '@aztec/stdlib/logs';
import type { TxEffect } from '@aztec/stdlib/tx';

import type { ContractClassLogData } from './contract_class_log_data.js';

/**
 * Wire form of a {@link TxEffect} as the `getTxEffect` oracle returns it: identical to the domain type except its logs
<<<<<<< HEAD
 * are flattened to their Noir layout. Keeping the conversion in the handler lets the `TX_EFFECT` mapping stay purely
 * structural.
 */
export type TxEffectData = Omit<FieldsOf<TxEffect>, 'publicLogs' | 'contractClassLogs'> & {
=======
 * are flattened to their Noir layout and its revert code is the plain `u8` Noir declares. Keeping the conversion in
 * the handler lets the `TX_EFFECT` mapping stay purely structural.
 */
export type TxEffectData = Omit<FieldsOf<TxEffect>, 'revertCode' | 'publicLogs' | 'contractClassLogs'> & {
  revertCode: number;
>>>>>>> origin/v5-next
  publicLogs: FlatPublicLogs;
  contractClassLogs: ContractClassLogData[];
};

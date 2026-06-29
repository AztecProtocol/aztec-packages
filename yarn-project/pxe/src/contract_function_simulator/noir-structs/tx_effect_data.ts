import type { FieldsOf } from '@aztec/foundation/types';
import type { FlatPublicLogs } from '@aztec/stdlib/logs';
import type { TxEffect } from '@aztec/stdlib/tx';

import type { ContractClassLogData } from './contract_class_log_data.js';

/**
 * Wire form of a {@link TxEffect} as the `getTxEffect` oracle returns it: identical to the domain type except its logs
 * are flattened to their Noir layout. Keeping the conversion in the handler lets the `TX_EFFECT` mapping stay purely
 * structural.
 */
export type TxEffectData = Omit<FieldsOf<TxEffect>, 'publicLogs' | 'contractClassLogs'> & {
  publicLogs: FlatPublicLogs;
  contractClassLogs: ContractClassLogData[];
};

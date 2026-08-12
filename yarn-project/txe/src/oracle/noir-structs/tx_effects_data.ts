import type { Fr } from '@aztec/foundation/curves/bn254';
import type { TxHash } from '@aztec/stdlib/tx';

type TxPrivateLog = Fr[];

export type TxEffectsData = {
  txHash: TxHash;
  noteHashes: Fr[];
  nullifiers: Fr[];
  privateLogs: TxPrivateLog[];
};

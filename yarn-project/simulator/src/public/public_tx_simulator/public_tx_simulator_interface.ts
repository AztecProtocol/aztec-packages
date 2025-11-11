import type { PublicTxResult } from '@aztec/stdlib/avm';
import type { Tx } from '@aztec/stdlib/tx';

export interface PublicTxSimulatorInterface {
  simulate(tx: Tx): Promise<PublicTxResult>;
}

export interface MeasuredPublicTxSimulatorInterface {
  simulate(tx: Tx, txLabel: string): Promise<PublicTxResult>;
}

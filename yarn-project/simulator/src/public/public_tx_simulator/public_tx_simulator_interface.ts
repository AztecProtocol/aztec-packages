import type { Tx } from '@aztec/stdlib/tx';

import type { PublicTxResult } from './public_tx_simulator.js';

export interface PublicTxSimulatorInterface {
  simulate(tx: Tx): Promise<PublicTxResult>;
}

export interface MeasuredPublicTxSimulatorInterface {
  simulate(tx: Tx, txLabel: string): Promise<PublicTxResult>;
}

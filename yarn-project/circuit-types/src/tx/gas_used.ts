import { type Gas } from '@aztec/circuits.js';

export interface GasUsed {
  totalGas: Gas;
  teardownGas: Gas;
}

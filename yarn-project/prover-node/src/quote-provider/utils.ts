import { type L2Block } from '@aztec/circuit-types';
import { Fr } from '@aztec/circuits.js';

export function getTotalFees(epoch: L2Block[]) {
  return epoch.reduce((total, block) => total.add(block.header.totalFees), Fr.ZERO).toBigInt();
}

export function getTxCount(epoch: L2Block[]) {
  return epoch.reduce((total, block) => total + block.body.txEffects.length, 0);
}

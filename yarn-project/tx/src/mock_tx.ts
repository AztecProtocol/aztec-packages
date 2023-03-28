import { makePrivateKernelPublicInputs } from '@aztec/circuits.js/factories';
import { Tx } from './tx.js';

export const MockTx = () => {
  return new Tx(makePrivateKernelPublicInputs());
};

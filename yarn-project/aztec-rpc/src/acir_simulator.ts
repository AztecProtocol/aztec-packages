// TODO use @aztce/acir-simulator

import { PreviousKernelData, PrivateCallData, TxRequest } from './circuits.js';

export class AcirSimulator {
  public simulate(txRequest: TxRequest) {
    return Promise.resolve({ kernelData: new PreviousKernelData(), callData: new PrivateCallData() });
  }
}

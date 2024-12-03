import { jsonStringify } from '@aztec/foundation/json-rpc';

import { mockSimulatedTx } from '../mocks.js';
import { TxProvingResult, TxSimulationResult } from './simulated_tx.js';

describe('simulated_tx', () => {
  describe('TxSimulationResult', () => {
    let simulatedTx: TxSimulationResult;
    beforeEach(() => {
      simulatedTx = mockSimulatedTx();
    });

    it('convert to and from json', () => {
      expect(TxSimulationResult.schema.parse(JSON.parse(jsonStringify(simulatedTx)))).toEqual(simulatedTx);
    });

    it('convert undefined effects to and from json', () => {
      simulatedTx.publicOutput = undefined;
      expect(TxSimulationResult.schema.parse(JSON.parse(jsonStringify(simulatedTx)))).toEqual(simulatedTx);
    });
  });

  describe('TxProvingResult', () => {
    let tx: TxProvingResult;
    beforeEach(() => {
      tx = TxProvingResult.random();
    });

    it('convert to and from json', () => {
      expect(TxProvingResult.schema.parse(JSON.parse(jsonStringify(tx)))).toEqual(tx);
    });
  });
});

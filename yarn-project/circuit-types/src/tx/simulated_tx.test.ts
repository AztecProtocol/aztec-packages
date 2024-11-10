import { mockSimulatedTx } from '../mocks.js';
import { TxSimulationResult } from './simulated_tx.js';

describe('simulated_tx', () => {
  let simulatedTx: TxSimulationResult;
  beforeEach(() => {
    simulatedTx = mockSimulatedTx();
  });
  describe('json', () => {
    it('convert to and from json', () => {
      expect(TxSimulationResult.fromJSON(JSON.parse(JSON.stringify(simulatedTx.toJSON())))).toEqual(simulatedTx);
    });
    it('convert undefined effects to and from json', () => {
      simulatedTx.publicOutput = undefined;
      expect(TxSimulationResult.fromJSON(JSON.parse(JSON.stringify(simulatedTx.toJSON())))).toEqual(simulatedTx);
    });
  });
});

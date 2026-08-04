import { times } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { jsonStringify } from '@aztec/foundation/json-rpc';

import { AztecAddress } from '../aztec-address/index.js';
import { MAX_RPC_CONTRACT_OVERRIDES_LEN, MAX_RPC_PUBLIC_STORAGE_OVERRIDES_LEN } from '../interfaces/api_limit.js';
import { mockSimulatedTx, randomContractInstanceWithAddress } from '../tests/mocks.js';
import { SimulationOverrides, TxSimulationResult } from './simulated_tx.js';

describe('simulated_tx', () => {
  describe('SimulationOverrides', () => {
    const publicStorage = async (count: number) => {
      const contract = await AztecAddress.random();
      return times(count, () => ({ contract, slot: Fr.random(), value: Fr.random() }));
    };

    const contracts = async (count: number) => {
      const instance = await randomContractInstanceWithAddress();
      return Object.fromEntries(times(count, i => [`contract-${i}`, { instance }]));
    };

    const parse = (overrides: object) => SimulationOverrides.schema.safeParse(JSON.parse(jsonStringify(overrides)));

    it('accepts publicStorage at the maximum length', async () => {
      const overrides = { publicStorage: await publicStorage(MAX_RPC_PUBLIC_STORAGE_OVERRIDES_LEN) };
      expect(parse(overrides).success).toBe(true);
    });

    it('rejects publicStorage over the maximum length', async () => {
      const overrides = { publicStorage: await publicStorage(MAX_RPC_PUBLIC_STORAGE_OVERRIDES_LEN + 1) };
      expect(parse(overrides).success).toBe(false);
    });

    it('accepts contracts at the maximum count', async () => {
      const overrides = { contracts: await contracts(MAX_RPC_CONTRACT_OVERRIDES_LEN) };
      expect(parse(overrides).success).toBe(true);
    });

    it('rejects contracts over the maximum count', async () => {
      const overrides = { contracts: await contracts(MAX_RPC_CONTRACT_OVERRIDES_LEN + 1) };
      expect(parse(overrides).success).toBe(false);
    });
  });

  describe('TxSimulationResult', () => {
    let simulatedTx: TxSimulationResult;
    beforeEach(async () => {
      simulatedTx = await mockSimulatedTx();
    });

    it('convert to and from json', () => {
      expect(TxSimulationResult.schema.parse(JSON.parse(jsonStringify(simulatedTx)))).toEqual(simulatedTx);
    });

    it('convert undefined effects to and from json', () => {
      simulatedTx.publicOutput = undefined;
      expect(TxSimulationResult.schema.parse(JSON.parse(jsonStringify(simulatedTx)))).toEqual(simulatedTx);
    });
  });
});

import { Fr } from '@aztec/foundation/curves/bn254';

import { FunctionSelector } from '../abi/function_selector.js';
import { computeContractClassId } from './contract_class_id.js';
import type { ContractClass } from './interfaces/contract_class.js';

describe('ContractClass', () => {
  describe('getContractClassId', () => {
    it('calculates the contract class id', async () => {
      const contractClass: ContractClass = {
        version: 1,
        artifactHash: Fr.fromHexString('0x1234'),
        packedBytecode: Buffer.from('123456789012345678901234567890', 'hex'),
        privateFunctions: [{ selector: FunctionSelector.fromString('0x12345678'), vkHash: Fr.fromHexString('0x1234') }],
      };
      const contractClassId = await computeContractClassId(contractClass);
      expect(contractClassId.toString()).toMatchInlineSnapshot(
        `"0x2731a26ac05991b7424963be532299e369dc106e86ac5231d0f8b6faab79d6c3"`,
      );
    });
  });
});

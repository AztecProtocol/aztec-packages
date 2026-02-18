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
        `"0x19d84e3076730c5d608938a94a77c2680bc9036af0af0adc4f4d82d0230d8f11"`,
      );
    });
  });
});

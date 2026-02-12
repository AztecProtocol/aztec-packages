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
        `"0x0d0cb79e4b7d9fbc1a8cbbb0259814831a0a9b68eb935d6f8050586f049ac3f7"`,
      );
    });
  });
});

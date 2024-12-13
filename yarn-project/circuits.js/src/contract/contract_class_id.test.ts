import { Fr } from '@aztec/foundation/fields';

import { FunctionSelector, computeContractClassId } from '../index.js';
import { type ContractClass } from './interfaces/contract_class.js';

describe('ContractClass', () => {
  describe('getContractClassId', () => {
    it('calculates the contract class id', () => {
      const contractClass: ContractClass = {
        version: 1,
        artifactHash: Fr.fromHexString('0x1234'),
        packedBytecode: Buffer.from('123456789012345678901234567890', 'hex'),
        privateFunctions: [
          {
            selector: FunctionSelector.fromString('0x12345678'),
            vkHash: Fr.fromHexString('0x1234'),
          },
        ],
        publicFunctions: [
          {
            selector: FunctionSelector.fromString('0x12345678'),
            bytecode: Buffer.from('123456789012345678901234567890', 'hex'),
          },
        ],
      };

      expect(computeContractClassId(contractClass).toString()).toMatchInlineSnapshot(
        `"0x2d5c712c483891d42e5bca539e8516fc52b5b024568ac71e4fe47c0c0157f851"`,
      );
    });
  });
});

import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { elapsed } from '@aztec/foundation/timer';

import { FunctionSelector } from '../abi/function_selector.js';
import { getBenchmarkContractArtifact, getTestContractArtifact, getTokenContractArtifact } from '../tests/fixtures.js';
import { getContractClassFromArtifact } from './contract_class.js';
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
        `"0x2926577ccab09f8e4600550792066ed9d6ce530a973ac2b81a36eaebee56ad44"`,
      );
    });

    it('calculates the contract class id for a real contract artifact', async () => {
      const artifacts = [getBenchmarkContractArtifact(), getTokenContractArtifact(), getTestContractArtifact()];
      const logger = createLogger('stdlib:contract_class_id:test');

      for (const artifact of artifacts) {
        const contractClass = await getContractClassFromArtifact(artifact);

        const [ms, contractClassId] = await elapsed(computeContractClassId(contractClass));
        logger.info(`Computed contract class id ${contractClassId} in ${ms}ms`);

        expect(contractClassId.toString()).toHaveLength(66); // 0x + 64 hex chars
        expect(contractClassId.toBigInt()).toBeGreaterThan(0n);
      }
    });
  });
});

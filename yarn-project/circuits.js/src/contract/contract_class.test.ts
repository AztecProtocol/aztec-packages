import { Fr } from '@aztec/foundation/fields';
import { toFriendlyJSON } from '@aztec/foundation/serialize';
import { BenchmarkingContractArtifact } from '@aztec/noir-contracts/Benchmarking';

import { createContractClassFromArtifact } from './contract_class.js';

describe('ContractClass', () => {
  it('creates a contract class from a contract compilation artifact', () => {
    const contractClass = createContractClassFromArtifact({
      ...BenchmarkingContractArtifact,
      artifactHash: Fr.fromString('0x1234'),
    });
    expect(toFriendlyJSON(contractClass)).toMatchSnapshot();
  });
});

import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';

import {
  type ComponentsVersions,
  checkCompressedComponentVersion,
  compressComponentVersions,
  validatePartialComponentVersionsMatch,
} from './versioning.js';

describe('versioning', () => {
  let versions: ComponentsVersions;

  beforeEach(() => {
    versions = {
      l1ChainId: 1,
      l1RollupAddress: EthAddress.random(),
      l2ChainVersion: 3,
      l2ProtocolContractsTreeRoot: Fr.random().toString(),
      l2CircuitsVkTreeRoot: Fr.random().toString(),
    };
  });

  it('compresses and checks', () => {
    checkCompressedComponentVersion(compressComponentVersions(versions), versions);
  });

  it('throws on mismatch in compressed', () => {
    const compressed = compressComponentVersions(versions);
    const expected = { ...versions, l1ChainId: 2 };
    expect(() => checkCompressedComponentVersion(compressed, expected)).toThrow(/L1 chain/);
  });

  it('validates partial versions', () => {
    const partial = { l1ChainId: 1, l2ChainVersion: 3 };
    validatePartialComponentVersionsMatch(partial, versions);
  });

  it('throws on mismatch for partial versions', () => {
    const partial = { l1ChainId: 10, l2ChainVersion: 3 };
    expect(() => validatePartialComponentVersionsMatch(partial, versions)).toThrow(/l1ChainId/);
  });
});

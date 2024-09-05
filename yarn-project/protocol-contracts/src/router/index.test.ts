import {
  AztecAddress,
  ROUTER_ADDRESS,
  computeContractAddressFromInstance,
  getContractClassFromArtifact,
} from '@aztec/circuits.js';

import { getCanonicalRouter } from './index.js';

describe('Router', () => {
  it('returns canonical protocol contract', () => {
    const contract = getCanonicalRouter();
    expect(computeContractAddressFromInstance(contract.instance)).toEqual(contract.address);
    expect(getContractClassFromArtifact(contract.artifact).id).toEqual(contract.contractClass.id);
    expect(contract.address).toEqual(AztecAddress.fromBigInt(ROUTER_ADDRESS));
  });
});

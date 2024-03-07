import omit from 'lodash.omit';

import { GasTokenAddress, getCanonicalGasToken } from './index.js';

describe('GasToken', () => {
  it('returns canonical protocol contract', () => {
    const contract = getCanonicalGasToken();
    expect(omit(contract, 'artifact')).toMatchSnapshot();
    expect(contract.address.toString()).toEqual(GasTokenAddress.toString());
  });
});

import { Fr } from '@aztec/foundation/curves/bn254';
import { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { getP2PDefaultConfig, parseAllowList } from './config.js';

describe('config', () => {
  it('parses allow list', async () => {
    const instance = { address: await AztecAddress.random() };
    const instanceFunction = { address: await AztecAddress.random(), selector: FunctionSelector.random() };
    const classId = { classId: Fr.random() };
    const classFunction = { classId: Fr.random(), selector: FunctionSelector.random() };

    const config = [instance, instanceFunction, classId, classFunction];

    const configStrings = [
      `I:${instance.address}`,
      `I:${instanceFunction.address}:${instanceFunction.selector}`,
      `C:${classId.classId}`,
      `C:${classFunction.classId}:${classFunction.selector}`,
    ];
    const stringifiedAllowList = configStrings.join(',');

    const allowList = parseAllowList(stringifiedAllowList);
    expect(allowList).toEqual(config);
  });

  it('defaults proposal tx collector type to new', () => {
    const config = getP2PDefaultConfig();
    expect(config.txCollectionProposalTxCollectorType).toBe('new');
  });
});

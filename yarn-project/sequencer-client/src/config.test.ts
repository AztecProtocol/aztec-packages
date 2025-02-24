import { FunctionSelector } from '@aztec/circuits.js/abi';
import { AztecAddress } from '@aztec/circuits.js/aztec-address';
import { Fr } from '@aztec/foundation/fields';

import { parseSequencerAllowList } from './config.js';

describe('sequencer config', () => {
  it('parse a sequencer config', async () => {
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

    const allowList = parseSequencerAllowList(stringifiedAllowList);
    expect(allowList).toEqual(config);
  });
});

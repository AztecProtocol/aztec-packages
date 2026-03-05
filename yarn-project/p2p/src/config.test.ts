import { Fr } from '@aztec/foundation/curves/bn254';
import { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { getP2PDefaultConfig, parseAllowList } from './config.js';

describe('config', () => {
  it('parses allow list with required selectors', async () => {
    const instanceFunction = { address: await AztecAddress.random(), selector: FunctionSelector.random() };
    const classFunction = { classId: Fr.random(), selector: FunctionSelector.random() };

    const config = [instanceFunction, classFunction];

    const configStrings = [
      `I:${instanceFunction.address}:${instanceFunction.selector}`,
      `C:${classFunction.classId}:${classFunction.selector}`,
    ];
    const stringifiedAllowList = configStrings.join(',');

    const allowList = parseAllowList(stringifiedAllowList);
    expect(allowList).toEqual(config);
  });

  it('rejects instance entry without selector', async () => {
    const address = await AztecAddress.random();
    expect(() => parseAllowList(`I:${address}`)).toThrow('selector is required');
  });

  it('rejects class entry without selector', () => {
    const classId = Fr.random();
    expect(() => parseAllowList(`C:${classId}`)).toThrow('selector is required');
  });

  it('rejects entry with unknown type', () => {
    expect(() => parseAllowList(`X:0x1234:0x12345678`)).toThrow('unknown type');
  });

  it('parses empty string', () => {
    expect(parseAllowList('')).toEqual([]);
  });

  it('handles whitespace in entries', async () => {
    const instanceFunction = { address: await AztecAddress.random(), selector: FunctionSelector.random() };
    const allowList = parseAllowList(` I:${instanceFunction.address}:${instanceFunction.selector} `);
    expect(allowList).toEqual([instanceFunction]);
  });

  it('defaults missing txs collector type to new', () => {
    const config = getP2PDefaultConfig();
    expect(config.txCollectionMissingTxsCollectorType).toBe('new');
  });
});
